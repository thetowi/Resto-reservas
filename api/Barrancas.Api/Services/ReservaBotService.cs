using Barrancas.Api.Data;
using Barrancas.Api.Hubs;
using Barrancas.Api.Models;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;

namespace Barrancas.Api.Services;

public record DisponibilidadResultado(bool Disponible, string? Motivo, List<string> HorariosSugeridos);

// Estado: "confirmada" | "pendiente" | "rechazada" (ver EstadoReserva — no
// se reutiliza el enum tal cual porque "rechazada" no crea ninguna fila, no
// es un estado de una Reserva real).
public record ReservaBotResultado(string Estado, int? ReservaId, string? MesaCodigo, string? HoraAsignada, string? Motivo);

/// <summary>
/// Las dos acciones que el chatbot de WhatsApp puede pedir (ver
/// ClaudeAgentService, que las expone como tools de la Messages API):
/// consultar si hay lugar, y efectivamente crear la reserva. Reutiliza
/// DiaService para todo lo que ya sabe calcular (mesas ocupadas, cierres,
/// etc.) en vez de duplicar esa logica — el bot tiene que ver EXACTAMENTE
/// lo mismo que ve el staff en pantalla para el mismo turno.
///
/// Reglas de negocio (ver claude/whatsapp-bot-reservas.md en el proyecto):
/// el bot solo opera sobre el salon "Restaurant" (fijo); solo reserva
/// Almuerzo o Cena (nunca Merienda, que de todas formas ese salon no
/// ofrece); auto-confirma solo si hay menos de 6 pax Y una mesa libre con
/// capacidad suficiente — si falta cualquiera de las dos, la reserva se
/// crea igual pero como PendienteBot, para que el staff la termine de
/// resolver a mano en vez de perder el pedido.
/// </summary>
public class ReservaBotService
{
    private const string NombreSalonBot = "Restaurant";
    private const int LimitePaxAutoConfirma = 6; // auto-confirma con MENOS de 6 (1 a 5)

    private readonly BarrancasDbContext _db;
    private readonly DiaService _diaService;
    private readonly IHubContext<ReservasHub> _hub;

    public ReservaBotService(BarrancasDbContext db, DiaService diaService, IHubContext<ReservasHub> hub)
    {
        _db = db;
        _diaService = diaService;
        _hub = hub;
    }

    private Task<Salon?> ObtenerSalonBotAsync() =>
        _db.Salones.FirstOrDefaultAsync(s => s.Nombre == NombreSalonBot);

    private static bool TryParseTurno(string texto, out Turno turno)
    {
        switch (texto.Trim().ToLowerInvariant())
        {
            case "almuerzo": turno = Turno.Almuerzo; return true;
            case "cena": turno = Turno.Cena; return true;
            default: turno = default; return false;
        }
    }

    public async Task<DisponibilidadResultado> ConsultarDisponibilidadAsync(string fechaTexto, string turnoTexto, int pax)
    {
        if (!DateOnly.TryParse(fechaTexto, out var fecha))
        {
            return new(false, "Esa fecha no es válida.", new());
        }
        if (!TryParseTurno(turnoTexto, out var turno))
        {
            return new(false, "Ese turno no existe: el restaurante solo toma reservas por este medio para Almuerzo o Cena.", new());
        }

        var salon = await ObtenerSalonBotAsync();
        if (salon is null)
        {
            return new(false, "El restaurante todavía no configuró el salón del bot.", new());
        }

        if (await _db.FechasBloqueadasBot.AnyAsync(f => f.Fecha == fecha))
        {
            return new(false, "Esa fecha no está disponible para reservar por este medio — comunicate directamente con el restaurante.", new());
        }
        if (await _db.CierresTurno.AnyAsync(c => c.Fecha == fecha && c.Turno == turno && c.SalonId == salon.Id))
        {
            return new(false, "Ese turno está cerrado ese día.", new());
        }

        var data = await _diaService.GetTurnoAsync(fecha, turno, salon.Id);
        var ocupadas = data.MesasOcupadas.Concat(data.MesasWalkIn).ToHashSet();
        var hayMesa = data.Mesas.Any(m => !m.Reducida && m.Capacidad >= pax && !ocupadas.Contains(m.Id));

        if (!hayMesa)
        {
            return new(false, "No queda ninguna mesa libre con esa capacidad para ese turno.", new());
        }

        // Unos horarios de referencia para que el bot pueda ofrecerlos (no
        // es una restriccion real: CrearReservaAsync puede abrir una fila
        // nueva en cualquier horario si hace falta).
        var horariosSugeridos = data.Reservas
            .Where(r => r.Pax is null && string.IsNullOrEmpty(r.Nombre) && r.Hora is not null)
            .Select(r => r.Hora!)
            .Distinct()
            .OrderBy(h => h, StringComparer.Ordinal)
            .Take(4)
            .ToList();

        return new(true, null, horariosSugeridos);
    }

