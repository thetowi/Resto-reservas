using System.Text.RegularExpressions;
using Barrancas.Api.Data;
using Barrancas.Api.Dtos;
using Barrancas.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace Barrancas.Api.Services;

/// <summary>
/// Estado de los sectores de un salón en un turno (ver Models/SectorTurno.cs):
/// abierto, cerrado o con un grupo que ocupa todas sus mesas. Lo usa el modal
/// «Sectores» del panel (SectoresController.Turno). Después de cada cambio la
/// planilla se achica o se agranda sola (DiaService.AjustarFilasAsync).
/// </summary>
public class SectoresService
{
    private readonly BarrancasDbContext _db;
    private readonly DiaService _dia;
    private readonly ReservaWebService _web;

    public SectoresService(BarrancasDbContext db, DiaService dia, ReservaWebService web)
    {
        _db = db;
        _dia = dia;
        _web = web;
    }

    public const int MaxNombre = 40;
    public const int MaxMotivo = 60;

    // Colores para los sectores nuevos, en orden (el Admin los puede cambiar).
    private static readonly string[] Colores = ["#8a5a2b", "#2f7d6d", "#2f6f9f", "#a33b5c", "#6b7a1f", "#7a4fb3"];

    public static string ColorSugerido(int cantidad) => Colores[cantidad % Colores.Length];

    public static bool ColorValido(string? color) =>
        color is not null && Regex.IsMatch(color, "^#[0-9a-fA-F]{6}$");

    /// <summary>Un pedido que no se puede cumplir (400, o 409 si es un choque).</summary>
    public class ErrorSectores(string mensaje, bool choque = false) : Exception(mensaje)
    {
        public bool Choque { get; } = choque;
    }

