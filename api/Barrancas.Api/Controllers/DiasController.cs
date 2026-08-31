using Barrancas.Api.Data;
using Barrancas.Api.Dtos;
using Barrancas.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Barrancas.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/dias")]
public class DiasController : ControllerBase
{
    private readonly DiaService _diaService;
    private readonly BarrancasDbContext _db;

    public DiasController(DiaService diaService, BarrancasDbContext db)
    {
        _diaService = diaService;
        _db = db;
    }

    [HttpGet("{fecha}")]
    public async Task<ActionResult<DiaDto>> GetDia(string fecha, [FromQuery] int salonId)
    {
        if (!DateOnly.TryParse(fecha, out var fechaParseada))
        {
            return BadRequest(new { error = "fecha invalida, usar YYYY-MM-DD" });
        }
        if (!await _db.Salones.AnyAsync(s => s.Id == salonId))
        {
            return BadRequest(new { error = "el salon indicado no existe" });
        }

        var dia = await _diaService.GetDiaAsync(fechaParseada, salonId);
        return Ok(dia);
    }
}
