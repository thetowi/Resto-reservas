namespace Barrancas.Api.Dtos;

// DTOs de los salones del restaurante (Restaurant, Bar, Aqua Bar, etc — ver
// Models/Salon.cs y SalonesController). La lista completa viaja siempre
// dentro de MetaDto (GET /api/meta) para el selector de salon del frontend;
// estos records son los que usa SalonesController para crear/renombrar.

// PermiteMerienda: si este salon ofrece el turno intermedio Merienda (ver
// Models/Salon.cs) — pensado para el lobby bar, no para el salon principal.
public record SalonDto(int Id, string Nombre, int Orden, bool PermiteMerienda);

public record CrearSalonRequest(string Nombre);

// Todos opcionales: renombrar manda solo Nombre, reordenar (si hiciera falta
// en el futuro) mandaria solo Orden, y PermiteMerienda se togglea sola desde
// el checkbox correspondiente en /admin/salones.
public record ActualizarSalonRequest(string? Nombre, int? Orden, bool? PermiteMerienda);
