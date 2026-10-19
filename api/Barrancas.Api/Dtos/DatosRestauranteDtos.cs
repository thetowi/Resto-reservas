namespace Barrancas.Api.Dtos;

// Datos del restaurante (/admin/restaurante, ver DatosRestauranteController).
// Todos opcionales: lo vacio se guarda como null.
public record DatosRestauranteDto(
    string? Direccion,
    string? GoogleMapsUrl,
    string? AppleMapsUrl,
    string? WazeUrl,
    DateTime? UpdatedAt,
    string? UpdatedBy);

public record GuardarDatosRestauranteRequest(
    string? Direccion,
    string? GoogleMapsUrl,
    string? AppleMapsUrl,
    string? WazeUrl);
