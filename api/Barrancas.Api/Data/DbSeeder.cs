using Barrancas.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace Barrancas.Api.Data;

public static class DbSeeder
{
    // Capacidad por defecto para el seed inicial: no teniamos ese dato en la
    // planilla original, asi que arrancamos con un valor razonable y cada
    // mesa se puede ajustar despues desde el panel de administracion de
    // mesas (/admin/mesas). Las divisiones ("b") arrancan con una capacidad
    // menor porque son la mitad de una mesa mas grande.
    private const int CapacidadBaseDefault = 4;
    private const int CapacidadDivisionDefault = 2;

    private static readonly (string Codigo, string? CodigoDivision)[] MesasSeed =
    {
        ("11", "11b"), ("12", "12b"), ("13", "13b"), ("14", null),
        ("21", null), ("22", null), ("23", null), ("24", null),
        ("31", "31b"), ("32", "32b"), ("33", "33b"),
        ("40", "40b"), ("41", "41b"), ("42", "42b"), ("43", null), ("44", null),
        ("45", "45b"), ("46", null), ("47", null),
        ("50", "50b"), ("51", "51b"), ("52", "52b"), ("53", null), ("54", null), ("55", null),
        ("60", "60b"),
    };

    // Cuentas de login iniciales: basico a proposito (dos cuentas genericas,
    // una por rol) para arrancar a probar los permisos — el Admin puede
    // crear cuentas nuevas desde /admin/usuarios en cuanto haga falta mas de
    // una persona por rol, sin tener que tocar este seed.
    private static readonly (string Username, string Nombre, string Password, Rol Rol)[] UsuariosSeed =
    {
        ("admin", "Admin", "admin", Rol.Admin),
        ("staff", "Staff", "staff", Rol.Staff),
    };

    public static async Task SeedAsync(BarrancasDbContext db)
    {
        // En Postgres (produccion/desarrollo real) aplicamos migraciones.
        // En proveedores no relacionales (InMemory, usado en los tests)
        // no existe el concepto de migracion: alcanza con crear el esquema.
        if (db.Database.IsRelational())
        {
            await db.Database.MigrateAsync();
        }
        else
        {
            await db.Database.EnsureCreatedAsync();
        }

        // El salon tiene que existir ANTES que las mesas (son su FK): se
        // siembra primero un unico salon default para que una instalacion
        // nueva arranque funcionando sin que el usuario tenga que crear
        // nada a mano — despues puede agregar "Bar", "Aqua Bar", etc. desde
        // /admin/salones.
        if (!await db.Salones.AnyAsync())
        {
            db.Salones.Add(new Salon { Nombre = "Restaurant", Orden = 0 });
            await db.SaveChangesAsync();
        }
        var salonPrincipal = await db.Salones.OrderBy(s => s.Orden).FirstAsync();

        if (!await db.Mesas.AnyAsync())
        {
            // Dos pasadas: primero las mesas base (para que EF les asigne Id
            // reales), despues las divisiones apuntando a esos Id como padre.
            var basesPorCodigo = new Dictionary<string, Mesa>();
            var orden = 0;
            foreach (var (codigo, codigoDivision) in MesasSeed)
            {
                // Si esta mesa ya arranca dividida, la capacidad de la
                // division sale de la base (mismos asientos, repartidos) —
                // no son pax nuevos, asi que hay que restarla aca tambien
                // para no duplicar capacidad en el total del salon.
                var capacidadBase = codigoDivision is null
                    ? CapacidadBaseDefault
                    : CapacidadBaseDefault - CapacidadDivisionDefault;
                var mesa = new Mesa
                {
                    Codigo = codigo,
                    Capacidad = capacidadBase,
                    Orden = orden++,
                    SalonId = salonPrincipal.Id,
                };
                basesPorCodigo[codigo] = mesa;
                await db.Mesas.AddAsync(mesa);
            }
            await db.SaveChangesAsync();

            foreach (var (codigo, codigoDivision) in MesasSeed)
            {
                if (codigoDivision is null) continue;
                await db.Mesas.AddAsync(new Mesa
                {
                    Codigo = codigoDivision,
                    Capacidad = CapacidadDivisionDefault,
                    Orden = orden++,
                    SalonId = salonPrincipal.Id,
                    MesaPadreId = basesPorCodigo[codigo].Id,
                });
            }
        }

        if (!await db.Usuarios.AnyAsync())
        {
            var usuarios = UsuariosSeed.Select((u, i) => new Usuario
            {
                Nombre = u.Nombre,
                Username = u.Username,
                PasswordHash = BCrypt.Net.BCrypt.HashPassword(u.Password),
                DebeCambiarPassword = true,
                Rol = u.Rol,
                Orden = i,
            });
            await db.Usuarios.AddRangeAsync(usuarios);
        }

        await db.SaveChangesAsync();
    }

    // Reutilizado por UsuariosController al crear una cuenta nueva, para
    // mantener la misma normalizacion (minusculas, espacios -> puntos) que
    // usaba este seed.
    public static string NormalizarUsername(string nombre) =>
        nombre.Trim().ToLowerInvariant().Replace(" ", ".");
}
