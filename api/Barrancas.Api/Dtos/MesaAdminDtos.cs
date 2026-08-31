namespace Barrancas.Api.Dtos;

// DTOs del panel de administracion de mesas (/admin/mesas en el frontend):
// crear una mesa base nueva, dividir una mesa existente en una mesa hija
// independiente, editar codigo/capacidad, o borrar una mesa.

public record CrearMesaRequest(string Codigo, int Capacidad, int SalonId);

public record DividirMesaRequest(string Codigo, int Capacidad);

// Todos los campos opcionales: solo se actualiza lo que viene en el body.
// PosX/PosY se mandan juntos siempre que se termina de arrastrar una mesa en
// el plano visual (vista "Plano" de /admin/mesas).
public record ActualizarMesaRequest(string? Codigo, int? Capacidad, double? PosX, double? PosY);
