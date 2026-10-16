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

[ApiController]
[Authorize]
[Route("api/reservas")]
public class ReservasController : ControllerBase
{
    private readonly BarrancasDbContext _db;
    private readonly IHubContext<ReservasHub> _hub;
    private readonly DiaService _diaService;
    private readonly ReservaWebService _reservasWeb;

    public ReservasController(BarrancasDbContext db, IHubContext<ReservasHub> hub, DiaService diaService, ReservaWebService reservasWeb)
    {
        _db = db;
        _hub = hub;
        _diaService = diaService;
        _reservasWeb = reservasWeb;
    }

    [HttpPost]
    public async Task<ActionResult<TurnoDataDto>> Crear(CrearReservaRequest req)
    {
        if (!await _db.Salones.AnyAsync(s => s.Id == req.SalonId))
        {
            return BadRequest(new { error = "el salón indicado no existe" });
        }
        if (await _db.CierresTurno.AnyAsync(c => c.Fecha == req.Fecha && c.Turno == req.Turno && c.SalonId == req.SalonId))
        {
            return BadRequest(new { error = "este turno está cerrado: no se pueden cargar reservas nuevas" });
        }

        var maxOrden = await _db.Reservas
            .Where(r => r.Fecha == req.Fecha && r.Turno == req.Turno && r.SalonId == req.SalonId)
            .Select(r => (int?)r.Orden)
            .MaxAsync() ?? -1;

        var reserva = new Reserva
        {
            Fecha = req.Fecha,
            Turno = req.Turno,
            SalonId = req.SalonId,
            Orden = maxOrden + 1,
            Hora = req.Hora,
            Asistio = false,
        };

        _db.Reservas.Add(reserva);
        await _db.SaveChangesAsync();

        var data = await BroadcastTurnoAsync(req.Fecha, req.Turno, req.SalonId);
        return CreatedAtAction(nameof(Crear), new { id = reserva.Id }, data);
    }

    [HttpPatch("{id:int}")]
    public async Task<ActionResult<TurnoDataDto>> Actualizar(int id, ActualizarReservaRequest req)
    {
        var reserva = await _db.Reservas.FirstOrDefaultAsync(r => r.Id == id);
        if (reserva is null) return NotFound(new { error = "no encontrada" });

        var cerrado = await _db.CierresTurno.AnyAsync(c =>
            c.Fecha == reserva.Fecha && c.Turno == reserva.Turno && c.SalonId == reserva.SalonId);
        if (cerrado)
        {
            return BadRequest(new { error = "este turno está cerrado: no se pueden editar sus reservas" });
        }

        if (req.Hora is not null) reserva.Hora = req.Hora;
        if (req.Nombre is not null) reserva.Nombre = req.Nombre;
        if (req.HabTel is not null) reserva.HabTel = req.HabTel;
        if (req.Comentarios is not null) reserva.Comentarios = req.Comentarios;
        if (req.Asistio.HasValue) reserva.Asistio = req.Asistio.Value;

        if (req.Pax.IsSet) reserva.Pax = req.Pax.Value;

        if (req.MesaIds is not null)
        {
            // Con "Pidio mesa" tildado el conjunto de mesas queda bloqueado:
            // hay que destildarlo para poder reasignarlas. Mismo criterio
            // que antes con una sola mesa: se mira el valor YA guardado
            // (reserva.PidioMesa, de antes de este PATCH), no el que
            // quedaria despues, para poder elegir mesa(s) Y tildar "Pidio
            // mesa" en el mismo request. Se valida aca ademas de en el
            // frontend para que no se pueda saltear con un PATCH directo.
            var siguesBloqueada = reserva.PidioMesa && req.PidioMesa != false;
            if (siguesBloqueada)
            {
                return BadRequest(new { error = "esta reserva tiene mesa pedida: destildá \"Pidió mesa\" para poder cambiarla" });
            }

            var idsUnicos = req.MesaIds.Distinct().ToList();
            if (idsUnicos.Count > 0)
            {
                var cantidadExistente = await _db.Mesas.CountAsync(m => idsUnicos.Contains(m.Id));
                if (cantidadExistente != idsUnicos.Count)
                {
                    return BadRequest(new { error = "alguna de las mesas indicadas no existe" });
                }
            }

            // Reemplaza el conjunto completo: se borran las ReservaMesa que
            // ya tenia y se cargan de nuevo desde cero, mas simple y menos
            // propenso a errores que calcular la diferencia contra lo que
            // ya tenia.
            var actuales = await _db.ReservaMesas.Where(rm => rm.ReservaId == reserva.Id).ToListAsync();
            _db.ReservaMesas.RemoveRange(actuales);
            _db.ReservaMesas.AddRange(idsUnicos.Select(mesaId => new ReservaMesa { ReservaId = reserva.Id, MesaId = mesaId }));
        }

        if (req.PidioMesa.HasValue) reserva.PidioMesa = req.PidioMesa.Value;
        // Independiente de Asistio a proposito (ver Models/Reserva.cs): no
        // se auto-tilda ni se auto-destilda entre si. Se puede volver a
        // destildar sin restricciones si fue un error — si en el medio esa
        // mesa ya la tomó otro walk-in u otra reserva, quedan las dos
        // marcándola (caso raro, se resuelve a mano reasignando mesa).
        if (req.Retirada.HasValue) reserva.Retirada = req.Retirada.Value;

        reserva.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();

        var data = await BroadcastTurnoAsync(reserva.Fecha, reserva.Turno, reserva.SalonId);
        return Ok(data);
    }

