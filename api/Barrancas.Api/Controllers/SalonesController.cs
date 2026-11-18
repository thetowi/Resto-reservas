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
/// Administracion de salones (Restaurant, Bar, Aqua Bar, etc — ver
/// Models/Salon.cs): crear, renombrar, activar/desactivar y borrar. GetLista
/// trae TODOS los salones (activos e inactivos — la usa /admin/salones para
/// poder reactivarlos); MetaController.GetMeta, en cambio, solo trae los
/// activos (alimenta el selector de uso diario). Crear/editar/desactivar/
/// borrar es exclusivo de Admin, igual patron que
/// MesasController/ElementosPlanoController.
/// </summary>
[ApiController]
[Authorize]
[Route("api/salones")]
public class SalonesController : ControllerBase
{
    private readonly BarrancasDbContext _db;
    private readonly IHubContext<ReservasHub> _hub;

    public SalonesController(BarrancasDbContext db, IHubContext<ReservasHub> hub)
    {
        _db = db;
        _hub = hub;
    }

    [HttpGet]
    public async Task<ActionResult<List<SalonDto>>> GetLista()
    {
        return Ok(await ListaAsync());
    }

    [HttpPost]
    [Authorize(Roles = "Admin")]
    public async Task<ActionResult<List<SalonDto>>> Crear(CrearSalonRequest req)
    {
        var nombre = req.Nombre?.Trim();
        if (string.IsNullOrWhiteSpace(nombre))
        {
            return BadRequest(new { error = "el nombre del salón es obligatorio" });
        }
        if (await _db.Salones.AnyAsync(s => s.Nombre == nombre))
        {
            return BadRequest(new { error = "ya existe un salón con ese nombre" });
        }

        var maxOrden = await _db.Salones.Select(s => (int?)s.Orden).MaxAsync() ?? -1;
        _db.Salones.Add(new Salon { Nombre = nombre, Orden = maxOrden + 1 });
        await _db.SaveChangesAsync();

        return Ok(await BroadcastAsync());
    }

    [HttpPatch("{id:int}")]
    [Authorize(Roles = "Admin")]
    public async Task<ActionResult<List<SalonDto>>> Actualizar(int id, ActualizarSalonRequest req)
    {
        var salon = await _db.Salones.FirstOrDefaultAsync(s => s.Id == id);
        if (salon is null) return NotFound(new { error = "el salón indicado no existe" });

        if (req.Nombre is not null)
        {
            var nombre = req.Nombre.Trim();
            if (string.IsNullOrWhiteSpace(nombre))
            {
                return BadRequest(new { error = "el nombre del salón no puede quedar vacío" });
            }
            if (await _db.Salones.AnyAsync(s => s.Nombre == nombre && s.Id != id))
            {
                return BadRequest(new { error = "ya existe un salón con ese nombre" });
            }
            salon.Nombre = nombre;
        }

        if (req.Orden is not null) salon.Orden = req.Orden.Value;
        if (req.PermiteMerienda is not null) salon.PermiteMerienda = req.PermiteMerienda.Value;

        // Configuración del salón (ficha en /admin/salones).
        if (req.Color is not null)
        {
            var color = req.Color.Trim();
            if (color.Length > 0 && !System.Text.RegularExpressions.Regex.IsMatch(color, "^#[0-9a-fA-F]{6}$"))
            {
                return BadRequest(new { error = "color inválido" });
            }
            salon.Color = color;
        }
        if (req.OfreceAlmuerzo is not null) salon.OfreceAlmuerzo = req.OfreceAlmuerzo.Value;
        if (req.OfreceCena is not null) salon.OfreceCena = req.OfreceCena.Value;
        foreach (var (valor, asignar) in new (int?, Action<int>)[]
                 {
                     (req.DiasAlmuerzo, v => salon.DiasAlmuerzo = v),
                     (req.DiasMerienda, v => salon.DiasMerienda = v),
                     (req.DiasCena, v => salon.DiasCena = v),
                 })
        {
            if (valor is null) continue;
            if (valor < 0 || valor > Salon.TodosLosDias) return BadRequest(new { error = "días inválidos" });
            asignar(valor.Value);
        }
        if (req.MostrarEnLink is not null) salon.MostrarEnLink = req.MostrarEnLink.Value;
        if (req.Confirmacion is not null) salon.Confirmacion = req.Confirmacion.Value;
        var rangos = new (int? Valor, int Min, int Max, string Que, Action<int> Asignar)[]
        {
            (req.ConfirmaHastaPax, 2, 100, "la cantidad de personas para confirmar", v => salon.ConfirmaHastaPax = v),
            (req.PaxMaximoWeb, 1, 100, "el máximo de personas por reserva", v => salon.PaxMaximoWeb = v),
            (req.AnticipacionMinutos, 0, 2880, "la anticipación mínima", v => salon.AnticipacionMinutos = v),
            (req.DiasAdelante, 1, 365, "los días hacia adelante", v => salon.DiasAdelante = v),
            (req.ToleranciaMinutos, 0, 180, "la tolerancia de llegada", v => salon.ToleranciaMinutos = v),
        };
        foreach (var r in rangos)
        {
            if (r.Valor is null) continue;
            if (r.Valor < r.Min || r.Valor > r.Max) return BadRequest(new { error = $"Revisá {r.Que}: tiene que estar entre {r.Min} y {r.Max}." });
            r.Asignar(r.Valor.Value);
        }

        if (req.Activo is not null)
        {
            // Mismo criterio que UsuariosController al desactivar el unico
            // Admin activo: siempre tiene que quedar al menos un salon
            // ACTIVO (no uno a secas — ya podia haber inactivos de antes),
            // para que el selector de la pantalla principal nunca se quede
            // sin ninguna opcion.
            if (!req.Activo.Value)
            {
                var otrosActivos = await _db.Salones.CountAsync(s => s.Id != id && s.Activo);
                if (otrosActivos == 0)
                {
                    return BadRequest(new { error = "tiene que quedar al menos un salón activo" });
                }
            }
            salon.Activo = req.Activo.Value;
        }

        await _db.SaveChangesAsync();
        // El link de reservas lee estos datos: que no quede con lo anterior.
        ReservaOnlineService.InvalidarCache();

        return Ok(await BroadcastAsync());
    }

