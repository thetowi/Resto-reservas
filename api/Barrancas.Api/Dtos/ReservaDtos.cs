using Barrancas.Api.Models;

namespace Barrancas.Api.Dtos;

public record ReservaDto(
    int Id,
    DateOnly Fecha,
    Turno Turno,
    int Orden,
    string? Hora,
    // Antes era una sola mesa (MesaId); ahora puede ser mas de una para
    // grupos grandes. Vienen ordenadas por Mesa.Orden.
    List<int> MesaIds,
    List<string> MesaCodigos,
    int? Pax,
    string? Nombre,
    string? HabTel,
    string? Comentarios,
    bool Asistio,
    bool PidioMesa,
    DateTime UpdatedAt
);

public record TurnoDataDto(
    DateOnly Fecha,
    Turno Turno,
    // A que salon pertenece este turno (ver Models/Salon.cs): cada salon
    // tiene su propia lista de reservas/mesas ocupadas independiente, asi
    // que quien escucha el broadcast de SignalR necesita este dato para
    // filtrar (igual criterio que Fecha/Turno).
    int SalonId,
    List<ReservaDto> Reservas,
    int TotalPax,
    int TotalAsistio,
    List<int> MesasOcupadas,
    // Subconjunto de MesasOcupadas donde la reserva que la ocupa tiene
    // "Pidio mesa" tildado: el frontend las resalta con un color distinto
    // en el panel de mesas para avisar que esa mesa fue pedida puntualmente
    // y no conviene reasignarla a otro grupo.
    List<int> MesasPedidas,
    // Mesas marcadas como ocupadas por un walk-in (ver Models/WalkIn.cs):
    // a proposito NO son parte de MesasOcupadas/Reservas — un walk-in no
    // genera fila en la grilla, solo pinta la mesa de otro color en el
    // panel. Nunca se solapa con MesasOcupadas: una mesa esta en una lista
    // o en la otra, nunca en las dos.
    List<int> MesasWalkIn,
    // Si este turno esta cerrado para este salon (ver Models/CierreTurno.cs):
    // no se toman reservas nuevas ni se editan las existentes hasta
    // reabrirlo (ver ReservasController). El frontend reemplaza la grilla
    // por un aviso cuando esto es true.
    bool EstaCerrado,
    string? MotivoCierre
);

public record DiaDto(DateOnly Fecha, TurnoDataDto Almuerzo, TurnoDataDto Cena);

public record MesaDto(int Id, string Codigo, int Capacidad, int? MesaPadreId, int Orden, double? PosX, double? PosY, int SalonId);

// Trae TODAS las mesas de TODOS los salones (no solo el elegido en
// pantalla): el frontend las filtra por SalonId donde haga falta, igual
// criterio que ya usaba para ocultar mesas "totalmente divididas" — evita
// tener que volver a pedir /api/meta cada vez que se cambia de salon.
// Salones es la lista completa para el selector.
public record MetaDto(List<MesaDto> Mesas, List<SalonDto> Salones);

public record CrearReservaRequest(DateOnly Fecha, Turno Turno, int SalonId, string? Hora);

// Togglear la marca de walk-in de una mesa desde el panel de mesas
// disponibles: si no estaba marcada, la marca (y valida que no tenga ya una
// reserva real asignada); si ya estaba marcada, la saca (libera la mesa). No
// hace falta mandar SalonId: se deriva de la mesa (ver WalkInController).
public record ToggleWalkInRequest(DateOnly Fecha, Turno Turno, int MesaId);

// Convencion de este DTO para PATCH parcial: en Hora/Nombre/HabTel/Comentarios
// un valor null significa "no tocar este campo" (el frontend, al editar un
// input de texto, siempre manda "" para vaciarlo, nunca null). MesaId y Pax
// en cambio necesitan poder "vaciarse" de verdad (desasignar mesa, borrar la
// cantidad de pax), por eso usan OptionalInt: IsSet=false = no vino en el
// body: no tocar. IsSet=true,Value=null = vino explicitamente en null:
// limpiar el campo.
public record ActualizarReservaRequest(
    string? Hora,
    List<int>? MesaIds,
    OptionalInt Pax,
    string? Nombre,
    string? HabTel,
    string? Comentarios,
    bool? Asistio,
    bool? PidioMesa
);
