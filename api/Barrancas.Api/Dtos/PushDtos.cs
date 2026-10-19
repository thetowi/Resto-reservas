namespace Barrancas.Api.Dtos;

// Avisos push de reservas web (ver Services/PushService.cs). Endpoint, P256dh
// y Auth son los que devuelve PushManager.subscribe() en el navegador.
public record SuscribirPushRequest(string Endpoint, string P256dh, string Auth, string? Dispositivo);

public record BajaPushRequest(string Endpoint);

public record ClavePushDto(string Clave);

public record PruebaPushDto(int Enviados);
