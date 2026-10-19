using System.Security.Claims;
using Barrancas.Api.Data;
using Barrancas.Api.Dtos;
using Barrancas.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace Barrancas.Api.Services;

/// <summary>
/// Registro de las reservas hechas por el link publico (ver
/// Models/ReservaWeb.cs): el listado del panel "Reservas por el link" y las
/// marcas de cancelada / confirmada que dejan el tachito, quitar fila y el
/// boton Confirmar.
/// </summary>
public class ReservaWebService
{
    private readonly BarrancasDbContext _db;

    public ReservaWebService(BarrancasDbContext db)
    {
        _db = db;
    }

    // Codigo que ve el cliente en la confirmacion ("R-15").
    public static string Codigo(int id) => $"R-{id}";

    // Nombre del usuario del panel que hizo la accion (claim Name del JWT,
    // ver TokenService).
    public static string? Usuario(ClaimsPrincipal user) =>
        user.FindFirst(ClaimTypes.Name)?.Value ?? user.Identity?.Name;

    /// <summary>
    /// Si la fila tiene una reserva web activa, la marca cancelada (quien y
    /// cuando) y la desvincula de la fila, que queda libre para otra reserva.
    /// No guarda: lo hace quien llama, junto con el resto del cambio.
    /// Devuelve el registro, o null si la fila no venia del link.
    /// </summary>
    public async Task<ReservaWeb?> CancelarDeFilaAsync(int reservaId, string? usuario)
    {
        var registro = await _db.ReservasWeb
            .Where(w => w.ReservaId == reservaId && w.Estado != EstadoReservaWeb.Cancelada)
            .OrderByDescending(w => w.Id)
            .FirstOrDefaultAsync();
        if (registro is null) return null;

        registro.Estado = EstadoReservaWeb.Cancelada;
        registro.CanceladaEn = DateTime.UtcNow;
        registro.CanceladaPor = usuario;
        registro.ReservaId = null;
        return registro;
    }

    public async Task<List<ReservaWebDto>> ListarAsync(int diasAtras)
    {
        var hoy = ReservaOnlineService.HoyLocal();
        var desde = hoy.AddDays(-Math.Clamp(diasAtras, 1, 366));
        var registros = await _db.ReservasWeb
            .AsNoTracking()
            .Include(w => w.Reserva)
            .Include(w => w.Salon)
            .Where(w => w.Fecha >= desde)
            .OrderByDescending(w => w.CreadaEn)
            .ToListAsync();
        return registros.Select(w => ADto(w, hoy)).ToList();
    }

    /// <summary>
    /// Contador del boton "Reservas web" del panel. AConfirmar: solicitudes
    /// que el staff tiene que confirmar. Nuevas: las activas que entraron
    /// despues de <paramref name="vistoHasta"/> (la ultima que se vio en
    /// /reservas-web desde ese navegador; null = no cuenta nuevas). Avisos:
    /// cuantas reservas distintas piden atencion (una nueva que ademas esta
    /// a confirmar cuenta una vez). UltimaCreadaEn: la mas reciente de todas,
    /// para que el navegador arranque desde ahi la primera vez.
    /// </summary>
    public async Task<ReservaWebResumenDto> ResumenAsync(DateTime? vistoHasta = null)
    {
        var hoy = ReservaOnlineService.HoyLocal();
        var registros = await _db.ReservasWeb
            .AsNoTracking()
            .Include(w => w.Reserva)
            .Where(w => w.Fecha >= hoy && w.Estado != EstadoReservaWeb.Cancelada && w.Estado != EstadoReservaWeb.Rechazada)
            .ToListAsync();
        var aConfirmar = 0;
        var nuevas = 0;
        var avisos = 0;
        foreach (var w in registros)
        {
            var estado = EstadoDe(w, hoy);
            var pendiente = estado == "pendiente";
            var nueva = vistoHasta is not null && w.CreadaEn > vistoHasta && (pendiente || estado == "confirmada");
            if (pendiente) aConfirmar++;
            if (nueva) nuevas++;
            if (pendiente || nueva) avisos++;
        }
        var ultima = await _db.ReservasWeb.MaxAsync(w => (DateTime?)w.CreadaEn);
        return new ReservaWebResumenDto(aConfirmar, nuevas, avisos, ultima);
    }

