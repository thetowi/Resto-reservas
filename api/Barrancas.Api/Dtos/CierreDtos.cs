using Barrancas.Api.Models;

namespace Barrancas.Api.Dtos;

// Mismo patron que ToggleWalkInRequest: si el turno no estaba cerrado, lo
// cierra (con Motivo, si vino); si ya estaba cerrado, lo reabre (Motivo se
// ignora en ese caso). Ver CierresController.
// Cerrar: lo que se quiere (true = cerrado, false = abierto). Si ya está así
// no se toca: «cerrar en todos los salones» no reabre uno que ya estaba
// cerrado (ej. un salón que ese día de la semana no abre). Sin Cerrar se
// comporta como interruptor.
public record ToggleCierreRequest(DateOnly Fecha, Turno Turno, int SalonId, string? Motivo, bool? Cerrar = null);