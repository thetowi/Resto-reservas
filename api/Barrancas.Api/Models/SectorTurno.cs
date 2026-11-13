namespace Barrancas.Api.Models;

/// <summary>
/// Estado de un sector en un turno puntual (ver Models/Sector.cs). Si no hay
/// registro, el sector está abierto. Cerrado: sus mesas quedan reducidas
/// (MesasReducidas, igual que «Reducir salón») y se guarda el motivo para
/// mostrarlo. Grupo: una sola reserva (ReservaId) ocupa todas sus mesas. En
/// los dos casos la planilla se achica sola (ver DiaService.AjustarFilasAsync).
/// Como las reducciones, vale solo para ese turno: el siguiente vuelve a
/// estar todo abierto.
/// </summary>
public class SectorTurno
{
    public int Id { get; set; }
    public DateOnly Fecha { get; set; }
    public Turno Turno { get; set; }
    public int SalonId { get; set; }

    public int SectorId { get; set; }
    public Sector? Sector { get; set; }

    public EstadoSector Estado { get; set; }

    // Cerrado: el motivo que se eligió ("Poco personal", "Clima"...).
    public string? Motivo { get; set; }

    // Grupo: la fila de la planilla con la reserva del grupo.
    public int? ReservaId { get; set; }

    public DateTime CreadoEn { get; set; } = DateTime.UtcNow;
    public string? CreadoPor { get; set; }
}

public enum EstadoSector
{
    Cerrado = 1,
    Grupo = 2,
}
