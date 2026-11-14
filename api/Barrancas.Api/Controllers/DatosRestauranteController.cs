using Barrancas.Api.Data;
using Barrancas.Api.Dtos;
using Barrancas.Api.Models;
using Barrancas.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Barrancas.Api.Controllers;

/// <summary>
/// Datos del restaurante que ve el cliente en el link de reservas (ver
/// Models/DatosRestaurante.cs): por ahora la ubicacion para "Cómo llegar".
/// Verlos puede cualquiera del equipo; cambiarlos, solo Admin. El link los
/// recibe en GET /api/publico/config (ReservaOnlineService.ConfigAsync).
/// </summary>
[ApiController]
[Authorize]
[Route("api/datos-restaurante")]
public class DatosRestauranteController : ControllerBase
{
    private const int MaxDireccion = 200;
    private const int MaxUrl = 500;
    private const int MaxTelefono = 30;
    private readonly BarrancasDbContext _db;

    public DatosRestauranteController(BarrancasDbContext db)
    {
        _db = db;
    }

    private static DatosRestauranteDto ADto(DatosRestaurante? d) =>
        new(d?.Direccion, d?.GoogleMapsUrl, d?.AppleMapsUrl, d?.WazeUrl, d?.UpdatedAt, d?.UpdatedBy, d?.Telefono, d?.Whatsapp);

    private static string? Limpio(string? texto) => string.IsNullOrWhiteSpace(texto) ? null : texto.Trim();

    // Un link valido: absoluto, http(s) y no muy largo.
    private static bool UrlValida(string? url) =>
        url is null ||
        (url.Length <= MaxUrl && Uri.TryCreate(url, UriKind.Absolute, out var u) && (u.Scheme == Uri.UriSchemeHttps || u.Scheme == Uri.UriSchemeHttp));

    [HttpGet]
    public async Task<ActionResult<DatosRestauranteDto>> Obtener() =>
        Ok(ADto(await _db.DatosRestaurante.AsNoTracking().OrderBy(d => d.Id).FirstOrDefaultAsync()));

    [HttpPut]
    [Authorize(Roles = "Admin")]
    public async Task<ActionResult<DatosRestauranteDto>> Guardar(GuardarDatosRestauranteRequest req)
    {
        var direccion = Limpio(req.Direccion);
        var google = Limpio(req.GoogleMapsUrl);
        var apple = Limpio(req.AppleMapsUrl);
        var waze = Limpio(req.WazeUrl);
        var telefono = Limpio(req.Telefono);
        // WhatsApp: solo los números (se aceptan espacios, guiones, "+").
        var whatsapp = Limpio(req.Whatsapp) is string w ? new string(w.Where(char.IsDigit).ToArray()) : null;
        if (whatsapp is { Length: 0 }) whatsapp = null;

        if (direccion is { Length: > MaxDireccion })
        {
            return BadRequest(new { error = $"La dirección puede tener hasta {MaxDireccion} caracteres." });
        }
        if (telefono is { Length: > MaxTelefono })
        {
            return BadRequest(new { error = $"El teléfono puede tener hasta {MaxTelefono} caracteres." });
        }
        if (whatsapp is { Length: < 10 or > 15 })
        {
            return BadRequest(new { error = "El WhatsApp tiene que tener el código de país y de área, ej. 5493434221234." });
        }
        foreach (var (nombre, url) in new[] { ("Google Maps", google), ("Apple Maps", apple), ("Waze", waze) })
        {
            if (!UrlValida(url))
            {
                return BadRequest(new { error = $"El link de {nombre} no es válido: tiene que empezar con https://" });
            }
        }

        var fila = await _db.DatosRestaurante.OrderBy(d => d.Id).FirstOrDefaultAsync();
        if (fila is null)
        {
            fila = new DatosRestaurante();
            _db.DatosRestaurante.Add(fila);
        }
        fila.Direccion = direccion;
        fila.GoogleMapsUrl = google;
        fila.AppleMapsUrl = apple;
        fila.WazeUrl = waze;
        fila.Telefono = telefono;
        fila.Whatsapp = whatsapp;
        fila.UpdatedAt = DateTime.UtcNow;
        fila.UpdatedBy = ReservaWebService.Usuario(User);
        await _db.SaveChangesAsync();
        return Ok(ADto(fila));
    }
}
