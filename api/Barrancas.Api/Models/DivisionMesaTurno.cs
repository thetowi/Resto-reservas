namespace Barrancas.Api.Models;

/// <summary>
/// Division temporal de una mesa, valida SOLO para una fecha+turno+salon
/// puntual (a diferencia de la division de MesasController.Dividir, que es
/// permanente/estructural y define el default del salon desde
/// /admin/mesas). Mientras existe esta fila, ese turno ve las dos mesas
/// hijas en vez de la mesa base; en cualquier otro turno o dia, la base se
/// ve entera. "Unir" borra esta fila junto con las dos mesas hijas.
/// </summary>
public class DivisionMesaTurno
{
    public int Id { get; set; }
    public DateOnly Fecha { get; set; }
    public Turno Turno { get; set; }
    public int SalonId { get; set; }
    public Salon? Salon { get; set; }

    public int MesaBaseId { get; set; }
    public Mesa? MesaBase { get; set; }

    public int MesaHijaAId { get; set; }
    public Mesa? MesaHijaA { get; set; }

    public int MesaHijaBId { get; set; }
    public Mesa? MesaHijaB { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}