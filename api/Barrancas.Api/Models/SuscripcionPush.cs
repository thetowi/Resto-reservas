namespace Barrancas.Api.Models;

/// <summary>
/// Un dispositivo que activó los avisos de reservas web (notificaciones push
/// del navegador). Endpoint/P256dh/Auth son los que da el navegador al
/// suscribirse (PushManager.subscribe) y se usan para mandarle el aviso con
/// las claves VAPID (ver Services/PushService.cs). Si el dispositivo entró con
/// «Recordarme», SesionRecordadaId apunta a esa sesión: al cerrarla se borra
/// también la suscripción.
/// </summary>
public class SuscripcionPush
{
    public int Id { get; set; }
    public int UsuarioId { get; set; }
    public Usuario? Usuario { get; set; }
    public int? SesionRecordadaId { get; set; }
    public string Endpoint { get; set; } = string.Empty;
    public string P256dh { get; set; } = string.Empty;
    public string Auth { get; set; } = string.Empty;
    public string Dispositivo { get; set; } = string.Empty;
    public DateTime CreadaEn { get; set; }
    public DateTime ActualizadaEn { get; set; }
    // Envios fallidos seguidos (que no sean "ya no existe"): a los 10 se borra.
    public int FallosSeguidos { get; set; }
}
