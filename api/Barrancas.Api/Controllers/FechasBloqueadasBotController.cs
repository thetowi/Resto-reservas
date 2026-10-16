using Barrancas.Api.Data;
using Barrancas.Api.Dtos;
using Barrancas.Api.Models;
using Barrancas.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Barrancas.Api.Controllers;

/// <summary>
/// Fechas sin reservas web (ver Models/FechaBloqueadaBot.cs): los dias (o un
/// turno de un dia) en que el link publico no toma reservas y le muestra al
/// cliente un mensaje con el boton de WhatsApp; opcionalmente tambien frena
/// al chatbot. Se usa desde el panel (boton "Reservas web" de cada turno) y
/// desde /admin/fechas-web. Ver lo puede cualquiera del equipo (para que se
/// vea el aviso en el panel); cambiarlo, solo Admin — mismo criterio que
/// CierresController/ReduccionesController (decision operativa de peso).
/// </summary>
[ApiController]
[Authorize]
[Route("api/fechas-bloqueadas-bot")]
public class FechasBloqueadasBotController : ControllerBase
{
    private const int MaxDiasPorRango = 62;
    private readonly BarrancasDbContext _db;

    public FechasBloqueadasBotController(BarrancasDbContext db)
    {
        _db = db;
    }

    private static FechaBloqueadaBotDto ADto(FechaBloqueadaBot f) =>
        new(f.Id, f.Fecha, f.Turno, f.Motivo, f.MensajeCliente, f.IncluyeBot, f.CreatedAt);

    private static string? Limpio(string? texto, int max)
    {
        if (string.IsNullOrWhiteSpace(texto)) return null;
        var t = texto.Trim();
        return t.Length > max ? t[..max] : t;
    }

    // Por defecto, de hoy en adelante (las pasadas no le sirven a nadie).
    [HttpGet]
    public async Task<ActionResult<List<FechaBloqueadaBotDto>>> Listar([FromQuery] DateOnly? desde = null)
    {
        var minimo = desde ?? ReservaOnlineService.HoyLocal();
        var fechas = await _db.FechasBloqueadasBot
            .Where(f => f.Fecha >= minimo)
            .OrderBy(f => f.Fecha)
            .ToListAsync();
        return Ok(fechas.Select(ADto).ToList());
    }

    [HttpPost]
    [Authorize(Roles = "Admin")]
    public async Task<ActionResult<List<FechaBloqueadaBotDto>>> Crear(CrearFechaBloqueadaBotRequest req)
    {
        var hasta = req.Hasta ?? req.Desde;
        if (hasta < req.Desde)
        {
            return BadRequest(new { error = "la fecha «hasta» es anterior a «desde»" });
        }
        if (hasta.DayNumber - req.Desde.DayNumber + 1 > MaxDiasPorRango)
        {
            return BadRequest(new { error = $"elegí un rango de hasta {MaxDiasPorRango} días" });
        }

        var existentes = await _db.FechasBloqueadasBot
            .Where(f => f.Fecha >= req.Desde && f.Fecha <= hasta)
            .ToDictionaryAsync(f => f.Fecha);
        var resultado = new List<FechaBloqueadaBot>();
        for (var d = req.Desde; d <= hasta; d = d.AddDays(1))
        {
            if (!existentes.TryGetValue(d, out var fila))
            {
                fila = new FechaBloqueadaBot { Fecha = d };
                _db.FechasBloqueadasBot.Add(fila);
            }
            fila.Turno = req.Turno;
            fila.Motivo = Limpio(req.Motivo, 60);
            fila.MensajeCliente = Limpio(req.MensajeCliente, 300);
            fila.IncluyeBot = req.IncluyeBot;
            resultado.Add(fila);
        }
        await _db.SaveChangesAsync();
        ReservaOnlineService.InvalidarCache();

        return Ok(resultado.Select(ADto).ToList());
    }

    [HttpPut("{id:int}")]
    [Authorize(Roles = "Admin")]
    public async Task<ActionResult<FechaBloqueadaBotDto>> Actualizar(int id, ActualizarFechaBloqueadaBotRequest req)
    {
        var fila = await _db.FechasBloqueadasBot.FirstOrDefaultAsync(f => f.Id == id);
        if (fila is null) return NotFound(new { error = "no encontrada" });

        fila.Turno = req.Turno;
        fila.Motivo = Limpio(req.Motivo, 60);
        fila.MensajeCliente = Limpio(req.MensajeCliente, 300);
        fila.IncluyeBot = req.IncluyeBot;
        await _db.SaveChangesAsync();
        ReservaOnlineService.InvalidarCache();
        return Ok(ADto(fila));
    }

    [HttpDelete("{id:int}")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> Borrar(int id)
    {
        var fecha = await _db.FechasBloqueadasBot.FirstOrDefaultAsync(f => f.Id == id);
        if (fecha is null) return NotFound(new { error = "no encontrada" });

        _db.FechasBloqueadasBot.Remove(fecha);
        await _db.SaveChangesAsync();
        ReservaOnlineService.InvalidarCache();
        return NoContent();
    }
}
