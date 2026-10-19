using System.Net;
using System.Text.Json;
using System.Threading.Channels;
using Barrancas.Api.Data;
using Barrancas.Api.Models;
using Microsoft.EntityFrameworkCore;
using WebPush;

namespace Barrancas.Api.Services;

// Avisos push de reservas web (mockup capax-avisos-y-recordarme): cuando
// entra una reserva por el link se le avisa a todos los dispositivos que
// activaron los avisos (Models/SuscripcionPush.cs), aunque capax esté
// cerrado. El envío va por una cola en segundo plano (PushWorker) para no
// demorar la respuesta al cliente que reserva.

/// <summary>Lo que muestra el aviso. Url = adónde lleva al tocarlo.</summary>
public record AvisoPush(string Titulo, string Cuerpo, string Url, string Tag);

public record ClavesVapid(string PublicKey, string PrivateKey, string Subject);

public enum ResultadoEnvioPush { Enviado, YaNoExiste, Fallo }

/// <summary>Manda un aviso a un dispositivo. En los tests se reemplaza por uno falso.</summary>
public interface IEnviadorPush
{
    Task<ResultadoEnvioPush> EnviarAsync(SuscripcionPush sub, string payload, ClavesVapid claves, CancellationToken ct);
}

public class WebPushEnviador : IEnviadorPush
{
    private readonly WebPushClient _cliente;
    private readonly ILogger<WebPushEnviador> _log;

    public WebPushEnviador(HttpClient http, ILogger<WebPushEnviador> log)
    {
        _cliente = new WebPushClient(http);
        _log = log;
    }

    public async Task<ResultadoEnvioPush> EnviarAsync(SuscripcionPush sub, string payload, ClavesVapid claves, CancellationToken ct)
    {
        try
        {
            await _cliente.SendNotificationAsync(
                new PushSubscription(sub.Endpoint, sub.P256dh, sub.Auth),
                payload,
                new VapidDetails(claves.Subject, claves.PublicKey, claves.PrivateKey));
            return ResultadoEnvioPush.Enviado;
        }
        catch (WebPushException ex) when (ex.StatusCode is HttpStatusCode.Gone or HttpStatusCode.NotFound)
        {
            // El navegador ya dio de baja esa suscripción (se desinstaló la
            // app, se borraron los datos del sitio, etc.).
            return ResultadoEnvioPush.YaNoExiste;
        }
        catch (Exception ex)
        {
            _log.LogWarning(ex, "No se pudo mandar el aviso push a la suscripción {Id}", sub.Id);
            return ResultadoEnvioPush.Fallo;
        }
    }
}

/// <summary>
/// Claves VAPID: las de las variables VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY si
/// están; si no, las de la tabla ConfigPush, que se generan solas la primera
/// vez. Se guardan en memoria después de leerlas.
/// </summary>
public class ClavesPush
{
    private readonly IConfiguration _config;
    private readonly SemaphoreSlim _lock = new(1, 1);
    private ClavesVapid? _claves;

    public ClavesPush(IConfiguration config)
    {
        _config = config;
    }

    private string Subject =>
        _config["Vapid:Subject"] ?? Environment.GetEnvironmentVariable("VAPID_SUBJECT") ?? "https://www.reservascapax.app";

    public async Task<ClavesVapid> ObtenerAsync(BarrancasDbContext db)
    {
        if (_claves is not null) return _claves;
        await _lock.WaitAsync();
        try
        {
            if (_claves is not null) return _claves;
            var pub = _config["Vapid:PublicKey"] ?? Environment.GetEnvironmentVariable("VAPID_PUBLIC_KEY");
            var priv = _config["Vapid:PrivateKey"] ?? Environment.GetEnvironmentVariable("VAPID_PRIVATE_KEY");
            if (!string.IsNullOrWhiteSpace(pub) && !string.IsNullOrWhiteSpace(priv))
            {
                return _claves = new ClavesVapid(pub.Trim(), priv.Trim(), Subject);
            }
            var fila = await db.ConfigPush.OrderBy(c => c.Id).FirstOrDefaultAsync();
            if (fila is null)
            {
                var nuevas = VapidHelper.GenerateVapidKeys();
                fila = new ConfigPush { PublicKey = nuevas.PublicKey, PrivateKey = nuevas.PrivateKey, CreadaEn = DateTime.UtcNow };
                db.ConfigPush.Add(fila);
                await db.SaveChangesAsync();
            }
            return _claves = new ClavesVapid(fila.PublicKey, fila.PrivateKey, Subject);
        }
        finally
        {
            _lock.Release();
        }
    }
}

/// <summary>Cola de avisos por mandar (singleton): la llenan los servicios, la vacía PushWorker.</summary>
public class ColaAvisosPush
{
    private readonly Channel<AvisoPush> _canal = Channel.CreateUnbounded<AvisoPush>();

    public void Encolar(AvisoPush aviso) => _canal.Writer.TryWrite(aviso);

