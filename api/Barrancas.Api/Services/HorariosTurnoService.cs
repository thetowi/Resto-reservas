using System.Collections.Concurrent;
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
///
/// Al guardar horarios nuevos se aplican de hoy en adelante, también a los
/// días que ya tenían la planilla abierta (AplicarADiasAbiertosAsync): ahí se
/// rearman solo las filas vacías; las filas con datos (reservas) no se tocan.
/// </summary>
public static class HorariosTurnoService
{
    public record Franja(string Hora, int Filas);

    // Un candado por salón + turno: abrir un día (DiaService.SeedTurnoSiVacioAsync)
    // y rearmar los días abiertos (AplicarADiasAbiertosAsync) no pueden correr
    // a la vez para el mismo turno. Sin esto, si el mismo día se pedía dos o
    // tres veces al mismo tiempo (el panel lo pide para el salón elegido y para
    // el resumen de salones, otra tablet, el link…), cada pedido lo veía vacío
    // y creaba sus filas: el día quedaba con las filas duplicadas o triplicadas.
    private static readonly ConcurrentDictionary<(int, Turno), SemaphoreSlim> Candados = new();

    public static SemaphoreSlim Candado(int salonId, Turno turno) =>
        Candados.GetOrAdd((salonId, turno), _ => new SemaphoreSlim(1, 1));

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

    /// <summary>
    /// Una fila "con datos" es una reserva de verdad (o algo que cargó el
    /// equipo): nunca se borra ni se mueve al cambiar horarios.
    /// </summary>
    public static bool TieneDatos(Reserva r) =>
        r.Pax is not null
        || !string.IsNullOrWhiteSpace(r.Nombre)
        || !string.IsNullOrWhiteSpace(r.HabTel)
        || !string.IsNullOrWhiteSpace(r.Comentarios)
        || r.Asistio
        || r.PidioMesa
        || r.Retirada
        || r.ReservaMesas.Count > 0;

    /// <summary>
    /// Lleva los horarios actuales de ese salón y turno a los días que ya
    /// tienen la planilla abierta, desde la fecha dada (hoy) en adelante. En
    /// cada día: las filas con datos quedan como están; las vacías se agregan
    /// o se quitan para que cada horario tenga sus filas (contando las que ya
    /// tienen reserva), y las vacías de horarios que ya no existen se quitan.
    /// Los días que todavía no se abrieron no se tocan: se arman solos con
    /// los horarios nuevos el día que alguien los abra. Devuelve los días que
    /// cambiaron (para avisarle al panel).
    /// </summary>
    public static async Task<List<DateOnly>> AplicarADiasAbiertosAsync(BarrancasDbContext db, int salonId, Turno turno, DateOnly desde)
    {
        var candado = Candado(salonId, turno);
        await candado.WaitAsync();
        try
        {
            var franjas = await ObtenerAsync(db, salonId, turno);
            var filas = await db.Reservas
                .Include(r => r.ReservaMesas)
                .Where(r => r.SalonId == salonId && r.Turno == turno && r.Fecha >= desde)
                .ToListAsync();

            var cambiados = new List<DateOnly>();
            foreach (var dia in filas.GroupBy(r => r.Fecha))
            {
                if (RearmarDia(db, dia.Key, salonId, turno, dia.ToList(), franjas)) cambiados.Add(dia.Key);
            }
            if (cambiados.Count > 0) await db.SaveChangesAsync();
            return cambiados.OrderBy(f => f).ToList();
        }
        finally
        {
            candado.Release();
        }
    }

    private static bool RearmarDia(BarrancasDbContext db, DateOnly fecha, int salonId, Turno turno, List<Reserva> filas, List<Franja> franjas)
    {
        var conDatos = filas.Where(TieneDatos).ToList();
        var vacias = filas.Where(r => !TieneDatos(r)).ToList();
        var quedan = new List<Reserva>(conDatos);
        var cambio = false;

        foreach (var f in franjas)
        {
            var faltan = Math.Max(0, f.Filas - conDatos.Count(r => r.Hora == f.Hora));
            var reusadas = vacias.Where(r => r.Hora == f.Hora).OrderBy(r => r.Orden).Take(faltan).ToList();
            quedan.AddRange(reusadas);
            for (var i = reusadas.Count; i < faltan; i++)
            {
                var nueva = new Reserva { Fecha = fecha, Turno = turno, SalonId = salonId, Hora = f.Hora, Asistio = false };
                db.Reservas.Add(nueva);
                quedan.Add(nueva);
                cambio = true;
            }
        }

        var sobran = vacias.Except(quedan).ToList();
        if (sobran.Count > 0)
        {
            db.Reservas.RemoveRange(sobran);
            cambio = true;
        }

        // Orden de la planilla: por hora y, dentro de cada hora, como estaban
        // (las filas nuevas al final de su hora).
        var orden = 0;
        foreach (var r in quedan
                     .OrderBy(r => r.Hora ?? "99:99", StringComparer.Ordinal)
                     .ThenBy(r => r.Id == 0 ? int.MaxValue : r.Orden))
        {
            if (r.Orden != orden)
            {
                r.Orden = orden;
                cambio = true;
            }
            orden++;
        }
        return cambio;
    }

    /// <summary>Una entrada por fila, en orden (ej. 20:30, 20:30, 20:30, 20:45…).</summary>
    public static List<string> Filas(IEnumerable<Franja> franjas) =>
        franjas.SelectMany(f => Enumerable.Repeat(f.Hora, f.Filas)).ToList();
}
