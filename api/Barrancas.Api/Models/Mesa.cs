namespace Barrancas.Api.Models;

/// <summary>
/// Una mesa del salon, o una division de otra mesa. Codigo es el numero que
/// usaba la planilla original (11, 12, ..., 60); Capacidad es la cantidad de
/// pax que entran en esa mesa.
///
/// Division: algunas mesas se pueden separar en dos mesas mas chicas e
/// independientes para reservas (por ejemplo la mesa "50" se divide en "50" y
/// "50b"). Eso se modela con MesaPadreId: una fila con MesaPadreId != null es
/// una division de otra mesa, y aparece igual que cualquier otra mesa en los
/// desplegables de reserva (tiene su propio Id, Codigo y Capacidad). Una
/// mesa que ya tiene divisiones no se puede volver a dividir (un solo nivel).
/// </summary>
public class Mesa
{
    public int Id { get; set; }
    public string Codigo { get; set; } = string.Empty;
    public int Capacidad { get; set; } = 2;
    public int Orden { get; set; }

    // A que salon pertenece esta mesa (Restaurant, Bar, Aqua Bar, etc — ver
    // Models/Salon.cs). El codigo solo tiene que ser unico DENTRO de un
    // salon, no en todo el restaurante: cada salon es su propio plano
    // independiente, asi que "11" puede existir tanto en Restaurant como en
    // Bar sin pisarse (ver el indice unico (SalonId, Codigo) en
    // BarrancasDbContext).
    public int SalonId { get; set; }
    public Salon? Salon { get; set; }

    public int? MesaPadreId { get; set; }
    public Mesa? MesaPadre { get; set; }
    public List<Mesa> Divisiones { get; set; } = new();

    // Posicion en el plano visual del salon (panel /admin/mesas, vista
    // "Plano"). Null = todavia no se acomodo a mano: el frontend la ubica
    // en una grilla automatica hasta que alguien la arrastra por primera vez.
    public double? PosX { get; set; }
    public double? PosY { get; set; }

    public List<ReservaMesa> ReservaMesas { get; set; } = new();
}
