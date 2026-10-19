using System.Globalization;
using Barrancas.Api.Data;
using Barrancas.Api.Dtos;
using Barrancas.Api.Models;
using Barrancas.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.ModelBinding;
using Microsoft.EntityFrameworkCore;

namespace Barrancas.Api.Controllers;

/// <summary>
/// Panel "Reservas por el link" (/reservas-web en el frontend): todas las
/// reservas que hicieron los clientes desde el link publico, incluidas las
/// canceladas, y las solicitudes (grupos de 6 o mas, salones que no confirman
/// solos), que se aprueban o rechazan aca antes de entrar a la grilla.
/// </summary>
[ApiController]
[Authorize]
[Route("api/reservas-web")]
public class ReservasWebController : ControllerBase
{
    private readonly BarrancasDbContext _db;
    private readonly ReservaWebService _servicio;
    private readonly DiaService _diaService;
    private readonly ReservaOnlineService _online;

    public ReservasWebController(BarrancasDbContext db, ReservaWebService servicio, DiaService diaService, ReservaOnlineService online)
    {
        _db = db;
        _servicio = servicio;
        _diaService = diaService;
        _online = online;
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

    // Solicitudes sin aprobar de un dia, para la franja del panel.
    [HttpGet("solicitudes")]
    public async Task<ActionResult<List<ReservaWebDto>>> Solicitudes([FromQuery] DateOnly fecha) =>
        Ok(await _servicio.SolicitudesDelDiaAsync(fecha));

    // Chequeo de lugar de una solicitud, en el momento (tarjeta y ventana de
    // Aprobar en Reservas web).
    [HttpGet("{id:int}/chequeo")]
    public async Task<ActionResult<ChequeoSolicitudDto>> Chequeo(int id)
    {
        var registro = await _db.ReservasWeb.AsNoTracking().FirstOrDefaultAsync(w => w.Id == id);
        if (registro is null) return NotFound(new { error = "no encontrada" });
        return Ok(await _online.ChequearAsync(registro));
    }

    // Aprueba una solicitud. Las del link ya no tienen fila mientras esperan:
    // recien aca entran a la grilla, confirmadas y con las mesas elegidas
    // (opcional; si no, se asignan despues en la grilla, como siempre). Las
    // viejas (de antes de este cambio) que ya tenian fila "a confirmar", se
    // confirman ahi mismo.
    [HttpPost("{id:int}/confirmar")]
    public async Task<ActionResult<ReservaWebDto>> Confirmar(
        int id, [FromBody(EmptyBodyBehavior = EmptyBodyBehavior.Allow)] AprobarSolicitudRequest? req)
    {
        var registro = await _db.ReservasWeb.Include(w => w.Reserva).FirstOrDefaultAsync(w => w.Id == id);
        if (registro is null) return NotFound(new { error = "no encontrada" });
        var hoy = ReservaOnlineService.HoyLocal();
        var estado = ReservaWebService.EstadoDe(registro, hoy);
        if (estado is "cancelada" or "rechazada")
        {
            return BadRequest(new { error = $"esta reserva está {estado}" });
        }
        if (estado == "vencida")
        {
            return BadRequest(new { error = "esta solicitud ya pasó de fecha" });
        }

        var mesaIds = req?.MesaIds?.Distinct().ToList() ?? [];
        if (mesaIds.Count > 0)
        {
            var data = await _diaService.GetTurnoAsync(registro.Fecha, registro.Turno, registro.SalonId, sembrar: false);
            var delSalon = data.Mesas.Select(m => m.Id).ToHashSet();
            if (mesaIds.Any(m => !delSalon.Contains(m)))
            {
                return BadRequest(new { error = "alguna de esas mesas no es de este salón" });
            }
            var ocupadas = data.Reservas.Where(r => r.Id != registro.ReservaId).SelectMany(r => r.MesaIds).Concat(data.MesasWalkIn).ToHashSet();
            var choque = data.Mesas.FirstOrDefault(m => mesaIds.Contains(m.Id) && ocupadas.Contains(m.Id));
            if (choque is not null)
            {
                return Conflict(new { error = $"la mesa {choque.Codigo} ya tiene una reserva en este turno" });
            }
        }

        var usuario = ReservaWebService.Usuario(User);
        if (registro.Estado == EstadoReservaWeb.Pendiente)
        {
            registro.Estado = EstadoReservaWeb.Confirmada;
            registro.ConfirmadaEn = DateTime.UtcNow;
            registro.ConfirmadaPor = usuario;
        }

        var fila = registro.Reserva;
        if (fila is null)
        {
            // Solicitud: entra a la grilla ahora.
            fila = await _online.ColocarEnGrillaAsync(registro, mesaIds, EstadoReserva.Confirmada);
            registro.ReservaId = fila.Id;
        }
        else
        {
            if (fila.Estado == EstadoReserva.PendienteBot)
            {
                fila.Estado = EstadoReserva.Confirmada;
                fila.UpdatedAt = DateTime.UtcNow;
            }
            if (mesaIds.Count > 0)
            {
                var actuales = await _db.ReservaMesas.Where(rm => rm.ReservaId == fila.Id).ToListAsync();
                _db.ReservaMesas.RemoveRange(actuales);
                foreach (var mesaId in mesaIds)
                {
                    _db.ReservaMesas.Add(new ReservaMesa { ReservaId = fila.Id, MesaId = mesaId });
                }
            }
        }
        await _db.SaveChangesAsync();

        await _online.AvisarTurnoAsync(fila.Fecha, fila.Turno, fila.SalonId);
        return Ok(await _servicio.ObtenerAsync(id));
    }

    // Rechaza una solicitud (no habia lugar, se le ofrecio otro horario...).
    // No ocupa nada en la grilla; si era una de las viejas con fila "a
    // confirmar", esa fila queda vacia.
    [HttpPost("{id:int}/rechazar")]
    public async Task<ActionResult<ReservaWebDto>> Rechazar(
        int id, [FromBody(EmptyBodyBehavior = EmptyBodyBehavior.Allow)] RechazarSolicitudRequest? req)
    {
        var registro = await _db.ReservasWeb.Include(w => w.Reserva).FirstOrDefaultAsync(w => w.Id == id);
        if (registro is null) return NotFound(new { error = "no encontrada" });
        if (ReservaWebService.EstadoDe(registro, ReservaOnlineService.HoyLocal()) != "pendiente")
        {
            return BadRequest(new { error = "solo se pueden rechazar las solicitudes sin aprobar" });
        }

        var motivo = req?.Motivo?.Trim();
        registro.Estado = EstadoReservaWeb.Rechazada;
        registro.RechazadaEn = DateTime.UtcNow;
        registro.RechazadaPor = ReservaWebService.Usuario(User);
        registro.MotivoRechazo = string.IsNullOrEmpty(motivo) ? null : motivo.Length > 300 ? motivo[..300] : motivo;

        var fila = registro.Reserva;
        if (fila is not null)
        {
            await _servicio.VaciarFilaAsync(fila);
            registro.ReservaId = null;
        }
        await _db.SaveChangesAsync();

        await _online.AvisarTurnoAsync(registro.Fecha, registro.Turno, registro.SalonId);
        return Ok(await _servicio.ObtenerAsync(id));
    }
}
