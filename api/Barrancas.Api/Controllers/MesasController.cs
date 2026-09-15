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
    // Separacion horizontal (px del lienzo del plano) entre dos mesas recien
    // creadas por una division: sin esto, las mesas nuevas nacen con
    // PosX/PosY en null y el frontend las ubica en la grilla por defecto
    // (ver posicionPorDefecto en PlanoSalon.tsx), lejos de donde estaba la
    // mesa que se dividio — visualmente aparecian "perdidas" en vez de
    // separadas una de la otra justo donde uno las estaba mirando. Solo
    // aplica cuando la mesa base YA tenia una posicion propia en el plano
    // (se acomodo a mano alguna vez): si todavia esta en la grilla por
    // defecto, las nuevas tambien quedan en null y el frontend las ubica
    // solo (ya les toca un "Orden" distinto, asi que no se superponen).
    //
    // El valor esta calcado a proposito del ancho de UN cuadrado del par
    // visual que dibuja una mesa cuadrada de 4 pax (ver dimensionesPorCapacidad
    // / GAP_PAR en PlanoSalon.tsx: lado 52px + separacion interna 4px = 56).
    // Asi, al dividir una mesa "11" de 4 pax en "11a"/"11b" de 2 pax cada
    // una, las dos mitades nuevas aparecen EXACTAMENTE donde ya estaban
    // dibujados los dos cuadrados del par — no saltan a otro lado, solo se
    // "sueltan" y quedan separadas por ese mismo espacio chiquito que ya
    // tenian antes de dividirse. Si cambia esa geometria del lado frontend,
    // hay que actualizar este numero tambien.
    private const double SeparacionDivisionPx = 56;

    // Ancho aproximado (px del lienzo) que ocupa cualquier mesa en el plano,
    // sin importar su capacidad exacta ni si es redonda o cuadrada: alcanza
    // para detectar una superposicion evidente contra OTRA mesa ya ubicada,
    // sin tener que calcar pixel a pixel dimensionesPorCapacidad del
    // frontend (que ademas depende de esPar, forma, etc.). No hace falta
    // que sea exacto: solo evitar que una division recien creada nazca
    // literalmente arriba de una mesa vecina no relacionada.
    private const double DistanciaMinimaEntreMesas = 70;

    // Tope de intentos al alejar una mesa nueva de sus vecinas (ver
    // AlejarDeVecinasAsync): un salon con MUCHAS mesas ya ubicadas en fila
    // podria en teoria necesitar varios pasos para encontrar hueco libre;
    // este limite evita un bucle infinito si por algun motivo nunca lo
    // encuentra (en ese caso se devuelve la ultima posicion probada, que en
    // la practica ya esta bastante lejos del punto de partida).
    private const int IntentosMaximosDeAlejar = 12;

    private readonly BarrancasDbContext _db;
    private readonly IHubContext<ReservasHub> _hub;
    private readonly DiaService _diaService;

    public MesasController(BarrancasDbContext db, IHubContext<ReservasHub> hub, DiaService diaService)
    {
        _db = db;
        _hub = hub;
        _diaService = diaService;
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
        // El chequeo de codigo unico ignora las divisiones TEMPORALES por
        // turno (EsTemporal=true — ver DividirPorTurno): esas son propias de
        // una fecha+turno puntual, invisibles en Administrar mesas, y el
        // indice unico real de la base de datos tampoco las cuenta (ver
        // BarrancasDbContext). Sin este filtro, una division temporal vieja
        // que quedo dando vueltas (por ejemplo "11b" de un turno donde no se
        // llego a "Unir") bloqueaba para siempre crear una mesa PERMANENTE
        // con ese mismo codigo, con un error confuso para quien no tiene
        // forma de ver esa mesa temporal en ningun lado de este panel.
        if (await _db.Mesas.AnyAsync(m => m.Codigo == codigo && m.SalonId == req.SalonId && !m.EsTemporal))
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
        // Mismo criterio que en Crear: una division TEMPORAL por turno que
        // haya quedado con este mismo codigo (ver comentario de Crear) no
        // cuenta como choque para crear la division PERMANENTE.
        if (await _db.Mesas.AnyAsync(m => m.Codigo == codigo && m.SalonId == padre.SalonId && !m.EsTemporal))
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
        var hija = new Mesa
        {
            Codigo = codigo,
            Capacidad = req.Capacidad,
            Orden = padre.Orden + 1,
            SalonId = padre.SalonId,
            MesaPadreId = padre.Id,
            // La division es fisicamente la misma mesa partida en dos: hereda
            // la forma y la rotacion de la base en vez de arrancar en el
            // default.
            Forma = padre.Forma,
            Rotacion = padre.Rotacion,
        };
        // La base se queda en su lugar (no se toca su posicion): la nueva
        // division aparece pegada a su derecha, ya separada, en vez de
        // nacer en la grilla por defecto (ver SeparacionDivisionPx).
        if (padre.PosX is not null && padre.PosY is not null)
        {
            var (x, y) = await AlejarDeVecinasAsync(padre.SalonId, padre.PosX.Value + SeparacionDivisionPx, padre.PosY.Value, padre.Id);
            hija.PosX = x;
            hija.PosY = y;
        }
        _db.Mesas.Add(hija);
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
        // Mismo criterio que en Crear/Dividir: una division TEMPORAL por
        // turno con este mismo codigo (por ejemplo, si ya se hizo un
        // "Dividir mesa" de un solo turno sobre esta mesa y no se "Unio")
        // no bloquea crear la division PERMANENTE — son cosas distintas.
        if (await _db.Mesas.AnyAsync(m => m.SalonId == padre.SalonId && !m.EsTemporal && (m.Codigo == codigoA || m.Codigo == codigoB)))
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
        var hijaA = new Mesa { Codigo = codigoA, Capacidad = capacidadA, Orden = padre.Orden + 1, SalonId = padre.SalonId, MesaPadreId = padre.Id, Forma = padre.Forma, Rotacion = padre.Rotacion };
        var hijaB = new Mesa { Codigo = codigoB, Capacidad = capacidadB, Orden = padre.Orden + 2, SalonId = padre.SalonId, MesaPadreId = padre.Id, Forma = padre.Forma, Rotacion = padre.Rotacion };
        // La mesa base queda en 0 pax (ver comentario arriba) y el plano ya
        // no la dibuja (PlanoSalon.tsx la oculta por capacidad <= 0): las dos
        // mitades nuevas toman su lugar, una al lado de la otra, en vez de
        // nacer en la grilla por defecto lejos de donde estaba.
        if (padre.PosX is not null && padre.PosY is not null)
        {
            hijaA.PosX = padre.PosX;
            hijaA.PosY = padre.PosY;
            var (x, y) = await AlejarDeVecinasAsync(padre.SalonId, padre.PosX.Value + SeparacionDivisionPx, padre.PosY.Value, padre.Id);
            hijaB.PosX = x;
            hijaB.PosY = y;
        }
        _db.Mesas.Add(hijaA);
        _db.Mesas.Add(hijaB);
        await _db.SaveChangesAsync();

        return Ok(await BroadcastMesasAsync());
    }
    /// <summary>
    /// Division temporal desde "Mesas disponibles" (pantalla de reservas): a
    /// diferencia de <see cref="Dividir"/> (permanente, define el default del
    /// salon desde /admin/mesas), esta division vale SOLO para la fecha+turno
    /// indicada — cualquier otro turno o dia sigue viendo la mesa entera. Pide
    /// cuantos pax van a cada mitad (no reparte al medio solo): las dos tienen
    /// que sumar exactamente la capacidad de la mesa base, para no crear ni
    /// perder pax. Abierta a Admin y Staff (ver comentario de la clase).
    /// </summary>
    [HttpPost("{id:int}/dividir-turno")]
    public async Task<ActionResult> DividirPorTurno(int id, DividirPorTurnoRequest req)
    {
        var padre = await _db.Mesas.FirstOrDefaultAsync(m => m.Id == id);
        if (padre is null) return NotFound(new { error = "la mesa indicada no existe" });
        if (padre.MesaPadreId is not null)
        {
            return BadRequest(new { error = "una division no se puede volver a dividir" });
        }
        if (req.PaxA < 1 || req.PaxB < 1)
        {
            return BadRequest(new { error = "cada mitad necesita al menos 1 pax" });
        }
        if (req.PaxA + req.PaxB != padre.Capacidad)
        {
            return BadRequest(new { error = $"las dos mitades tienen que sumar {padre.Capacidad} pax (la capacidad de la mesa)" });
        }

        // La division "por turno" es independiente de fecha/turno: la mesa
        // 52 se puede dividir en "52a"/"52b" para el almuerzo y, por
        // separado, tambien para la cena del mismo dia (o de otro dia),
        // sin que una pise a la otra — cada turno tiene su propia fila de
        // DivisionMesaTurno y sus propias mesas hijas. El indice unico de
        // Mesas (SalonId, Codigo) aplica SOLO a mesas permanentes
        // (EsTemporal = false — ver BarrancasDbContext): dos mesas
        // temporales de turnos distintos pueden compartir el mismo texto de
        // codigo sin chocar en la base de datos, porque nunca se muestran
        // juntas (GetTurnoAsync filtra cada turno por su propia
        // DivisionMesaTurno). Solo hace falta bloquear la re-division del
        // MISMO turno+fecha (ya tiene una division activa).
        var yaDividida = await _db.DivisionesMesaTurno.AnyAsync(d =>
            d.Fecha == req.Fecha && d.Turno == req.Turno && d.MesaBaseId == padre.Id);
        if (yaDividida)
        {
            return BadRequest(new { error = "esta mesa ya esta dividida en este turno" });
        }

        // Red de seguridad: el "{codigo}a"/"b" SI tiene que seguir siendo
        // unico contra las mesas PERMANENTES del salon (las de /admin/mesas
        // no estan protegidas por ningun otro chequeo de turno).
        var codigoA = $"{padre.Codigo}a";
        var codigoB = $"{padre.Codigo}b";
        var chocaConPermanente = await _db.Mesas.AnyAsync(m =>
            m.SalonId == padre.SalonId && !m.EsTemporal && (m.Codigo == codigoA || m.Codigo == codigoB));
        if (chocaConPermanente)
        {
            return BadRequest(new
            {
                error = $"ya existe una mesa permanente con código {codigoA} o {codigoB}: revisalo desde \"Administrar mesas\"",
            });
        }

        await CorrerOrdenesAsync(padre.SalonId, padre.Orden, cantidad: 2);

        var hijaA = new Mesa
        {
            Codigo = $"{padre.Codigo}a",
            Capacidad = req.PaxA,
            Orden = padre.Orden + 1,
            SalonId = padre.SalonId,
            MesaPadreId = padre.Id,
            EsTemporal = true,
            Forma = padre.Forma,
        };
        var hijaB = new Mesa
        {
            Codigo = $"{padre.Codigo}b",
            Capacidad = req.PaxB,
            Orden = padre.Orden + 2,
            SalonId = padre.SalonId,
            MesaPadreId = padre.Id,
            EsTemporal = true,
            Forma = padre.Forma,
        };
        // Este turno ya no dibuja a la base (DiaService.GetTurnoAsync la
        // oculta mientras esta dividida): las dos mitades toman su lugar en
        // el plano, separadas entre si, en vez de nacer en la grilla por
        // defecto.
        if (padre.PosX is not null && padre.PosY is not null)
        {
            hijaA.PosX = padre.PosX;
            hijaA.PosY = padre.PosY;
            var (x, y) = await AlejarDeVecinasAsync(padre.SalonId, padre.PosX.Value + SeparacionDivisionPx, padre.PosY.Value, padre.Id);
            hijaB.PosX = x;
            hijaB.PosY = y;
        }
        _db.Mesas.AddRange(hijaA, hijaB);
        await _db.SaveChangesAsync();

        _db.DivisionesMesaTurno.Add(new DivisionMesaTurno
        {
            Fecha = req.Fecha,
            Turno = req.Turno,
            SalonId = padre.SalonId,
            MesaBaseId = padre.Id,
            MesaHijaAId = hijaA.Id,
            MesaHijaBId = hijaB.Id,
        });
        await _db.SaveChangesAsync();

        await BroadcastMesasAsync();
        await BroadcastTurnoAsync(req.Fecha, req.Turno, padre.SalonId);
        return NoContent();
    }

    /// <summary>
    /// Deshace una division temporal (ver DividirPorTurno): borra las dos
    /// mesas hijas y el registro de division, asi ese turno vuelve a ver la
    /// mesa base entera. Bloqueada si alguna de las dos mitades ya tiene una
    /// reserva o un walk-in real encima — primero hay que reasignar eso a otra
    /// mesa (mismo criterio que ya se usa para no poder borrar una mesa con
    /// reservas).
    /// </summary>
    [HttpPost("{id:int}/unir-turno")]
    public async Task<ActionResult> UnirPorTurno(int id, UnirPorTurnoRequest req)
    {
        var division = await _db.DivisionesMesaTurno.FirstOrDefaultAsync(d =>
            d.Fecha == req.Fecha && d.Turno == req.Turno && d.MesaBaseId == id);
        if (division is null)
        {
            return NotFound(new { error = "esta mesa no esta dividida en este turno" });
        }

        var hijaIds = new[] { division.MesaHijaAId, division.MesaHijaBId };
        var enUso = await _db.ReservaMesas.AnyAsync(rm => hijaIds.Contains(rm.MesaId))
            || await _db.WalkIns.AnyAsync(w => hijaIds.Contains(w.MesaId));
        if (enUso)
        {
            return BadRequest(new { error = "una de las dos mitades tiene una reserva o walk-in: reasignala a otra mesa antes de unir" });
        }

        var hijas = await _db.Mesas.Where(m => hijaIds.Contains(m.Id)).ToListAsync();
        _db.DivisionesMesaTurno.Remove(division);
        _db.Mesas.RemoveRange(hijas);
        await _db.SaveChangesAsync();

        await BroadcastMesasAsync();
        await BroadcastTurnoAsync(req.Fecha, req.Turno, division.SalonId);
        return NoContent();
    }

    /// <summary>
    /// Renombra una mesa SOLO para una fecha+turno puntual (ver Models/
    /// RenombreMesaTurno.cs): a diferencia de <see cref="Actualizar"/> (PATCH,
    /// permanente, define el default de /admin/mesas), esta no toca el
    /// Codigo real de la mesa — solo hace que ESE turno la vea con otro
    /// numero. Caso tipico: se corrio la mesa "55" junto a la ventana y por
    /// esta noche se la quiere ver como "48". Al terminar el turno deja de
    /// aplicarse solo. Abierta a Admin y Staff (ver comentario de la clase).
    /// Volver a llamar a este mismo endpoint sobre una mesa ya renombrada
    /// actualiza el renombre (no crea uno segundo).
    /// </summary>
    [HttpPost("{id:int}/renombrar-turno")]
    public async Task<ActionResult> RenombrarPorTurno(int id, RenombrarPorTurnoRequest req)
    {
        var mesa = await _db.Mesas.FirstOrDefaultAsync(m => m.Id == id);
        if (mesa is null) return NotFound(new { error = "la mesa indicada no existe" });

        var codigoNuevo = req.CodigoNuevo?.Trim();
        if (string.IsNullOrWhiteSpace(codigoNuevo))
        {
            return BadRequest(new { error = "el numero nuevo es obligatorio" });
        }

        // Chequeamos contra la lista de mesas YA RESUELTA de este turno
        // (divisiones y renombres previos incluidos), para no dejar dos
        // mesas mostrando el mismo numero al mismo tiempo. Se excluye a la
        // mesa que se esta renombrando: renombrarla al numero que ya tiene
        // (o volver a editarla) no cuenta como choque contra si misma.
        var turnoActual = await _diaService.GetTurnoAsync(req.Fecha, req.Turno, mesa.SalonId);
        var choque = turnoActual.Mesas.Any(m => m.Id != mesa.Id && m.Codigo == codigoNuevo);
        if (choque)
        {
            return BadRequest(new { error = $"ya hay otra mesa con el numero {codigoNuevo} en este turno" });
        }

        var renombre = await _db.RenombresMesaTurno.FirstOrDefaultAsync(r =>
            r.Fecha == req.Fecha && r.Turno == req.Turno && r.MesaId == mesa.Id);
        if (renombre is null)
        {
            _db.RenombresMesaTurno.Add(new RenombreMesaTurno
            {
                Fecha = req.Fecha,
                Turno = req.Turno,
                SalonId = mesa.SalonId,
                MesaId = mesa.Id,
                CodigoNuevo = codigoNuevo,
            });
        }
        else
        {
            renombre.CodigoNuevo = codigoNuevo;
        }
        await _db.SaveChangesAsync();

        // No hace falta BroadcastMesasAsync: el Codigo real de la mesa (el
        // que ve /admin/mesas) no cambio, solo su vista para este turno.
        await BroadcastTurnoAsync(req.Fecha, req.Turno, mesa.SalonId);
        return NoContent();
    }

    /// <summary>
    /// Deshace un renombre hecho con <see cref="RenombrarPorTurno"/> antes de
    /// que termine el turno (si no se llama, igual deja de aplicarse solo al
    /// turno siguiente). Se pide con el Id real de la mesa.
    /// </summary>
    [HttpPost("{id:int}/revertir-nombre-turno")]
    public async Task<ActionResult> RevertirNombrePorTurno(int id, RevertirNombrePorTurnoRequest req)
    {
        var renombre = await _db.RenombresMesaTurno.FirstOrDefaultAsync(r =>
            r.Fecha == req.Fecha && r.Turno == req.Turno && r.MesaId == id);
        if (renombre is null)
        {
            return NotFound(new { error = "esta mesa no tiene un renombre activo en este turno" });
        }

        _db.RenombresMesaTurno.Remove(renombre);
        await _db.SaveChangesAsync();

        await BroadcastTurnoAsync(req.Fecha, req.Turno, renombre.SalonId);
        return NoContent();
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
            // Mismo criterio que en Crear/Dividir/DividirEnDos: una division
            // TEMPORAL por turno con este codigo no bloquea renombrar una
            // mesa PERMANENTE a ese mismo codigo.
            if (await _db.Mesas.AnyAsync(m => m.Codigo == codigo && m.SalonId == mesa.SalonId && m.Id != id && !m.EsTemporal))
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

        // Segunda linea de defensa contra mover una mesa fijada (la primera
        // es el frontend, que ni siquiera deja arrancar el arrastre — ver
        // PlanoSalon.tsx): si esta fijada y el pedido trae una posicion
        // nueva, se rechaza, salvo que este MISMO pedido tambien la este
        // desfijando (req.Fijada == false), para permitir "desfijar y mover"
        // en un solo paso si el frontend alguna vez lo necesita.
        if ((req.PosX is not null || req.PosY is not null) && mesa.Fijada && req.Fijada is not false)
        {
            return BadRequest(new { error = "esta mesa está fijada: desfijala antes de moverla" });
        }

        // PosX/PosY viajan juntos desde el plano visual; no tiene sentido
        // mandar uno sin el otro, pero por las dudas los tratamos por
        // separado (ninguno "limpia" la posicion: siempre se manda una
        // coordenada real al soltar el arrastre).
        if (req.PosX is not null) mesa.PosX = req.PosX;
        if (req.PosY is not null) mesa.PosY = req.PosY;

        // Forma (redonda/cuadrada): se manda sola, desde el selector que
        // aparece al elegir una mesa en el plano (ver PlanoSalon.tsx).
        if (req.Forma is not null) mesa.Forma = req.Forma.Value;

        // Fijada: tambien se manda sola, desde el mismo selector, al tocar
        // "Fijar"/"Desfijar".
        if (req.Fijada is not null) mesa.Fijada = req.Fijada.Value;

        // Rotacion: igual que Fijada, se manda sola al tocar "Rotar". Se
        // normaliza a [0, 360) por las dudas (el frontend siempre manda un
        // multiplo de 90, pero no cuesta nada blindarlo aca tambien).
        if (req.Rotacion is not null) mesa.Rotacion = ((req.Rotacion.Value % 360) + 360) % 360;

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

    // Si (x,y) cae encima (o demasiado cerca) de OTRA mesa ya ubicada en el
    // mismo salon, la corre hacia abajo en pasos de SeparacionDivisionPx
    // hasta encontrar un lugar libre. Sin esto, el offset fijo que usan las
    // divisiones (ver SeparacionDivisionPx) podia terminar exactamente
    // arriba de una mesa vecina no relacionada en un plano muy cargado,
    // dejando las dos literalmente superpuestas — e imposibles de
    // seleccionar por separado, porque la que queda arriba en el orden de
    // dibujo capta todos los clicks de esa zona. excluirIds deja afuera a la
    // mesa que se esta dividiendo (es normal y esperado que la nueva mitad
    // aparezca pegada a ella).
    private async Task<(double x, double y)> AlejarDeVecinasAsync(int salonId, double x, double y, params int[] excluirIds)
    {
        var vecinas = await _db.Mesas
            .Where(m => m.SalonId == salonId && !m.EsTemporal && m.Capacidad > 0
                && !excluirIds.Contains(m.Id) && m.PosX != null && m.PosY != null)
            .Select(m => new { PosX = m.PosX!.Value, PosY = m.PosY!.Value })
            .ToListAsync();

        for (var intento = 0; intento < IntentosMaximosDeAlejar; intento++)
        {
            var chocaConAlguna = vecinas.Any(v =>
                Math.Abs(v.PosX - x) < DistanciaMinimaEntreMesas && Math.Abs(v.PosY - y) < DistanciaMinimaEntreMesas);
            if (!chocaConAlguna) return (x, y);
            y += SeparacionDivisionPx;
        }
        return (x, y);
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
        // Igual que MetaController.GetMeta (que arma esta misma lista en el
        // primer fetch): las mesas TEMPORALES (divisiones por turno) no van
        // aca — son propias de un turno puntual, no del "mobiliario por
        // default" del salon que administra /admin/mesas. Sin este filtro,
        // cualquier broadcast global terminaba pisando el estado ya
        // correctamente filtrado del primer fetch con una lista que
        // mezclaba mesas de turnos distintos (incluso con codigos
        // repetidos, ahora que dos turnos pueden compartir "52a").
        var mesas = await _db.Mesas
            .Where(m => !m.EsTemporal)
            .OrderBy(m => m.Orden)
            .Select(m => new MesaDto(m.Id, m.Codigo, m.Capacidad, m.MesaPadreId, m.Orden, m.PosX, m.PosY, m.SalonId, m.EsTemporal, m.Forma, m.Fijada, m.Rotacion))
            .ToListAsync();
        await _hub.Clients.All.SendAsync("MesasActualizado", mesas);
        return mesas;
    }

    // Mismo patron que ReservasController.BroadcastTurnoAsync: recalcula
    // el turno completo (con la lista de mesas ya resuelta segun si hay una
    // division por turno activa) y lo empuja al grupo fecha:turno:salon,
    // para que la pantalla de reservas se actualice en vivo sin recargar.
    private async Task BroadcastTurnoAsync(DateOnly fecha, Turno turno, int salonId)
    {
        var data = await _diaService.GetTurnoAsync(fecha, turno, salonId);
        var grupo = ReservasHub.GrupoDe(fecha.ToString("yyyy-MM-dd"), turno.ToString().ToLowerInvariant(), salonId);
        await _hub.Clients.Group(grupo).SendAsync("TurnoActualizado", data);
    }
}