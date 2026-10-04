namespace Barrancas.Api.Models;

/// <summary>
/// Marca una fecha puntual como "no se toman reservas por el chatbot de
/// WhatsApp" — pensado para dias de alta ocupacion del hotel o un evento,
/// donde el staff SI puede seguir cargando reservas a mano (por ejemplo para
/// huespedes del hotel) pero no quiere que el bot le siga sumando gente sola.
/// A diferencia de CierreTurno (que bloquea TODO, incluso al staff, para un
/// turno puntual de un salon puntual), esto es exclusivo del bot y aplica al
/// dia completo (los tres turnos, si los hubiera), sin importar salon — ver
/// ReservaBotService, que consulta esta tabla antes de intentar reservar.
/// </summary>
public class FechaBloqueadaBot
{
    public int Id { get; set; }
    public DateOnly Fecha { get; set; }
    public string? Motivo { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
