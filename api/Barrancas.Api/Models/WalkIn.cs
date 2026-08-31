namespace Barrancas.Api.Models;

/// <summary>
/// Marca "esta mesa está ocupada por un walk-in" (alguien que llegó sin
/// reserva) para un dia/turno puntual — a proposito NO es una Reserva: no
/// tiene nombre, pax, ni aparece en la grilla de reservas. Es solo la marca
/// que el panel de mesas disponibles usa para pintar esa mesa de otro color
/// y poder "liberarla" tocandola de nuevo, sin ensuciar la lista de reservas
/// con filas que nadie va a completar.
/// </summary>
public class WalkIn
{
    public int Id { get; set; }
    public DateOnly Fecha { get; set; }
    public Turno Turno { get; set; }

    // Redundante con Mesa.SalonId (una mesa siempre pertenece a un solo
    // salon), pero se guarda directo aca tambien para poder filtrar walk-ins
    // por salon sin tener que hacer join contra Mesas en cada consulta —
    // mismo criterio que Reserva/Espera. Se completa solo al crear el
    // walk-in (ver WalkInController), nunca lo manda el cliente.
    public int SalonId { get; set; }
    public Salon? Salon { get; set; }

    public int MesaId { get; set; }
    public Mesa? Mesa { get; set; }
}
