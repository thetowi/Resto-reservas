namespace Barrancas.Api.Models;

/// <summary>
/// Un salón del restaurante: una sección con sus propias mesas, su propio
/// plano visual, y sus propias reservas/lista de espera/walk-ins por turno.
/// Hasta ahora "el restaurante" era un único salón implícito; esto lo separa
/// en entidades propias ("Restaurant", "Bar", "Aqua Bar", etc.) para que cada
/// una tenga la misma lógica y las mismas funciones de forma independiente —
/// el staff elige con cuál trabajar desde un selector en pantalla (mismo
/// patrón que el selector Almuerzo/Cena), y un Admin puede crear/renombrar/
/// borrar salones desde /admin/salones. Siempre tiene que existir al menos
/// uno: la app no tiene sentido sin ningún salón (ver SalonesController.Borrar).
/// </summary>
public class Salon
{
    public int Id { get; set; }
    public string Nombre { get; set; } = string.Empty;
    public int Orden { get; set; }
}
