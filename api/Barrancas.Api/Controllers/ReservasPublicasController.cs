using Barrancas.Api.Dtos;
using Barrancas.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace Barrancas.Api.Controllers;

/// <summary>
/// Endpoints del link publico de reservas (/reservar en el frontend). Sin
/// login a proposito: los usa el cliente final. Por eso no devuelven nada
/// interno (ni mesas ni datos de otras reservas, solo si hay lugar) y estan
/// limitados por IP (ver las politicas "publico-*" en Program.cs). Toda la
/// logica vive en ReservaOnlineService.
/// </summary>
[ApiController]
[AllowAnonymous]
[Route("api/publico")]
public class ReservasPublicasController : ControllerBase
{
    private readonly ReservaOnlineService _servicio;

    public ReservasPublicasController(ReservaOnlineService servicio)
    {
        _servicio = servicio;
    }

    // Salones activos, horarios de cada turno y limites.
    [HttpGet("config")]
    [EnableRateLimiting("publico-lectura")]
    public async Task<ActionResult<PublicoConfigDto>> Config() => Ok(await _servicio.ConfigAsync());

    // Resumen de los proximos dias para el selector de fecha.
    [HttpGet("dias")]
    [EnableRateLimiting("publico-lectura")]
    public async Task<ActionResult<List<PublicoDiaDto>>> Dias([FromQuery] int pax = 2, [FromQuery] int cantidad = 14) =>
        Ok(await _servicio.DiasAsync(pax, cantidad));

    // Horarios con lugar de un dia, para todos los salones activos.
    [HttpGet("disponibilidad")]
    [EnableRateLimiting("publico-lectura")]
    public async Task<ActionResult<PublicoDisponibilidadDto>> Disponibilidad([FromQuery] DateOnly fecha, [FromQuery] int pax = 2) =>
        Ok(await _servicio.DisponibilidadAsync(fecha, pax));

    [HttpPost("reservas")]
    [EnableRateLimiting("publico-reserva")]
    public async Task<ActionResult<PublicoReservaResultado>> Reservar(PublicoReservaRequest req)
    {
        try
        {
            return Ok(await _servicio.CrearAsync(req));
        }
        catch (ReservaOnlineException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }
}
