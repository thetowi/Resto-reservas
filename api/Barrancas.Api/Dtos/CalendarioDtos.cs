namespace Barrancas.Api.Dtos;

/// <summary>
/// Un dia del calendario del encabezado del panel: cuantas reservas y
/// cuanta gente hay cargadas, sumando todos los salones y turnos.
/// </summary>
public record CalendarioDiaDto(DateOnly Fecha, int Reservas, int Pax);
