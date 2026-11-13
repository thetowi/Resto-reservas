using Barrancas.Api.Models;

namespace Barrancas.Api.Dtos;

// Sectores de un salón (ver Models/Sector.cs).
public record SectorDto(int Id, int SalonId, string Nombre, string Color, int Orden);

public record CrearSectorRequest(int SalonId, string Nombre, string? Color);

public record EditarSectorRequest(string? Nombre, string? Color);

// Pinta mesas con un sector (SectorId null = sin sector). Las divisiones
// siguen a su mesa (ver SectoresController.Asignar).
public record AsignarSectorRequest(int? SectorId, List<int> MesaIds);

// Estado de un sector en un turno, para el panel (TurnoDataDto.Sectores).
// Estado: "abierto", "cerrado" o "grupo". MesaIds: las mesas del sector que
// ve este turno.
public record SectorTurnoDto(
    int SectorId,
    string Nombre,
    string Color,
    string Estado,
    string? Motivo,
    int? ReservaId,
    List<int> MesaIds);

// Lo que se confirma en el modal «Sectores» de un turno: el estado final de
// cada sector (los que no vienen no se tocan).
public record SectoresTurnoRequest(DateOnly Fecha, Turno Turno, int SalonId, List<SectorEstadoRequest> Sectores);

public record SectorEstadoRequest(int SectorId, string Estado, string? Motivo, GrupoSectorRequest? Grupo);

public record GrupoSectorRequest(string Nombre, int Pax, string Hora, string? HabTel, string? Comentarios);