    public async Task<ReservaWebDto?> ObtenerAsync(int id)
    {
        var w = await _db.ReservasWeb.AsNoTracking().Include(x => x.Reserva).Include(x => x.Salon)
            .FirstOrDefaultAsync(x => x.Id == id);
        return w is null ? null : ADto(w, ReservaOnlineService.HoyLocal());
    }

    // Estado para el panel. Ademas de lo guardado en el registro, mira la
    // fila: si ya no es una reserva web (alguien la vacio a mano o la
    // quito), cuenta como cancelada; si se tildo Asistio, "asistio"; si la
    // fecha ya paso sin tildarlo, "novino". Una solicitud sin fila es
    // "pendiente" hasta que se aprueba o rechaza ("vencida" si paso la fecha).
    public static string EstadoDe(ReservaWeb w, DateOnly hoy)
    {
        if (w.Estado == EstadoReservaWeb.Cancelada) return "cancelada";
        if (w.Estado == EstadoReservaWeb.Rechazada) return "rechazada";
        // Solicitud sin aprobar: todavia no tiene fila en la grilla.
        if (w.Estado == EstadoReservaWeb.Pendiente && w.ReservaId is null) return w.Fecha < hoy ? "vencida" : "pendiente";
        var fila = w.Reserva;
        if (fila is null || fila.Origen != OrigenReserva.Web || string.IsNullOrWhiteSpace(fila.Nombre)) return "cancelada";
        if (fila.Asistio) return "asistio";
        if (w.Fecha < hoy) return "novino";
        return w.Estado == EstadoReservaWeb.Pendiente ? "pendiente" : "confirmada";
    }

    private static ReservaWebDto ADto(ReservaWeb w, DateOnly hoy)
    {
        // Si la fila sigue siendo esta reserva, se muestran sus datos
        // actuales (el staff pudo correr la hora o cambiar los pax).
        var fila = w.Reserva is { Origen: OrigenReserva.Web } r && !string.IsNullOrWhiteSpace(r.Nombre) ? r : null;
        var pedido = string.Join(" · ", new[] { w.Ocasion, w.Comentarios }.Where(p => !string.IsNullOrWhiteSpace(p)));
        return new ReservaWebDto(
            w.Id,
            Codigo(w.Id),
            w.CreadaEn,
            fila?.Fecha ?? w.Fecha,
            fila?.Turno ?? w.Turno,
            fila?.Hora ?? w.Hora,
            fila?.SalonId ?? w.SalonId,
            w.Salon?.Nombre ?? string.Empty,
            fila?.Pax ?? w.Pax,
            fila?.Nombre ?? w.Nombre,
            w.Telefono,
            w.Habitacion,
            pedido.Length > 0 ? pedido : null,
            EstadoDe(w, hoy),
            fila?.Id,
            w.ConfirmadaEn,
            w.ConfirmadaPor,
            w.CanceladaEn,
            w.CanceladaPor,
            w.RechazadaEn,
            w.RechazadaPor,
            w.MotivoRechazo);
    }

    /// <summary>
    /// Solicitudes sin aprobar de un dia (todos los salones y turnos), para
    /// la franja «N solicitudes para esta cena» del panel.
    /// </summary>
    public async Task<List<ReservaWebDto>> SolicitudesDelDiaAsync(DateOnly fecha)
    {
        var hoy = ReservaOnlineService.HoyLocal();
        var registros = await _db.ReservasWeb
            .AsNoTracking()
            .Include(w => w.Reserva)
            .Include(w => w.Salon)
            .Where(w => w.Fecha == fecha && w.Estado == EstadoReservaWeb.Pendiente)
            .OrderBy(w => w.Hora)
            .ToListAsync();
        return registros.Select(w => ADto(w, hoy)).Where(d => d.Estado == "pendiente").ToList();
    }

    /// <summary>
    /// Deja vacia una fila de la grilla (como el tachito): sin datos ni
    /// mesas, de nuevo una fila comun del staff. No guarda.
    /// </summary>
    public async Task VaciarFilaAsync(Reserva reserva)
    {
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
    }
}