    /// <summary>
    /// Deja cada sector pedido en el estado indicado («abierto», «cerrado» o
    /// «grupo») para ese turno. Cerrar o dar a un grupo un sector que tiene
    /// reservas o walk-ins en sus mesas no se puede: hay que moverlas antes.
    /// </summary>
    public async Task AplicarTurnoAsync(SectoresTurnoRequest req, string? usuario)
    {
        if (await _dia.TurnoCerradoAsync(req.Fecha, req.Turno, req.SalonId))
        {
            throw new ErrorSectores("Este turno está cerrado.");
        }

        var sectores = await _db.Sectores.Where(s => s.SalonId == req.SalonId).ToDictionaryAsync(s => s.Id);
        var pedidos = new List<(Sector Sector, EstadoSector? Estado, SectorEstadoRequest Pedido)>();
        foreach (var p in req.Sectores ?? [])
        {
            if (!sectores.TryGetValue(p.SectorId, out var sector)) throw new ErrorSectores("Ese sector no es de este salón.");
            EstadoSector? estado = p.Estado?.Trim().ToLowerInvariant() switch
            {
                "abierto" => null,
                "cerrado" => EstadoSector.Cerrado,
                "grupo" => EstadoSector.Grupo,
                _ => throw new ErrorSectores("Estado inválido: tiene que ser abierto, cerrado o grupo."),
            };
            if (estado == EstadoSector.Grupo) ValidarGrupo(sector, p.Grupo);
            pedidos.Add((sector, estado, p));
        }

        // El turno tiene que tener su planilla para poder cargar el grupo y
        // achicarla.
        await _dia.SeedTurnoSiVacioAsync(req.Fecha, req.Turno, req.SalonId);
        var data = await _dia.GetTurnoAsync(req.Fecha, req.Turno, req.SalonId, sembrar: false);
        var estados = await _db.SectoresTurno
            .Where(x => x.Fecha == req.Fecha && x.Turno == req.Turno && x.SalonId == req.SalonId)
            .ToDictionaryAsync(x => x.SectorId);
        var walkIns = data.MesasWalkIn.ToHashSet();
        var filasUsadas = new HashSet<int>();
        var proximoOrden = data.Reservas.Count == 0 ? 0 : data.Reservas.Max(r => r.Orden) + 1;

        foreach (var (sector, objetivo, pedido) in pedidos)
        {
            var mesasSector = data.Mesas.Where(m => m.SectorId == sector.Id).Select(m => m.Id).ToList();
            estados.TryGetValue(sector.Id, out var actual);

            if (objetivo is null)
            {
                if (actual is null) continue;
                await LiberarAsync(actual, mesasSector);
                _db.SectoresTurno.Remove(actual);
                continue;
            }

            if (mesasSector.Count == 0)
            {
                throw new ErrorSectores($"{sector.Nombre} no tiene mesas: asignáselas en Administrar mesas.");
            }

            // No se cierra ni se le da a un grupo un sector con gente: primero
            // hay que pasar esas reservas a otra mesa.
            var grupoActual = actual?.Estado == EstadoSector.Grupo ? actual.ReservaId : null;
            var ocupadas = data.Reservas
                .Where(r => r.Id != grupoActual && !r.Retirada)
                .SelectMany(r => r.MesaIds)
                .Concat(walkIns)
                .ToHashSet();
            var choques = data.Mesas.Where(m => m.SectorId == sector.Id && ocupadas.Contains(m.Id)).Select(m => m.Codigo).ToList();
            if (choques.Count > 0)
            {
                throw new ErrorSectores(
                    $"{sector.Nombre} tiene reservas o walk-ins en {(choques.Count == 1 ? "la mesa" : "las mesas")} {string.Join(", ", choques)}: pasalas a otra mesa antes.",
                    choque: true);
            }

            if (actual is null)
            {
                actual = new SectorTurno { Fecha = req.Fecha, Turno = req.Turno, SalonId = req.SalonId, SectorId = sector.Id };
                _db.SectoresTurno.Add(actual);
                estados[sector.Id] = actual;
            }
            actual.CreadoEn = DateTime.UtcNow;
            actual.CreadoPor = usuario;

            if (objetivo == EstadoSector.Cerrado)
            {
                if (actual.Estado == EstadoSector.Grupo) await VaciarGrupoAsync(actual);
                var yaReducidas = await _db.MesasReducidas
                    .Where(x => x.Fecha == req.Fecha && x.Turno == req.Turno && mesasSector.Contains(x.MesaId))
                    .Select(x => x.MesaId)
                    .ToListAsync();
                foreach (var mesaId in mesasSector.Except(yaReducidas))
                {
                    _db.MesasReducidas.Add(new MesaReducida { Fecha = req.Fecha, Turno = req.Turno, SalonId = req.SalonId, MesaId = mesaId });
                }
                var motivo = pedido.Motivo?.Trim();
                actual.Estado = EstadoSector.Cerrado;
                actual.Motivo = string.IsNullOrEmpty(motivo) ? null : motivo.Length > MaxMotivo ? motivo[..MaxMotivo] : motivo;
                actual.ReservaId = null;
                continue;
            }

            // Grupo: sus mesas dejan de estar reducidas (las ocupa el grupo)
            // y se carga (o se actualiza) su reserva con todas ellas.
            var reducidas = await _db.MesasReducidas
                .Where(x => x.Fecha == req.Fecha && x.Turno == req.Turno && mesasSector.Contains(x.MesaId))
                .ToListAsync();
            _db.MesasReducidas.RemoveRange(reducidas);

            var g = pedido.Grupo!;
            Reserva? fila = null;
            if (actual.Estado == EstadoSector.Grupo && actual.ReservaId is int id)
            {
                fila = await _db.Reservas.FirstOrDefaultAsync(r => r.Id == id && r.SectorId == sector.Id);
            }
            if (fila is null)
            {
                // La primera fila vacía de esa hora, o una nueva al final.
                var vacia = data.Reservas
                    .Where(r => r.Hora == g.Hora && !filasUsadas.Contains(r.Id) && r.MesaIds.Count == 0 && r.Pax is null
                        && string.IsNullOrWhiteSpace(r.Nombre) && string.IsNullOrWhiteSpace(r.HabTel) && string.IsNullOrWhiteSpace(r.Comentarios))
                    .OrderBy(r => r.Orden)
                    .FirstOrDefault();
                if (vacia is not null)
                {
                    fila = await _db.Reservas.FirstAsync(r => r.Id == vacia.Id);
                }
                else
                {
                    fila = new Reserva { Fecha = req.Fecha, Turno = req.Turno, SalonId = req.SalonId, Orden = proximoOrden++ };
                    _db.Reservas.Add(fila);
                }
                fila.RecibidaEn = DateTime.UtcNow;
                fila.RecibidaPor = usuario;
                fila.Asistio = false;
                fila.Retirada = false;
            }

            fila.Hora = g.Hora.Trim();
            fila.Nombre = g.Nombre.Trim();
            fila.Pax = g.Pax;
            fila.HabTel = string.IsNullOrWhiteSpace(g.HabTel) ? null : g.HabTel.Trim();
            fila.Comentarios = string.IsNullOrWhiteSpace(g.Comentarios) ? null : g.Comentarios.Trim();
            fila.PidioMesa = true; // las mesas del grupo no se reasignan por error
            fila.SectorId = sector.Id;
            fila.Origen = OrigenReserva.Staff;
            fila.Estado = EstadoReserva.Confirmada;
            fila.UpdatedAt = DateTime.UtcNow;
            await _db.SaveChangesAsync();
            filasUsadas.Add(fila.Id);

            var actuales = await _db.ReservaMesas.Where(rm => rm.ReservaId == fila.Id).ToListAsync();
            _db.ReservaMesas.RemoveRange(actuales);
            _db.ReservaMesas.AddRange(mesasSector.Select(mesaId => new ReservaMesa { ReservaId = fila.Id, MesaId = mesaId }));

            actual.Estado = EstadoSector.Grupo;
            actual.Motivo = null;
            actual.ReservaId = fila.Id;
        }

        await _db.SaveChangesAsync();
        await _dia.AjustarFilasAsync(req.Fecha, req.Turno, req.SalonId);
        ReservaOnlineService.InvalidarCache();
    }

