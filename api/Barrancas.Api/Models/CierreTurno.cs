namespace Barrancas.Api.Models;

/// <summary>
/// Marca un turno de un dia (para un salon puntual) como cerrado: no se
/// toman reservas nuevas ni se editan las que ya estaban, hasta que se
/// reabra (ver ReservasController). Pensado como la base para mas adelante
/// conectar el asistente de WhatsApp/IA: antes de ofrecer un horario, va a
/// poder consultar esto para saber si el restaurante (o un salon puntual)
/// esta abierto ese dia/turno.
/// </summary>
public class CierreTurno
{
    public int Id { get; set; }
    public DateOnly Fecha { get; set; }
    public Turno Turno { get; set; }

    public int SalonId { get; set; }
    public Salon? Salon { get; set; }

    public string? Motivo { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}