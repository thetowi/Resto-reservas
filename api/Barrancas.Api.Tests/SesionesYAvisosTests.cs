using System.Collections.Concurrent;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Barrancas.Api.Data;
using Barrancas.Api.Dtos;
using Barrancas.Api.Models;
using Barrancas.Api.Services;
using Microsoft.AspNetCore.Hosting;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace Barrancas.Api.Tests;

/// <summary>Enviador falso: anota los avisos en vez de mandarlos a internet.</summary>
public class EnviadorPushFalso : IEnviadorPush
{
    public ConcurrentQueue<(string Endpoint, string Payload)> Enviados { get; } = new();
    public ConcurrentDictionary<string, bool> Borrados { get; } = new();

    public Task<ResultadoEnvioPush> EnviarAsync(SuscripcionPush sub, string payload, ClavesVapid claves, CancellationToken ct)
    {
        if (Borrados.ContainsKey(sub.Endpoint)) return Task.FromResult(ResultadoEnvioPush.YaNoExiste);
        Enviados.Enqueue((sub.Endpoint, payload));
        return Task.FromResult(ResultadoEnvioPush.Enviado);
    }
}

public class PushFactory : BarrancasWebApplicationFactory
{
    public EnviadorPushFalso Enviador { get; } = new();

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        base.ConfigureWebHost(builder);
        builder.ConfigureServices(services => services.AddSingleton<IEnviadorPush>(Enviador));
    }
}

/// <summary>
/// «Recordarme» (sesiones que se renuevan solas, «Mis dispositivos») y los
/// avisos push de reservas web.
/// </summary>
public class SesionesYAvisosTests : IClassFixture<PushFactory>
{
    private readonly PushFactory _factory;

    public SesionesYAvisosTests(PushFactory factory)
    {
        _factory = factory;
    }

    private async Task<HttpClient> AdminAsync()
    {
        var client = _factory.CreateClient();
        var login = await client.PostAsJsonAsync("/api/auth/login", new LoginRequest("admin", "admin"));
        login.EnsureSuccessStatusCode();
        var body = await login.Content.ReadFromJsonAsync<LoginResponse>();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", body!.Token);
        return client;
    }

    // Cuenta nueva para cada test, así cambiar la contraseña o desactivarla
    // no afecta a los demás.
    private async Task<(int Id, string Username)> CuentaNuevaAsync()
    {
        var admin = await AdminAsync();
        var username = "u" + Guid.NewGuid().ToString("N")[..8];
        var res = await admin.PostAsJsonAsync("/api/usuarios", new CrearUsuarioRequest("Prueba", username, "clave1234", Rol.Staff));
        res.EnsureSuccessStatusCode();
        var lista = await res.Content.ReadFromJsonAsync<List<UsuarioDto>>();
        return (lista!.Single(u => u.Username == username).Id, username);
    }

    private async Task<LoginResponse> EntrarAsync(string username, bool recordarme, string dispositivo = "Chrome en Windows")
    {
        var res = await _factory.CreateClient().PostAsJsonAsync("/api/auth/login", new LoginRequest(username, "clave1234", recordarme, dispositivo));
        res.EnsureSuccessStatusCode();
        return (await res.Content.ReadFromJsonAsync<LoginResponse>())!;
    }

    private HttpClient Con(string token)
    {
        var client = _factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
        return client;
    }

    private Task<HttpResponseMessage> RenovarAsync(string llave) =>
        _factory.CreateClient().PostAsJsonAsync("/api/auth/renovar", new RenovarRequest(llave));

    [Fact]
    public async Task Sin_recordarme_no_hay_llave()
    {
        var (_, username) = await CuentaNuevaAsync();

        var login = await EntrarAsync(username, recordarme: false);

        Assert.Null(login.Llave);
        Assert.Null(login.SesionId);
    }

