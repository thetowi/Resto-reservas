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
        var yaExiste = await _db.Reservas.AnyAsync(r => r.Fecha == fecha && r.Turno == turno && r.SalonId == salonId);
        if (yaExiste) return;

        var horarios = HorariosDefault.Para(turno);
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

    public async Task<TurnoDataDto> GetTurnoAsync(DateOnly fecha, Turno turno, int salonId)
    {
        var cierre = await _db.CierresTurno
            .FirstOrDefaultAsync(c => c.Fecha == fecha && c.Turno == turno && c.SalonId == salonId);

        // Si esta cerrado no tiene sentido pre-generar las filas default del
        // turno (ver SeedTurnoSiVacioAsync): no se van a cargar reservas,
        // quedarian sin usarse hasta que alguien reabra.
        if (cierre is null)
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
                r.Pax, r.Nombre, r.HabTel, r.Comentarios, r.Asistio, r.PidioMesa,
                r.UpdatedAt))
            .ToListAsync();

        var totalPax = reservas.Sum(r => r.Pax ?? 0);
        var totalAsistio = reservas.Where(r => r.Asistio).Sum(r => r.Pax ?? 0);
        var mesasOcupadas = reservas.SelectMany(r => r.MesaIds).Distinct().ToList();
        var mesasPedidas = reservas.Where(r => r.PidioMesa).SelectMany(r => r.MesaIds).Distinct().ToList();
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

        var mesas = await _db.Mesas
            .Where(m => m.SalonId == salonId)
            .Where(m => !m.EsTemporal || hijasActivas.Contains(m.Id))
            .Where(m => !basesDivididas.Contains(m.Id))
            .OrderBy(m => m.Orden)
            .Select(m => new MesaDto(m.Id, m.Codigo, m.Capacidad, m.MesaPadreId, m.Orden, m.PosX, m.PosY, m.SalonId, m.EsTemporal))
            .ToListAsync();

        return new TurnoDataDto(
            fecha, turno, salonId, reservas, totalPax, totalAsistio, mesasOcupadas, mesasPedidas, mesasWalkIn,
            cierre is not null, cierre?.Motivo, mesas);
    }

    public async Task<DiaDto> GetDiaAsync(DateOnly fecha, int salonId)
    {
        var almuerzo = await GetTurnoAsync(fecha, Turno.Almuerzo, salonId);
        var cena = await GetTurnoAsync(fecha, Turno.Cena, salonId);
        return new DiaDto(fecha, almuerzo, cena);
    }
}
