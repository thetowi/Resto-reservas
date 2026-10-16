using System.Globalization;
using Barrancas.Api.Data;
using Barrancas.Api.Dtos;
using Barrancas.Api.Hubs;
using Barrancas.Api.Models;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;

namespace Barrancas.Api.Services;

/// <summary>Error de negocio que se le muestra tal cual al cliente del link.</summary>
public class ReservaOnlineException : Exception
{
    public ReservaOnlineException(string mensaje) : base(mensaje) { }
}

/// <summary>
/// Link publico de reservas (/reservar en el frontend): el propio cliente
/// elige cuantos son, dia, salon y horario entre los que tienen lugar, y la
/// reserva entra al panel en tiempo real con Origen=Web.
///
/// Reglas (las mismas del bot de WhatsApp, ver ReservaBotService y
/// claude/whatsapp-bot-reservas.md):
/// - Solo se ofrecen los salones ACTIVOS; Merienda solo donde esta habilitada.
/// - Horarios: los de la planilla (HorariosDefault, cada 15 min). Cada horario
///   tiene un cupo = cuantas filas trae la planilla para esa hora (ej. 12:30
///   tiene 4); cuando se llena, ese horario deja de ofrecerse.
/// - Hay lugar si queda una mesa libre (no ocupada, sin walk-in, no reducida)
///   con capacidad para esa cantidad de personas. Para grupos grandes alcanza
///   con que la suma de mesas libres llegue (lo arma el staff).
/// - Se confirma sola si: salon "Restaurant" Y menos de 6 personas Y hay mesa;
///   la mesa se asigna sola (la mas chica que entre). Cualquier otro caso queda
///   como solicitud (EstadoReserva.PendienteBot) para que el equipo confirme.
/// - Dias bloqueados: los mismos de FechaBloqueadaBot (sin reservas online ese
///   dia). Turnos cerrados (CierreTurno): sin lugar.
/// - Consultar disponibilidad NUNCA crea filas (DiaService sin sembrar): solo
///   reservar de verdad genera las filas del turno, igual que abrir el dia.
/// </summary>
public class ReservaOnlineService
{
    public const string SalonConfirmaSola = "Restaurant";
    public const int LimitePaxConfirmaSola = 6; // se confirma sola con MENOS de 6
    public const int PaxMaximo = 20;
    // Hasta cuantos dias adelante se puede reservar por el link (la tira
    // muestra 14; el resto se elige con "Otra fecha", en el calendario).
    public const int DiasAdelante = 60;
    private const int MinutosAnticipacion = 60;
    private const int MaxReservasWebFuturasPorTelefono = 3;

    public const string Disponible = "disponible";
    public const string Pocas = "pocas";
    public const string SinLugar = "sin_lugar";

    private static readonly TimeZoneInfo ZonaLocal = ObtenerZonaLocal();

    // Se incrementa con cada reserva nueva: forma parte de la clave de cache
    // del resumen de dias, asi una reserva recien hecha se refleja enseguida.
    private static int _versionCache;

    // Cuando cambian las fechas sin reservas web (ver
    // FechasBloqueadasBotController), para que el link lo refleje enseguida.
    public static void InvalidarCache() => Interlocked.Increment(ref _versionCache);

    private readonly BarrancasDbContext _db;
    private readonly DiaService _diaService;
    private readonly IHubContext<ReservasHub> _hub;
    private readonly IMemoryCache _cache;

    public ReservaOnlineService(BarrancasDbContext db, DiaService diaService, IHubContext<ReservasHub> hub, IMemoryCache cache)
    {
        _db = db;
        _diaService = diaService;
        _hub = hub;
        _cache = cache;
    }

    // ---------------------------------------------------------------- hora local

    private static TimeZoneInfo ObtenerZonaLocal()
    {
        foreach (var id in new[] { "America/Argentina/Buenos_Aires", "Argentina Standard Time" })
        {
            try
            {
                return TimeZoneInfo.FindSystemTimeZoneById(id);
            }
            catch (TimeZoneNotFoundException) { }
            catch (InvalidTimeZoneException) { }
        }
        return TimeZoneInfo.CreateCustomTimeZone("ART", TimeSpan.FromHours(-3), "ART", "ART");
    }

