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

    // Se tildo cuando esta reserva ya vino, comio y se fue: a partir de ahi
    // sus mesas (ReservaMesas) DEJAN de contar como ocupadas (ver
    // DiaService.GetTurnoAsync — mesasOcupadas/mesasPedidas se calculan
    // excluyendo las reservas retiradas) asi quedan libres para un walk-in
    // u otra reserva. A proposito NO se borran las ReservaMesas al tildar
    // esto: la fila sigue mostrando en que mesa(s) estuvo sentada esta
    // reserva (historial), solo que atenuada — ver ReservaRow.tsx. Es
    // independiente de Asistio (no se auto-tilda ni se auto-destilda entre
    // si): el equipo puede querer marcar "se fue" sin haber tildado antes
    // "Asistio", segun como lo use cada turno.
    public bool Retirada { get; set; }

    // De donde vino esta reserva (ver Models/OrigenReserva.cs) y, si vino del
    // chatbot de WhatsApp, si pudo confirmarla sola o quedo pendiente de que
    // el staff la termine de resolver (ver Models/EstadoReserva.cs). Para
    // una reserva cargada por el staff (el caso de siempre) estos dos quedan
    // en sus defaults — Staff / Confirmada — y no significan nada especial.
    public OrigenReserva Origen { get; set; } = OrigenReserva.Staff;
    public EstadoReserva Estado { get; set; } = EstadoReserva.Confirmada;

    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    // Orden de llegada: cuándo entró esta reserva (UTC) y quién la cargó.
    // Se toma cuando la fila vacía recibe su primer dato (ver
    // ReservasController.Actualizar); editarla después no lo cambia, y
    // moverla de horario lo conserva (es la misma reserva). Al vaciar la
    // fila (tachito) vuelve a null. RecibidaPor es el usuario del panel; en
    // las del link y del bot queda null (el origen ya dice de dónde vino) y
    // en las del link RecibidaEn es la hora en que el cliente la mandó.
    // Las cargadas a mano antes de esta función quedan en null.
    public DateTime? RecibidaEn { get; set; }
    public string? RecibidaPor { get; set; }

    // Reserva de un grupo que ocupa un sector completo en este turno (ver
    // Models/SectorTurno.cs): el sector. Null en las reservas comunes.
    public int? SectorId { get; set; }
}
