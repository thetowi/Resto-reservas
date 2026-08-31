using Barrancas.Api.Models;

namespace Barrancas.Api.Dtos;

// Reporte mensual de asistencia (ver ReportesController), exclusivo del rol
// Admin. Solo cuenta reservas "reales" (con Pax cargado) — las filas
// default pre-generadas por turno (ver DiaService.SeedTurnoSiVacioAsync) no
// entran en ningun conteo/total.

public record ReporteDiaDto(
    DateOnly Fecha,
    Turno Turno,
    int CantidadReservas,
    int TotalPax,
    int TotalAsistio,
    // Redondeado a 1 decimal; 0 si TotalPax es 0 (no dividir por cero).
    double PorcentajeAsistencia
);

public record ReporteMensualDto(
    int Anio,
    int Mes,
    int TotalReservas,
    int TotalPax,
    int TotalAsistio,
    double PorcentajeAsistencia,
    List<ReporteDiaDto> PorDiaYTurno
);
