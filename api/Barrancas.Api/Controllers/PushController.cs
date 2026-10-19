using System.Security.Claims;
using Barrancas.Api.Data;
using Barrancas.Api.Dtos;
using Barrancas.Api.Models;
using Barrancas.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Barrancas.Api.Controllers;

/// <summary>
/// Activar / desactivar los avisos de reservas web en un dispositivo (ver
/// Services/PushService.cs y Models/SuscripcionPush.cs). Cualquier usuario
/// del equipo puede activarlos en los suyos.
/// </summary>
[ApiController]
[Authorize]
[Route("api/push")]
public class PushController : ControllerBase
{
    private readonly BarrancasDbContext _db;
    private readonly PushService _push;

    public PushController(BarrancasDbContext db, PushService push)
    {
        _db = db;
        _push = push;
    }

    // Clave publica VAPID: el navegador la necesita para suscribirse.
    [HttpGet("clave")]
    public async Task<ActionResult<ClavePushDto>> Clave() => Ok(new ClavePushDto(await _push.ClavePublicaAsync()));

    [HttpPost("suscripciones")]
    public async Task<IActionResult> Suscribir(SuscribirPushRequest req)
    {
        if (!int.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var usuarioId)) return Unauthorized();
        var endpoint = req.Endpoint?.Trim() ?? string.Empty;
        if (endpoint.Length > 2000 || !Uri.TryCreate(endpoint, UriKind.Absolute, out var uri) || uri.Scheme != Uri.UriSchemeHttps)
        {
            return BadRequest(new { error = "Suscripción inválida." });
        }
        if (string.IsNullOrWhiteSpace(req.P256dh) || string.IsNullOrWhiteSpace(req.Auth) || req.P256dh.Length > 200 || req.Auth.Length > 100)
        {
            return BadRequest(new { error = "Suscripción inválida." });
        }
        int? sesionId = int.TryParse(User.FindFirstValue(TokenService.ClaimSesion), out var sid) ? sid : null;

        var ahora = DateTime.UtcNow;
        var sub = await _db.SuscripcionesPush.FirstOrDefaultAsync(p => p.Endpoint == endpoint);
        if (sub is null)
        {
            sub = new SuscripcionPush { Endpoint = endpoint, CreadaEn = ahora };
            _db.SuscripcionesPush.Add(sub);
        }
        // Si en este navegador ahora entró otra persona, los avisos pasan a ella.
        sub.UsuarioId = usuarioId;
        sub.SesionRecordadaId = sesionId;
        sub.P256dh = req.P256dh.Trim();
        sub.Auth = req.Auth.Trim();
        sub.Dispositivo = SesionService.LimpiarDispositivo(req.Dispositivo);
        sub.ActualizadaEn = ahora;
        sub.FallosSeguidos = 0;
        await _db.SaveChangesAsync();
        return NoContent();
    }

    // Sin login: al salir o cuando venció la sesión igual se tiene que poder
    // apagar (el endpoint lo conoce solo ese navegador).
    [HttpPost("baja")]
    [AllowAnonymous]
    public async Task<IActionResult> Baja(BajaPushRequest req)
    {
        var sub = await _db.SuscripcionesPush.FirstOrDefaultAsync(p => p.Endpoint == req.Endpoint);
        if (sub is not null)
        {
            _db.SuscripcionesPush.Remove(sub);
            await _db.SaveChangesAsync();
        }
        return NoContent();
    }

    [HttpPost("prueba")]
    public async Task<ActionResult<PruebaPushDto>> Prueba()
    {
        if (!int.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var usuarioId)) return Unauthorized();
        var enviados = await _push.EnviarAUsuarioAsync(usuarioId,
            new AvisoPush("Avisos de capax activados", "Así te van a llegar las reservas que entren por el link.", "/", "prueba"));
        return Ok(new PruebaPushDto(enviados));
    }
}
