using Barrancas.Api.Models;

namespace Barrancas.Api.Dtos;

// Una reserva hecha por el link, para el panel "Reservas por el link".
// Estado: "pendiente" (a confirmar), "confirmada", "asistio", "novino" o
// "cancelada" (ver ReservaWebService.EstadoDe). ReservaId es la fila de la
// grilla mientras siga siendo esta reserva (null si se cancelo).
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
    string? CanceladaPor
);

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
