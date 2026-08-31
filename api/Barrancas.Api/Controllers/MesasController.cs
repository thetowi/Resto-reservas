using Barrancas.Api.Data;
using Barrancas.Api.Dtos;
using Barrancas.Api.Hubs;
using Barrancas.Api.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;

namespace Barrancas.Api.Controllers;

/// <summary>
/// Panel de administracion de mesas: crear mesas, dividirlas en mesas mas
/// chicas e independientes, editar codigo/capacidad, y borrarlas. Cada mesa
/// pertenece a un salon (ver Models/Salon.cs) — el codigo solo tiene que ser
/// unico dentro de ese salon, no en todo el restaurante. A diferencia de las
/// reservas (que se agrupan por fecha:turno:salon), las mesas de TODOS los
/// salones viajan juntas en un unico broadcast (igual que antes de que
/// existieran los salones): el frontend filtra por SalonId localmente.
///
/// La mayoria de estos endpoints son exclusivos de Admin: Staff puede ver el
/// plano (mesas + ocupacion) en modo lectura desde /plano, pero no crear,
/// mover ni borrar mesas. La excepcion es <see cref="DividirEnDos"/> (dividir
/// una mesa al toque desde "Mesas disponibles" en la pantalla de reservas):
/// esa la puede usar cualquiera de los dos roles, para no depender de que
/// haya un Admin disponible durante el servicio — por eso el atributo de rol
/// se pone accion por accion en vez de en la clase entera (mismo patron que
/// ElementosPlanoController). La lectura de la lista de mesas en si vive en
/// MetaController (GET /api/meta), abierta a cualquier rol autenticado.
/// </summary>
[ApiController]
[Authorize]
[Route("api/mesas")]
public class MesasController : ControllerBase
{
    private readonly BarrancasDbContext _db;
    private readonly IHubContext<ReservasHub> _hub;

    public MesasController(BarrancasDbContext db, IHubContext<ReservasHub> hub)
    {
        _db = db;
        _hub = hub;
    }

    [HttpPost]
    [Authorize(Roles = "Admin")]
    public async Task<ActionResult<List<MesaDto>>> Crear(CrearMesaRequest req)
    {
        var codigo = req.Codigo?.Trim();
        if (string.IsNullOrWhiteSpace(codigo))
        {
            return BadRequest(new { error = "el codigo de mesa es obligatorio" });
        }
        if (req.Capacidad <= 0)
        {
            return BadRequest(new { error = "la capacidad tiene que ser mayor a 0" });
        }
        if (!await _db.Salones.AnyAsync(s => s.Id == req.SalonId))
        {
            return BadRequest(new { error = "el salón indicado no existe" });
        }
        if (await _db.Mesas.AnyAsync(m => m.Codigo == codigo && m.SalonId == req.SalonId))
        {
            return BadRequest(new { error = "ya existe una mesa con ese codigo en este salón" });
        }

        var maxOrden = await _db.Mesas
            .Where(m => m.SalonId == req.SalonId)
            .Select(m => (int?)m.Orden)
            .MaxAsync() ?? -1;
        _db.Mesas.Add(new Mesa { Codigo = codigo, Capacidad = req.Capacidad, Orden = maxOrden + 1, SalonId = req.SalonId });
        await _db.SaveChangesAsync();

        return Ok(await BroadcastMesasAsync());
    }

