namespace Barrancas.Api.Dtos;

public record FechaBloqueadaBotDto(int Id, DateOnly Fecha, string? Motivo, DateTime CreatedAt);

public record CrearFechaBloqueadaBotRequest(DateOnly Fecha, string? Motivo);
