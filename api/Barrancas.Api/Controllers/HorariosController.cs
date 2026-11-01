using System.Globalization;
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
/// Horarios de cada turno por salón y cuántas filas tiene cada uno (ver
/// Models/HorarioTurno.cs). Solo Admin. Guardar reemplaza la lista entera de
/// ese salón y turno; «Restaurar» la borra y el salón vuelve a usar los de
/// siempre. En los dos casos se aplica de hoy en adelante, también a los días
/// que ya tenían la planilla abierta (solo sus filas vacías, ver
/// HorariosTurnoService.AplicarADiasAbiertosAsync); los días anteriores a hoy
/// no se tocan.
/// </summary>
[ApiController]
[Authorize(Roles = "Admin")]
[Route("api/horarios")]
public class HorariosController : ControllerBase
{
    private readonly BarrancasDbContext _db;
    private readonly DiaService _dias;
    private readonly IHubContext<ReservasHub> _hub;

    public HorariosController(BarrancasDbContext db, DiaService dias, IHubContext<ReservasHub> hub)
    {
        _db = db;
        _dias = dias;
        _hub = hub;
    }

    [HttpGet]
    public async Task<ActionResult<HorariosSalonDto>> Get([FromQuery] int salonId)
    {
        var salon = await _db.Salones.FirstOrDefaultAsync(s => s.Id == salonId);
        if (salon is null) return NotFound(new { error = "No existe ese salón." });
        return Ok(await ArmarAsync(salon));
    }

    [HttpPut("{salonId:int}/{turno}")]
    public async Task<ActionResult<HorariosSalonDto>> Guardar(int salonId, string turno, GuardarHorariosRequest req)
    {
        var salon = await _db.Salones.FirstOrDefaultAsync(s => s.Id == salonId);
        if (salon is null) return NotFound(new { error = "No existe ese salón." });
        if (!TryParseTurno(turno, out var t)) return BadRequest(new { error = "Turno inválido." });

        var lista = req.Horarios ?? [];
        if (lista.Count == 0) return BadRequest(new { error = "Tiene que quedar al menos un horario." });
        if (lista.Count > HorariosTurnoService.MaxHorarios)
        {
            return BadRequest(new { error = $"Como máximo {HorariosTurnoService.MaxHorarios} horarios por turno." });
        }
        var limpios = new List<HorarioTurno>();
        foreach (var f in lista)
        {
            if (!TimeOnly.TryParseExact(f.Hora?.Trim(), "HH:mm", CultureInfo.InvariantCulture, DateTimeStyles.None, out var hora))
            {
                return BadRequest(new { error = $"«{f.Hora}» no es un horario válido (usá HH:mm, por ejemplo 21:00)." });
            }
            if (f.Filas < 1 || f.Filas > HorariosTurnoService.MaxFilasPorHorario)
            {
                return BadRequest(new { error = $"Cada horario tiene que tener entre 1 y {HorariosTurnoService.MaxFilasPorHorario} filas." });
            }
            var texto = hora.ToString("HH:mm", CultureInfo.InvariantCulture);
            if (limpios.Any(x => x.Hora == texto)) return BadRequest(new { error = $"El horario {texto} está repetido." });
            limpios.Add(new HorarioTurno { SalonId = salonId, Turno = t, Hora = texto, Filas = f.Filas });
        }

        var anteriores = await _db.HorariosTurno.Where(h => h.SalonId == salonId && h.Turno == t).ToListAsync();
        _db.HorariosTurno.RemoveRange(anteriores);
        _db.HorariosTurno.AddRange(limpios);
        await _db.SaveChangesAsync();
        var dias = await AplicarAsync(salonId, t);
        return Ok(await ArmarAsync(salon, dias));
    }

    // Vuelve a los horarios de siempre para ese salón y turno.
    [HttpDelete("{salonId:int}/{turno}")]
    public async Task<ActionResult<HorariosSalonDto>> Restaurar(int salonId, string turno)
    {
        var salon = await _db.Salones.FirstOrDefaultAsync(s => s.Id == salonId);
        if (salon is null) return NotFound(new { error = "No existe ese salón." });
        if (!TryParseTurno(turno, out var t)) return BadRequest(new { error = "Turno inválido." });

        var anteriores = await _db.HorariosTurno.Where(h => h.SalonId == salonId && h.Turno == t).ToListAsync();
        _db.HorariosTurno.RemoveRange(anteriores);
        await _db.SaveChangesAsync();
        var dias = await AplicarAsync(salonId, t);
        return Ok(await ArmarAsync(salon, dias));
    }

    // De hoy en adelante, a los días que ya tienen la planilla abierta, y
    // aviso en vivo a quien tenga abierto alguno de esos días en el panel.
    private async Task<int> AplicarAsync(int salonId, Turno turno)
    {
        ReservaOnlineService.InvalidarCache();
        var dias = await HorariosTurnoService.AplicarADiasAbiertosAsync(_db, salonId, turno, ReservaOnlineService.HoyLocal());
        foreach (var fecha in dias)
        {
            var data = await _dias.GetTurnoAsync(fecha, turno, salonId, sembrar: false);
            var grupo = ReservasHub.GrupoDe(fecha.ToString("yyyy-MM-dd"), turno.ToString().ToLowerInvariant(), salonId);
            await _hub.Clients.Group(grupo).SendAsync("TurnoActualizado", data);
        }
        return dias.Count;
    }

    private async Task<HorariosSalonDto> ArmarAsync(Salon salon, int diasActualizados = 0)
    {
        var turnos = new List<HorariosTurnoDto>();
        foreach (var t in new[] { Turno.Almuerzo, Turno.Merienda, Turno.Cena })
        {
            if (t == Turno.Merienda && !salon.PermiteMerienda) continue;
            var personalizado = await _db.HorariosTurno.AnyAsync(h => h.SalonId == salon.Id && h.Turno == t);
            var franjas = await HorariosTurnoService.ObtenerAsync(_db, salon.Id, t);
            turnos.Add(new HorariosTurnoDto(
                t.ToString().ToLowerInvariant(),
                personalizado,
                franjas.Select(f => new FranjaHorariaDto(f.Hora, f.Filas)).ToList()));
        }
        return new HorariosSalonDto(salon.Id, turnos, diasActualizados);
    }

    private static bool TryParseTurno(string? texto, out Turno turno)
    {
        switch (texto?.Trim().ToLowerInvariant())
        {
            case "almuerzo": turno = Turno.Almuerzo; return true;
            case "merienda": turno = Turno.Merienda; return true;
            case "cena": turno = Turno.Cena; return true;
            default: turno = default; return false;
        }
    }
}
