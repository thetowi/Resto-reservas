using Barrancas.Api.Data;
using Barrancas.Api.Models;
using Barrancas.Api.Services;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace Barrancas.Api.Tests;

public class DiaServiceTests
{
    private static BarrancasDbContext CrearDbEnMemoria()
    {
        var options = new DbContextOptionsBuilder<BarrancasDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        return new BarrancasDbContext(options);
    }

    private static async Task<int> CrearSalonAsync(BarrancasDbContext db)
    {
        var salon = new Salon { Nombre = "Test", Orden = 0 };
        db.Salones.Add(salon);
        await db.SaveChangesAsync();
        return salon.Id;
    }

    [Fact]
    public async Task SeedTurnoSiVacio_crea_26_filas_con_los_horarios_default()
    {
        await using var db = CrearDbEnMemoria();
        var salonId = await CrearSalonAsync(db);
        var service = new DiaService(db);
        var fecha = new DateOnly(2026, 1, 1);

        await service.SeedTurnoSiVacioAsync(fecha, Turno.Almuerzo, salonId);

        var filas = await db.Reservas
            .Where(r => r.Fecha == fecha && r.Turno == Turno.Almuerzo)
            .OrderBy(r => r.Orden)
            .ToListAsync();

        Assert.Equal(26, filas.Count);
        Assert.Equal(HorariosDefault.Almuerzo, filas.Select(f => f.Hora));
        Assert.All(filas, f => Assert.False(f.Asistio));
        Assert.All(filas, f => Assert.Null(f.MesaId));
    }

    [Fact]
    public async Task SeedTurnoSiVacio_no_duplica_filas_si_ya_hay_datos()
    {
        await using var db = CrearDbEnMemoria();
        var salonId = await CrearSalonAsync(db);
        var service = new DiaService(db);
        var fecha = new DateOnly(2026, 1, 1);

        await service.SeedTurnoSiVacioAsync(fecha, Turno.Cena, salonId);
        var countInicial = await db.Reservas.CountAsync(r => r.Fecha == fecha && r.Turno == Turno.Cena);

        await service.SeedTurnoSiVacioAsync(fecha, Turno.Cena, salonId);
        var countFinal = await db.Reservas.CountAsync(r => r.Fecha == fecha && r.Turno == Turno.Cena);

        Assert.Equal(26, countInicial);
        Assert.Equal(countInicial, countFinal);
    }

    [Fact]
    public async Task GetTurno_calcula_totales_y_mesas_ocupadas_correctamente()
    {
        await using var db = CrearDbEnMemoria();
        var salonId = await CrearSalonAsync(db);
        var mesa11 = new Mesa { Codigo = "11", Orden = 0, SalonId = salonId };
        var mesa12 = new Mesa { Codigo = "12", Orden = 1, SalonId = salonId };
        db.Mesas.AddRange(mesa11, mesa12);
        await db.SaveChangesAsync();

        var service = new DiaService(db);
        var fecha = new DateOnly(2026, 1, 1);
        await service.SeedTurnoSiVacioAsync(fecha, Turno.Almuerzo, salonId);

        var filas = await db.Reservas
            .Where(r => r.Fecha == fecha && r.Turno == Turno.Almuerzo)
            .OrderBy(r => r.Orden)
            .ToListAsync();

        // Reserva 1: mesa 11, 4 pax, asistio
        filas[0].MesaId = mesa11.Id;
        filas[0].Pax = 4;
        filas[0].Asistio = true;

        // Reserva 2: mesa 12, 2 pax, no asistio (todavia)
        filas[1].MesaId = mesa12.Id;
        filas[1].Pax = 2;
        filas[1].Asistio = false;

        await db.SaveChangesAsync();

        var data = await service.GetTurnoAsync(fecha, Turno.Almuerzo, salonId);

        Assert.Equal(6, data.TotalPax);
        Assert.Equal(4, data.TotalAsistio);
        Assert.Equal(new[] { mesa11.Id, mesa12.Id }, data.MesasOcupadas.OrderBy(x => x));
    }

    [Fact]
    public void HorariosDefault_tiene_26_franjas_por_turno()
    {
        Assert.Equal(26, HorariosDefault.Almuerzo.Length);
        Assert.Equal(26, HorariosDefault.Cena.Length);
    }
}
