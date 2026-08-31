using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Barrancas.Api.Models;
using Microsoft.IdentityModel.Tokens;

namespace Barrancas.Api.Services;

public class TokenService
{
    private readonly IConfiguration _config;

    public TokenService(IConfiguration config)
    {
        _config = config;
    }

    public string GenerarToken(Usuario usuario)
    {
        var secret = _config["Jwt:Secret"]
            ?? throw new InvalidOperationException("Falta configurar Jwt:Secret");
        var issuer = _config["Jwt:Issuer"] ?? "barrancas-api";
        var audience = _config["Jwt:Audience"] ?? "barrancas-web";
        var expiresMinutes = int.TryParse(_config["Jwt:ExpiresMinutes"], out var m) ? m : 60 * 12;

        var claims = new List<Claim>
        {
            new(JwtRegisteredClaimNames.Sub, usuario.Id.ToString()),
            new(ClaimTypes.NameIdentifier, usuario.Id.ToString()),
            new(ClaimTypes.Name, usuario.Nombre),
            // ClaimTypes.Role es lo que [Authorize(Roles = "Admin")] espera
            // por default en ASP.NET Core, sin configuracion adicional.
            new(ClaimTypes.Role, usuario.Rol.ToString()),
            new(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString()),
        };

        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(secret));
        var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

        var token = new JwtSecurityToken(
            issuer: issuer,
            audience: audience,
            claims: claims,
            expires: DateTime.UtcNow.AddMinutes(expiresMinutes),
            signingCredentials: creds
        );

        return new JwtSecurityTokenHandler().WriteToken(token);
    }
}
