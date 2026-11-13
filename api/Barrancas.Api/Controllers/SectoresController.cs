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
/// Sectores de cada salón (ver Models/Sector.cs): armarlos y pintar sus
/// mesas (Administrar mesas), y su estado en cada turno (modal «Sectores» del
/// panel: abierto, cerrado o con un grupo). Todo lo que cambia algo es solo
/// para Admin, igual que «Reducir salón» y «Cerrar turno».
/// </summary>
[ApiController]
[Authorize]
[Route("api/sectores")]
public class SectoresController : ControllerBase
{
    private readonly BarrancasDbContext _db;
    private readonly DiaService _dia;
    private readonly SectoresService _sectores;
    private readonly IHubContext<ReservasHub> _hub;

    public SectoresController(BarrancasDbContext db, DiaService dia, SectoresService sectores, IHubContext<ReservasHub> hub)
    {
        _db = db;
        _dia = dia;
        _sectores = sectores;
        _hub = hub;
    }

    [HttpGet]
    public async Task<ActionResult<List<SectorDto>>> Listar([FromQuery] int salonId) =>
        Ok(await ListaAsync(salonId));

    [Authorize(Roles = "Admin")]
    [HttpPost]
    public async Task<ActionResult<List<SectorDto>>> Crear(CrearSectorRequest req)
    {
        if (!await _db.Salones.AnyAsync(s => s.Id == req.SalonId)) return BadRequest(new { error = "No existe ese salón." });
        var nombre = req.Nombre?.Trim() ?? "";
        var error = await ValidarNombreAsync(req.SalonId, nombre, null);
        if (error is not null) return BadRequest(new { error });
        if (req.Color is not null && !SectoresService.ColorValido(req.Color)) return BadRequest(new { error = "Color inválido." });

        var cantidad = await _db.Sectores.CountAsync(s => s.SalonId == req.SalonId);
        _db.Sectores.Add(new Sector
        {
            SalonId = req.SalonId,
            Nombre = nombre,
            Color = req.Color ?? SectoresService.ColorSugerido(cantidad),
            Orden = cantidad,
        });
        await _db.SaveChangesAsync();
        return Ok(await AvisarAsync(req.SalonId));
    }

    [Authorize(Roles = "Admin")]
    [HttpPatch("{id:int}")]
    public async Task<ActionResult<List<SectorDto>>> Editar(int id, EditarSectorRequest req)
    {
        var sector = await _db.Sectores.FirstOrDefaultAsync(s => s.Id == id);
        if (sector is null) return NotFound(new { error = "No existe ese sector." });
        if (req.Nombre is not null)
        {
            var nombre = req.Nombre.Trim();
            var error = await ValidarNombreAsync(sector.SalonId, nombre, sector.Id);
            if (error is not null) return BadRequest(new { error });
            sector.Nombre = nombre;
        }
        if (req.Color is not null)
        {
            if (!SectoresService.ColorValido(req.Color)) return BadRequest(new { error = "Color inválido." });
            sector.Color = req.Color;
        }
        await _db.SaveChangesAsync();
        return Ok(await AvisarAsync(sector.SalonId));
    }

    // Borra el sector: sus mesas quedan sin sector y los estados por turno
    // se van con él (las mesas que estaban reducidas siguen reducidas y el
    // grupo queda como una reserva común).
    [Authorize(Roles = "Admin")]
    [HttpDelete("{id:int}")]
    public async Task<ActionResult<List<SectorDto>>> Borrar(int id)
    {
        var sector = await _db.Sectores.FirstOrDefaultAsync(s => s.Id == id);
        if (sector is null) return NotFound(new { error = "No existe ese sector." });

        var mesas = await _db.Mesas.Where(m => m.SectorId == id).ToListAsync();
        foreach (var m in mesas) m.SectorId = null;
        var grupos = await _db.Reservas.Where(r => r.SectorId == id).ToListAsync();
        foreach (var r in grupos) r.SectorId = null;
        _db.SectoresTurno.RemoveRange(await _db.SectoresTurno.Where(x => x.SectorId == id).ToListAsync());
        _db.Sectores.Remove(sector);
        await _db.SaveChangesAsync();

        var restantes = await _db.Sectores.Where(s => s.SalonId == sector.SalonId).OrderBy(s => s.Orden).ThenBy(s => s.Nombre).ToListAsync();
        for (var i = 0; i < restantes.Count; i++) restantes[i].Orden = i;
        await _db.SaveChangesAsync();

        await AvisarMesasAsync();
        return Ok(await AvisarAsync(sector.SalonId));
    }

