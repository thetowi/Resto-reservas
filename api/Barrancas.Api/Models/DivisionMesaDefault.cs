namespace Barrancas.Api.Models;

/// <summary>
/// Layout visual "default" guardado a mano para las dos mitades de una
/// division temporal de una mesa (ver DividirPorTurno / DivisionMesaTurno):
/// posicion, forma, fijada y rotacion de cada mitad tal como quedaron
/// acomodadas la ultima vez que alguien toco "Guardar como default" en el
/// plano. Sin esto, cada DividirPorTurno nueva (en otro turno u otro dia)
/// hacia nacer las mitades desde cero — heredando forma/rotacion de la
/// base, sin fijar, pegadas una al lado de la otra — sin memoria de como
/// habian quedado acomodadas la vez anterior.
///
/// A PROPOSITO no guarda el reparto de pax entre las mitades (PaxA/PaxB):
/// eso puede variar turno a turno (una noche 2 y 2, otra 3 y 1) y se sigue
/// cargando a mano en cada DividirPorTurno — este default es solo la parte
/// visual. Tampoco se actualiza solo: se guarda (o pisa) unicamente cuando
/// alguien aprieta el boton "Guardar como default", nunca automaticamente al
/// mover/fijar/rotar una mitad, para no pisar sin querer un layout ya
/// guardado con un ajuste de un solo turno que no se queria dejar fijo.
///
/// Una sola fila por mesa base (indice unico en MesaBaseId): volver a
/// guardar sobre la misma base actualiza esta misma fila. Cascade (no
/// Restrict): es una anotacion liviana sobre la mesa base — si la mesa se
/// borra, este default no tiene sentido y desaparece con ella, sin
/// bloquear el borrado (mismo criterio que RenombreMesaTurno/WalkIn).
/// </summary>
public class DivisionMesaDefault
{
    public int Id { get; set; }

    public int MesaBaseId { get; set; }
    public Mesa? MesaBase { get; set; }

    public double? PosXA { get; set; }
    public double? PosYA { get; set; }
    public FormaMesa FormaA { get; set; } = FormaMesa.Cuadrada;
    public bool FijadaA { get; set; } = false;
    public int RotacionA { get; set; } = 0;

    public double? PosXB { get; set; }
    public double? PosYB { get; set; }
    public FormaMesa FormaB { get; set; } = FormaMesa.Cuadrada;
    public bool FijadaB { get; set; } = false;
    public int RotacionB { get; set; } = 0;

    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
