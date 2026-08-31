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
/// Cerrar/reabrir un turno puntual (fecha+turno+salon) para que no se tomen
/// reservas nuevas — ver Models/CierreTurno.cs. Exclusivo de Admin: es una
/// decision operativa de peso (bloquea todo el turno), no una carga del
/// dia a dia.
/// </summary>
[ApiController]
[Authorize(Roles = "Admin")]
[Route("api/cierres")]
public class CierresController : ControllerBase
{
    private readonly BarrancasDbContext _db;
    private readonly DiaService _diaService;
    private readonly IHubContext<ReservasHub> _hub;

    public CierresController(BarrancasDbContext db, DiaService diaService, IHubContext<ReservasHub> hub)
    {
        _db = db;
        _diaService = diaService;
        _hub = hub;
    }

    // Mismo patron que WalkInController.Toggle: si el turno no estaba
    // cerrado, lo cierra (con el motivo, si vino); si ya estaba cerrado, lo
    // reabre (el motivo se ignora en ese caso).
    [HttpPost("toggle")]
    public async Task<ActionResult<TurnoDataDto>> Toggle(ToggleCierreRequest req)
    {
        if (!await _db.Salones.AnyAsync(s => s.Id == req.SalonId))
        {
            return BadRequest(new { error = "el salón indicado no existe" });
        }

        var existente = await _db.CierresTurno.FirstOrDefaultAsync(c =>
            c.Fecha == req.Fecha && c.Turno == req.Turno && c.SalonId == req.SalonId);

        if (existente is not null)
        {
            _db.CierresTurno.Remove(existente);
        }
        else
        {
            _db.CierresTurno.Add(new CierreTurno
            {
                Fecha = req.Fecha,
                Turno = req.Turno,
                SalonId = req.SalonId,
                Motivo = req.Motivo,
            });
        }

        await _db.SaveChangesAsync();

        var data = await _diaService.GetTurnoAsync(req.Fecha, req.Turno, req.SalonId);
        var grupo = ReservasHub.GrupoDe(req.Fecha.ToString("yyyy-MM-dd"), req.Turno.ToString().ToLowerInvariant(), req.SalonId);
        await _hub.Clients.Group(grupo).SendAsync("TurnoActualizado", data);
        return Ok(data);
    }
}