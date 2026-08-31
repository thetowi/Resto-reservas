using Barrancas.Api.Models;

namespace Barrancas.Api.Dtos;

// Mismo patron que ToggleWalkInRequest: si el turno no estaba cerrado, lo
// cierra (con Motivo, si vino); si ya estaba cerrado, lo reabre (Motivo se
// ignora en ese caso). Ver CierresController.
public record ToggleCierreRequest(DateOnly Fecha, Turno Turno, int SalonId, string? Motivo);