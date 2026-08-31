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
/// Administracion de salones (Restaurant, Bar, Aqua Bar, etc — ver
/// Models/Salon.cs): crear, renombrar y borrar. GetLista queda abierta a
/// cualquier autenticado (todos necesitan la lista completa para el
/// selector de salon en pantalla); crear/editar/borrar es exclusivo de
/// Admin, igual patron que MesasController/ElementosPlanoController.
/// </summary>
[ApiController]
[Authorize]
[Route("api/salones")]
public class SalonesController : ControllerBase
{
    private readonly BarrancasDbContext _db;
    private readonly IHubContext<ReservasHub> _hub;

    public SalonesController(BarrancasDbContext db, IHubContext<ReservasHub> hub)
    {
        _db = db;
        _hub = hub;
    }

    [HttpGet]
    public async Task<ActionResult<List<SalonDto>>> GetLista()
    {
        return Ok(await ListaAsync());
    }

    [HttpPost]
    [Authorize(Roles = "Admin")]
    public async Task<ActionResult<List<SalonDto>>> Crear(CrearSalonRequest req)
    {
        var nombre = req.Nombre?.Trim();
        if (string.IsNullOrWhiteSpace(nombre))
        {
            return BadRequest(new { error = "el nombre del salón es obligatorio" });
        }
        if (await _db.Salones.AnyAsync(s => s.Nombre == nombre))
        {
            return BadRequest(new { error = "ya existe un salón con ese nombre" });
        }

        var maxOrden = await _db.Salones.Select(s => (int?)s.Orden).MaxAsync() ?? -1;
        _db.Salones.Add(new Salon { Nombre = nombre, Orden = maxOrden + 1 });
        await _db.SaveChangesAsync();

        return Ok(await BroadcastAsync());
    }

    [HttpPatch("{id:int}")]
    [Authorize(Roles = "Admin")]
    public async Task<ActionResult<List<SalonDto>>> Actualizar(int id, ActualizarSalonRequest req)
    {
        var salon = await _db.Salones.FirstOrDefaultAsync(s => s.Id == id);
        if (salon is null) return NotFound(new { error = "el salón indicado no existe" });

        if (req.Nombre is not null)
        {
            var nombre = req.Nombre.Trim();
            if (string.IsNullOrWhiteSpace(nombre))
            {
                return BadRequest(new { error = "el nombre del salón no puede quedar vacío" });
            }
            if (await _db.Salones.AnyAsync(s => s.Nombre == nombre && s.Id != id))
            {
                return BadRequest(new { error = "ya existe un salón con ese nombre" });
            }
            salon.Nombre = nombre;
        }

        if (req.Orden is not null) salon.Orden = req.Orden.Value;

        await _db.SaveChangesAsync();

        return Ok(await BroadcastAsync());
    }

    [HttpDelete("{id:int}")]
    [Authorize(Roles = "Admin")]
    public async Task<ActionResult<List<SalonDto>>> Borrar(int id)
    {
        var salon = await _db.Salones.FirstOrDefaultAsync(s => s.Id == id);
        if (salon is null) return NotFound(new { error = "el salón indicado no existe" });

        // Siempre tiene que quedar al menos un salon: la app no tiene sentido
        // sin ninguno (no habria donde cargar mesas ni reservas nuevas).
        if (await _db.Salones.CountAsync() <= 1)
        {
            return BadRequest(new { error = "tiene que quedar al menos un salón" });
        }
        // Igual criterio que borrar una mesa con divisiones: no se borra un
        // salon con mesas todavia adentro, hay que borrarlas (o pasarlas a
        // mano a otro salon, creando mesas nuevas ahi) primero. Evita perder
        // de vista mesas/reservas historicas "flotando" sin salon valido.
        if (await _db.Mesas.AnyAsync(m => m.SalonId == id))
        {
            return BadRequest(new { error = "este salón todavía tiene mesas: borralas primero desde \"Administrar mesas\"" });
        }

        _db.Salones.Remove(salon);
        await _db.SaveChangesAsync();

        return Ok(await BroadcastAsync());
    }

    private async Task<List<SalonDto>> ListaAsync()
    {
        return await _db.Salones
            .OrderBy(s => s.Orden)
            .Select(s => new SalonDto(s.Id, s.Nombre, s.Orden))
            .ToListAsync();
    }

    private async Task<List<SalonDto>> BroadcastAsync()
    {
        var lista = await ListaAsync();
        await _hub.Clients.All.SendAsync("SalonesActualizados", lista);
        return lista;
    }
}
