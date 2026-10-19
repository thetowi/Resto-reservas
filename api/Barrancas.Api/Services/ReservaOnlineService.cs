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
///   la mesa NO se asigna: la elige el equipo en la grilla (la reserva igual
///   descuenta lugar, ver MesasLibresEfectivas). Cualquier otro caso queda
///   como SOLICITUD: solo el registro ReservaWeb (Pendiente, sin fila), que el
///   equipo aprueba o rechaza en Reservas web; recien al aprobarla entra a la
///   grilla, ya confirmada (ver ColocarEnGrillaAsync). No guarda lugar
///   mientras espera: al aprobar se ve el lugar que hay en ese momento.
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

    // Aviso push a los dispositivos del equipo (ver Services/PushService.cs).
    private readonly ColaAvisosPush _avisosPush;

    public ReservaOnlineService(BarrancasDbContext db, DiaService diaService, IHubContext<ReservasHub> hub, IMemoryCache cache, ColaAvisosPush avisosPush)
    {
        _db = db;
        _diaService = diaService;
        _hub = hub;
        _cache = cache;
        _avisosPush = avisosPush;
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

    // ---------------------------------------------------------------- en servicio

    // Un turno de HOY esta "en servicio" desde su primer horario de la
    // planilla hasta que cierra la cocina (FinDeServicio): almuerzo de 12:30
    // a 15:00 y cena de 20:30 a 00:00. Mientras tanto el link no toma
    // reservas para ese turno: las mesas son por orden de llegada.
    // "00:00" = medianoche (fin del dia).
    private static readonly Dictionary<Turno, TimeOnly> FinDeServicio = new()
    {
        [Turno.Almuerzo] = new TimeOnly(15, 0),
        [Turno.Merienda] = new TimeOnly(19, 0),
        [Turno.Cena] = new TimeOnly(0, 0),
    };

    public static string FinServicio(Turno turno) =>
        FinDeServicio.TryGetValue(turno, out var fin) ? fin.ToString("HH:mm", CultureInfo.InvariantCulture) : string.Empty;

    public static bool EstaEnServicio(DateTime ahoraLocal, DateOnly fecha, Turno turno)
    {
        if (fecha != DateOnly.FromDateTime(ahoraLocal)) return false;
        var horarios = HorariosDe(turno);
        if (horarios.Count == 0 || !FinDeServicio.TryGetValue(turno, out var finHora)) return false;
        if (!TimeOnly.TryParseExact(horarios[0], "HH:mm", CultureInfo.InvariantCulture, DateTimeStyles.None, out var inicio)) return false;
        var fin = finHora == TimeOnly.MinValue ? TimeSpan.FromHours(24) : finHora.ToTimeSpan();
        var ahora = ahoraLocal.TimeOfDay;
        return ahora >= inicio.ToTimeSpan() && ahora < fin;
    }

    private static bool EnServicio(DateOnly fecha, Turno turno) => EstaEnServicio(AhoraLocal(), fecha, turno);

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

    /// <summary>
    /// Mesas que quedan libres en el turno, contando tambien las reservas que
    /// todavia no tienen mesa: las del link entran SIN mesa (la asigna el
    /// equipo segun como arme el salon), asi que no ocupan ninguna en la
    /// grilla, pero igual se descuentan aca: cada una "se lleva" la mesa mas
    /// chica en la que entra (o, si es un grupo, las mas grandes hasta sumar
    /// su gente). Sin esto el link seguiria ofreciendo lugar indefinidamente.
    /// </summary>
    private static List<MesaDto> MesasLibresEfectivas(TurnoDataDto data, int? sinContar = null)
    {
        var ocupadas = data.MesasOcupadas.Concat(data.MesasWalkIn).ToHashSet();
        var libres = data.Mesas.Where(m => !m.Reducida && !ocupadas.Contains(m.Id)).OrderBy(m => m.Capacidad).ThenBy(m => m.Orden).ToList();
        foreach (var r in data.Reservas.Where(r => r.Pax is > 0 && r.MesaIds.Count == 0 && !r.Retirada && r.Id != sinContar).OrderByDescending(r => r.Pax))
        {
            var una = libres.FirstOrDefault(m => m.Capacidad >= r.Pax);
            if (una is not null)
            {
                libres.Remove(una);
                continue;
            }
            var suma = 0;
            while (suma < r.Pax && libres.Count > 0)
            {
                var grande = libres[^1];
                libres.RemoveAt(libres.Count - 1);
                suma += grande.Capacidad;
            }
        }
        return libres;
    }

    private record EvaluacionTurno(bool Cerrado, bool HayLugar, List<PublicoHorarioDto> Horarios, MesaDto? MesaParaAsignar);

    private async Task<EvaluacionTurno> EvaluarTurnoAsync(DateOnly fecha, Turno turno, int salonId, int pax, bool sembrar)
    {
        var data = await _diaService.GetTurnoAsync(fecha, turno, salonId, sembrar);
        var horarios = HorariosDe(turno);

        if (data.EstaCerrado)
        {
            return new(true, false, horarios.Select(h => new PublicoHorarioDto(h, SinLugar)).ToList(), null);
        }

        var libres = MesasLibresEfectivas(data);

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
        var datos = await _db.DatosRestaurante.AsNoTracking().OrderBy(d => d.Id).FirstOrDefaultAsync();
        var ubicacion = datos is null || (datos.Direccion is null && datos.GoogleMapsUrl is null && datos.AppleMapsUrl is null && datos.WazeUrl is null)
            ? null
            : new PublicoUbicacionDto(datos.Direccion, datos.GoogleMapsUrl, datos.AppleMapsUrl, datos.WazeUrl);
        return new PublicoConfigDto(
            salones.Select(s => new PublicoSalonDto(s.Id, s.Nombre, s.PermiteMerienda, ConfirmaSola(s))).ToList(),
            horarios,
            LimitePaxConfirmaSola,
            PaxMaximo,
            DiasAdelante,
            HoyLocal(),
            ubicacion);
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
            var enServicio = false;
            foreach (var salon in salones)
            {
                foreach (var turno in TurnosDe(salon))
                {
                    // Turno cerrado para la web (el resto del dia sigue abierto).
                    if (cierre is not null && cierre.Cierra(turno)) continue;
                    // Turno de hoy ya en servicio: por orden de llegada.
                    if (EnServicio(fecha, turno))
                    {
                        enServicio = true;
                        continue;
                    }
                    var ev = await EvaluarTurnoAsync(fecha, turno, salon.Id, pax, sembrar: false);
                    total += ev.Horarios.Count;
                    disponibles += ev.Horarios.Count(h => h.Estado == Disponible);
                    pocas += ev.Horarios.Count(h => h.Estado == Pocas);
                }
            }

            string estado;
            if (disponibles + pocas == 0) estado = enServicio ? "servicio" : "lleno";
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
                if (EnServicio(fecha, turno))
                {
                    // Hoy, con el turno ya empezado: el link muestra "Estamos
                    // en servicio" (por orden de llegada) hasta FinServicio.
                    turnos.Add(new PublicoTurnoDto(Nombre(turno), false,
                        HorariosDe(turno).Select(h => new PublicoHorarioDto(h, SinLugar)).ToList(),
                        EnServicio: true, FinServicio: FinServicio(turno)));
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

        if (EnServicio(req.Fecha, turno))
        {
            throw new ReservaOnlineException($"Estamos en servicio: hasta las {FinServicio(turno)} las mesas son por orden de llegada.");
        }

        // Limite de reservas web a futuro por el mismo telefono (contra abuso).
        // Se cuenta sobre el registro de reservas web (sin las canceladas).
        var webFuturas = await _db.ReservasWeb
            .Where(w => w.Fecha >= hoy && w.Estado != EstadoReservaWeb.Cancelada && w.Estado != EstadoReservaWeb.Rechazada)
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

        // Se confirma sola solo si el salon lo permite, es de menos de 6 y hay
        // una mesa que le sirva (se mira que haya lugar, pero NO se asigna:
        // la mesa la elige el equipo segun como organice el salon, ver
        // MesasLibresEfectivas). Si no, queda como SOLICITUD: no entra a la
        // grilla (ni ocupa lugar) hasta que alguien del equipo la aprueba en
        // Reservas web (ver ReservasWebController.Confirmar / Rechazar).
        MesaDto? mesa = null;
        if (ConfirmaSola(salon) && req.Pax < LimitePaxConfirmaSola)
        {
            // Recien ahora se generan las filas del turno (como al abrir el dia).
            await _diaService.SeedTurnoSiVacioAsync(req.Fecha, turno, salon.Id);
            mesa = (await EvaluarTurnoAsync(req.Fecha, turno, salon.Id, req.Pax, sembrar: false)).MesaParaAsignar;
        }
        var confirmada = mesa is not null;

        // Registro aparte (panel "Reservas por el link"): queda aunque despues
        // la fila se vacie o se quite. Su Id es el codigo que ve el cliente.
        var registro = new ReservaWeb
        {
            CreadaEn = DateTime.UtcNow,
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
        if (confirmada)
        {
            var reserva = await ColocarEnGrillaAsync(registro, [], EstadoReserva.Confirmada);
            registro.ReservaId = reserva.Id;
        }
        _db.ReservasWeb.Add(registro);
        await _db.SaveChangesAsync();

        // Mismo aviso en vivo que una reserva cargada por el staff (con una
        // solicitud la grilla no cambia, pero el panel actualiza la burbuja
        // de Reservas web y la franja de solicitudes del turno).
        await AvisarTurnoAsync(req.Fecha, turno, salon.Id);
        // Y el aviso al celular / la compu del equipo, aunque capax esté cerrado.
        _avisosPush.Encolar(PushService.DeReservaWeb(registro, salon.Nombre, confirmada));

        return new PublicoReservaResultado(
            confirmada ? "confirmada" : "pendiente",
            ReservaWebService.Codigo(registro.Id),
            req.Fecha,
            hora,
            Nombre(turno),
            salon.Nombre,
            req.Pax);
    }

    // ---------------------------------------------------------------- grilla y solicitudes

    /// <summary>
    /// Carga una reserva del link en la grilla: usa la primera fila vacia de
    /// esa hora (la planilla trae varias por horario) o abre una nueva al
    /// final, con las mesas indicadas. La usan la reserva que se confirma
    /// sola y la aprobacion de una solicitud. Guarda; no avisa por SignalR.
    /// </summary>
    public async Task<Reserva> ColocarEnGrillaAsync(ReservaWeb w, IReadOnlyCollection<int> mesaIds, EstadoReserva estado)
    {
        await _diaService.SeedTurnoSiVacioAsync(w.Fecha, w.Turno, w.SalonId);
        var data = await _diaService.GetTurnoAsync(w.Fecha, w.Turno, w.SalonId, sembrar: false);

        var filaLibre = data.Reservas
            .Where(r => r.Pax is null && string.IsNullOrEmpty(r.Nombre) && r.Hora == w.Hora)
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
            reserva = new Reserva { Fecha = w.Fecha, Turno = w.Turno, SalonId = w.SalonId, Orden = maxOrden + 1 };
            _db.Reservas.Add(reserva);
        }

        var partesComentario = new[] { w.Ocasion, w.Comentarios }.Where(p => !string.IsNullOrWhiteSpace(p));
        reserva.Hora = w.Hora;
        reserva.Pax = w.Pax;
        reserva.Nombre = w.Nombre;
        reserva.HabTel = w.Habitacion is not null ? $"Hab {w.Habitacion} · {w.Telefono}" : w.Telefono;
        reserva.Comentarios = partesComentario.Any() ? string.Join(" · ", partesComentario) : null;
        reserva.Asistio = false;
        reserva.PidioMesa = false;
        reserva.Retirada = false;
        reserva.Origen = OrigenReserva.Web;
        reserva.Estado = estado;
        reserva.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();

        var actuales = await _db.ReservaMesas.Where(rm => rm.ReservaId == reserva.Id).ToListAsync();
        _db.ReservaMesas.RemoveRange(actuales);
        foreach (var mesaId in mesaIds.Distinct())
        {
            _db.ReservaMesas.Add(new ReservaMesa { ReservaId = reserva.Id, MesaId = mesaId });
        }
        await _db.SaveChangesAsync();

        Interlocked.Increment(ref _versionCache);
        return reserva;
    }

    public async Task AvisarTurnoAsync(DateOnly fecha, Turno turno, int salonId)
    {
        var actualizado = await _diaService.GetTurnoAsync(fecha, turno, salonId, sembrar: false);
        var grupo = ReservasHub.GrupoDe(fecha.ToString("yyyy-MM-dd"), Nombre(turno), salonId);
        await _hub.Clients.Group(grupo).SendAsync("TurnoActualizado", actualizado);
    }

    /// <summary>
    /// Chequeo de lugar para una solicitud, en el momento (Reservas web):
    /// mesas libres del turno y cuanta gente entra, reservas ya cargadas a
    /// esa hora contra el cupo de la planilla, y que mesas convendria juntar.
    /// Estado: "ok", "justo" (entra pero con poco margen u hora llena),
    /// "sin_lugar" o "cerrado".
    /// </summary>
    public async Task<ChequeoSolicitudDto> ChequearAsync(ReservaWeb w)
    {
        var data = await _diaService.GetTurnoAsync(w.Fecha, w.Turno, w.SalonId, sembrar: false);
        var libres = MesasLibresEfectivas(data, w.ReservaId).OrderBy(m => m.Orden).ToList();
        var lugares = libres.Sum(m => m.Capacidad);
        var aLaHora = data.Reservas.Count(r => r.Pax is not null && r.Hora == w.Hora && r.Id != w.ReservaId);
        var cupo = CupoDe(w.Turno, w.Hora);
        var sugeridas = SugerirMesas(libres, w.Pax);

        string estado;
        if (data.EstaCerrado) estado = "cerrado";
        else if (data.Mesas.Count == 0) estado = "ok"; // salon sin mesas cargadas: lo decide el equipo
        else if (lugares < w.Pax || sugeridas.Count == 0) estado = "sin_lugar";
        else if (aLaHora >= cupo || lugares < w.Pax * 2 || libres.Count <= 3) estado = "justo";
        else estado = "ok";

        return new ChequeoSolicitudDto(
            estado,
            libres.Count,
            lugares,
            aLaHora,
            cupo,
            sugeridas,
            libres.Select(m => new MesaLibreDto(m.Id, m.Codigo, m.Capacidad)).ToList());
    }

    // Una sola mesa (la mas chica en la que entran) o, si no hay, las mas
    // grandes hasta sumar la gente (pocas mesas para juntar).
    private static List<int> SugerirMesas(List<MesaDto> libres, int pax)
    {
        var una = libres.Where(m => m.Capacidad >= pax).OrderBy(m => m.Capacidad).ThenBy(m => m.Orden).FirstOrDefault();
        if (una is not null) return [una.Id];
        var elegidas = new List<int>();
        var suma = 0;
        foreach (var m in libres.OrderByDescending(m => m.Capacidad).ThenBy(m => m.Orden))
        {
            elegidas.Add(m.Id);
            suma += m.Capacidad;
            if (suma >= pax) return elegidas;
        }
        return [];
    }
}
