using Barrancas.Api.Data;
using Barrancas.Api.Dtos;
using Barrancas.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace Barrancas.Api.Services;

/// <summary>
/// Arma la vista de un dia/turno DE UN SALON PUNTUAL (ver Models/Salon.cs):
/// genera las filas default si ese turno de ese salon esta vacio (igual que
/// hacia la planilla al abrir un dia nuevo), calcula totales de pax/
/// asistencia, y cuales de las mesas de ese salon ya estan ocupadas en ese
/// turno (reemplazo del MATCH + formato condicional de Sheets). Cada salon
/// tiene su propia lista de reservas independiente, asi que todo aca esta
/// filtrado por SalonId ademas de Fecha/Turno.
/// </summary>
public class DiaService
{
    private readonly BarrancasDbContext _db;

    public DiaService(BarrancasDbContext db)
    {
        _db = db;
    }

    public async Task SeedTurnoSiVacioAsync(DateOnly fecha, Turno turno, int salonId)
    {
        if (await TieneFilasAsync(fecha, turno, salonId)) return;

        // El mismo día se puede pedir varias veces a la vez (el panel lo pide
        // para el salón elegido y para el resumen de salones, otra tablet, el
        // link…): con el candado lo abre uno solo; los demás esperan y, al
        // volver a mirar, ya lo encuentran abierto. Sin esto el día quedaba
        // con las filas duplicadas o triplicadas.
        var candado = HorariosTurnoService.Candado(salonId, turno);
        await candado.WaitAsync();
        try
        {
            if (await TieneFilasAsync(fecha, turno, salonId)) return;
            await CrearFilasAsync(fecha, turno, salonId);
        }
        finally
        {
            candado.Release();
        }
    }

    private Task<bool> TieneFilasAsync(DateOnly fecha, Turno turno, int salonId) =>
        _db.Reservas.AnyAsync(r => r.Fecha == fecha && r.Turno == turno && r.SalonId == salonId);

    private async Task CrearFilasAsync(DateOnly fecha, Turno turno, int salonId)
    {
        // Los horarios que configuró el Admin para este salón y turno (o los
        // de siempre, ver HorariosTurnoService): una fila vacía por cada fila
        // de cada horario.
        var horarios = HorariosTurnoService.Filas(await HorariosTurnoService.ObtenerAsync(_db, salonId, turno));
        var nuevas = horarios.Select((hora, i) => new Reserva
        {
            Fecha = fecha,
            Turno = turno,
            SalonId = salonId,
            Orden = i,
            Hora = hora,
            Asistio = false,
        });

        await _db.Reservas.AddRangeAsync(nuevas);
        await _db.SaveChangesAsync();
    }