    [Fact]
    public async Task Con_recordarme_la_llave_renueva_el_token_y_aparece_en_mis_dispositivos()
    {
        var (_, username) = await CuentaNuevaAsync();
        var login = await EntrarAsync(username, recordarme: true, dispositivo: "Safari en iPhone (app)");
        Assert.False(string.IsNullOrEmpty(login.Llave));

        var res = await RenovarAsync(login.Llave!);
        res.EnsureSuccessStatusCode();
        var renovado = await res.Content.ReadFromJsonAsync<LoginResponse>();
        Assert.Equal(login.SesionId, renovado!.SesionId);

        var lista = await Con(renovado.Token).GetFromJsonAsync<List<DispositivoDto>>("/api/auth/dispositivos");
        var este = Assert.Single(lista!);
        Assert.True(este.EsEste);
        Assert.True(este.Recordado);
        Assert.Equal("Safari en iPhone (app)", este.Nombre);

        // La llave se guarda hasheada, nunca tal cual.
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<BarrancasDbContext>();
        Assert.False(await db.SesionesRecordadas.AnyAsync(s => s.TokenHash == login.Llave));
    }

    [Fact]
    public async Task Salir_cierra_la_sesion_recordada()
    {
        var (_, username) = await CuentaNuevaAsync();
        var login = await EntrarAsync(username, recordarme: true);

        var salir = await _factory.CreateClient().PostAsJsonAsync("/api/auth/salir", new SalirRequest(login.Llave, null));
        Assert.Equal(HttpStatusCode.NoContent, salir.StatusCode);

        Assert.Equal(HttpStatusCode.Unauthorized, (await RenovarAsync(login.Llave!)).StatusCode);
    }

    [Fact]
    public async Task Una_sesion_sin_usar_90_dias_se_cierra()
    {
        var (_, username) = await CuentaNuevaAsync();
        var login = await EntrarAsync(username, recordarme: true);
        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<BarrancasDbContext>();
            var s = await db.SesionesRecordadas.SingleAsync(x => x.Id == login.SesionId);
            s.UltimoUsoEn = DateTime.UtcNow.AddDays(-(SesionService.DiasSinUso + 1));
            await db.SaveChangesAsync();
        }

