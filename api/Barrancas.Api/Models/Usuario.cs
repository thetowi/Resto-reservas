namespace Barrancas.Api.Models;

/// <summary>
/// Una cuenta de login (JWT): la credencial con la que se entra a la app
/// (usuario/contraseña) y el rol que determina que puede hacer (Admin o
/// Staff). No representa a una persona puntual del staff ni identifica quien
/// cargo/edito una reserva en particular — solo controla el acceso.
/// </summary>
public class Usuario
{
    public int Id { get; set; }
    public string Nombre { get; set; } = string.Empty;
    public string Username { get; set; } = string.Empty;
    public string PasswordHash { get; set; } = string.Empty;
    public bool DebeCambiarPassword { get; set; } = true;
    public bool Activo { get; set; } = true;
    public Rol Rol { get; set; } = Rol.Staff;
    public int Orden { get; set; }
}