    public static DateTime AhoraLocal() => TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, ZonaLocal);

    public static DateOnly HoyLocal() => DateOnly.FromDateTime(AhoraLocal());

    private static bool HoraYaPaso(DateOnly fecha, string hora)
    {
        var ahora = AhoraLocal();
        if (fecha != DateOnly.FromDateTime(ahora)) return fecha < DateOnly.FromDateTime(ahora);
        if (!TimeOnly.TryParseExact(hora, "HH:mm", CultureInfo.InvariantCulture, DateTimeStyles.None, out var t)) return true;
        return t.ToTimeSpan() < ahora.TimeOfDay.Add(TimeSpan.FromMinutes(MinutosAnticipacion));
    }

    // ---------------------------------------------------------------- turnos y horarios

    private static IEnumerable<Turno> TurnosDe(Salon salon)
    {
        yield return Turno.Almuerzo;
        if (salon.PermiteMerienda) yield return Turno.Merienda;
        yield return Turno.Cena;
    }

    private static string Nombre(Turno turno) => turno.ToString().ToLowerInvariant();

    private static List<string> HorariosDe(Turno turno) =>
        HorariosDefault.Para(turno).Distinct().OrderBy(h => h, StringComparer.Ordinal).ToList();

    private static int CupoDe(Turno turno, string hora) =>
        HorariosDefault.Para(turno).Count(h => h == hora);

    private static bool TryParseTurno(string? texto, out Turno turno)
    {
        switch (texto?.Trim().ToLowerInvariant())
        {
            case "almuerzo": turno = Turno.Almuerzo; return true;
            case "cena": turno = Turno.Cena; return true;
            case "merienda": turno = Turno.Merienda; return true;
            default: turno = default; return false;
        }
    }

    private static bool ConfirmaSola(Salon salon) =>
        string.Equals(salon.Nombre.Trim(), SalonConfirmaSola, StringComparison.OrdinalIgnoreCase);

    private Task<List<Salon>> SalonesActivosAsync() =>
        _db.Salones.Where(s => s.Activo).OrderBy(s => s.Orden).ToListAsync();

    // ---------------------------------------------------------------- evaluacion de un turno

    private record EvaluacionTurno(bool Cerrado, bool HayLugar, List<PublicoHorarioDto> Horarios, MesaDto? MesaParaAsignar);

    private async Task<EvaluacionTurno> EvaluarTurnoAsync(DateOnly fecha, Turno turno, int salonId, int pax, bool sembrar)
    {
        var data = await _diaService.GetTurnoAsync(fecha, turno, salonId, sembrar);
        var horarios = HorariosDe(turno);

        if (data.EstaCerrado)
        {
            return new(true, false, horarios.Select(h => new PublicoHorarioDto(h, SinLugar)).ToList(), null);
        }

        var ocupadas = data.MesasOcupadas.Concat(data.MesasWalkIn).ToHashSet();
        var libres = data.Mesas.Where(m => !m.Reducida && !ocupadas.Contains(m.Id)).ToList();

        bool hayLugar;
        int mesasAptas;
        MesaDto? mesa = null;
        if (data.Mesas.Count == 0)
        {
            // Salon sin mesas cargadas todavia: no hay forma de saber el lugar
            // real, se acepta como solicitud y lo resuelve el equipo.
            hayLugar = true;
            mesasAptas = int.MaxValue;
        }
        else if (pax < LimitePaxConfirmaSola)
        {
            var aptas = libres.Where(m => m.Capacidad >= pax).OrderBy(m => m.Capacidad).ThenBy(m => m.Orden).ToList();
            hayLugar = aptas.Count > 0;
            mesasAptas = aptas.Count;
            mesa = aptas.FirstOrDefault();
        }
        else
        {
            // Grupo grande: alcanza con que las mesas libres sumen la capacidad
            // (el staff junta mesas al confirmar).
            hayLugar = libres.Sum(m => m.Capacidad) >= pax;
            mesasAptas = libres.Count;
        }

        var estados = horarios.Select(h =>
        {
            var usados = data.Reservas.Count(r => r.Pax is not null && r.Hora == h);
            var cupo = CupoDe(turno, h);
            string estado;
            if (!hayLugar || usados >= cupo || HoraYaPaso(fecha, h)) estado = SinLugar;
            else if (mesasAptas <= 2 || cupo - usados == 1) estado = Pocas;
            else estado = Disponible;
            return new PublicoHorarioDto(h, estado);
        }).ToList();

        return new(false, hayLugar, estados, mesa);
    }

    // ---------------------------------------------------------------- consultas

    public async Task<PublicoConfigDto> ConfigAsync()
    {
        var salones = await SalonesActivosAsync();
        var horarios = new Dictionary<string, List<string>>
        {
            ["almuerzo"] = HorariosDe(Turno.Almuerzo),
            ["merienda"] = HorariosDe(Turno.Merienda),
            ["cena"] = HorariosDe(Turno.Cena),
        };
        return new PublicoConfigDto(
            salones.Select(s => new PublicoSalonDto(s.Id, s.Nombre, s.PermiteMerienda, ConfirmaSola(s))).ToList(),
            horarios,
            LimitePaxConfirmaSola,
            PaxMaximo,
            DiasAdelante,
            HoyLocal());
    }

    private static int PaxValido(int pax) => Math.Clamp(pax, 1, PaxMaximo);

    public async Task<List<PublicoDiaDto>> DiasAsync(int pax, int cantidad)
    {
        pax = PaxValido(pax);
        cantidad = Math.Clamp(cantidad, 1, DiasAdelante + 1);
        var hoy = HoyLocal();
        var clave = $"publico-dias:{hoy}:{pax}:{cantidad}:{Volatile.Read(ref _versionCache)}";
        if (_cache.TryGetValue(clave, out List<PublicoDiaDto>? enCache) && enCache is not null)
        {
            return enCache;
        }

        var hasta = hoy.AddDays(cantidad - 1);
        var bloqueadas = await _db.FechasBloqueadasBot
            .Where(f => f.Fecha >= hoy && f.Fecha <= hasta)
            .ToDictionaryAsync(f => f.Fecha);
        var salones = await SalonesActivosAsync();

        var resultado = new List<PublicoDiaDto>();
        for (var fecha = hoy; fecha <= hasta; fecha = fecha.AddDays(1))
        {
            bloqueadas.TryGetValue(fecha, out var cierre);
            if (cierre is { Turno: null })
            {
                // Todo el dia: el cliente ve el mensaje y el boton de WhatsApp.
                resultado.Add(new PublicoDiaDto(fecha, "bloqueado", cierre.Motivo, cierre.MensajeCliente));
                continue;
            }

            var disponibles = 0;
            var pocas = 0;
            var total = 0;
            foreach (var salon in salones)
            {
                foreach (var turno in TurnosDe(salon))
                {
                    // Turno cerrado para la web (el resto del dia sigue abierto).
                    if (cierre is not null && cierre.Cierra(turno)) continue;
                    var ev = await EvaluarTurnoAsync(fecha, turno, salon.Id, pax, sembrar: false);
                    total += ev.Horarios.Count;
                    disponibles += ev.Horarios.Count(h => h.Estado == Disponible);
                    pocas += ev.Horarios.Count(h => h.Estado == Pocas);
                }
            }

            string estado;
            if (disponibles + pocas == 0) estado = "lleno";
            else if (total > 0 && disponibles < total * 0.35) estado = "pocos";
            else estado = "ok";
            resultado.Add(new PublicoDiaDto(fecha, estado));
        }

        _cache.Set(clave, resultado, TimeSpan.FromSeconds(60));
        return resultado;
    }

    public async Task<PublicoDisponibilidadDto> DisponibilidadAsync(DateOnly fecha, int pax)
    {
        pax = PaxValido(pax);
        var hoy = HoyLocal();
        var salones = await SalonesActivosAsync();
        var fueraDeRango = fecha < hoy || fecha > hoy.AddDays(DiasAdelante);
        var cierre = await _db.FechasBloqueadasBot.FirstOrDefaultAsync(f => f.Fecha == fecha);
        var bloqueada = fueraDeRango || cierre is { Turno: null };

        var lista = new List<PublicoSalonDisponibilidadDto>();
        foreach (var salon in salones)
        {
            var turnos = new List<PublicoTurnoDto>();
            foreach (var turno in TurnosDe(salon))
            {
                if (bloqueada || (cierre is not null && cierre.Cierra(turno)))
                {
                    // PorWhatsApp: cerrado para la web por una fecha especial
                    // (el link muestra el mensaje y el boton de WhatsApp).
                    turnos.Add(new PublicoTurnoDto(Nombre(turno), true,
                        HorariosDe(turno).Select(h => new PublicoHorarioDto(h, SinLugar)).ToList(),
                        PorWhatsApp: !fueraDeRango && cierre is not null));
                    continue;
                }
                var ev = await EvaluarTurnoAsync(fecha, turno, salon.Id, pax, sembrar: false);
                turnos.Add(new PublicoTurnoDto(Nombre(turno), ev.Cerrado, ev.Horarios));
            }
            var hayLugar = turnos.Any(t => t.Horarios.Any(h => h.Estado != SinLugar));
            lista.Add(new PublicoSalonDisponibilidadDto(salon.Id, hayLugar, turnos));
        }

        return new PublicoDisponibilidadDto(fecha, bloqueada, lista, cierre?.Motivo, cierre?.MensajeCliente);
    }

    // ---------------------------------------------------------------- crear

    private static string SoloDigitos(string? texto) =>
        new((texto ?? string.Empty).Where(char.IsDigit).ToArray());

    private static string? Recortar(string? texto, int max)
    {
        if (string.IsNullOrWhiteSpace(texto)) return null;
        var t = texto.Trim();
        return t.Length > max ? t[..max] : t;
    }

    public async Task<PublicoReservaResultado> CrearAsync(PublicoReservaRequest req)
    {
        // Campo trampa: el formulario real nunca lo completa.
        if (!string.IsNullOrEmpty(req.Sitio))
        {
            throw new ReservaOnlineException("No pudimos procesar la reserva. Probá de nuevo.");
        }
        if (!req.AceptaPrivacidad)
        {
            throw new ReservaOnlineException("Para reservar tenés que aceptar el uso de tus datos.");
        }

        var hoy = HoyLocal();
        if (req.Fecha < hoy || req.Fecha > hoy.AddDays(DiasAdelante))
        {
            throw new ReservaOnlineException($"Solo tomamos reservas online para los próximos {DiasAdelante} días.");
        }
        if (req.Pax < 1 || req.Pax > PaxMaximo)
        {
            throw new ReservaOnlineException($"Por este medio tomamos reservas de 1 a {PaxMaximo} personas.");
        }

        var nombre = Recortar(req.Nombre, 80);
        if (nombre is null || nombre.Length < 2)
        {
            throw new ReservaOnlineException("Falta tu nombre.");
        }
        var digitos = SoloDigitos(req.Telefono);
        if (digitos.Length < 8 || digitos.Length > 15)
        {
            throw new ReservaOnlineException("Revisá el número de WhatsApp.");
        }
        var telefono = Recortar(req.Telefono, 30)!;
        var habitacion = Recortar(req.Habitacion, 10);
        var ocasion = Recortar(req.Ocasion, 40);
        var comentarios = Recortar(req.Comentarios, 500);

        var salon = await _db.Salones.FirstOrDefaultAsync(s => s.Id == req.SalonId && s.Activo);
        if (salon is null)
        {
            throw new ReservaOnlineException("Ese salón no está tomando reservas online.");
        }
        if (!TryParseTurno(req.Turno, out var turno) || (turno == Turno.Merienda && !salon.PermiteMerienda))
        {
            throw new ReservaOnlineException("Ese turno no está disponible en ese salón.");
        }
        var hora = req.Hora?.Trim() ?? string.Empty;
        if (!HorariosDe(turno).Contains(hora))
        {
            throw new ReservaOnlineException("Ese horario no está disponible.");
        }
        var cierre = await _db.FechasBloqueadasBot.FirstOrDefaultAsync(f => f.Fecha == req.Fecha);
        if (cierre is not null && cierre.Cierra(turno))
        {
            throw new ReservaOnlineException(cierre.MensajeCliente ?? "Ese día no tomamos reservas online. Escribinos por WhatsApp y lo vemos.");
        }

        // Limite de reservas web a futuro por el mismo telefono (contra abuso).
        // Se cuenta sobre el registro de reservas web (sin las canceladas).
        var webFuturas = await _db.ReservasWeb
            .Where(w => w.Fecha >= hoy && w.Estado != EstadoReservaWeb.Cancelada)
            .Select(w => w.Telefono)
            .ToListAsync();
        if (webFuturas.Count(h => SoloDigitos(h).EndsWith(digitos, StringComparison.Ordinal)) >= MaxReservasWebFuturasPorTelefono)
        {
            throw new ReservaOnlineException("Ya tenés varias reservas hechas por este medio. Escribinos para sumar otra.");
        }

        // Se vuelve a evaluar en el momento de reservar (pudo ocuparse
        // mientras el cliente completaba sus datos).
        var previa = await EvaluarTurnoAsync(req.Fecha, turno, salon.Id, req.Pax, sembrar: false);
        var estadoHora = previa.Horarios.FirstOrDefault(h => h.Hora == hora)?.Estado ?? SinLugar;
        if (estadoHora == SinLugar)
        {
            throw new ReservaOnlineException("Ese horario se acaba de ocupar. Elegí otro, por favor.");
        }

        // Recien ahora se generan las filas del turno (como al abrir el dia).
        await _diaService.SeedTurnoSiVacioAsync(req.Fecha, turno, salon.Id);
        var evaluacion = await EvaluarTurnoAsync(req.Fecha, turno, salon.Id, req.Pax, sembrar: false);
        var data = await _diaService.GetTurnoAsync(req.Fecha, turno, salon.Id, sembrar: false);

        var mesa = evaluacion.MesaParaAsignar;
        var confirmada = ConfirmaSola(salon) && req.Pax < LimitePaxConfirmaSola && mesa is not null;

        // Usa la primera fila vacia de esa misma hora (la planilla trae varias
        // por horario); si no queda ninguna, abre una nueva al final.
        var filaLibre = data.Reservas
            .Where(r => r.Pax is null && string.IsNullOrEmpty(r.Nombre) && r.Hora == hora)
            .OrderBy(r => r.Orden)
            .FirstOrDefault();

        Reserva reserva;
        if (filaLibre is not null)
        {
            reserva = await _db.Reservas.FirstAsync(r => r.Id == filaLibre.Id);
        }
        else
        {
            var maxOrden = data.Reservas.Count == 0 ? -1 : data.Reservas.Max(r => r.Orden);
            reserva = new Reserva { Fecha = req.Fecha, Turno = turno, SalonId = salon.Id, Orden = maxOrden + 1 };
            _db.Reservas.Add(reserva);
        }

        var partesComentario = new[] { ocasion, comentarios }.Where(p => p is not null);
        reserva.Hora = hora;
        reserva.Pax = req.Pax;
        reserva.Nombre = nombre;
        reserva.HabTel = habitacion is not null ? $"Hab {habitacion} · {telefono}" : telefono;
        reserva.Comentarios = partesComentario.Any() ? string.Join(" · ", partesComentario) : null;
        reserva.Asistio = false;
        reserva.PidioMesa = false;
        reserva.Retirada = false;
        reserva.Origen = OrigenReserva.Web;
        reserva.Estado = confirmada ? EstadoReserva.Confirmada : EstadoReserva.PendienteBot;
        reserva.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();

        if (confirmada && mesa is not null)
        {
            var actuales = await _db.ReservaMesas.Where(rm => rm.ReservaId == reserva.Id).ToListAsync();
            _db.ReservaMesas.RemoveRange(actuales);
            _db.ReservaMesas.Add(new ReservaMesa { ReservaId = reserva.Id, MesaId = mesa.Id });
            await _db.SaveChangesAsync();
        }

        // Registro aparte (panel "Reservas por el link"): queda aunque despues
        // la fila se vacie o se quite. Su Id es el codigo que ve el cliente.
        var registro = new ReservaWeb
        {
            CreadaEn = DateTime.UtcNow,
            ReservaId = reserva.Id,
            Fecha = req.Fecha,
            Turno = turno,
            SalonId = salon.Id,
            Hora = hora,
            Pax = req.Pax,
            Nombre = nombre,
            Telefono = telefono,
            Habitacion = habitacion,
            Ocasion = ocasion,
            Comentarios = comentarios,
            Estado = confirmada ? EstadoReservaWeb.Confirmada : EstadoReservaWeb.Pendiente,
        };
        _db.ReservasWeb.Add(registro);
        await _db.SaveChangesAsync();

        Interlocked.Increment(ref _versionCache);

        // Mismo aviso en vivo que una reserva cargada por el staff.
        var actualizado = await _diaService.GetTurnoAsync(req.Fecha, turno, salon.Id, sembrar: false);
        var grupo = ReservasHub.GrupoDe(req.Fecha.ToString("yyyy-MM-dd"), Nombre(turno), salon.Id);
        await _hub.Clients.Group(grupo).SendAsync("TurnoActualizado", actualizado);

        return new PublicoReservaResultado(
            confirmada ? "confirmada" : "pendiente",
            ReservaWebService.Codigo(registro.Id),
            req.Fecha,
            hora,
            Nombre(turno),
            salon.Nombre,
            req.Pax);
    }
}