    // Reordenar arrastrando en /admin/salones: los ids en el orden nuevo.
    [HttpPost("orden")]
    [Authorize(Roles = "Admin")]
    public async Task<ActionResult<List<SalonDto>>> Ordenar(OrdenSalonesRequest req)
    {
        var salones = await _db.Salones.ToListAsync();
        var ids = (req.Ids ?? []).Distinct().ToList();
        if (ids.Count != salones.Count || salones.Any(s => !ids.Contains(s.Id)))
        {
            return BadRequest(new { error = "mandá todos los salones en el orden nuevo" });
        }
        foreach (var s in salones) s.Orden = ids.IndexOf(s.Id);
        await _db.SaveChangesAsync();
        ReservaOnlineService.InvalidarCache();
        return Ok(await BroadcastAsync());
    }

    [HttpDelete("{id:int}")]
    [Authorize(Roles = "Admin")]
    public async Task<ActionResult<List<SalonDto>>> Borrar(int id)
    {
        var salon = await _db.Salones.FirstOrDefaultAsync(s => s.Id == id);
        if (salon is null) return NotFound(new { error = "el salón indicado no existe" });

        // Siempre tiene que quedar al menos un salon: la app no tiene sentido
        // sin ninguno (no habria donde cargar mesas ni reservas nuevas).
        if (await _db.Salones.CountAsync() <= 1)
        {
            return BadRequest(new { error = "tiene que quedar al menos un salón" });
        }
        // Igual criterio que borrar una mesa con divisiones: no se borra un
        // salon con mesas todavia adentro, hay que borrarlas (o pasarlas a
        // mano a otro salon, creando mesas nuevas ahi) primero. Evita perder
        // de vista mesas/reservas historicas "flotando" sin salon valido.
        if (await _db.Mesas.AnyAsync(m => m.SalonId == id))
        {
            return BadRequest(new { error = "este salón todavía tiene mesas: borralas primero desde \"Administrar mesas\"" });
        }
        // El resto de las tablas que cuelgan de un salon (reservas, lista de
        // espera, cierres de turno, carteles de referencia del plano) tienen
        // su propia FK en RESTRICT contra Salones — nunca dependen de que
        // existan mesas, asi que el chequeo de arriba no las cubre. Sin este
        // chequeo, intentar borrar un salon con cualquiera de estos todavia
        // cargados tiraba una excepcion cruda de Postgres (23001) en vez de
        // un mensaje entendible. Para un salon que ya no se usa pero tiene
        // historial real (el caso mas comun), la opcion correcta es
        // "Desactivar" (ver mas arriba) en vez de borrar: eso no pierde nada.
        if (await _db.Reservas.AnyAsync(r => r.SalonId == id))
        {
            return BadRequest(new { error = "este salón todavía tiene reservas cargadas: no se puede borrar (podés desactivarlo en vez de borrarlo)" });
        }
        if (await _db.Esperas.AnyAsync(e => e.SalonId == id))
        {
            return BadRequest(new { error = "este salón todavía tiene lista de espera cargada: no se puede borrar (podés desactivarlo en vez de borrarlo)" });
        }
        if (await _db.CierresTurno.AnyAsync(c => c.SalonId == id))
        {
            return BadRequest(new { error = "este salón todavía tiene turnos cerrados registrados: no se puede borrar (podés desactivarlo en vez de borrarlo)" });
        }
        if (await _db.ElementosPlano.AnyAsync(e => e.SalonId == id))
        {
            return BadRequest(new { error = "este salón todavía tiene carteles de referencia en el plano: borralos primero desde \"Administrar mesas\"" });
        }

        _db.Salones.Remove(salon);
        await _db.SaveChangesAsync();

        return Ok(await BroadcastAsync());
    }

    private async Task<List<SalonDto>> ListaAsync()
    {
        return await _db.Salones
            .OrderBy(s => s.Orden)
            .Select(s => new SalonDto(s.Id, s.Nombre, s.Orden, s.PermiteMerienda, s.Activo, s.Color, s.OfreceAlmuerzo, s.OfreceCena,
                s.DiasAlmuerzo, s.DiasMerienda, s.DiasCena, s.MostrarEnLink, s.Confirmacion, s.ConfirmaHastaPax,
                s.PaxMaximoWeb, s.AnticipacionMinutos, s.DiasAdelante, s.ToleranciaMinutos))
            .ToListAsync();
    }

    private async Task<List<SalonDto>> BroadcastAsync()
    {
        var lista = await ListaAsync();
        await _hub.Clients.All.SendAsync("SalonesActualizados", lista);
        return lista;
    }
}
