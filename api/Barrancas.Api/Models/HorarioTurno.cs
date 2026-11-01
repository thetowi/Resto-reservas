namespace Barrancas.Api.Models;

/// <summary>
/// Un horario de un turno en un salón, con cuántas filas trae la planilla en
/// ese horario (ej. Restaurant · Cena · 21:00 · 4 filas). Lo configura el
/// Admin desde /admin/horarios. Si un salón no tiene ninguno cargado para un
/// turno, se usan los de siempre (Data/HorariosDefault.cs, los de la planilla
/// original).
///
/// Se usa al abrir un día nuevo (DiaService.SeedTurnoSiVacioAsync arma una
/// fila vacía por cada fila de cada horario) y en el link de reservas (los
/// horarios que se ofrecen y el cupo de cada uno = sus filas). Cambiarlo NO
/// toca los días que ya tienen la planilla abierta: esas filas quedan como
/// estaban.
/// </summary>
public class HorarioTurno
{
    public int Id { get; set; }
    public int SalonId { get; set; }
    public Salon? Salon { get; set; }
    public Turno Turno { get; set; }
    // "HH:mm"
    public string Hora { get; set; } = string.Empty;
    public int Filas { get; set; }
}
