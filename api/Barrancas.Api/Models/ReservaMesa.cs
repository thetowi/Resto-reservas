namespace Barrancas.Api.Models;

/// <summary>
/// Relacion muchos-a-muchos entre Reserva y Mesa: una reserva puede ocupar
/// mas de una mesa a la vez (grupos grandes que no entran en una sola mesa).
/// Cada fila es "esta reserva usa esta mesa". Reemplaza al viejo
/// Reserva.MesaId (una sola) por una lista.
/// </summary>
public class ReservaMesa
{
    public int ReservaId { get; set; }
    public Reserva Reserva { get; set; } = null!;

    public int MesaId { get; set; }
    public Mesa Mesa { get; set; } = null!;
}