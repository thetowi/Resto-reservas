using Barrancas.Api.Data;
using Barrancas.Api.Dtos;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Barrancas.Api.Controllers;

/// <summary>
/// Reporte mensual de asistencia — exclusivo de Admin. Solo cuenta filas de
/// reserva "reales" (con Pax cargado): las 26 filas default que
/// DiaService.SeedTurnoSiVacioAsync pre-genera por turno no representan una
/// reserva de verdad, asi que quedarian afuera de cualquier conteo si
/// entraran (siempre tienen Pax null). Por defecto combina TODOS los
/// salones (ver Models/Salon.cs); pasando ?salonId= se limita a uno solo.
/// </summary>
[ApiController]
[Authorize(Roles = "Admin")]
[Route("api/reportes")]
public class ReportesController : ControllerBase
{
    private readonly BarrancasDbContext _db;

    public ReportesController(BarrancasDbContext db)
    {
        _db = db;
    }

    [HttpGet("mensual")]
    public async Task<ActionResult<ReporteMensualDto>> Mensual([FromQuery] int anio, [FromQuery] int mes, [FromQuery] int? salonId = null)
    {
        if (mes < 1 || mes > 12)
        {
            return BadRequest(new { error = "mes inválido: tiene que estar entre 1 y 12" });
        }
        DateOnly primerDia;
        try
        {
            primerDia = new DateOnly(anio, mes, 1);
        }
        catch (ArgumentOutOfRangeException)
        {
            return BadRequest(new { error = "año inválido" });
        }
        var ultimoDia = primerDia.AddMonths(1).AddDays(-1);

        // Solo el rango de fechas (y, si se pidio, el salon) se filtra en
        // SQL; el resto (agrupar, sumar, contar "reservas reales") es mas
        // simple de expresar en memoria una vez traidas las filas del mes,
        // que en la practica son pocas (unos cientos como mucho). Sin
        // salonId el reporte combina TODOS los salones (default); con
        // salonId, se limita a ese uno solo.
        var reservas = await _db.Reservas
            .Where(r => r.Fecha >= primerDia && r.Fecha <= ultimoDia && (salonId == null || r.SalonId == salonId))
            .Select(r => new { r.Fecha, r.Turno, r.Pax, r.Asistio })
            .ToListAsync();

        var porDiaYTurno = reservas
            .GroupBy(r => (r.Fecha, r.Turno))
            .Select(g =>
            {
                var totalPaxDia = g.Sum(r => r.Pax ?? 0);
                var totalAsistioDia = g.Where(r => r.Asistio).Sum(r => r.Pax ?? 0);
                return new ReporteDiaDto(
                    g.Key.Fecha,
                    g.Key.Turno,
                    g.Count(r => r.Pax.HasValue),
                    totalPaxDia,
                    totalAsistioDia,
                    Porcentaje(totalAsistioDia, totalPaxDia));
            })
            .OrderBy(d => d.Fecha).ThenBy(d => d.Turno)
            .ToList();

        var totalReservas = reservas.Count(r => r.Pax.HasValue);
        var totalPax = reservas.Sum(r => r.Pax ?? 0);
        var totalAsistio = reservas.Where(r => r.Asistio).Sum(r => r.Pax ?? 0);

        return Ok(new ReporteMensualDto(
            anio, mes, totalReservas, totalPax, totalAsistio,
            Porcentaje(totalAsistio, totalPax), porDiaYTurno));
    }

    private static double Porcentaje(int parte, int total) =>
        total == 0 ? 0 : Math.Round(100.0 * parte / total, 1);
}
