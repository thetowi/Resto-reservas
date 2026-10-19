namespace Barrancas.Api.Models;

/// <summary>
/// Datos del restaurante que ve el cliente en el link de reservas (una sola
/// fila): la direccion y los links de mapas para "Cómo llegar". Los carga el
/// Admin desde /admin/restaurante (ver DatosRestauranteController). Cada
/// restaurante tiene su base, asi que cada uno tiene sus propios datos. Si
/// un campo esta vacio, el frontend usa la variable de entorno equivalente
/// (NEXT_PUBLIC_CLIENTE_DIRECCION, etc.) como respaldo.
/// </summary>
public class DatosRestaurante
{
    public int Id { get; set; }

    // Direccion completa ("Av. Costanera 1234, San Isidro, Buenos Aires").
    // Con esto alcanza: los links de cada app se arman solos.
    public string? Direccion { get; set; }

    // Links opcionales de la ficha en cada app ("Compartir" → copiar).
    // Si estan, se usan en lugar del que se arma con la direccion.
    public string? GoogleMapsUrl { get; set; }
    public string? AppleMapsUrl { get; set; }
    public string? WazeUrl { get; set; }

    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    // Usuario del panel que guardo el ultimo cambio.
    public string? UpdatedBy { get; set; }
}
