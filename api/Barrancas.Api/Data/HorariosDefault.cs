using Barrancas.Api.Models;

namespace Barrancas.Api.Data;

/// <summary>
/// Horarios sugeridos por defecto para las 26 filas iniciales de cada turno,
/// tal cual estaban en la planilla original de Google Sheets.
/// </summary>
public static class HorariosDefault
{
    public static readonly string[] Almuerzo =
    {
        "12:30", "12:30", "12:30", "12:30",
        "12:45", "12:45", "12:45", "12:45",
        "13:00", "13:00", "13:00", "13:00",
        "13:15", "13:15", "13:15", "13:15",
        "13:30", "13:30", "13:30",
        "13:45", "13:45", "13:45",
        "14:00", "14:00", "14:00", "14:00",
    };

    public static readonly string[] Cena =
    {
        "20:30", "20:30", "20:30", "20:30",
        "20:45", "20:45", "20:45",
        "21:00", "21:00", "21:00", "21:00",
        "21:15", "21:15", "21:15",
        "21:30", "21:30", "21:30", "21:30",
        "21:45", "21:45", "21:45", "21:45",
        "22:00", "22:00", "22:00", "22:00",
    };

    // Turno intermedio del lobby bar (ver Salon.PermiteMerienda): dos filas
    // por horario, cada 30 min, de 16:00 a 18:00. A diferencia de
    // Almuerzo/Cena (26 filas heredadas tal cual de la planilla original),
    // este arranca mas chico porque es un turno nuevo sin historial — el
    // staff puede agregar mas filas a mano con "+ Agregar reserva" si hace
    // falta.
    public static readonly string[] Merienda =
    {
        "16:00", "16:00",
        "16:30", "16:30",
        "17:00", "17:00",
        "17:30", "17:30",
        "18:00", "18:00",
    };

    public static string[] Para(Turno turno) => turno switch
    {
        Turno.Almuerzo => Almuerzo,
        Turno.Cena => Cena,
        Turno.Merienda => Merienda,
        _ => throw new ArgumentOutOfRangeException(nameof(turno), turno, "turno desconocido"),
    };
}
