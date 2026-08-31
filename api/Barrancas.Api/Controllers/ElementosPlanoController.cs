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
/// Elementos de referencia del plano visual de un salon (Ventana, Cocina,
/// Bodega, Isla, Mueble, etc — ver Models/ElementoPlano.cs). Igual que las
/// mesas, los de TODOS los salones se transmiten juntos por SignalR a todos
/// los clientes conectados (el frontend filtra por SalonId localmente).
///
/// GetLista queda abierta a cualquier autenticado (Staff tambien ve estos
/// carteles en el plano de solo lectura, /plano); crear/editar/borrar es
/// exclusivo de Admin.
/// </summary>
[ApiController]
[Authorize]
[Route("api/elementos-plano")]
public class ElementosPlanoController : ControllerBase
{
    private readonly BarrancasDbContext _db;
    private readonly IHubContext<ReservasHub> _hub;

    public ElementosPlanoController(BarrancasDbContext db, IHubContext<ReservasHub> hub)
    {
        _db = db;
        _hub = hub;
    }

    [HttpGet]
    public async Task<ActionResult<List<ElementoPlanoDto>>> GetLista()
    {
        return Ok(await ListaAsync());
    }

    [HttpPost]
    [Authorize(Roles = "Admin")]
    public async Task<ActionResult<List<ElementoPlanoDto>>> Crear(CrearElementoPlanoRequest req)
    {
        if (!await _db.Salones.AnyAsync(s => s.Id == req.SalonId))
        {
            return BadRequest(new { error = "el salón indicado no existe" });
        }

        _db.ElementosPlano.Add(new ElementoPlano
        {
            Etiqueta = string.IsNullOrWhiteSpace(req.Etiqueta) ? "Nuevo" : req.Etiqueta.Trim(),
            PosX = req.PosX,
            PosY = req.PosY,
            SalonId = req.SalonId,
        });
        await _db.SaveChangesAsync();

        return Ok(await BroadcastAsync());
    }

    [HttpPatch("{id:int}")]
    [Authorize(Roles = "Admin")]
    public async Task<ActionResult<List<ElementoPlanoDto>>> Actualizar(int id, ActualizarElementoPlanoRequest req)
    {
        var elemento = await _db.ElementosPlano.FirstOrDefaultAsync(e => e.Id == id);
        if (elemento is null) return NotFound(new { error = "no encontrado" });

        if (req.Etiqueta is not null)
        {
            var etiqueta = req.Etiqueta.Trim();
            elemento.Etiqueta = string.IsNullOrWhiteSpace(etiqueta) ? "Nuevo" : etiqueta;
        }
        if (req.PosX is not null) elemento.PosX = req.PosX.Value;
        if (req.PosY is not null) elemento.PosY = req.PosY.Value;
        if (req.Ancho is not null) elemento.Ancho = Math.Max(30, req.Ancho.Value);
        if (req.Alto is not null) elemento.Alto = Math.Max(24, req.Alto.Value);

        await _db.SaveChangesAsync();

        return Ok(await BroadcastAsync());
    }

    [HttpDelete("{id:int}")]
    [Authorize(Roles = "Admin")]
    public async Task<ActionResult<List<ElementoPlanoDto>>> Borrar(int id)
    {
        var elemento = await _db.ElementosPlano.FirstOrDefaultAsync(e => e.Id == id);
        if (elemento is null) return NotFound(new { error = "no encontrado" });

        _db.ElementosPlano.Remove(elemento);
        await _db.SaveChangesAsync();

        return Ok(await BroadcastAsync());
    }

    private async Task<List<ElementoPlanoDto>> ListaAsync()
    {
        return await _db.ElementosPlano
            .OrderBy(e => e.Id)
            .Select(e => new ElementoPlanoDto(e.Id, e.Etiqueta, e.PosX, e.PosY, e.Ancho, e.Alto, e.SalonId))
            .ToListAsync();
    }

    private async Task<List<ElementoPlanoDto>> BroadcastAsync()
    {
        var lista = await ListaAsync();
        await _hub.Clients.All.SendAsync("ElementosPlanoActualizado", lista);
        return lista;
    }
}
