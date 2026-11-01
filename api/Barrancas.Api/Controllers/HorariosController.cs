using System.Globalization;
using Barrancas.Api.Data;
using Barrancas.Api.Dtos;
using Barrancas.Api.Models;
using Barrancas.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Barrancas.Api.Controllers;

/// <summary>
/// Horarios de cada turno por salón y cuántas filas tiene cada uno (ver
/// Models/HorarioTurno.cs). Solo Admin. Guardar reemplaza la lista entera de
/// ese salón y turno; «Restaurar» la borra y el salón vuelve a usar los de
/// siempre. Ningún cambio toca los días que ya tienen la planilla abierta.
/// </summary>
[ApiController]
[Authorize(Roles = "Admin")]
[Route("api/horarios")]
public class HorariosController : ControllerBase
{
    private readonly BarrancasDbContext _db;

    public HorariosController(BarrancasDbContext db)
    {
        _db = db;
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
        ReservaOnlineService.InvalidarCache();
        return Ok(await ArmarAsync(salon));
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
        ReservaOnlineService.InvalidarCache();
        return Ok(await ArmarAsync(salon));
    }

    private async Task<HorariosSalonDto> ArmarAsync(Salon salon)
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
        return new HorariosSalonDto(salon.Id, turnos);
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