    public async Task<ReservaBotResultado> CrearReservaAsync(
        string fechaTexto, string turnoTexto, int pax, string horaPedida, string nombre, string telefono, string? comentarios)
    {
        if (!DateOnly.TryParse(fechaTexto, out var fecha))
        {
            return new("rechazada", null, null, null, "Esa fecha no es válida.");
        }
        if (!TryParseTurno(turnoTexto, out var turno))
        {
            return new("rechazada", null, null, null, "Ese turno no existe: el restaurante solo toma reservas por este medio para Almuerzo o Cena.");
        }
        if (pax <= 0)
        {
            return new("rechazada", null, null, null, "La cantidad de personas no es válida.");
        }
        if (string.IsNullOrWhiteSpace(nombre))
        {
            return new("rechazada", null, null, null, "Falta el nombre para la reserva.");
        }

        var salon = await ObtenerSalonBotAsync();
        if (salon is null)
        {
            return new("rechazada", null, null, null, "El restaurante todavía no configuró el salón del bot.");
        }

        if (await _db.FechasBloqueadasBot.AnyAsync(f => f.Fecha == fecha))
        {
            return new("rechazada", null, null, null, "Esa fecha no está disponible para reservar por este medio.");
        }
        if (await _db.CierresTurno.AnyAsync(c => c.Fecha == fecha && c.Turno == turno && c.SalonId == salon.Id))
        {
            return new("rechazada", null, null, null, "Ese turno está cerrado ese día.");
        }

        var data = await _diaService.GetTurnoAsync(fecha, turno, salon.Id);

        // Fila vacia mas cercana buscando desde la hora pedida HACIA
        // ADELANTE (ver claude/whatsapp-bot-reservas.md, Ronda 2) — es solo
        // para elegir que horario mostrar en la fila: si no hay ninguna
        // libre, mas abajo se abre una fila nueva en la hora pedida tal
        // cual, asi que esto nunca bloquea la reserva por si solo.
        var filaLibre = data.Reservas
            .Where(r => r.Pax is null && string.IsNullOrEmpty(r.Nombre) && r.Hora is not null
                && string.Compare(r.Hora, horaPedida, StringComparison.Ordinal) >= 0)
            .OrderBy(r => r.Hora, StringComparer.Ordinal)
            .FirstOrDefault();

        var ocupadas = data.MesasOcupadas.Concat(data.MesasWalkIn).ToHashSet();
        // Mejor ajuste: la mesa libre mas chica que entre esa cantidad de
        // pax, para no "gastar" una mesa grande en un grupo chico si hay
        // una mas ajustada disponible.
        var mesaLibre = data.Mesas
            .Where(m => !m.Reducida && m.Capacidad >= pax && !ocupadas.Contains(m.Id))
            .OrderBy(m => m.Capacidad)
            .ThenBy(m => m.Orden)
            .FirstOrDefault();

        // La restriccion real para auto-confirmar es esta: menos de 6 pax Y
        // una mesa con capacidad libre. Que no haya una FILA vacia en la
        // hora pedida no importa aca — se abre una nueva mas abajo.
        var puedeAutoConfirmar = pax < LimitePaxAutoConfirma && mesaLibre is not null;

        Reserva reserva;
        if (filaLibre is not null)
        {
            reserva = await _db.Reservas.FirstAsync(r => r.Id == filaLibre.Id);
        }
        else
        {
            var maxOrden = data.Reservas.Count == 0 ? -1 : data.Reservas.Max(r => r.Orden);
            reserva = new Reserva
            {
                Fecha = fecha,
                Turno = turno,
                SalonId = salon.Id,
                Orden = maxOrden + 1,
            };
            _db.Reservas.Add(reserva);
        }

        reserva.Hora = filaLibre?.Hora ?? horaPedida;
        reserva.Pax = pax;
        reserva.Nombre = nombre;
        reserva.HabTel = telefono;
        reserva.Comentarios = comentarios;
        reserva.Asistio = false;
        reserva.Origen = OrigenReserva.Bot;
        reserva.Estado = puedeAutoConfirmar ? EstadoReserva.Confirmada : EstadoReserva.PendienteBot;
        reserva.UpdatedAt = DateTime.UtcNow;

        await _db.SaveChangesAsync();

        string? mesaCodigo = null;
        if (puedeAutoConfirmar && mesaLibre is not null)
        {
            // Reemplaza el set completo, mismo patron que
            // ReservasController.Actualizar — por mas que una fila vacia no
            // deberia tener mesas asignadas, es mas robusto que asumirlo.
            var actuales = await _db.ReservaMesas.Where(rm => rm.ReservaId == reserva.Id).ToListAsync();
            _db.ReservaMesas.RemoveRange(actuales);
            _db.ReservaMesas.Add(new ReservaMesa { ReservaId = reserva.Id, MesaId = mesaLibre.Id });
            await _db.SaveChangesAsync();
            mesaCodigo = mesaLibre.Codigo;
        }

        var dataActualizada = await _diaService.GetTurnoAsync(fecha, turno, salon.Id);
        var grupo = ReservasHub.GrupoDe(fecha.ToString("yyyy-MM-dd"), turno.ToString().ToLowerInvariant(), salon.Id);
        await _hub.Clients.Group(grupo).SendAsync("TurnoActualizado", dataActualizada);

        return new(
            puedeAutoConfirmar ? "confirmada" : "pendiente",
            reserva.Id,
            mesaCodigo,
            reserva.Hora,
            puedeAutoConfirmar
                ? null
                : "Quedó anotada, pero alguien del restaurante la tiene que confirmar a la brevedad antes de darla por segura.");
    }
}
