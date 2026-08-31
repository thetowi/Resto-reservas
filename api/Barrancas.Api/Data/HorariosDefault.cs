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

    public static string[] Para(Turno turno) => turno == Turno.Almuerzo ? Almuerzo : Cena;
}
