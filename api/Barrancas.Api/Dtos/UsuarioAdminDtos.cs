using Barrancas.Api.Models;

namespace Barrancas.Api.Dtos;

// Administracion de cuentas de login (ver Models/Usuario.cs), exclusiva del
// rol Admin (UsuariosController): quien puede entrar a la app y con que
// permisos (Admin o Staff).

public record UsuarioDto(int Id, string Nombre, string Username, Rol Rol, bool Activo, int Orden);

// El Admin elige la contraseña inicial directamente (a diferencia del seed,
// que usaba una temporal generica) — igual queda pidiendo cambiarla en el
// primer login de esa cuenta.
public record CrearUsuarioRequest(string Nombre, string Username, string Password, Rol Rol);

// Todos los campos opcionales: solo se actualiza lo que viene en el body.
// Password, si viene, resetea la contraseña y vuelve a pedir el cambio en el
// proximo login (igual que una cuenta recien creada).
public record ActualizarUsuarioRequest(string? Nombre, Rol? Rol, bool? Activo, string? Password);
