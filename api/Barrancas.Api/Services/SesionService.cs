using System.Security.Cryptography;
using System.Text;
using Barrancas.Api.Data;
using Barrancas.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace Barrancas.Api.Services;

/// <summary>
/// «Recordarme» (ver Models/SesionRecordada.cs) y la lista de «Mis
/// dispositivos». El dispositivo guarda una llave larga al azar; acá se
/// guarda solo su hash. Con la llave se pide un token nuevo (corto, 30 min)
/// cada vez que el anterior está por vencer, y cada uso corre el plazo.
/// </summary>
public class SesionService
{
    // Sin usar ese dispositivo durante estos días, la sesión se cierra sola.
    public const int DiasSinUso = 90;
    // Lo que dura el token de un dispositivo recordado (se renueva solo).
    public static readonly TimeSpan DuracionTokenRecordado = TimeSpan.FromMinutes(30);

    private readonly BarrancasDbContext _db;

    public SesionService(BarrancasDbContext db)
    {
        _db = db;
    }

    public static string Hash(string llave) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(llave)));

    public static string LimpiarDispositivo(string? texto)
    {
        var t = (texto ?? string.Empty).Trim();
        if (t.Length == 0) return "Dispositivo sin nombre";
        return t.Length > 80 ? t[..80] : t;
    }

    public async Task<(SesionRecordada Sesion, string Llave)> CrearAsync(Usuario usuario, string? dispositivo)
    {
        var llave = Convert.ToBase64String(RandomNumberGenerator.GetBytes(32))
            .TrimEnd('=').Replace('+', '-').Replace('/', '_');
        var ahora = DateTime.UtcNow;
        var sesion = new SesionRecordada
        {
            UsuarioId = usuario.Id,
            TokenHash = Hash(llave),
            Dispositivo = LimpiarDispositivo(dispositivo),
            CreadaEn = ahora,
            UltimoUsoEn = ahora,
        };
        _db.SesionesRecordadas.Add(sesion);
        await _db.SaveChangesAsync();
        return (sesion, llave);
    }

    /// <summary>La sesión de esa llave si sigue valida (y el usuario activo); si no, null.</summary>
    public async Task<SesionRecordada?> BuscarValidaAsync(string? llave)
    {
        if (string.IsNullOrWhiteSpace(llave) || llave.Length > 200) return null;
        var hash = Hash(llave.Trim());
        var limite = DateTime.UtcNow.AddDays(-DiasSinUso);
        return await _db.SesionesRecordadas
            .Include(s => s.Usuario)
            .FirstOrDefaultAsync(s => s.TokenHash == hash && s.RevocadaEn == null && s.UltimoUsoEn > limite && s.Usuario!.Activo);
    }

    public async Task MarcarUsoAsync(SesionRecordada sesion)
    {
        sesion.UltimoUsoEn = DateTime.UtcNow;
        await _db.SaveChangesAsync();
    }

    /// <summary>Cierra una sesión y borra los avisos de ese dispositivo.</summary>
    public async Task RevocarAsync(SesionRecordada sesion)
    {
        sesion.RevocadaEn ??= DateTime.UtcNow;
        var subs = await _db.SuscripcionesPush.Where(p => p.SesionRecordadaId == sesion.Id).ToListAsync();
        _db.SuscripcionesPush.RemoveRange(subs);
        await _db.SaveChangesAsync();
    }

    /// <summary>
    /// Cambio de contraseña, contraseña nueva puesta por el admin o usuario
    /// desactivado: se cierran todas sus sesiones recordadas (menos la del
    /// dispositivo desde donde se cambió, si se pasa) y se borran los avisos
    /// de los demás dispositivos.
    /// </summary>
    public async Task RevocarTodasAsync(int usuarioId, int? exceptoSesionId = null)
    {
        var ahora = DateTime.UtcNow;
        var sesiones = await _db.SesionesRecordadas
            .Where(s => s.UsuarioId == usuarioId && s.RevocadaEn == null && s.Id != exceptoSesionId)
            .ToListAsync();
        foreach (var s in sesiones) s.RevocadaEn = ahora;
        var subs = await _db.SuscripcionesPush
            .Where(p => p.UsuarioId == usuarioId && (exceptoSesionId == null || p.SesionRecordadaId != exceptoSesionId))
            .ToListAsync();
        _db.SuscripcionesPush.RemoveRange(subs);
        await _db.SaveChangesAsync();
    }

    /// <summary>
    /// «Mis dispositivos»: los recordados que siguen abiertos y, aparte, los
    /// que tienen avisos sin haber tildado «Recordarme».
    /// </summary>
    public async Task<List<Dtos.DispositivoDto>> ListaAsync(int usuarioId, int? sesionActualId)
    {
        var limite = DateTime.UtcNow.AddDays(-DiasSinUso);
        var sesiones = await _db.SesionesRecordadas
            .Where(s => s.UsuarioId == usuarioId && s.RevocadaEn == null && s.UltimoUsoEn > limite)
            .ToListAsync();
        var subs = await _db.SuscripcionesPush.Where(p => p.UsuarioId == usuarioId).ToListAsync();
        var conAvisos = subs.Where(p => p.SesionRecordadaId != null).Select(p => p.SesionRecordadaId!.Value).ToHashSet();

        var lista = sesiones.Select(s => new Dtos.DispositivoDto(
            "sesion", s.Id, s.Dispositivo, s.CreadaEn, s.UltimoUsoEn, true, conAvisos.Contains(s.Id), s.Id == sesionActualId)).ToList();
        var idsSesiones = sesiones.Select(s => s.Id).ToHashSet();
        lista.AddRange(subs
            .Where(p => p.SesionRecordadaId is null || !idsSesiones.Contains(p.SesionRecordadaId.Value))
            .Select(p => new Dtos.DispositivoDto("avisos", p.Id, p.Dispositivo, p.CreadaEn, p.ActualizadaEn, false, true, false)));
        return lista.OrderByDescending(d => d.EsEste).ThenByDescending(d => d.UltimoUso).ToList();
    }

    /// <summary>Cierra un dispositivo de la lista (sesión o solo avisos). false si no es de ese usuario.</summary>
    public async Task<bool> QuitarAsync(int usuarioId, string tipo, int id)
    {
        if (tipo == "sesion")
        {
            var sesion = await _db.SesionesRecordadas.FirstOrDefaultAsync(s => s.Id == id && s.UsuarioId == usuarioId);
            if (sesion is null) return false;
            await RevocarAsync(sesion);
            return true;
        }
        if (tipo == "avisos")
        {
            var sub = await _db.SuscripcionesPush.FirstOrDefaultAsync(p => p.Id == id && p.UsuarioId == usuarioId);
            if (sub is null) return false;
            _db.SuscripcionesPush.Remove(sub);
            await _db.SaveChangesAsync();
            return true;
        }
        return false;
    }
}