    [HttpPost("{id:int}/dividir")]
    [Authorize(Roles = "Admin")]
    public async Task<ActionResult<List<MesaDto>>> Dividir(int id, DividirMesaRequest req)
    {
        var padre = await _db.Mesas.Include(m => m.Divisiones).FirstOrDefaultAsync(m => m.Id == id);
        if (padre is null) return NotFound(new { error = "la mesa indicada no existe" });
        if (padre.MesaPadreId is not null)
        {
            return BadRequest(new { error = "una division no se puede volver a dividir" });
        }

        var codigo = req.Codigo?.Trim();
        if (string.IsNullOrWhiteSpace(codigo))
        {
            return BadRequest(new { error = "el codigo de la division es obligatorio" });
        }
        if (req.Capacidad <= 0)
        {
            return BadRequest(new { error = "la capacidad tiene que ser mayor a 0" });
        }
        if (await _db.Mesas.AnyAsync(m => m.Codigo == codigo && m.SalonId == padre.SalonId))
        {
            return BadRequest(new { error = "ya existe una mesa con ese codigo en este salón" });
        }
        // Dividir no agrega asientos nuevos: los pax de la division salen de
        // la mesa base, asi que le restamos esa capacidad (y por eso tiene
        // que quedar con al menos 1 pax para seguir siendo una mesa usable).
        if (req.Capacidad >= padre.Capacidad)
        {
            return BadRequest(new
            {
                error = $"la mesa {padre.Codigo} tiene {padre.Capacidad} pax disponibles: la division tiene que ser menor a eso",
            });
        }

        // Insertamos la division justo despues del orden de la base (no al
        // final de la lista): todo lo que ya estaba despues (de ese MISMO
        // salon) se corre un lugar para hacerle espacio, asi la nueva mesa
        // aparece pegada a su base tanto en la lista como en el panel de
        // mesas disponibles.
        await CorrerOrdenesAsync(padre.SalonId, padre.Orden, cantidad: 1);

        padre.Capacidad -= req.Capacidad;
        _db.Mesas.Add(new Mesa
        {
            Codigo = codigo,
            Capacidad = req.Capacidad,
            Orden = padre.Orden + 1,
            SalonId = padre.SalonId,
            MesaPadreId = padre.Id,
        });
        await _db.SaveChangesAsync();

        return Ok(await BroadcastMesasAsync());
    }

    /// <summary>
    /// Division rapida desde "Mesas disponibles" (pantalla de reservas): a
    /// diferencia de <see cref="Dividir"/> (que pide codigo y capacidad de
    /// la division a mano, y deja la base con el resto de los pax), esta
    /// parte la mesa entera al medio en dos mesas nuevas e independientes,
    /// "{codigo}a" y "{codigo}b", sin pedir ningun dato — pensada para
    /// resolver una mesa grande en dos chicas al toque, sin entrar a
    /// /admin/mesas. Abierta a Admin y Staff (ver el comentario de la
    /// clase). Las dos mitades heredan el salon de la mesa que se divide.
    /// </summary>
    [HttpPost("{id:int}/dividir-en-dos")]
    public async Task<ActionResult<List<MesaDto>>> DividirEnDos(int id)
    {
        var padre = await _db.Mesas.Include(m => m.Divisiones).FirstOrDefaultAsync(m => m.Id == id);
        if (padre is null) return NotFound(new { error = "la mesa indicada no existe" });
        if (padre.MesaPadreId is not null)
        {
            return BadRequest(new { error = "una division no se puede volver a dividir" });
        }
        if (padre.Divisiones.Count > 0)
        {
            return BadRequest(new { error = "esta mesa ya tiene divisiones: administralas desde \"Administrar mesas\"" });
        }
        if (padre.Capacidad < 2)
        {
            return BadRequest(new { error = "no quedan pax suficientes en esta mesa para dividirla" });
        }

        var codigoA = $"{padre.Codigo}a";
        var codigoB = $"{padre.Codigo}b";
        if (await _db.Mesas.AnyAsync(m => m.SalonId == padre.SalonId && (m.Codigo == codigoA || m.Codigo == codigoB)))
        {
            return BadRequest(new
            {
                error = $"ya existe una mesa con código {codigoA} o {codigoB}: revisalo desde \"Administrar mesas\"",
            });
        }

        // Reparte los pax de la base entre las dos mitades (si es impar, la
        // segunda se lleva el pax de mas) — no son asientos nuevos, son los
        // mismos repartidos, asi que la base queda en 0 (no se borra sola:
        // ya le quedan dos divisiones, y ademas alguna reserva vieja podria
        // seguir apuntando a su Id).
        var capacidadA = padre.Capacidad / 2;
        var capacidadB = padre.Capacidad - capacidadA;

        // Mismo criterio de orden que Dividir: las dos mitades quedan
        // pegadas a la base, no al final de la lista (dentro del mismo
        // salon).
        await CorrerOrdenesAsync(padre.SalonId, padre.Orden, cantidad: 2);

        padre.Capacidad = 0;
        _db.Mesas.Add(new Mesa { Codigo = codigoA, Capacidad = capacidadA, Orden = padre.Orden + 1, SalonId = padre.SalonId, MesaPadreId = padre.Id });
        _db.Mesas.Add(new Mesa { Codigo = codigoB, Capacidad = capacidadB, Orden = padre.Orden + 2, SalonId = padre.SalonId, MesaPadreId = padre.Id });
        await _db.SaveChangesAsync();

        return Ok(await BroadcastMesasAsync());
    }

