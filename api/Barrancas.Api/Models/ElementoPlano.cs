namespace Barrancas.Api.Models;

/// <summary>
/// Elemento puramente decorativo/de referencia dentro del plano visual del
/// salon (pestaña "Plano" de /admin/mesas): un cartel de texto libre para
/// marcar cosas que no son mesas pero ayudan a ubicarse — "Cocina",
/// "Ventana", "Bodega", "Isla", "Mueble", etc. Se arrastra y se redimensiona
/// igual que una mesa, pero no participa de reservas ni ocupacion.
/// </summary>
public class ElementoPlano
{
    public int Id { get; set; }

    // A que salon pertenece este cartel (ver Models/Salon.cs) — igual que
    // las mesas, cada salon tiene su propio plano con sus propios carteles.
    public int SalonId { get; set; }
    public Salon? Salon { get; set; }

    public string Etiqueta { get; set; } = "Nuevo";
    public double PosX { get; set; }
    public double PosY { get; set; }
    public double Ancho { get; set; } = 90;
    public double Alto { get; set; } = 60;
}
