using Barrancas.Api.Models;

namespace Barrancas.Api.Dtos;

// Una reserva hecha por el link, para el panel "Reservas por el link".
// Estado: "pendiente" (solicitud sin aprobar), "confirmada", "asistio",
// "novino", "cancelada", "rechazada" o "vencida" (solicitud que nadie
// respondio y ya paso la fecha) — ver ReservaWebService.EstadoDe. ReservaId
// es la fila de la grilla mientras siga siendo esta reserva (null si se
// cancelo, se rechazo o es una solicitud que todavia no se aprobo).
public record ReservaWebDto(
    int Id,
    string Codigo,
    DateTime CreadaEn,
    DateOnly Fecha,
    Turno Turno,
    string Hora,
    int SalonId,
    string Salon,
    int Pax,
    string Nombre,
    string Telefono,
    string? Habitacion,
    string? Pedido,
    string Estado,
    int? ReservaId,
    DateTime? ConfirmadaEn,
    string? ConfirmadaPor,
    DateTime? CanceladaEn,
    string? CanceladaPor,
    DateTime? RechazadaEn = null,
    string? RechazadaPor = null,
    string? MotivoRechazo = null
);

// Aprobar una solicitud (POST /api/reservas-web/{id}/confirmar). MesaIds es
// opcional: las mesas tambien se pueden asignar despues en la grilla.
public record AprobarSolicitudRequest(List<int>? MesaIds);

// Rechazar una solicitud (POST /api/reservas-web/{id}/rechazar).
public record RechazarSolicitudRequest(string? Motivo);

// Chequeo de lugar de una solicitud (GET /api/reservas-web/{id}/chequeo, ver
// ReservaOnlineService.ChequearAsync). Estado: "ok", "justo", "sin_lugar" o
// "cerrado". Sugeridas: ids de las mesas que conviene usar (o juntar).
public record ChequeoSolicitudDto(
    string Estado,
    int MesasLibres,
    int LugaresLibres,
    int ReservasALaHora,
    int CupoHora,
    List<int> Sugeridas,
    List<MesaLibreDto> Libres
);

public record MesaLibreDto(int Id, string Codigo, int Capacidad);

// Para el contador (tipo notificacion) del boton "Reservas web" del panel.
// Ver ReservaWebService.ResumenAsync.
public record ReservaWebResumenDto(int AConfirmar, int Nuevas, int Avisos, DateTime? UltimaCreadaEn);

// Respuesta del tachito: si la fila venia del link, el registro que quedo
// cancelado (para poder deshacer).
public record VaciarReservaResultado(int? ReservaWebId);

// "Deshacer" del tachito: vuelve a cargar en la fila (que tiene que seguir
// vacia) los datos que tenia, y si venia del link, reactiva su registro.
public record RestaurarReservaRequest(
    string? Hora,
    int? Pax,
    string? Nombre,
    string? HabTel,
    string? Comentarios,
    bool Asistio,
    bool PidioMesa,
    bool Retirada,
    List<int>? MesaIds,
    OrigenReserva Origen,
    EstadoReserva Estado,
    int? ReservaWebId
);

// Arrastrar una reserva a otra fila (vacia) del mismo turno.
public record MoverReservaRequest(int DestinoId);