    // sembrar=false: solo lectura, no genera las filas default si el turno
    // esta vacio. Lo usa el link publico de reservas (ReservaOnlineService)
    // para consultar disponibilidad de muchos dias sin dejar filas vacias
    // creadas por cada consulta anonima.
    public async Task<TurnoDataDto> GetTurnoAsync(DateOnly fecha, Turno turno, int salonId, bool sembrar = true)
    {
        var (cerrado, motivoCierre) = await EstadoCierreAsync(fecha, turno, salonId);

        // Si esta cerrado no tiene sentido pre-generar las filas default del
        // turno (ver SeedTurnoSiVacioAsync): no se van a cargar reservas,
        // quedarian sin usarse hasta que alguien reabra.
        if (!cerrado && sembrar)
        {
            await SeedTurnoSiVacioAsync(fecha, turno, salonId);
        }

        var reservas = await _db.Reservas
            .Where(r => r.Fecha == fecha && r.Turno == turno && r.SalonId == salonId)
            .OrderBy(r => r.Orden)
            .Select(r => new ReservaDto(
                r.Id, r.Fecha, r.Turno, r.Orden, r.Hora,
                r.ReservaMesas.OrderBy(rm => rm.Mesa.Orden).Select(rm => rm.MesaId).ToList(),
                r.ReservaMesas.OrderBy(rm => rm.Mesa.Orden).Select(rm => rm.Mesa.Codigo).ToList(),
                r.Pax, r.Nombre, r.HabTel, r.Comentarios, r.Asistio, r.PidioMesa, r.Retirada,
                r.UpdatedAt, r.Origen, r.Estado, r.RecibidaEn, r.RecibidaPor, r.SectorId))
            .ToListAsync();

        var totalPax = reservas.Sum(r => r.Pax ?? 0);
        var totalAsistio = reservas.Where(r => r.Asistio).Sum(r => r.Pax ?? 0);
        // Una reserva "retirada" (ya vino, comio y se fue — ver
        // Models/Reserva.cs) deja de contar sus mesas como ocupadas/pedidas:
        // sus MesaIds se siguen mostrando en la fila (historial), pero acá
        // se excluyen a proposito para que la mesa quede libre en el panel
        // y en el plano, disponible para un walk-in u otra reserva.
        var mesasOcupadas = reservas.Where(r => !r.Retirada).SelectMany(r => r.MesaIds).Distinct().ToList();
        var mesasPedidas = reservas.Where(r => r.PidioMesa && !r.Retirada).SelectMany(r => r.MesaIds).Distinct().ToList();
        var mesasWalkIn = await _db.WalkIns
            .Where(w => w.Fecha == fecha && w.Turno == turno && w.SalonId == salonId)
            .Select(w => w.MesaId)
            .ToListAsync();

        // Mesas que ve ESTE turno puntual: las estructurales del salon (bases y
        // divisiones permanentes de /admin/mesas), salvo las que estan
        // divididas temporalmente para esta fecha+turno (esas se ocultan, se
        // muestran sus dos mitades en su lugar); mas las mitades temporales que
        // SI pertenecen a esta fecha+turno.
        var divisiones = await _db.DivisionesMesaTurno
            .Where(d => d.Fecha == fecha && d.Turno == turno && d.SalonId == salonId)
            .ToListAsync();
        var basesDivididas = divisiones.Select(d => d.MesaBaseId).ToHashSet();
        var hijasActivas = divisiones.SelectMany(d => new[] { d.MesaHijaAId, d.MesaHijaBId }).ToHashSet();

        // Renombres activos para este turno puntual (ver Models/
        // RenombreMesaTurno.cs): mesaId -> codigo nuevo a mostrar. No ocultan
        // ni crean ninguna mesa (a diferencia de divisiones): solo cambian
        // el Codigo con el que se ve una mesa que sigue siendo la misma.
        var renombres = await _db.RenombresMesaTurno
            .Where(r => r.Fecha == fecha && r.Turno == turno && r.SalonId == salonId)
            .ToDictionaryAsync(r => r.MesaId, r => r.CodigoNuevo);

        var mesas = await _db.Mesas
            .Where(m => m.SalonId == salonId)
            .Where(m => !m.EsTemporal || hijasActivas.Contains(m.Id))
            .Where(m => !basesDivididas.Contains(m.Id))
            .OrderBy(m => m.Orden)
            .Select(m => new MesaDto(
                m.Id,
                m.Codigo,
                m.Capacidad,
                m.MesaPadreId,
                m.Orden,
                m.PosX,
                m.PosY,
                m.SalonId,
                m.EsTemporal,
                m.Forma,
                m.Fijada,
                m.Rotacion,
                null,
                false,
                m.SectorId))
            .ToListAsync();

        // Aplicamos los renombres despues de traer la lista (no se puede
        // resolver el diccionario dentro del Select de EF/SQL): si hay uno
        // activo para esta mesa, Codigo pasa a ser el nuevo numero y
        // CodigoOriginal guarda el real, para que el frontend pueda ofrecer
        // "revertir".
        mesas = mesas
            .Select(m => renombres.TryGetValue(m.Id, out var codigoNuevo)
                ? m with { Codigo = codigoNuevo, CodigoOriginal = m.Codigo }
                : m)
            .ToList();

        // Mesas reducidas para este turno puntual (ver "Reducir salón" /
        // ReduccionesController, Models/MesaReducida.cs): no se ocultan ni
        // se filtran de esta lista (el plano y el resto de la app siguen
        // viéndolas normal) — solo se marcan con Reducida=true para que el
        // frontend (MesasPanel.tsx) las saque puntualmente de "Mesas
        // disponibles".
        var reducidas = (await _db.MesasReducidas
            .Where(x => x.Fecha == fecha && x.Turno == turno && x.SalonId == salonId)
            .Select(x => x.MesaId)
            .ToListAsync()).ToHashSet();

        mesas = mesas
            .Select(m => reducidas.Contains(m.Id) ? m with { Reducida = true } : m)
            .ToList();

        // Sectores del salón y cómo quedaron en este turno (abierto, cerrado
        // o con un grupo): ver Models/SectorTurno.cs.
        var sectores = await _db.Sectores
            .Where(s => s.SalonId == salonId)
            .OrderBy(s => s.Orden).ThenBy(s => s.Nombre)
            .ToListAsync();
        var estados = sectores.Count == 0
            ? new Dictionary<int, SectorTurno>()
            : await _db.SectoresTurno
                .Where(x => x.Fecha == fecha && x.Turno == turno && x.SalonId == salonId)
                .ToDictionaryAsync(x => x.SectorId);
        var sectoresDto = sectores.Select(s =>
        {
            estados.TryGetValue(s.Id, out var est);
            return new SectorTurnoDto(
                s.Id, s.Nombre, s.Color,
                est is null ? "abierto" : est.Estado == EstadoSector.Grupo ? "grupo" : "cerrado",
                est?.Motivo,
                est?.ReservaId,
                mesas.Where(m => m.SectorId == s.Id).Select(m => m.Id).ToList());
        }).ToList();

        return new TurnoDataDto(
            fecha, turno, salonId, reservas, totalPax, totalAsistio, mesasOcupadas, mesasPedidas, mesasWalkIn,
            cerrado, motivoCierre, mesas, sectoresDto);
    }

