using Barrancas.Api.Data;
using Barrancas.Api.Dtos;
using Barrancas.Api.Hubs;
using Barrancas.Api.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;

namespace Barrancas.Api.Controllers;

/// <summary>
/// Lista de espera de un dia/turno DE UN SALON PUNTUAL: gente que llega sin
/// reserva y espera mesa. Cada salon tiene su propia lista independiente
/// (ver Models/Salon.cs) — se ordena por orden de llegada (FIFO) dentro de
/// ese salon (ver Espera.cs). Comparte el grupo de SignalR
/// "{fecha}:{turno}:{salon}" con las reservas de ese turno/salon, asi que
/// cualquiera que ya este viendo esa pantalla recibe el broadcast sin tener
/// que suscribirse a nada aparte.
/// </summary>
[ApiController]
[Authorize]
[Route("api/espera")]
public class EsperaController : ControllerBase
{
    private readonly BarrancasDbContext _db;
    private readonly IHubContext<ReservasHub> _hub;

    public EsperaController(BarrancasDbContext db, IHubContext<ReservasHub> hub)
    {
        _db = db;
        _hub = hub;
    }

    [HttpGet("{fecha}/{turno}")]
    public async Task<ActionResult<List<EsperaDto>>> GetLista(string fecha, string turno, [FromQuery] int salonId)
    {
        // Mismo patron que DiasController: se parsea a mano (en vez de
        // confiar en el model binding automatico de DateOnly/enum en la
        // ruta) para poder devolver un 400 claro si vienen mal.
        if (!DateOnly.TryParse(fecha, out var fechaParseada))
        {
            return BadRequest(new { error = "fecha invalida, usar YYYY-MM-DD" });
        }
        if (!Enum.TryParse<Turno>(turno, ignoreCase: true, out var turnoParseado))
        {
            return BadRequest(new { error = "turno invalido, usar almuerzo o cena" });
        }

        var lista = await _db.Esperas
            .Where(e => e.Fecha == fechaParseada && e.Turno == turnoParseado && e.SalonId == salonId)
            .OrderBy(e => e.Orden)
            .Select(e => new EsperaDto(e.Id, e.Fecha, e.Turno, e.Orden, e.Nombre, e.HabTel, e.Pax, e.Ubicada, e.CreatedAt))
            .ToListAsync();

        return Ok(lista);
    }

    [HttpPost]
    public async Task<ActionResult<List<EsperaDto>>> Crear(CrearEsperaRequest req)
    {
        if (!await _db.Salones.AnyAsync(s => s.Id == req.SalonId))
        {
            return BadRequest(new { error = "el salón indicado no existe" });
        }

        var maxOrden = await _db.Esperas
            .Where(e => e.Fecha == req.Fecha && e.Turno == req.Turno && e.SalonId == req.SalonId)
            .Select(e => (int?)e.Orden)
            .MaxAsync() ?? -1;

        _db.Esperas.Add(new Espera
        {
            Fecha = req.Fecha,
            Turno = req.Turno,
            SalonId = req.SalonId,
            Orden = maxOrden + 1,
            Nombre = req.Nombre,
            HabTel = req.HabTel,
            Pax = req.Pax,
        });
        await _db.SaveChangesAsync();

        var data = await BroadcastListaAsync(req.Fecha, req.Turno, req.SalonId);
        return Ok(data);
    }

    [HttpPatch("{id:int}")]
    public async Task<ActionResult<List<EsperaDto>>> Actualizar(int id, ActualizarEsperaRequest req)
    {
        var entrada = await _db.Esperas.FirstOrDefaultAsync(e => e.Id == id);
        if (entrada is null) return NotFound(new { error = "no encontrada" });

        if (req.Nombre is not null) entrada.Nombre = req.Nombre;
        if (req.HabTel is not null) entrada.HabTel = req.HabTel;
        if (req.Pax.IsSet) entrada.Pax = req.Pax.Value;
        if (req.Ubicada.HasValue) entrada.Ubicada = req.Ubicada.Value;

        await _db.SaveChangesAsync();

        var data = await BroadcastListaAsync(entrada.Fecha, entrada.Turno, entrada.SalonId);
        return Ok(data);
    }

    [HttpDelete("{id:int}")]
    public async Task<ActionResult<List<EsperaDto>>> Borrar(int id)
    {
        var entrada = await _db.Esperas.FirstOrDefaultAsync(e => e.Id == id);
        if (entrada is null) return NotFound(new { error = "no encontrada" });

        _db.Esperas.Remove(entrada);
        await _db.SaveChangesAsync();

        var data = await BroadcastListaAsync(entrada.Fecha, entrada.Turno, entrada.SalonId);
        return Ok(data);
    }

    private async Task<List<EsperaDto>> BroadcastListaAsync(DateOnly fecha, Turno turno, int salonId)
    {
        var lista = await _db.Esperas
            .Where(e => e.Fecha == fecha && e.Turno == turno && e.SalonId == salonId)
            .OrderBy(e => e.Orden)
            .Select(e => new EsperaDto(e.Id, e.Fecha, e.Turno, e.Orden, e.Nombre, e.HabTel, e.Pax, e.Ubicada, e.CreatedAt))
            .ToListAsync();

        var grupo = ReservasHub.GrupoDe(fecha.ToString("yyyy-MM-dd"), turno.ToString().ToLowerInvariant(), salonId);
        await _hub.Clients.Group(grupo).SendAsync("EsperaActualizada", new EsperaListaDto(fecha, turno, salonId, lista));
        return lista;
    }
}
