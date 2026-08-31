using Barrancas.Api.Models;

namespace Barrancas.Api.Dtos;

public record LoginRequest(string Username, string Password);

public record LoginResponse(string Token, int UsuarioId, string Nombre, Rol Rol, bool DebeCambiarPassword);

public record CambiarPasswordRequest(string PasswordActual, string PasswordNueva);