    [HttpDelete("{id:int}")]
    public async Task<ActionResult<TurnoDataDto>> Borrar(int id)
    {
        var reserva = await _db.Reservas.FirstOrDefaultAsync(r => r.Id == id);
        if (reserva is null) return NotFound(new { error = "no encontrada" });

        // Si era una reserva del link, su registro queda como cancelada
        // (no se borra con la fila).
        await _reservasWeb.CancelarDeFilaAsync(reserva.Id, ReservaWebService.Usuario(User));
        _db.Reservas.Remove(reserva);
        await _db.SaveChangesAsync();

        var data = await BroadcastTurnoAsync(reserva.Fecha, reserva.Turno, reserva.SalonId);
        return Ok(data);
    }

    // Tachito: borra la reserva pero deja la fila (con su horario de la
    // planilla) para cargar otra. Vacia todos los datos, libera sus mesas y
    // la fila vuelve a ser una fila comun del staff. Si venia del link, su
    // registro queda como cancelada (ver ReservaWebService).
    [HttpPost("{id:int}/vaciar")]
    public async Task<ActionResult<VaciarReservaResultado>> Vaciar(int id)
    {
        var reserva = await _db.Reservas.FirstOrDefaultAsync(r => r.Id == id);
        if (reserva is null) return NotFound(new { error = "no encontrada" });
        if (await TurnoCerradoAsync(reserva))
        {
            return BadRequest(new { error = "este turno está cerrado: no se pueden editar sus reservas" });
        }

        var registro = await _reservasWeb.CancelarDeFilaAsync(reserva.Id, ReservaWebService.Usuario(User));

        reserva.Pax = null;
        reserva.Nombre = null;
        reserva.HabTel = null;
        reserva.Comentarios = null;
        reserva.Asistio = false;
        reserva.PidioMesa = false;
        reserva.Retirada = false;
        reserva.Origen = OrigenReserva.Staff;
        reserva.Estado = EstadoReserva.Confirmada;
        reserva.UpdatedAt = DateTime.UtcNow;
        var mesas = await _db.ReservaMesas.Where(rm => rm.ReservaId == reserva.Id).ToListAsync();
        _db.ReservaMesas.RemoveRange(mesas);
        await _db.SaveChangesAsync();

        await BroadcastTurnoAsync(reserva.Fecha, reserva.Turno, reserva.SalonId);
        return Ok(new VaciarReservaResultado(registro?.Id));
    }

    // "Deshacer" del tachito. Solo si la fila sigue vacia (si alguien ya
    // cargo otra reserva en ese lugar, no la pisa).
    [HttpPost("{id:int}/restaurar")]
    public async Task<ActionResult<TurnoDataDto>> Restaurar(int id, RestaurarReservaRequest req)
    {
        var reserva = await _db.Reservas.FirstOrDefaultAsync(r => r.Id == id);
        if (reserva is null) return NotFound(new { error = "no encontrada" });
        if (await TurnoCerradoAsync(reserva))
        {
            return BadRequest(new { error = "este turno está cerrado: no se pueden editar sus reservas" });
        }
        var ocupada = !string.IsNullOrWhiteSpace(reserva.Nombre) || reserva.Pax is not null
            || await _db.ReservaMesas.AnyAsync(rm => rm.ReservaId == reserva.Id);
        if (ocupada)
        {
            return Conflict(new { error = "esa fila ya se volvió a usar: no se puede deshacer" });
        }

        var idsMesas = (req.MesaIds ?? new List<int>()).Distinct().ToList();
        if (idsMesas.Count > 0 && await _db.Mesas.CountAsync(m => idsMesas.Contains(m.Id)) != idsMesas.Count)
        {
            return BadRequest(new { error = "alguna de las mesas indicadas no existe" });
        }

        if (req.Hora is not null) reserva.Hora = req.Hora;
        reserva.Pax = req.Pax;
        reserva.Nombre = req.Nombre;
        reserva.HabTel = req.HabTel;
        reserva.Comentarios = req.Comentarios;
        reserva.Asistio = req.Asistio;
        reserva.PidioMesa = req.PidioMesa;
        reserva.Retirada = req.Retirada;
        reserva.Origen = req.Origen;
        reserva.Estado = req.Estado;
        reserva.UpdatedAt = DateTime.UtcNow;
        _db.ReservaMesas.AddRange(idsMesas.Select(mesaId => new ReservaMesa { ReservaId = reserva.Id, MesaId = mesaId }));

        if (req.ReservaWebId is int webId)
        {
            var registro = await _db.ReservasWeb.FirstOrDefaultAsync(w => w.Id == webId);
            if (registro is not null && registro.Estado == EstadoReservaWeb.Cancelada && registro.ReservaId is null)
            {
                registro.ReservaId = reserva.Id;
                registro.Estado = req.Estado == EstadoReserva.PendienteBot ? EstadoReservaWeb.Pendiente : EstadoReservaWeb.Confirmada;
                registro.CanceladaEn = null;
                registro.CanceladaPor = null;
            }
        }

        await _db.SaveChangesAsync();
        var data = await BroadcastTurnoAsync(reserva.Fecha, reserva.Turno, reserva.SalonId);
        return Ok(data);
    }

    private Task<bool> TurnoCerradoAsync(Reserva reserva) =>
        _db.CierresTurno.AnyAsync(c => c.Fecha == reserva.Fecha && c.Turno == reserva.Turno && c.SalonId == reserva.SalonId);

    private async Task<TurnoDataDto> BroadcastTurnoAsync(DateOnly fecha, Turno turno, int salonId)
    {
        var data = await _diaService.GetTurnoAsync(fecha, turno, salonId);
        var grupo = ReservasHub.GrupoDe(fecha.ToString("yyyy-MM-dd"), turno.ToString().ToLowerInvariant(), salonId);
        await _hub.Clients.Group(grupo).SendAsync("TurnoActualizado", data);
        return data;
    }
}