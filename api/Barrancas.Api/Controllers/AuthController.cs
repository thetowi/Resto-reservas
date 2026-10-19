using Barrancas.Api.Data;
using Barrancas.Api.Dtos;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Barrancas.Api.Services;
using System.Security.Claims;

namespace Barrancas.Api.Controllers;

[ApiController]
[Route("api/auth")]
public class AuthController : ControllerBase
{
    private readonly BarrancasDbContext _db;
    private readonly TokenService _tokenService;
    private readonly SesionService _sesiones;

    public AuthController(BarrancasDbContext db, TokenService tokenService, SesionService sesiones)
    {
        _db = db;
        _tokenService = tokenService;
        _sesiones = sesiones;
    }

    [HttpPost("login")]
    [AllowAnonymous]
    public async Task<ActionResult<LoginResponse>> Login(LoginRequest req)
    {
        var usuario = await _db.Usuarios
            .FirstOrDefaultAsync(u => u.Username == req.Username.Trim().ToLower() && u.Activo);

        if (usuario is null || !BCrypt.Net.BCrypt.Verify(req.Password, usuario.PasswordHash))
        {
            return Unauthorized(new { error = "Usuario o contraseña incorrectos" });
        }

        if (!req.Recordarme)
        {
            var token = _tokenService.GenerarToken(usuario);
            return Ok(new LoginResponse(token, usuario.Id, usuario.Nombre, usuario.Rol, usuario.DebeCambiarPassword));
        }

        // «Recordarme»: token corto + llave larga para renovarlo solo.
        var (sesion, llave) = await _sesiones.CrearAsync(usuario, req.Dispositivo);
        var tokenCorto = _tokenService.GenerarToken(usuario, SesionService.DuracionTokenRecordado, sesion.Id);
        return Ok(new LoginResponse(tokenCorto, usuario.Id, usuario.Nombre, usuario.Rol, usuario.DebeCambiarPassword, llave, sesion.Id));
    }

    /// <summary>
    /// Token nuevo para un dispositivo recordado (lo pide el navegador solo,
    /// antes de que venza el que tiene). 401 si la sesión se cerró, venció o
    /// el usuario está desactivado: ahí hay que volver a entrar.
    /// </summary>
    [HttpPost("renovar")]
    [AllowAnonymous]
    public async Task<ActionResult<LoginResponse>> Renovar(RenovarRequest req)
    {
        var sesion = await _sesiones.BuscarValidaAsync(req.Llave);
        if (sesion?.Usuario is null)
        {
            return Unauthorized(new { error = "La sesión se cerró. Volvé a ingresar." });
        }
        await _sesiones.MarcarUsoAsync(sesion);
        var u = sesion.Usuario;
        var token = _tokenService.GenerarToken(u, SesionService.DuracionTokenRecordado, sesion.Id);
        return Ok(new LoginResponse(token, u.Id, u.Nombre, u.Rol, u.DebeCambiarPassword, null, sesion.Id));
    }

    /// <summary>«Salir»: cierra la sesión recordada de este dispositivo y le saca los avisos.</summary>
    [HttpPost("salir")]
    [AllowAnonymous]
    public async Task<IActionResult> Salir(SalirRequest req)
    {
        var sesion = await _sesiones.BuscarValidaAsync(req.Llave);
        if (sesion is not null)
        {
            await _sesiones.RevocarAsync(sesion);
        }
        if (!string.IsNullOrWhiteSpace(req.PushEndpoint))
        {
            var sub = await _db.SuscripcionesPush.FirstOrDefaultAsync(p => p.Endpoint == req.PushEndpoint);
            if (sub is not null)
            {
                _db.SuscripcionesPush.Remove(sub);
                await _db.SaveChangesAsync();
            }
        }
        return NoContent();
    }

    [HttpPost("cambiar-password")]
    [Authorize]
    public async Task<IActionResult> CambiarPassword(CambiarPasswordRequest req)
    {
        var usuarioId = UsuarioActualId();
        if (usuarioId is null)
        {
            return Unauthorized();
        }

        var usuario = await _db.Usuarios.FindAsync(usuarioId.Value);
        if (usuario is null) return NotFound();

        if (!BCrypt.Net.BCrypt.Verify(req.PasswordActual, usuario.PasswordHash))
        {
            return BadRequest(new { error = "La contraseña actual no es correcta" });
        }

        if (string.IsNullOrWhiteSpace(req.PasswordNueva) || req.PasswordNueva.Length < 8)
        {
            return BadRequest(new { error = "La contraseña nueva debe tener al menos 8 caracteres" });
        }

        usuario.PasswordHash = BCrypt.Net.BCrypt.HashPassword(req.PasswordNueva);
        usuario.DebeCambiarPassword = false;
        await _db.SaveChangesAsync();

        // Los demás dispositivos recordados tienen que volver a entrar con la
        // contraseña nueva; este sigue.
        await _sesiones.RevocarTodasAsync(usuario.Id, SesionActualId());

        return NoContent();
    }

    // ---------------------------------------------------------------- Mis dispositivos

    [HttpGet("dispositivos")]
    [Authorize]
    public async Task<ActionResult<List<DispositivoDto>>> Dispositivos()
    {
        var usuarioId = UsuarioActualId();
        if (usuarioId is null) return Unauthorized();
        return Ok(await _sesiones.ListaAsync(usuarioId.Value, SesionActualId()));
    }

    [HttpDelete("dispositivos/{tipo}/{id:int}")]
    [Authorize]
    public async Task<ActionResult<List<DispositivoDto>>> QuitarDispositivo(string tipo, int id)
    {
        var usuarioId = UsuarioActualId();
        if (usuarioId is null) return Unauthorized();
        if (!await _sesiones.QuitarAsync(usuarioId.Value, tipo, id))
        {
            return NotFound(new { error = "Ese dispositivo ya no está en la lista." });
        }
        return Ok(await _sesiones.ListaAsync(usuarioId.Value, SesionActualId()));
    }

    private int? UsuarioActualId() =>
        int.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var id) ? id : null;

    private int? SesionActualId() =>
        int.TryParse(User.FindFirstValue(TokenService.ClaimSesion), out var id) ? id : null;
}
