using Barrancas.Api.Models;

namespace Barrancas.Api.Dtos;

// A diferencia de ToggleCierreRequest/ToggleWalkInRequest (que togglean de a
// una), esto REEMPLAZA el set completo de mesas reducidas para esta
// fecha+turno+salon puntual: MesaIds es la lista FINAL que queda fuera de
// "Mesas disponibles" — las que ya estaban reducidas y no vienen en la
// lista se reactivan, las nuevas que vienen se agregan. Permite que el
// mismo modal de "Reducir salon" sume y saque reducciones en una sola
// confirmacion (ver ReduccionesController.Set).
public record ReducirSalonRequest(DateOnly Fecha, Turno Turno, int SalonId, List<int> MesaIds);
