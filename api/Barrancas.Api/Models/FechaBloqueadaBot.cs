namespace Barrancas.Api.Models;

/// <summary>
/// Una fecha en la que NO se toman reservas por el link publico (/reservar)
/// y, si IncluyeBot, tampoco por el chatbot de WhatsApp — por ejemplo
/// Nochebuena o un evento. El staff SI puede seguir cargando reservas a mano
/// esos dias con total normalidad. Al cliente del link se le muestra
/// MensajeCliente con un boton para reservar por WhatsApp.
///
/// Turno: null = todo el dia; si no, solo ese turno (los demas siguen
/// abiertos). Una sola fila por fecha. A diferencia de CierreTurno (que
/// bloquea TODO, incluso al staff, para un turno de un salon), esto aplica a
/// todos los salones y solo frena las reservas que entran solas.
///
/// (El nombre de la clase/tabla viene de cuando era solo para el bot; se
/// mantuvo para no migrar datos.)
/// </summary>
public class FechaBloqueadaBot
{
    public int Id { get; set; }
    public DateOnly Fecha { get; set; }
    public Turno? Turno { get; set; }

    // Lo ve el equipo ("Nochebuena") y tambien el cliente, como titulo.
    public string? Motivo { get; set; }

    // Lo ve el cliente en el link, junto al boton de WhatsApp.
    public string? MensajeCliente { get; set; }

    // Si el chatbot de WhatsApp tampoco reserva solo ese dia/turno.
    public bool IncluyeBot { get; set; } = true;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    // ¿Esta fecha cierra este turno?
    public bool Cierra(Turno turno) => Turno is null || Turno == turno;
}