        Assert.Equal(HttpStatusCode.Unauthorized, (await RenovarAsync(login.Llave!)).StatusCode);
    }

    [Fact]
    public async Task Cambiar_la_contrasena_cierra_los_otros_dispositivos_pero_no_este()
    {
        var (_, username) = await CuentaNuevaAsync();
        var compu = await EntrarAsync(username, recordarme: true, dispositivo: "Compu");
        var celu = await EntrarAsync(username, recordarme: true, dispositivo: "Celu");

        var res = await Con(compu.Token).PostAsJsonAsync("/api/auth/cambiar-password", new CambiarPasswordRequest("clave1234", "clave-nueva-123"));
        Assert.Equal(HttpStatusCode.NoContent, res.StatusCode);

        Assert.Equal(HttpStatusCode.OK, (await RenovarAsync(compu.Llave!)).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await RenovarAsync(celu.Llave!)).StatusCode);
    }

    [Fact]
    public async Task El_admin_ve_los_dispositivos_y_cierra_uno_y_desactivar_cierra_todos()
    {
        var (id, username) = await CuentaNuevaAsync();
        var tablet = await EntrarAsync(username, recordarme: true, dispositivo: "Tablet del salón");
        var compu = await EntrarAsync(username, recordarme: true, dispositivo: "Compu");
        var admin = await AdminAsync();

        var lista = await admin.GetFromJsonAsync<List<DispositivoDto>>($"/api/usuarios/{id}/dispositivos");
        Assert.Equal(2, lista!.Count);

        var quitar = await admin.DeleteAsync($"/api/usuarios/{id}/dispositivos/sesion/{tablet.SesionId}");
        quitar.EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.Unauthorized, (await RenovarAsync(tablet.Llave!)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await RenovarAsync(compu.Llave!)).StatusCode);

        var desactivar = await admin.PatchAsJsonAsync($"/api/usuarios/{id}", new ActualizarUsuarioRequest(null, null, false, null));
        desactivar.EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.Unauthorized, (await RenovarAsync(compu.Llave!)).StatusCode);
    }

    [Fact]
    public async Task Una_reserva_del_link_avisa_a_los_dispositivos_suscriptos()
    {
        var (_, username) = await CuentaNuevaAsync();
        var login = await EntrarAsync(username, recordarme: true);
        var client = Con(login.Token);
        var clave = await client.GetFromJsonAsync<ClavePushDto>("/api/push/clave");
        Assert.False(string.IsNullOrWhiteSpace(clave!.Clave));

        var endpoint = "https://push.example.com/" + Guid.NewGuid();
        var sus = await client.PostAsJsonAsync("/api/push/suscripciones", new SuscribirPushRequest(endpoint, "p256dh-de-prueba", "auth-de-prueba", "Chrome en Android"));
        Assert.Equal(HttpStatusCode.NoContent, sus.StatusCode);

        var publico = _factory.CreateClient();
        var config = await publico.GetFromJsonAsync<PublicoConfigDto>("/api/publico/config");
        var salonId = config!.Salones.Single(s => s.Nombre == "Restaurant").Id;
        var fecha = ReservaOnlineService.HoyLocal().AddDays(7);
        var reserva = await publico.PostAsJsonAsync("/api/publico/reservas",
            new PublicoReservaRequest(fecha, salonId, "cena", "21:00", 2, "Laura Gómez", "11 5555-" + Random.Shared.Next(1000, 9999), null, null, null, true, null));
        reserva.EnsureSuccessStatusCode();

        // El envío va en segundo plano.
        string? payload = null;
        for (var i = 0; i < 50 && payload is null; i++)
        {
            payload = _factory.Enviador.Enviados.FirstOrDefault(e => e.Endpoint == endpoint).Payload;
            if (payload is null) await Task.Delay(100);
        }
        Assert.NotNull(payload);
        Assert.Contains("Nueva reserva web · Restaurant", payload);
        Assert.Contains("Laura Gómez · 2 pax", payload);
        Assert.Contains($"fecha={fecha:yyyy-MM-dd}", payload);

        // Aparece en «Mis dispositivos» con los avisos prendidos.
        var lista = await client.GetFromJsonAsync<List<DispositivoDto>>("/api/auth/dispositivos");
        Assert.True(Assert.Single(lista!).ConAvisos);
    }

    [Fact]
    public async Task Una_suscripcion_que_el_navegador_dio_de_baja_se_borra_y_salir_saca_los_avisos()
    {
        var (_, username) = await CuentaNuevaAsync();
        var login = await EntrarAsync(username, recordarme: false);
        var client = Con(login.Token);
        var vieja = "https://push.example.com/vieja-" + Guid.NewGuid();
        var nueva = "https://push.example.com/nueva-" + Guid.NewGuid();
        await client.PostAsJsonAsync("/api/push/suscripciones", new SuscribirPushRequest(vieja, "p", "a", "Compu"));
        await client.PostAsJsonAsync("/api/push/suscripciones", new SuscribirPushRequest(nueva, "p", "a", "Celu"));
        _factory.Enviador.Borrados[vieja] = true;

        var prueba = await client.PostAsJsonAsync("/api/push/prueba", new { });
        prueba.EnsureSuccessStatusCode();
        Assert.Equal(1, (await prueba.Content.ReadFromJsonAsync<PruebaPushDto>())!.Enviados);

        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<BarrancasDbContext>();
            Assert.False(await db.SuscripcionesPush.AnyAsync(p => p.Endpoint == vieja));
        }

        await _factory.CreateClient().PostAsJsonAsync("/api/auth/salir", new SalirRequest(null, nueva));
        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<BarrancasDbContext>();
            Assert.False(await db.SuscripcionesPush.AnyAsync(p => p.Endpoint == nueva));
        }
    }

    [Fact]
    public void El_aviso_de_una_solicitud_lleva_a_reservas_web()
    {
        var w = new ReservaWeb { Id = 41, Nombre = "Familia Ruiz", Pax = 8, Fecha = new DateOnly(2026, 10, 18), Hora = "21:30", Turno = Turno.Cena, SalonId = 1 };

        var aviso = PushService.DeReservaWeb(w, "Restaurant", confirmada: false);

        Assert.Equal("Solicitud para aprobar · Restaurant", aviso.Titulo);
        Assert.Equal("Familia Ruiz · 8 pax · Dom 18 oct · 21:30 — Tocá para revisar", aviso.Cuerpo);
        Assert.Equal("/reservas-web?solicitud=41", aviso.Url);
    }
}
