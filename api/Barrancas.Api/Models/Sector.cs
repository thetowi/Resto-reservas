namespace Barrancas.Api.Models;

/// <summary>
/// Una parte de un salón (en Barrancas, el Restaurant tiene «Bodega» y
/// «Terraza»). Cada mesa puede estar en un sector (Mesa.SectorId); las
/// divisiones van con su mesa. En cada turno, un sector puede quedar abierto,
/// cerrado (por poco personal, por ejemplo) o ocupado por un grupo grande que
/// se queda con todas sus mesas (ver SectorTurno y SectoresService).
/// </summary>
public class Sector
{
    public int Id { get; set; }

    public int SalonId { get; set; }
    public Salon? Salon { get; set; }

    public string Nombre { get; set; } = string.Empty;

    // Color para pintarlo en el plano y en el panel (hex, ej. "#8a5a2b").
    public string Color { get; set; } = string.Empty;

    public int Orden { get; set; }
}