    public ChannelReader<AvisoPush> Lector => _canal.Reader;
}

public class PushService
{
    private const int MaxFallosSeguidos = 10;
    // Sin escapar los acentos ni el «·» (el JSON sigue siendo válido).
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web)
    {
        Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
    };

    private readonly BarrancasDbContext _db;
    private readonly ClavesPush _claves;
    private readonly IEnviadorPush _enviador;

    public PushService(BarrancasDbContext db, ClavesPush claves, IEnviadorPush enviador)
    {
        _db = db;
        _claves = claves;
        _enviador = enviador;
    }

    public async Task<string> ClavePublicaAsync() => (await _claves.ObtenerAsync(_db)).PublicKey;

    /// <summary>A todos los dispositivos con avisos de usuarios activos.</summary>
    public Task<int> EnviarATodosAsync(AvisoPush aviso, CancellationToken ct = default) =>
        EnviarAsync(_db.SuscripcionesPush.Where(p => p.Usuario!.Activo), aviso, ct);

    /// <summary>Aviso de prueba: solo a los dispositivos de ese usuario.</summary>
    public Task<int> EnviarAUsuarioAsync(int usuarioId, AvisoPush aviso, CancellationToken ct = default) =>
        EnviarAsync(_db.SuscripcionesPush.Where(p => p.UsuarioId == usuarioId), aviso, ct);

    private async Task<int> EnviarAsync(IQueryable<SuscripcionPush> consulta, AvisoPush aviso, CancellationToken ct)
    {
        var subs = await consulta.ToListAsync(ct);
        if (subs.Count == 0) return 0;
        var claves = await _claves.ObtenerAsync(_db);
        var payload = JsonSerializer.Serialize(new { title = aviso.Titulo, body = aviso.Cuerpo, url = aviso.Url, tag = aviso.Tag }, Json);

        var enviados = 0;
        foreach (var sub in subs)
        {
            switch (await _enviador.EnviarAsync(sub, payload, claves, ct))
            {
                case ResultadoEnvioPush.Enviado:
                    enviados++;
                    sub.FallosSeguidos = 0;
                    break;
                case ResultadoEnvioPush.YaNoExiste:
                    _db.SuscripcionesPush.Remove(sub);
                    break;
                default:
                    if (++sub.FallosSeguidos >= MaxFallosSeguidos) _db.SuscripcionesPush.Remove(sub);
                    break;
            }
        }
        await _db.SaveChangesAsync(ct);
        return enviados;
    }

    // ---------------------------------------------------------------- textos

    private static readonly string[] DiasCortos = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
    private static readonly string[] MesesCortos = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

    public static string FechaCorta(DateOnly f) => $"{DiasCortos[(int)f.DayOfWeek]} {f.Day} {MesesCortos[f.Month - 1]}";

    /// <summary>
    /// Reserva que entró por el link: si se confirmó sola, lleva al panel en
    /// ese día/turno/salón; si es solicitud, a Reservas web con esa tarjeta.
    /// </summary>
    public static AvisoPush DeReservaWeb(ReservaWeb w, string salon, bool confirmada)
    {
        var detalle = $"{w.Nombre} · {w.Pax} pax · {FechaCorta(w.Fecha)} · {w.Hora}";
        return confirmada
            ? new AvisoPush(
                $"Nueva reserva web · {salon}",
                detalle,
                $"/?fecha={w.Fecha:yyyy-MM-dd}&turno={w.Turno.ToString().ToLowerInvariant()}&salonId={w.SalonId}",
                $"reserva-web-{w.Id}")
            : new AvisoPush(
                $"Solicitud para aprobar · {salon}",
                $"{detalle} — Tocá para revisar",
                $"/reservas-web?solicitud={w.Id}",
                $"reserva-web-{w.Id}");
    }
}

/// <summary>Manda en segundo plano los avisos que se van encolando.</summary>
public class PushWorker : BackgroundService
{
    private readonly ColaAvisosPush _cola;
    private readonly IServiceScopeFactory _scopes;
    private readonly ILogger<PushWorker> _log;

    public PushWorker(ColaAvisosPush cola, IServiceScopeFactory scopes, ILogger<PushWorker> log)
    {
        _cola = cola;
        _scopes = scopes;
        _log = log;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        try
        {
            await foreach (var aviso in _cola.Lector.ReadAllAsync(stoppingToken))
            {
                try
                {
                    using var scope = _scopes.CreateScope();
                    var push = scope.ServiceProvider.GetRequiredService<PushService>();
                    await push.EnviarATodosAsync(aviso, stoppingToken);
                }
                catch (Exception ex) when (ex is not OperationCanceledException)
                {
                    _log.LogWarning(ex, "No se pudo mandar el aviso push «{Titulo}»", aviso.Titulo);
                }
            }
        }
        catch (OperationCanceledException)
        {
            // se está apagando la API
        }
    }
}