    private static void ValidarGrupo(Sector sector, GrupoSectorRequest? g)
    {
        if (g is null || string.IsNullOrWhiteSpace(g.Nombre))
        {
            throw new ErrorSectores($"Poné el nombre del grupo de {sector.Nombre}.");
        }
        if (g.Pax is < 1 or > 1000) throw new ErrorSectores("La cantidad de pax del grupo no es válida.");
        if (string.IsNullOrWhiteSpace(g.Hora) || !Regex.IsMatch(g.Hora.Trim(), "^([01][0-9]|2[0-3]):[0-5][0-9]$"))
        {
            throw new ErrorSectores("Elegí la hora del grupo (hh:mm).");
        }
    }

    // Vuelve a abrir un sector: le saca las reducciones o le vacía la fila
    // del grupo. No guarda.
    private async Task LiberarAsync(SectorTurno actual, List<int> mesasSector)
    {
        if (actual.Estado == EstadoSector.Cerrado)
        {
            var reducidas = await _db.MesasReducidas
                .Where(x => x.Fecha == actual.Fecha && x.Turno == actual.Turno && mesasSector.Contains(x.MesaId))
                .ToListAsync();
            _db.MesasReducidas.RemoveRange(reducidas);
        }
        else
        {
            await VaciarGrupoAsync(actual);
        }
    }

    private async Task VaciarGrupoAsync(SectorTurno actual)
    {
        if (actual.ReservaId is not int id) return;
        var fila = await _db.Reservas.FirstOrDefaultAsync(r => r.Id == id);
        if (fila is not null && fila.SectorId == actual.SectorId) await _web.VaciarFilaAsync(fila);
        actual.ReservaId = null;
    }
}
