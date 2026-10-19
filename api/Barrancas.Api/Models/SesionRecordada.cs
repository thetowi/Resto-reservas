namespace Barrancas.Api.Models;

/// <summary>
/// Un dispositivo donde alguien entró con «Recordarme» tildado. Guarda el
/// hash (SHA-256) de la llave larga que tiene ese dispositivo, nunca la llave
/// en sí. Con esa llave el dispositivo pide un token nuevo cuando el suyo
/// vence (POST /api/auth/renovar), así la sesión no se cierra sola mientras
/// se use al menos una vez cada <see cref="Services.SesionService.DiasSinUso"/>
/// días. Se cierra con «Salir», al cambiar la contraseña, si se desactiva el
/// usuario o desde «Mis dispositivos».
/// </summary>
public class SesionRecordada
{
    public int Id { get; set; }
    public int UsuarioId { get; set; }
    public Usuario? Usuario { get; set; }
    public string TokenHash { get; set; } = string.Empty;
    // Lo arma el navegador al entrar («Chrome en Windows», «iPhone (app)»).
    public string Dispositivo { get; set; } = string.Empty;
    public DateTime CreadaEn { get; set; }
    public DateTime UltimoUsoEn { get; set; }
    public DateTime? RevocadaEn { get; set; }
}