    // Pinta mesas con un sector (o las deja sin sector). Las divisiones van
    // siempre con su mesa: pintar una división pinta a su mesa y a todas sus
    // divisiones.
    [Authorize(Roles = "Admin")]
    [HttpPost("asignar")]
    public async Task<ActionResult<List<MesaDto>>> Asignar(AsignarSectorRequest req)
    {
        var ids = (req.MesaIds ?? []).Distinct().ToList();
        if (ids.Count == 0) return BadRequest(new { error = "Elegí al menos una mesa." });
        var elegidas = await _db.Mesas.Where(m => ids.Contains(m.Id)).ToListAsync();
        if (elegidas.Count != ids.Count) return BadRequest(new { error = "Alguna de esas mesas no existe." });

        if (req.SectorId is int sectorId)
        {
            var sector = await _db.Sectores.FirstOrDefaultAsync(s => s.Id == sectorId);
            if (sector is null) return BadRequest(new { error = "No existe ese sector." });
            if (elegidas.Any(m => m.SalonId != sector.SalonId)) return BadRequest(new { error = "Esas mesas son de otro salón." });
        }

        var bases = elegidas.Select(m => m.MesaPadreId ?? m.Id).Distinct().ToList();
        var afectadas = await _db.Mesas.Where(m => bases.Contains(m.Id) || (m.MesaPadreId != null && bases.Contains(m.MesaPadreId.Value))).ToListAsync();
        foreach (var m in afectadas) m.SectorId = req.SectorId;
        await _db.SaveChangesAsync();

        return Ok(await AvisarMesasAsync());
    }

    // Estado de los sectores en un turno (modal «Sectores» del panel).
    [Authorize(Roles = "Admin")]
    [HttpPost("turno")]
    public async Task<ActionResult<TurnoDataDto>> Turno(SectoresTurnoRequest req)
    {
        try
        {
            await _sectores.AplicarTurnoAsync(req, ReservaWebService.Usuario(User));
        }
        catch (SectoresService.ErrorSectores e)
        {
            return e.Choque ? Conflict(new { error = e.Message }) : BadRequest(new { error = e.Message });
        }

        var data = await _dia.GetTurnoAsync(req.Fecha, req.Turno, req.SalonId);
        var grupo = ReservasHub.GrupoDe(req.Fecha.ToString("yyyy-MM-dd"), req.Turno.ToString().ToLowerInvariant(), req.SalonId);
        await _hub.Clients.Group(grupo).SendAsync("TurnoActualizado", data);
        return Ok(data);
    }

    private async Task<string?> ValidarNombreAsync(int salonId, string nombre, int? id)
    {
        if (nombre.Length == 0) return "Poné un nombre para el sector.";
        if (nombre.Length > SectoresService.MaxNombre) return $"El nombre puede tener hasta {SectoresService.MaxNombre} letras.";
        var repetido = await _db.Sectores.AnyAsync(s => s.SalonId == salonId && s.Id != id && s.Nombre.ToLower() == nombre.ToLower());
        return repetido ? "Ya hay un sector con ese nombre en este salón." : null;
    }

    private Task<List<SectorDto>> ListaAsync(int salonId) =>
        _db.Sectores
            .Where(s => s.SalonId == salonId)
            .OrderBy(s => s.Orden).ThenBy(s => s.Nombre)
            .Select(s => new SectorDto(s.Id, s.SalonId, s.Nombre, s.Color, s.Orden))
            .ToListAsync();

    // Lista nueva de sectores del salón, también a los demás que tengan
    // capax abierto (evento SectoresActualizados).
    private async Task<List<SectorDto>> AvisarAsync(int salonId)
    {
        var lista = await ListaAsync(salonId);
        await _hub.Clients.All.SendAsync("SectoresActualizados", new { salonId, sectores = lista });
        return lista;
    }

    // Mismo aviso que MesasController (MesasActualizado) con la lista nueva.
    private async Task<List<MesaDto>> AvisarMesasAsync()
    {
        var mesas = await _db.Mesas
            .Where(m => !m.EsTemporal)
            .OrderBy(m => m.Orden)
            .Select(m => new MesaDto(m.Id, m.Codigo, m.Capacidad, m.MesaPadreId, m.Orden, m.PosX, m.PosY, m.SalonId, m.EsTemporal, m.Forma, m.Fijada, m.Rotacion, null, false, m.SectorId))
            .ToListAsync();
        await _hub.Clients.All.SendAsync("MesasActualizado", mesas);
        return mesas;
    }
}
