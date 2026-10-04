using Barrancas.Api.Data;
using Barrancas.Api.Dtos;
using Barrancas.Api.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Barrancas.Api.Controllers;

/// <summary>
/// Administra las fechas en las que el chatbot de WhatsApp NO toma reservas
/// (ver Models/FechaBloqueadaBot.cs) — por ejemplo alta ocupacion del hotel
/// o un evento puntual. El staff sigue pudiendo cargar reservas a mano esos
/// dias con total normalidad; esto solo frena al bot. Exclusivo de Admin,
/// mismo criterio que CierresController/ReduccionesController (decision
/// operativa de peso).
/// </summary>
[ApiController]
[Authorize(Roles = "Admin")]
[Route("api/fechas-bloqueadas-bot")]
public class FechasBloqueadasBotController : ControllerBase
{
    private readonly BarrancasDbContext _db;

    public FechasBloqueadasBotController(BarrancasDbContext db)
    {
        _db = db;
    }

    [HttpGet]
    public async Task<ActionResult<List<FechaBloqueadaBotDto>>> Listar()
    {
        var fechas = await _db.FechasBloqueadasBot
            .OrderBy(f => f.Fecha)
            .Select(f => new FechaBloqueadaBotDto(f.Id, f.Fecha, f.Motivo, f.CreatedAt))
            .ToListAsync();
        return Ok(fechas);
    }

    [HttpPost]
    public async Task<ActionResult<FechaBloqueadaBotDto>> Crear(CrearFechaBloqueadaBotRequest req)
    {
        if (await _db.FechasBloqueadasBot.AnyAsync(f => f.Fecha == req.Fecha))
        {
            return BadRequest(new { error = "esa fecha ya está bloqueada para el bot" });
        }

        var fecha = new FechaBloqueadaBot { Fecha = req.Fecha, Motivo = req.Motivo };
        _db.FechasBloqueadasBot.Add(fecha);
        await _db.SaveChangesAsync();

        return Ok(new FechaBloqueadaBotDto(fecha.Id, fecha.Fecha, fecha.Motivo, fecha.CreatedAt));
    }

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Borrar(int id)
    {
        var fecha = await _db.FechasBloqueadasBot.FirstOrDefaultAsync(f => f.Id == id);
        if (fecha is null) return NotFound(new { error = "no encontrada" });

        _db.FechasBloqueadasBot.Remove(fecha);
        await _db.SaveChangesAsync();
        return NoContent();
    }
}
