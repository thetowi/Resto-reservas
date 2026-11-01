using Barrancas.Api.Data;
using Barrancas.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace Barrancas.Api.Services;

/// <summary>
/// Horarios de cada turno por salón (ver Models/HorarioTurno.cs): los que
/// cargó el Admin o, si no cargó ninguno para ese salón y turno, los de
/// siempre (Data/HorariosDefault.cs). Es estático a propósito: lo usan
/// DiaService (abrir el día) y ReservaOnlineService (link de reservas) con su
/// propio DbContext, sin sumar dependencias.
/// </summary>
public static class HorariosTurnoService
{
    public record Franja(string Hora, int Filas);

    public const int MaxHorarios = 40;
    public const int MaxFilasPorHorario = 30;

    /// <summary>Los de la planilla original, agrupados por hora.</summary>
    public static List<Franja> PorDefecto(Turno turno) =>
        HorariosDefault.Para(turno)
            .GroupBy(h => h)
            .OrderBy(g => g.Key, StringComparer.Ordinal)
            .Select(g => new Franja(g.Key, g.Count()))
            .ToList();

    public static async Task<List<Franja>> ObtenerAsync(BarrancasDbContext db, int salonId, Turno turno)
    {
        var cargados = await db.HorariosTurno
            .AsNoTracking()
            .Where(h => h.SalonId == salonId && h.Turno == turno)
            .Select(h => new Franja(h.Hora, h.Filas))
            .ToListAsync();
        return cargados.Count > 0
            ? cargados.OrderBy(f => f.Hora, StringComparer.Ordinal).ToList()
            : PorDefecto(turno);
    }

    /// <summary>Una entrada por fila, en orden (ej. 20:30, 20:30, 20:30, 20:45…).</summary>
    public static List<string> Filas(IEnumerable<Franja> franjas) =>
        franjas.SelectMany(f => Enumerable.Repeat(f.Hora, f.Filas)).ToList();
}
