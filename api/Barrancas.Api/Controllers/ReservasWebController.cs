using System.Globalization;
using Barrancas.Api.Data;
using Barrancas.Api.Dtos;
using Barrancas.Api.Hubs;
using Barrancas.Api.Models;
using Barrancas.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;

namespace Barrancas.Api.Controllers;

/// <summary>
/// Panel "Reservas por el link" (/reservas-web en el frontend): todas las
/// reservas que hicieron los clientes desde el link publico, incluidas las
/// canceladas, y el boton para confirmar las que quedaron como solicitud.
/// </summary>
[ApiController]
[Authorize]
[Route("api/reservas-web")]
public class ReservasWebController : ControllerBase
{
    private readonly BarrancasDbContext _db;
    private readonly ReservaWebService _servicio;
    private readonly DiaService _diaService;
    private readonly IHubContext<ReservasHub> _hub;

    public ReservasWebController(BarrancasDbContext db, ReservaWebService servicio, DiaService diaService, IHubContext<ReservasHub> hub)
    {
        _db = db;
        _servicio = servicio;
        _diaService = diaService;
        _hub = hub;
    }

    // Las de los ultimos `dias` dias para atras (por fecha de la reserva) y
    // todas las futuras, de la mas nueva a la mas vieja.
    [HttpGet]
    public async Task<ActionResult<List<ReservaWebDto>>> Listar([FromQuery] int dias = 90) =>
        Ok(await _servicio.ListarAsync(dias));

    // Contador del boton del panel. vistoHasta: el CreadaEn de la ultima
    // reserva que se vio en /reservas-web desde ese navegador (tal cual lo
    // devolvio la API, con zona). Sin el parametro no cuenta nuevas.
    [HttpGet("resumen")]
    public async Task<ActionResult<ReservaWebResumenDto>> Resumen([FromQuery] string? vistoHasta = null)
    {
        DateTime? visto = DateTimeOffset.TryParse(vistoHasta, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal, out var d)
            ? d.UtcDateTime
            : null;
        return Ok(await _servicio.ResumenAsync(visto));
    }

    // Pasa una solicitud a confirmada (en el registro y en la fila de la
    // grilla, que deja de mostrar "a confirmar"). La mesa la sigue
    // asignando el staff en la grilla, como siempre.
    [HttpPost("{id:int}/confirmar")]
    public async Task<ActionResult<ReservaWebDto>> Confirmar(int id)
    {
        var registro = await _db.ReservasWeb.Include(w => w.Reserva).FirstOrDefaultAsync(w => w.Id == id);
        if (registro is null) return NotFound(new { error = "no encontrada" });
        if (ReservaWebService.EstadoDe(registro, ReservaOnlineService.HoyLocal()) == "cancelada")
        {
            return BadRequest(new { error = "esta reserva está cancelada" });
        }

        if (registro.Estado == EstadoReservaWeb.Pendiente)
        {
            registro.Estado = EstadoReservaWeb.Confirmada;
            registro.ConfirmadaEn = DateTime.UtcNow;
            registro.ConfirmadaPor = ReservaWebService.Usuario(User);
        }
        var fila = registro.Reserva;
        if (fila is not null && fila.Estado == EstadoReserva.PendienteBot)
        {
            fila.Estado = EstadoReserva.Confirmada;
            fila.UpdatedAt = DateTime.UtcNow;
        }
        await _db.SaveChangesAsync();

        if (fila is not null)
        {
            var data = await _diaService.GetTurnoAsync(fila.Fecha, fila.Turno, fila.SalonId);
            var grupo = ReservasHub.GrupoDe(fila.Fecha.ToString("yyyy-MM-dd"), fila.Turno.ToString().ToLowerInvariant(), fila.SalonId);
            await _hub.Clients.Group(grupo).SendAsync("TurnoActualizado", data);
        }

        return Ok(await _servicio.ObtenerAsync(id));
    }
}
