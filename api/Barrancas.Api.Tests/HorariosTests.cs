using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Barrancas.Api.Data;
using Barrancas.Api.Dtos;
using Barrancas.Api.Models;
using Barrancas.Api.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace Barrancas.Api.Tests;

/// <summary>
/// Horarios por salón (/api/horarios): sin configurar se usan los de siempre;
/// lo que guarda el Admin se aplica de hoy en adelante (días nuevos, link y
/// las filas vacías de los días ya abiertos), sin mover reservas cargadas ni
/// tocar días anteriores a hoy.
/// </summary>
public class HorariosTests : IClassFixture<BarrancasWebApplicationFactory>
{
    private readonly BarrancasWebApplicationFactory _factory;

    public HorariosTests(BarrancasWebApplicationFactory factory)
    {
        _factory = factory;
    }

    private async Task<HttpClient> ClienteAsync(string usuario)
    {
        var client = _factory.CreateClient();
        var login = await client.PostAsJsonAsync("/api/auth/login", new LoginRequest(usuario, usuario));
        login.EnsureSuccessStatusCode();
        var body = await login.Content.ReadFromJsonAsync<LoginResponse>();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", body!.Token);
        return client;
    }

    private async Task<int> RestaurantIdAsync()
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<BarrancasDbContext>();
        return (await db.Salones.FirstAsync(s => s.Nombre == "Restaurant")).Id;
    }

    private async Task<List<string>> FilasDelDiaAsync(DateOnly fecha, Turno turno, int salonId)
    {
        using var scope = _factory.Services.CreateScope();
        var dia = scope.ServiceProvider.GetRequiredService<DiaService>();
        await dia.SeedTurnoSiVacioAsync(fecha, turno, salonId);
        var db = scope.ServiceProvider.GetRequiredService<BarrancasDbContext>();
        return await db.Reservas
            .Where(r => r.Fecha == fecha && r.Turno == turno && r.SalonId == salonId)
            .OrderBy(r => r.Orden)
            .Select(r => r.Hora!)
            .ToListAsync();
    }

    private static readonly List<FranjaHorariaDto> CenaNueva =
    [
        new("20:00", 2),
        new("21:00", 3),
        new("22:30", 1),
    ];

    [Fact]
    public async Task Sin_configurar_devuelve_los_de_siempre()
    {
        var admin = await ClienteAsync("admin");
        var salonId = await RestaurantIdAsync();

        var res = await admin.GetFromJsonAsync<HorariosSalonDto>($"/api/horarios?salonId={salonId}");

        var cena = res!.Turnos.Single(t => t.Turno == "cena");
        Assert.False(cena.Personalizado);
        Assert.Equal("20:30", cena.Horarios.First().Hora);
        Assert.Equal(4, cena.Horarios.First().Filas);
        Assert.Equal(HorariosDefault.Cena.Length, cena.Horarios.Sum(h => h.Filas));
    }

    [Fact]
    public async Task Lo_guardado_se_aplica_de_hoy_en_adelante_sin_mover_reservas()
    {
        var admin = await ClienteAsync("admin");
        var salonId = await RestaurantIdAsync();
        var hoy = ReservaOnlineService.HoyLocal();
        var pasado = hoy.AddDays(-3);
        var yaAbierto = hoy.AddDays(20);
        var nuevo = hoy.AddDays(21);

        // Un día anterior y uno futuro que ya tenían la planilla abierta con
        // los horarios de siempre; en el futuro hay una reserva a las 20:30.
        Assert.Equal(HorariosDefault.Cena.Length, (await FilasDelDiaAsync(pasado, Turno.Cena, salonId)).Count);
        await FilasDelDiaAsync(yaAbierto, Turno.Cena, salonId);
        int reservaId;
        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<BarrancasDbContext>();
            var fila = await db.Reservas.FirstAsync(r => r.Fecha == yaAbierto && r.Turno == Turno.Cena && r.SalonId == salonId && r.Hora == "20:30");
            fila.Pax = 2;
            fila.Nombre = "Gómez";
            await db.SaveChangesAsync();
            reservaId = fila.Id;
        }

        var res = await admin.PutAsJsonAsync($"/api/horarios/{salonId}/cena", new GuardarHorariosRequest(CenaNueva));
        res.EnsureSuccessStatusCode();
        var guardado = await res.Content.ReadFromJsonAsync<HorariosSalonDto>();
        Assert.True(guardado!.Turnos.Single(t => t.Turno == "cena").Personalizado);
        Assert.True(guardado.DiasActualizados >= 1);

        // Día ya abierto: horarios nuevos y la reserva de las 20:30 intacta.
        Assert.Equal(new[] { "20:00", "20:00", "20:30", "21:00", "21:00", "21:00", "22:30" }, await FilasDelDiaAsync(yaAbierto, Turno.Cena, salonId));
        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<BarrancasDbContext>();
            var fila = await db.Reservas.SingleAsync(r => r.Id == reservaId);
            Assert.Equal("Gómez", fila.Nombre);
            Assert.Equal("20:30", fila.Hora);
        }
        // Día nuevo: con los horarios nuevos. Día anterior: como estaba.
        Assert.Equal(new[] { "20:00", "20:00", "21:00", "21:00", "21:00", "22:30" }, await FilasDelDiaAsync(nuevo, Turno.Cena, salonId));
        Assert.Equal(HorariosDefault.Cena.Length, (await FilasDelDiaAsync(pasado, Turno.Cena, salonId)).Count);

        // El link ofrece los horarios nuevos en ese salón.
        var disp = await _factory.CreateClient().GetFromJsonAsync<PublicoDisponibilidadDto>(
            $"/api/publico/disponibilidad?fecha={hoy.AddDays(22):yyyy-MM-dd}&pax=2");
        var cena = disp!.Salones.Single(s => s.SalonId == salonId).Turnos.Single(t => t.Turno == "cena");
        Assert.Equal(new[] { "20:00", "21:00", "22:30" }, cena.Horarios.Select(h => h.Hora).ToList());

        // Restaurar: vuelve a los de siempre, también en los días ya abiertos.
        var restaurar = await admin.DeleteAsync($"/api/horarios/{salonId}/cena");
        restaurar.EnsureSuccessStatusCode();
        var final = await restaurar.Content.ReadFromJsonAsync<HorariosSalonDto>();
        Assert.False(final!.Turnos.Single(t => t.Turno == "cena").Personalizado);
        Assert.Equal(HorariosDefault.Cena.Length, (await FilasDelDiaAsync(nuevo, Turno.Cena, salonId)).Count);
    }

    [Theory]
    [InlineData("25:00", 2)]
    [InlineData("21:00", 0)]
    [InlineData("21:00", 99)]
    public async Task Rechaza_horarios_o_filas_invalidos(string hora, int filas)
    {
        var admin = await ClienteAsync("admin");
        var salonId = await RestaurantIdAsync();

        var res = await admin.PutAsJsonAsync($"/api/horarios/{salonId}/almuerzo",
            new GuardarHorariosRequest([new FranjaHorariaDto(hora, filas)]));

        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
    }

    [Fact]
    public async Task Rechaza_horarios_repetidos_y_la_lista_vacia()
    {
        var admin = await ClienteAsync("admin");
        var salonId = await RestaurantIdAsync();

        var repetidos = await admin.PutAsJsonAsync($"/api/horarios/{salonId}/almuerzo",
            new GuardarHorariosRequest([new FranjaHorariaDto("13:00", 2), new FranjaHorariaDto("13:00", 1)]));
        var vacia = await admin.PutAsJsonAsync($"/api/horarios/{salonId}/almuerzo", new GuardarHorariosRequest([]));

        Assert.Equal(HttpStatusCode.BadRequest, repetidos.StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, vacia.StatusCode);
    }

    [Fact]
    public async Task Staff_no_puede_cambiarlos()
    {
        var staff = await ClienteAsync("staff");
        var salonId = await RestaurantIdAsync();

        var res = await staff.PutAsJsonAsync($"/api/horarios/{salonId}/cena", new GuardarHorariosRequest(CenaNueva));

        Assert.Equal(HttpStatusCode.Forbidden, res.StatusCode);
    }
}
