namespace Barrancas.Api.Models;

/// <summary>
/// Una fila de reserva dentro de un turno (Almuerzo/Cena) de un dia
/// puntual. Equivale a una fila del bloque B:J de la planilla original.
/// </summary>
public class Reserva
{
    public int Id { get; set; }
    public DateOnly Fecha { get; set; }
    public Turno Turno { get; set; }

    // A que salon pertenece esta fila (Restaurant, Bar, Aqua Bar, etc — ver
    // Models/Salon.cs). Va aca directo (no solo a traves de Mesa) porque una
    // fila puede no tener mesa asignada todavia y aun asi tiene que poder
    // filtrarse por salon: cada salon tiene su propia lista de reservas
    // independiente por turno, igual logica que hoy pero particionada.
    public int SalonId { get; set; }
    public Salon? Salon { get; set; }

    public int Orden { get; set; }
    public string? Hora { get; set; }

    // Mesas que ocupa esta reserva: antes era una sola (MesaId), ahora
    // puede ser mas de una para grupos grandes que no entran en una sola
    // mesa (ver Models/ReservaMesa.cs). El orden en que aparecen no importa
    // aca, se ordenan por Mesa.Orden al armar el DTO (ver DiaService).
    public List<ReservaMesa> ReservaMesas { get; set; } = new();

    public int? Pax { get; set; }
    public string? Nombre { get; set; }
    public string? HabTel { get; set; }
    public string? Comentarios { get; set; }
    public bool Asistio { get; set; }

    // Se tildo cuando la mesa fue pedida especificamente (por telefono, o el
    // huesped la solicito puntualmente): mientras este en true, el frontend
    // bloquea el desplegable de Mesa para que nadie la reasigne por error.
    public bool PidioMesa { get; set; }

    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
