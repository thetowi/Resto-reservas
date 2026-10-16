using Barrancas.Api.Models;

namespace Barrancas.Api.Dtos;

// Turno null = todo el dia.
public record FechaBloqueadaBotDto(int Id, DateOnly Fecha, Turno? Turno, string? Motivo, string? MensajeCliente, bool IncluyeBot, DateTime CreatedAt);

// Hasta null = solo Desde. Si alguna fecha del rango ya estaba cerrada, se
// actualiza con estos datos (no se duplica).
public record CrearFechaBloqueadaBotRequest(DateOnly Desde, DateOnly? Hasta, Turno? Turno, string? Motivo, string? MensajeCliente, bool IncluyeBot = true);

public record ActualizarFechaBloqueadaBotRequest(Turno? Turno, string? Motivo, string? MensajeCliente, bool IncluyeBot);