    [HttpPatch("{id:int}")]
    [Authorize(Roles = "Admin")]
    public async Task<ActionResult<List<MesaDto>>> Actualizar(int id, ActualizarMesaRequest req)
    {
        var mesa = await _db.Mesas.FirstOrDefaultAsync(m => m.Id == id);
        if (mesa is null) return NotFound(new { error = "la mesa indicada no existe" });

        if (req.Codigo is not null)
        {
            var codigo = req.Codigo.Trim();
            if (string.IsNullOrWhiteSpace(codigo))
            {
                return BadRequest(new { error = "el codigo de mesa no puede quedar vacio" });
            }
            if (await _db.Mesas.AnyAsync(m => m.Codigo == codigo && m.SalonId == mesa.SalonId && m.Id != id))
            {
                return BadRequest(new { error = "ya existe una mesa con ese codigo en este salón" });
            }
            mesa.Codigo = codigo;
        }

        if (req.Capacidad is not null)
        {
            if (req.Capacidad <= 0)
            {
                return BadRequest(new { error = "la capacidad tiene que ser mayor a 0" });
            }
            mesa.Capacidad = req.Capacidad.Value;
        }

        // PosX/PosY viajan juntos desde el plano visual; no tiene sentido
        // mandar uno sin el otro, pero por las dudas los tratamos por
        // separado (ninguno "limpia" la posicion: siempre se manda una
        // coordenada real al soltar el arrastre).
        if (req.PosX is not null) mesa.PosX = req.PosX;
        if (req.PosY is not null) mesa.PosY = req.PosY;

        await _db.SaveChangesAsync();

        return Ok(await BroadcastMesasAsync());
    }

    [HttpDelete("{id:int}")]
    [Authorize(Roles = "Admin")]
    public async Task<ActionResult<List<MesaDto>>> Borrar(int id)
    {
        var mesa = await _db.Mesas.Include(m => m.Divisiones).Include(m => m.MesaPadre)
            .FirstOrDefaultAsync(m => m.Id == id);
        if (mesa is null) return NotFound(new { error = "la mesa indicada no existe" });
        if (mesa.Divisiones.Count > 0)
        {
            return BadRequest(new { error = "esta mesa todavia tiene divisiones: borralas primero" });
        }

        // Si es una division, sus pax vuelven a la mesa base (son los
        // mismos asientos: al dividir se los habiamos restado a la base).
        if (mesa.MesaPadre is not null)
        {
            mesa.MesaPadre.Capacidad += mesa.Capacidad;
        }

        // Las reservas que ya usaban esta mesa quedan sin mesa asignada
        // (Reserva.MesaId -> SetNull), no se borran.
        _db.Mesas.Remove(mesa);
        await _db.SaveChangesAsync();

        return Ok(await BroadcastMesasAsync());
    }

    // Le hace lugar a "cantidad" mesas nuevas justo despues de ordenDesde,
    // corriendo un lugar (o los que hagan falta) a todo lo que ya estaba
    // despues DENTRO DEL MISMO SALON. Sin el filtro de salon, esto correria
    // por error mesas de otros salones cuyo Orden numerico se solape con el
    // de este.
    private async Task CorrerOrdenesAsync(int salonId, int ordenDesde, int cantidad)
    {
        var siguientes = await _db.Mesas.Where(m => m.SalonId == salonId && m.Orden > ordenDesde).ToListAsync();
        foreach (var m in siguientes) m.Orden += cantidad;
    }

    private async Task<List<MesaDto>> BroadcastMesasAsync()
    {
        var mesas = await _db.Mesas
            .OrderBy(m => m.Orden)
            .Select(m => new MesaDto(m.Id, m.Codigo, m.Capacidad, m.MesaPadreId, m.Orden, m.PosX, m.PosY, m.SalonId))
            .ToListAsync();

        await _hub.Clients.All.SendAsync("MesasActualizado", mesas);
        return mesas;
    }
}
