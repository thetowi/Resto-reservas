using Barrancas.Api.Data;
using Barrancas.Api.Dtos;
using Barrancas.Api.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Barrancas.Api.Controllers;

/// <summary>
/// Administracion de cuentas de login (ver Models/Usuario.cs) — exclusiva
/// del rol Admin. El seed inicial (DbSeeder) solo crea dos cuentas basicas
/// (admin/admin, staff/staff) a proposito; el Admin usa este controller para
/// crear una cuenta por persona (o las que hagan falta) sin tener que tocar
/// el seed ni la base a mano.
/// </summary>
[ApiController]
[Authorize(Roles = "Admin")]
[Route("api/usuarios")]
public class UsuariosController : ControllerBase
{
    private readonly BarrancasDbContext _db;

    public UsuariosController(BarrancasDbContext db)
    {
        _db = db;
    }

    [HttpGet]
    public async Task<ActionResult<List<UsuarioDto>>> GetLista()
    {
        return Ok(await ListaAsync());
    }

    [HttpPost]
    public async Task<ActionResult<List<UsuarioDto>>> Crear(CrearUsuarioRequest req)
    {
        var nombre = req.Nombre?.Trim();
        if (string.IsNullOrWhiteSpace(nombre))
        {
            return BadRequest(new { error = "el nombre es obligatorio" });
        }
        if (string.IsNullOrWhiteSpace(req.Username))
        {
            return BadRequest(new { error = "el usuario es obligatorio" });
        }
        if (string.IsNullOrWhiteSpace(req.Password) || req.Password.Length < 4)
        {
            return BadRequest(new { error = "la contraseña tiene que tener al menos 4 caracteres" });
        }

        var username = DbSeeder.NormalizarUsername(req.Username);
        if (await _db.Usuarios.AnyAsync(u => u.Username == username))
        {
            return BadRequest(new { error = "ya existe una cuenta con ese usuario" });
        }

        var maxOrden = await _db.Usuarios.Select(u => (int?)u.Orden).MaxAsync() ?? -1;
        _db.Usuarios.Add(new Usuario
        {
            Nombre = nombre,
            Username = username,
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(req.Password),
            DebeCambiarPassword = true,
            Rol = req.Rol,
            Orden = maxOrden + 1,
        });
        await _db.SaveChangesAsync();

        return Ok(await ListaAsync());
    }

    [HttpPatch("{id:int}")]
    public async Task<ActionResult<List<UsuarioDto>>> Actualizar(int id, ActualizarUsuarioRequest req)
    {
        var usuario = await _db.Usuarios.FirstOrDefaultAsync(u => u.Id == id);
        if (usuario is null) return NotFound(new { error = "no encontrada" });

        if (req.Nombre is not null)
        {
            var nombre = req.Nombre.Trim();
            if (string.IsNullOrWhiteSpace(nombre))
            {
                return BadRequest(new { error = "el nombre no puede quedar vacío" });
            }
            usuario.Nombre = nombre;
        }

        if (req.Rol.HasValue)
        {
            // No permitir que el unico Admin activo se saque a si mismo el
            // rol (se quedaria sin forma de volver a administrar cuentas).
            if (req.Rol.Value != Rol.Admin && usuario.Rol == Rol.Admin)
            {
                var otrosAdminsActivos = await _db.Usuarios
                    .CountAsync(u => u.Id != id && u.Rol == Rol.Admin && u.Activo);
                if (otrosAdminsActivos == 0)
                {
                    return BadRequest(new { error = "no podés sacarle el rol Admin al único admin activo" });
                }
            }
            usuario.Rol = req.Rol.Value;
        }

        if (req.Activo.HasValue)
        {
            if (!req.Activo.Value && usuario.Rol == Rol.Admin)
            {
                var otrosAdminsActivos = await _db.Usuarios
                    .CountAsync(u => u.Id != id && u.Rol == Rol.Admin && u.Activo);
                if (otrosAdminsActivos == 0)
                {
                    return BadRequest(new { error = "no podés desactivar al único admin activo" });
                }
            }
            usuario.Activo = req.Activo.Value;
        }

        if (req.Password is not null)
        {
            if (req.Password.Length < 4)
            {
                return BadRequest(new { error = "la contraseña tiene que tener al menos 4 caracteres" });
            }
            usuario.PasswordHash = BCrypt.Net.BCrypt.HashPassword(req.Password);
            usuario.DebeCambiarPassword = true;
        }

        await _db.SaveChangesAsync();

        return Ok(await ListaAsync());
    }

    private async Task<List<UsuarioDto>> ListaAsync()
    {
        return await _db.Usuarios
            .OrderBy(u => u.Orden)
            .Select(u => new UsuarioDto(u.Id, u.Nombre, u.Username, u.Rol, u.Activo, u.Orden))
            .ToListAsync();
    }
}
