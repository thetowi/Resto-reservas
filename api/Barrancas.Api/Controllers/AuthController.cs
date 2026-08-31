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

    public AuthController(BarrancasDbContext db, TokenService tokenService)
    {
        _db = db;
        _tokenService = tokenService;
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

        var token = _tokenService.GenerarToken(usuario);
        return Ok(new LoginResponse(token, usuario.Id, usuario.Nombre, usuario.Rol, usuario.DebeCambiarPassword));
    }

    [HttpPost("cambiar-password")]
    [Authorize]
    public async Task<IActionResult> CambiarPassword(CambiarPasswordRequest req)
    {
        var idClaim = User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (idClaim is null || !int.TryParse(idClaim, out var usuarioId))
        {
            return Unauthorized();
        }

        var usuario = await _db.Usuarios.FindAsync(usuarioId);
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

        return NoContent();
    }
}
