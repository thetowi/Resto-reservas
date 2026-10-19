using Barrancas.Api.Models;

namespace Barrancas.Api.Dtos;

// Recordarme: el dispositivo queda con la sesión abierta (ver
// Models/SesionRecordada.cs). Dispositivo es el nombre que arma el navegador
// («Chrome en Windows») para mostrarlo en «Mis dispositivos».
public record LoginRequest(string Username, string Password, bool Recordarme = false, string? Dispositivo = null);

// Llave y SesionId solo vienen al entrar con «Recordarme»: la llave la guarda
// el navegador para pedir tokens nuevos (POST /api/auth/renovar).
public record LoginResponse(
    string Token,
    int UsuarioId,
    string Nombre,
    Rol Rol,
    bool DebeCambiarPassword,
    string? Llave = null,
    int? SesionId = null);

public record CambiarPasswordRequest(string PasswordActual, string PasswordNueva);

public record RenovarRequest(string Llave);

// Al tocar «Salir»: se cierra la sesión recordada (si había) y se borran los
// avisos de ese navegador (si los tenía).
public record SalirRequest(string? Llave, string? PushEndpoint);

// Una fila de «Mis dispositivos». Tipo "sesion" = entró con «Recordarme»;
// "avisos" = solo tiene los avisos activados (sin «Recordarme»).
public record DispositivoDto(
    string Tipo,
    int Id,
    string Nombre,
    DateTime Desde,
    DateTime UltimoUso,
    bool Recordado,
    bool ConAvisos,
    bool EsEste);
