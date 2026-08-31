namespace Barrancas.Api.Models;

/// <summary>
/// Una entrada en la lista de espera de un dia/turno: gente que llego sin
/// reserva y espera a que se libere una mesa. Orden es el orden de llegada
/// (FIFO) — se asigna al crear (siguiente numero para esa fecha+turno) y no
/// se reacomoda solo; el frontend siempre la muestra ordenada por Orden, asi
/// que borrar una entrada de mas arriba corre a las de abajo un lugar en la
/// vista, sin tocar el numero guardado de las demas.
/// </summary>
public class Espera
{
    public int Id { get; set; }
    public DateOnly Fecha { get; set; }
    public Turno Turno { get; set; }

    // Igual que en Reserva: cada salon tiene su propia lista de espera
    // independiente por turno (ver Models/Salon.cs).
    public int SalonId { get; set; }
    public Salon? Salon { get; set; }

    public int Orden { get; set; }

    public string? Nombre { get; set; }
    public string? HabTel { get; set; }
    public int? Pax { get; set; }

    // Se tilda cuando ya se la sento en una mesa: sigue en la lista (no se
    // pierde el dato de que esperaron), pero se muestra distinto para que
    // el staff sepa que ese grupo ya no esta esperando mas.
    public bool Ubicada { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
