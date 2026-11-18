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
            .Where(m => !m.EsTemporal)
            .OrderBy(m => m.Orden)
            .Select(m => new MesaDto(m.Id, m.Codigo, m.Capacidad, m.MesaPadreId, m.Orden, m.PosX, m.PosY, m.SalonId, m.EsTemporal, m.Forma, m.Fijada, m.Rotacion, null, false, m.SectorId))
            .ToListAsync();

        // Solo los salones ACTIVOS (ver Models/Salon.cs): este endpoint
        // alimenta el selector de uso diario (pantalla principal, /plano,
        // /admin/mesas) — un salon desactivado (de temporada, cerrado, etc.)
        // sigue existiendo con toda su data, pero no tiene que competir en
        // ese selector. /admin/salones usa GetLista (SIN este filtro) para
        // poder ver y reactivar los inactivos.
        var salones = await _db.Salones
            .Where(s => s.Activo)
            .OrderBy(s => s.Orden)
            .Select(s => new SalonDto(s.Id, s.Nombre, s.Orden, s.PermiteMerienda, s.Activo, s.Color, s.OfreceAlmuerzo, s.OfreceCena,
                s.DiasAlmuerzo, s.DiasMerienda, s.DiasCena, s.MostrarEnLink, s.Confirmacion, s.ConfirmaHastaPax,
                s.PaxMaximoWeb, s.AnticipacionMinutos, s.DiasAdelante, s.ToleranciaMinutos))
            .ToListAsync();

        var idsSalones = salones.Select(s => s.Id).ToList();
        var sectores = await _db.Sectores
            .Where(s => idsSalones.Contains(s.SalonId))
            .OrderBy(s => s.SalonId).ThenBy(s => s.Orden).ThenBy(s => s.Nombre)
            .Select(s => new SectorDto(s.Id, s.SalonId, s.Nombre, s.Color, s.Orden))
            .ToListAsync();

        return Ok(new MetaDto(mesas, salones, sectores));
    }
}
