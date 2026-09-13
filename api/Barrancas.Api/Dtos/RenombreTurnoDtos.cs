using Barrancas.Api.Models;

namespace Barrancas.Api.Dtos;
public record RenombrarPorTurnoRequest(DateOnly Fecha, Turno Turno, string CodigoNuevo);
public record RevertirNombrePorTurnoRequest(DateOnly Fecha, Turno Turno);
