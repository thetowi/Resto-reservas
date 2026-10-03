namespace Barrancas.Api.Models;

/// <summary>
/// Deshabilita una mesa LIBRE para una fecha+turno+salon puntual (ver
/// ReduccionesController) — pensado para cuando hay poco personal y
/// conviene reducir el salon en vez de dejarlo todo abierto. A diferencia
/// de DivisionMesaTurno (que crea mesas nuevas) o RenombreMesaTurno (que
/// solo cambia un codigo), esto no modifica la mesa ni crea nada: solo la
/// saca de "Mesas disponibles" (ver DiaService/MesaDto.Reducida) para ese
/// turno puntual. Al terminar el turno deja de aplicarse solo — no hace
/// falta revertirlo para que el turno siguiente la vuelva a ver normal —,
/// aunque tambien se puede destildar antes, dentro del mismo turno, desde
/// el mismo modal de "Reducir salon" (ver ReduccionesController.Set, que
/// reemplaza el set completo en vez de togglear una por una).
/// </summary>
public class MesaReducida
{
    public int Id { get; set; }
    public DateOnly Fecha { get; set; }
    public Turno Turno { get; set; }
    public int SalonId { get; set; }
    public Salon? Salon { get; set; }

    public int MesaId { get; set; }
    public Mesa? Mesa { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
