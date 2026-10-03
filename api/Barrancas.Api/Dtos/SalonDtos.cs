namespace Barrancas.Api.Dtos;

// DTOs de los salones del restaurante (Restaurant, Bar, Aqua Bar, etc — ver
// Models/Salon.cs y SalonesController). MetaController.GetMeta (GET
// /api/meta) solo trae los salones ACTIVOS (para el selector de la pantalla
// principal/plano/admin de mesas); SalonesController.GetLista (GET
// /api/salones, usada por /admin/salones) trae TODOS, activos e inactivos,
// para poder reactivarlos.

// PermiteMerienda: si este salon ofrece el turno intermedio Merienda (ver
// Models/Salon.cs) — pensado para el lobby bar, no para el salon principal.
// Activo: ver Models/Salon.cs — un salon inactivo sigue existiendo con toda
// su data, solo deja de ofrecerse en el uso diario.
public record SalonDto(int Id, string Nombre, int Orden, bool PermiteMerienda, bool Activo);

public record CrearSalonRequest(string Nombre);

// Todos opcionales: renombrar manda solo Nombre, reordenar (si hiciera falta
// en el futuro) mandaria solo Orden, PermiteMerienda y Activo se togglean
// solos desde sus respectivos controles en /admin/salones.
public record ActualizarSalonRequest(string? Nombre, int? Orden, bool? PermiteMerienda, bool? Activo);
