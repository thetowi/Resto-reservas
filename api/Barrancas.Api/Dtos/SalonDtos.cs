using Barrancas.Api.Models;

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
// El resto: la configuración del salón (ver Models/Salon.cs). Dias*: máscara
// de bits lunes = 1 ... domingo = 64.
public record SalonDto(
    int Id,
    string Nombre,
    int Orden,
    bool PermiteMerienda,
    bool Activo,
    string Color = "",
    bool OfreceAlmuerzo = true,
    bool OfreceCena = true,
    int DiasAlmuerzo = Salon.TodosLosDias,
    int DiasMerienda = Salon.TodosLosDias,
    int DiasCena = Salon.TodosLosDias,
    bool MostrarEnLink = true,
    ConfirmacionWeb Confirmacion = ConfirmacionWeb.Nunca,
    int ConfirmaHastaPax = 6,
    int PaxMaximoWeb = 20,
    int AnticipacionMinutos = 60,
    int DiasAdelante = 60,
    int ToleranciaMinutos = 15);

public record CrearSalonRequest(string Nombre);

// Todos opcionales: renombrar manda solo Nombre, reordenar (si hiciera falta
// en el futuro) mandaria solo Orden, PermiteMerienda y Activo se togglean
// solos desde sus respectivos controles en /admin/salones.
public record ActualizarSalonRequest(
    string? Nombre,
    int? Orden,
    bool? PermiteMerienda,
    bool? Activo,
    string? Color = null,
    bool? OfreceAlmuerzo = null,
    bool? OfreceCena = null,
    int? DiasAlmuerzo = null,
    int? DiasMerienda = null,
    int? DiasCena = null,
    bool? MostrarEnLink = null,
    ConfirmacionWeb? Confirmacion = null,
    int? ConfirmaHastaPax = null,
    int? PaxMaximoWeb = null,
    int? AnticipacionMinutos = null,
    int? DiasAdelante = null,
    int? ToleranciaMinutos = null);

// Nuevo orden de los salones (arrastrando en /admin/salones): los ids en orden.
public record OrdenSalonesRequest(List<int> Ids);
