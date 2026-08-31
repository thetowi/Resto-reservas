using Barrancas.Api.Data;
using Barrancas.Api.Dtos;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Barrancas.Api.Controllers;

[ApiController]
[Authorize]
[Route("api")]
public class MetaController : ControllerBase
{
    private readonly BarrancasDbContext _db;

    public MetaController(BarrancasDbContext db)
    {
        _db = db;
    }

    [HttpGet("meta")]
    public async Task<ActionResult<MetaDto>> GetMeta()
    {
        // Trae las mesas de TODOS los salones (no solo uno): el frontend las
        // filtra por SalonId localmente, asi evita tener que volver a pedir
        // /api/meta cada vez que se cambia de salon con el selector.
        var mesas = await _db.Mesas
            .OrderBy(m => m.Orden)
            .Select(m => new MesaDto(m.Id, m.Codigo, m.Capacidad, m.MesaPadreId, m.Orden, m.PosX, m.PosY, m.SalonId))
            .ToListAsync();

        var salones = await _db.Salones
            .OrderBy(s => s.Orden)
            .Select(s => new SalonDto(s.Id, s.Nombre, s.Orden))
            .ToListAsync();

        return Ok(new MetaDto(mesas, salones));
    }
}