    private static readonly string[] NombreDia = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábados", "domingos"];

    /// <summary>
    /// ¿El turno está cerrado ese día? Por «Cerrar turno» (CierreTurno), o
    /// porque el salón no ofrece ese turno o no abre ese día de la semana
    /// (ver Salon.AbreEl), salvo que se haya reabierto para ese día
    /// (CierreTurno.Reabierto). Devuelve también el motivo para mostrar.
    /// </summary>
    public async Task<(bool Cerrado, string? Motivo)> EstadoCierreAsync(DateOnly fecha, Turno turno, int salonId)
    {
        var cierre = await _db.CierresTurno
            .AsNoTracking()
            .FirstOrDefaultAsync(c => c.Fecha == fecha && c.Turno == turno && c.SalonId == salonId);
        if (cierre is not null) return cierre.Reabierto ? (false, null) : (true, cierre.Motivo);

        var salon = await _db.Salones.AsNoTracking().FirstOrDefaultAsync(s => s.Id == salonId);
        if (salon is null) return (false, null);
        if (!salon.Ofrece(turno)) return (true, $"Este salón no ofrece {turno.ToString().ToLowerInvariant()}.");
        if (!salon.AbreEl(turno, fecha))
        {
            return (true, $"Este salón no abre los {NombreDia[((int)fecha.DayOfWeek + 6) % 7]} ({turno.ToString().ToLowerInvariant()}).");
        }
        return (false, null);
    }

    public async Task<bool> TurnoCerradoAsync(DateOnly fecha, Turno turno, int salonId) =>
        (await EstadoCierreAsync(fecha, turno, salonId)).Cerrado;

