using Barrancas.Api.Data;
using Barrancas.Api.Dtos;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Barrancas.Api.Controllers;

/// <summary>
/// Calendario del encabezado del panel (components/DateNav.tsx): por cada dia
/// del rango, cuantas reservas y cuanta gente hay cargadas (todos los salones
/// y turnos), para dibujar la rayita que dice que dias vienen cargados. Lo
/// usa todo el equipo (a diferencia de /api/reportes, que es solo Admin).
/// Igual que el reporte, cuenta solo filas con Pax: las filas vacias que se
/// generan por turno no son reservas. Los dias sin reservas no vienen.
/// </summary>
[ApiController]
[Authorize]
[Route("api/calendario")]
public class CalendarioController : ControllerBase
{
    // El calendario muestra 6 semanas (42 dias); un poco de margen.
    private const int MaxDias = 62;

    private readonly BarrancasDbContext _db;

    public CalendarioController(BarrancasDbContext db)
    {
        _db = db;
    }

    [HttpGet]
    public async Task<ActionResult<List<CalendarioDiaDto>>> Get([FromQuery] DateOnly desde, [FromQuery] DateOnly hasta)
    {
        if (hasta < desde)
        {
            return BadRequest(new { error = "hasta tiene que ser igual o posterior a desde" });
        }
        if (hasta.DayNumber - desde.DayNumber + 1 > MaxDias)
        {
            return BadRequest(new { error = $"el rango no puede pasar de {MaxDias} días" });
        }

        var filas = await _db.Reservas
            .Where(r => r.Fecha >= desde && r.Fecha <= hasta && r.Pax != null)
            .Select(r => new { r.Fecha, r.Pax })
            .ToListAsync();

        var dias = filas
            .GroupBy(r => r.Fecha)
            .Select(g => new CalendarioDiaDto(g.Key, g.Count(), g.Sum(r => r.Pax ?? 0)))
            .OrderBy(d => d.Fecha)
            .ToList();

        return Ok(dias);
    }
}
