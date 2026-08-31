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
/// Toggle de "esta mesa esta ocupada por un walk-in" desde el panel de mesas
/// disponibles (alguien que llega sin reserva). A proposito no crea ni borra
/// filas de Reserva: un walk-in solo pinta la mesa de otro color en el panel,
/// nunca se agrega a la lista de reservas ni cuenta para los totales de pax.
/// No hace falta que el request indique el salon: se deriva de la mesa
/// (Mesa.SalonId) porque una mesa siempre pertenece a un solo salon.
/// </summary>
[ApiController]
[Authorize]
[Route("api/walkin")]
public class WalkInController : ControllerBase
{
    private readonly BarrancasDbContext _db;
    private readonly DiaService _diaService;
    private readonly IHubContext<ReservasHub> _hub;

    public WalkInController(BarrancasDbContext db, DiaService diaService, IHubContext<ReservasHub> hub)
    {
        _db = db;
        _diaService = diaService;
        _hub = hub;
    }

    [HttpPost("toggle")]
    public async Task<ActionResult<TurnoDataDto>> Toggle(ToggleWalkInRequest req)
    {
        var existente = await _db.WalkIns.FirstOrDefaultAsync(w =>
            w.Fecha == req.Fecha && w.Turno == req.Turno && w.MesaId == req.MesaId);

        if (existente is not null)
        {
            // Ya estaba marcada: togglear la libera.
            var salonExistente = existente.SalonId;
            _db.WalkIns.Remove(existente);
            await _db.SaveChangesAsync();
            return Ok(await BroadcastTurnoAsync(req.Fecha, req.Turno, salonExistente));
        }

        var mesa = await _db.Mesas.FirstOrDefaultAsync(m => m.Id == req.MesaId);
        if (mesa is null)
        {
            return BadRequest(new { error = "la mesa indicada no existe" });
        }

        // No marcar como walk-in una mesa que ya tiene una reserva real
        // asignada en este turno — evita pintar/ocupar algo que ya esta
        // ocupado por otra via. Ahora una reserva puede tener varias mesas,
        // asi que se busca en ReservaMesas en vez de un MesaId suelto.
        var yaReservada = await _db.ReservaMesas.AnyAsync(rm =>
            rm.MesaId == req.MesaId && rm.Reserva.Fecha == req.Fecha && rm.Reserva.Turno == req.Turno);
        if (yaReservada)
        {
            return BadRequest(new { error = "esa mesa ya tiene una reserva asignada en este turno" });
        }

        _db.WalkIns.Add(new WalkIn { Fecha = req.Fecha, Turno = req.Turno, MesaId = req.MesaId, SalonId = mesa.SalonId });
        await _db.SaveChangesAsync();

        return Ok(await BroadcastTurnoAsync(req.Fecha, req.Turno, mesa.SalonId));
    }

    private async Task<TurnoDataDto> BroadcastTurnoAsync(DateOnly fecha, Turno turno, int salonId)
    {
        var data = await _diaService.GetTurnoAsync(fecha, turno, salonId);
        var grupo = ReservasHub.GrupoDe(fecha.ToString("yyyy-MM-dd"), turno.ToString().ToLowerInvariant(), salonId);
        await _hub.Clients.Group(grupo).SendAsync("TurnoActualizado", data);
        return data;
    }
}
