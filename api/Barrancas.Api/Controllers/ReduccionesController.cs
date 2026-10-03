using Barrancas.Api.Data;
using Barrancas.Api.Dtos;
using Barrancas.Api.Hubs;
using Barrancas.Api.Models;
using Barrancas.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;

namespace Barrancas.Api.Controllers;

/// <summary>
/// "Reducir salón": deshabilitar mesas LIBRES de un turno puntual cuando hay
/// poco personal — ver Models/MesaReducida.cs. Exclusivo de Admin, igual
/// criterio que CierresController (es una decision operativa de peso).
/// </summary>
[ApiController]
[Authorize(Roles = "Admin")]
[Route("api/reducciones")]
public class ReduccionesController : ControllerBase
{
    private readonly BarrancasDbContext _db;
    private readonly DiaService _diaService;
    private readonly IHubContext<ReservasHub> _hub;

    public ReduccionesController(BarrancasDbContext db, DiaService diaService, IHubContext<ReservasHub> hub)
    {
        _db = db;
        _diaService = diaService;
        _hub = hub;
    }

    // Reemplaza el set completo de mesas reducidas para esta
    // fecha+turno+salon (ver ReducirSalonRequest): a diferencia de
    // CierresController.Toggle/WalkInController.Toggle, que togglean de a
    // una, acá se manda la lista FINAL completa en cada llamado, para que
    // el mismo modal pueda sumar y sacar reducciones en una sola
    // confirmación.
    [HttpPost("set")]
    public async Task<ActionResult<TurnoDataDto>> Set(ReducirSalonRequest req)
    {
        var mesaIdsDelSalon = await _db.Mesas
            .Where(m => m.SalonId == req.SalonId)
            .Select(m => m.Id)
            .ToListAsync();

        if (mesaIdsDelSalon.Count == 0 && !await _db.Salones.AnyAsync(s => s.Id == req.SalonId))
        {
            return BadRequest(new { error = "el salón indicado no existe" });
        }

        var mesaIdsDelSalonSet = mesaIdsDelSalon.ToHashSet();
        var pedidas = req.MesaIds.Distinct().ToList();

        var fueraDelSalon = pedidas.Where(id => !mesaIdsDelSalonSet.Contains(id)).ToList();
        if (fueraDelSalon.Count > 0)
        {
            return BadRequest(new { error = "alguna mesa indicada no pertenece a este salón" });
        }

        // No tiene sentido reducir una mesa que ya tiene gente sentada (una
        // reserva real o un walk-in): mismo chequeo que usa DiaService para
        // calcular mesasOcupadas/mesasWalkIn, para que coincida con lo que
        // el frontend ya muestra como "ocupada".
        var mesasOcupadas = await _db.Reservas
            .Where(r => r.Fecha == req.Fecha && r.Turno == req.Turno && r.SalonId == req.SalonId && !r.Retirada)
            .SelectMany(r => r.ReservaMesas.Select(rm => rm.MesaId))
            .Distinct()
            .ToListAsync();
        var mesasWalkIn = await _db.WalkIns
            .Where(w => w.Fecha == req.Fecha && w.Turno == req.Turno && w.SalonId == req.SalonId)
            .Select(w => w.MesaId)
            .ToListAsync();
        var ocupadasOWalkIn = mesasOcupadas.Concat(mesasWalkIn).ToHashSet();

        if (pedidas.Any(id => ocupadasOWalkIn.Contains(id)))
        {
            return BadRequest(new { error = "no se puede reducir una mesa que ya está ocupada o con un walk-in" });
        }

        var actuales = await _db.MesasReducidas
            .Where(x => x.Fecha == req.Fecha && x.Turno == req.Turno && x.SalonId == req.SalonId)
            .ToListAsync();

        var pedidasSet = pedidas.ToHashSet();
        var actualesPorMesaId = actuales.ToDictionary(x => x.MesaId);

        var aQuitar = actuales.Where(x => !pedidasSet.Contains(x.MesaId));
        _db.MesasReducidas.RemoveRange(aQuitar);

        var aAgregar = pedidas.Where(id => !actualesPorMesaId.ContainsKey(id));
        foreach (var mesaId in aAgregar)
        {
            _db.MesasReducidas.Add(new MesaReducida
            {
                Fecha = req.Fecha,
                Turno = req.Turno,
                SalonId = req.SalonId,
                MesaId = mesaId,
            });
        }

        await _db.SaveChangesAsync();

        var data = await _diaService.GetTurnoAsync(req.Fecha, req.Turno, req.SalonId);
        var grupo = ReservasHub.GrupoDe(req.Fecha.ToString("yyyy-MM-dd"), req.Turno.ToString().ToLowerInvariant(), req.SalonId);
        await _hub.Clients.Group(grupo).SendAsync("TurnoActualizado", data);
        return Ok(data);
    }
}
