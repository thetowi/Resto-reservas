// después
using Barrancas.Api.Models;

namespace Barrancas.Api.Dtos;
public record DividirPorTurnoRequest(DateOnly Fecha, Turno Turno, int PaxA, int PaxB);
public record UnirPorTurnoRequest(DateOnly Fecha, Turno Turno);