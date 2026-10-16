namespace Barrancas.Api.Models;

/// <summary>
/// Registro de cada reserva que un cliente hizo por el link publico
/// (/reservar). Es aparte de la fila de la grilla (Reserva) a proposito: la
/// fila se puede vaciar con el tachito o quitar, y se vuelve a usar para otra
/// reserva, pero este registro queda, asi el panel "Reservas por el link"
/// sigue mostrando las canceladas (quien y cuando) y no se pierde el control
/// de lo que entro por la web. Guarda una copia de los datos tal como los
/// cargo el cliente.
/// </summary>
public class ReservaWeb
{
    public int Id { get; set; }

    // Cuando entro el pedido (UTC).
    public DateTime CreadaEn { get; set; } = DateTime.UtcNow;

    // La fila de la grilla que ocupa. Queda en null si la fila se quita
    // (ver ReservasController.Borrar) — el registro no se borra con ella.
    public int? ReservaId { get; set; }
    public Reserva? Reserva { get; set; }

    public DateOnly Fecha { get; set; }
    public Turno Turno { get; set; }
    public int SalonId { get; set; }
    public Salon? Salon { get; set; }
    public string Hora { get; set; } = string.Empty;
    public int Pax { get; set; }
    public string Nombre { get; set; } = string.Empty;
    public string Telefono { get; set; } = string.Empty;
    public string? Habitacion { get; set; }
    public string? Ocasion { get; set; }
    public string? Comentarios { get; set; }

    public EstadoReservaWeb Estado { get; set; }

    // Quien la confirmo a mano (las que quedaron como solicitud), y quien la
    // cancelo (tachito o quitar fila). Nombre del usuario del panel.
    public DateTime? ConfirmadaEn { get; set; }
    public string? ConfirmadaPor { get; set; }
    public DateTime? CanceladaEn { get; set; }
    public string? CanceladaPor { get; set; }
}

public enum EstadoReservaWeb
{
    // Quedo confirmada al momento (o el staff la confirmo despues).
    Confirmada = 0,

    // Quedo como solicitud: el staff tiene que confirmarla.
    Pendiente = 1,

    // Se borro desde el panel (tachito o quitar fila).
    Cancelada = 2,
}