    /// <summary>
    /// Qué parte del salón queda abierta para reservas nuevas en este turno
    /// (0 a 1), por capacidad: se descuentan las mesas reducidas (a mano o
    /// por un sector cerrado) y las de un sector ocupado por un grupo. Con
    /// esto se achican las filas de la planilla y el cupo del link.
    /// </summary>
    public static double FactorAbierto(TurnoDataDto data)
    {
        var total = data.Mesas.Sum(m => m.Capacidad);
        if (total <= 0) return 1;
        var deGrupos = (data.Sectores ?? [])
            .Where(s => s.Estado == "grupo")
            .SelectMany(s => s.MesaIds)
            .ToHashSet();
        var abierta = data.Mesas.Where(m => !m.Reducida && !deGrupos.Contains(m.Id)).Sum(m => m.Capacidad);
        return Math.Clamp((double)abierta / total, 0, 1);
    }

    /// <summary>
    /// Filas por horario que le tocan a este turno: las configuradas,
    /// achicadas según la parte del salón que quedó abierta, más una por cada
    /// grupo que ocupa un sector (su reserva no le quita lugar al resto). Es
    /// también el cupo de cada horario en el link.
    /// </summary>
    public static List<HorariosTurnoService.Franja> FranjasDelTurno(List<HorariosTurnoService.Franja> configuradas, TurnoDataDto data)
    {
        var franjas = HorariosTurnoService.Escalar(configuradas, FactorAbierto(data));
        var grupos = data.Reservas.Where(r => r.SectorId is not null && r.Hora is not null).GroupBy(r => r.Hora!).ToDictionary(g => g.Key, g => g.Count());
        if (grupos.Count == 0) return franjas;
        return franjas.Select(f => grupos.TryGetValue(f.Hora, out var n) ? f with { Filas = f.Filas + n } : f).ToList();
    }

    /// <summary>
    /// Deja la planilla de ese turno con las filas que le corresponden según
    /// la parte del salón que quedó abierta (FactorAbierto): si se cierra la
    /// mitad, queda la mitad de las filas vacías en cada horario; al volver a
    /// abrir, vuelven. Nunca borra una reserva, solo filas vacías. No abre el
    /// día si todavía no se abrió. Devuelve si cambió algo.
    /// </summary>
    public async Task<bool> AjustarFilasAsync(DateOnly fecha, Turno turno, int salonId)
    {
        var data = await GetTurnoAsync(fecha, turno, salonId, sembrar: false);
        if (data.Reservas.Count == 0 || data.EstaCerrado) return false;
        var franjas = FranjasDelTurno(await HorariosTurnoService.ObtenerAsync(_db, salonId, turno), data);

        var candado = HorariosTurnoService.Candado(salonId, turno);
        await candado.WaitAsync();
        try
        {
            var filas = await _db.Reservas
                .Include(r => r.ReservaMesas)
                .Where(r => r.Fecha == fecha && r.Turno == turno && r.SalonId == salonId)
                .ToListAsync();
            if (!HorariosTurnoService.RearmarDia(_db, fecha, salonId, turno, filas, franjas)) return false;
            await _db.SaveChangesAsync();
            return true;
        }
        finally
        {
            candado.Release();
        }
    }

    // sembrar=false: solo mirar (lo usa el resumen de salones del panel, que
    // pide el día de TODOS los salones solo para contar reservas: no tiene
    // por qué abrirle la planilla a cada uno).
    public async Task<DiaDto> GetDiaAsync(DateOnly fecha, int salonId, bool sembrar = true)
    {
        var almuerzo = await GetTurnoAsync(fecha, Turno.Almuerzo, salonId, sembrar);
        var cena = await GetTurnoAsync(fecha, Turno.Cena, salonId, sembrar);

        // Merienda solo se calcula (y solo se siembran sus filas default) si
        // ESTE salon la tiene habilitada (ver Salon.PermiteMerienda) — un
        // salon que nunca la usa no necesita generar reservas vacias para
        // ese turno en cada dia que se consulta.
        var permiteMerienda = await _db.Salones
            .Where(s => s.Id == salonId)
            .Select(s => s.PermiteMerienda)
            .FirstOrDefaultAsync();
        var merienda = permiteMerienda ? await GetTurnoAsync(fecha, Turno.Merienda, salonId, sembrar) : null;

        return new DiaDto(fecha, almuerzo, cena, merienda);
    }
}
