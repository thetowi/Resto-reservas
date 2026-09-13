namespace Barrancas.Api.Models;

/// <summary>
/// Renombre temporal del codigo de una mesa, valido SOLO para una
/// fecha+turno+salon puntual (ver MesasController.RenombrarPorTurno) — a
/// diferencia de MesasController.Actualizar (PATCH /api/mesas/{id}, que
/// cambia el Codigo real y permanente de /admin/mesas), esto no toca la
/// mesa en si: solo hace que ESE turno la vea con otro numero. Ejemplo tipico:
/// se corrio la mesa "55" junto a la ventana y por esta noche se la quiere
/// ver como "48". Al terminar el turno deja de aplicarse solo — no hace
/// falta revertirlo para que el turno siguiente vuelva a ver el codigo
/// real —, aunque tambien se puede deshacer antes, dentro del mismo turno,
/// borrando esta fila (ver MesasController.RevertirNombrePorTurno).
/// </summary>
public class RenombreMesaTurno
{
    public int Id { get; set; }
    public DateOnly Fecha { get; set; }
    public Turno Turno { get; set; }
    public int SalonId { get; set; }
    public Salon? Salon { get; set; }

    public int MesaId { get; set; }
    public Mesa? Mesa { get; set; }

    public string CodigoNuevo { get; set; } = string.Empty;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
