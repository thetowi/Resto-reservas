namespace Barrancas.Api.Models;

/// <summary>
/// Claves VAPID con las que el servidor firma los avisos push. Se generan
/// solas la primera vez que hacen falta y quedan guardadas acá (una sola
/// fila), así no hay que cargar nada en Railway. Si están las variables
/// VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY, se usan esas en vez de esta fila.
/// </summary>
public class ConfigPush
{
    public int Id { get; set; }
    public string PublicKey { get; set; } = string.Empty;
    public string PrivateKey { get; set; } = string.Empty;
    public DateTime CreadaEn { get; set; }
}
