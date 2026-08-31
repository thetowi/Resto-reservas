namespace Barrancas.Api.Dtos;

// DTOs de los salones del restaurante (Restaurant, Bar, Aqua Bar, etc — ver
// Models/Salon.cs y SalonesController). La lista completa viaja siempre
// dentro de MetaDto (GET /api/meta) para el selector de salon del frontend;
// estos records son los que usa SalonesController para crear/renombrar.

public record SalonDto(int Id, string Nombre, int Orden);

public record CrearSalonRequest(string Nombre);

// Ambos campos opcionales: renombrar manda solo Nombre, reordenar (si hiciera
// falta en el futuro) mandaria solo Orden.
public record ActualizarSalonRequest(string? Nombre, int? Orden);
