using System.Net;
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
/// Link publico de reservas (/api/publico): sin login, solo salones activos,
/// consultar no crea filas, y las mismas reglas de confirmacion que el bot.
/// </summary>
public class ReservasPublicasEndpointsTests : IClassFixture<BarrancasWebApplicationFactory>
{
    private readonly BarrancasWebApplicationFactory _factory;

    public ReservasPublicasEndpointsTests(BarrancasWebApplicationFactory factory)
    {
        _factory = factory;
    }

    private static DateOnly EnDias(int dias) => ReservaOnlineService.HoyLocal().AddDays(dias);

    private async Task<int> SalonRestaurantIdAsync()
    {
        var client = _factory.CreateClient();
        var config = await client.GetFromJsonAsync<PublicoConfigDto>("/api/publico/config");
        Assert.NotNull(config);
        return config!.Salones.Single(s => s.Nombre == "Restaurant").Id;
    }

    private static PublicoReservaRequest Pedido(DateOnly fecha, int salonId, int pax, string hora = "21:00", bool acepta = true) =>
        new(fecha, salonId, "cena", hora, pax, "Laura Gómez", "11 5555-" + Random.Shared.Next(1000, 9999), null, "Aniversario", null, acepta, null);

    [Fact]
    public async Task Config_no_requiere_login_y_trae_el_restaurant()
    {
        var client = _factory.CreateClient();

        var config = await client.GetFromJsonAsync<PublicoConfigDto>("/api/publico/config");

        Assert.NotNull(config);
        var restaurant = Assert.Single(config!.Salones, s => s.Nombre == "Restaurant");
        Assert.True(restaurant.ConfirmaSola);
        Assert.Equal("12:30", config.Horarios["almuerzo"].First());
        Assert.Equal("14:00", config.Horarios["almuerzo"].Last());
        Assert.Equal("20:30", config.Horarios["cena"].First());
        Assert.Equal("22:00", config.Horarios["cena"].Last());
    }

    [Fact]
    public async Task Dias_del_calendario_llegan_hasta_60_dias_adelante()
    {
        var client = _factory.CreateClient();

        var dias = await client.GetFromJsonAsync<List<PublicoDiaDto>>($"/api/publico/dias?pax=2&cantidad={ReservaOnlineService.DiasAdelante + 1}");

        Assert.Equal(60, ReservaOnlineService.DiasAdelante);
        Assert.Equal(61, dias!.Count);
        Assert.Equal(EnDias(60), dias.Last().Fecha);
    }

    [Fact]
    public async Task Consultar_disponibilidad_no_crea_filas()
    {
        var client = _factory.CreateClient();
        var fecha = EnDias(10);

        var res = await client.GetFromJsonAsync<PublicoDisponibilidadDto>($"/api/publico/disponibilidad?fecha={fecha:yyyy-MM-dd}&pax=2");

        Assert.NotNull(res);
        Assert.Contains(res!.Salones, s => s.HayLugar);
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<BarrancasDbContext>();
        Assert.False(await db.Reservas.AnyAsync(r => r.Fecha == fecha));
    }

    [Fact]
    public async Task Reservar_pocas_personas_en_restaurant_se_confirma_y_asigna_mesa()
    {
        var client = _factory.CreateClient();
        var salonId = await SalonRestaurantIdAsync();
        var fecha = EnDias(5);

        var res = await client.PostAsJsonAsync("/api/publico/reservas", Pedido(fecha, salonId, 2));

        res.EnsureSuccessStatusCode();
        var body = await res.Content.ReadFromJsonAsync<PublicoReservaResultado>();
        Assert.Equal("confirmada", body!.Estado);

        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<BarrancasDbContext>();
        var reserva = await db.Reservas.Include(r => r.ReservaMesas)
            .SingleAsync(r => r.Fecha == fecha && r.Nombre == "Laura Gómez");
        Assert.Equal(OrigenReserva.Web, reserva.Origen);
        Assert.Equal(EstadoReserva.Confirmada, reserva.Estado);
        Assert.Single(reserva.ReservaMesas);
        Assert.Equal("21:00", reserva.Hora);
    }

    [Fact]
    public async Task Reservar_grupo_grande_queda_como_solicitud()
    {
        var client = _factory.CreateClient();
        var salonId = await SalonRestaurantIdAsync();

        var res = await client.PostAsJsonAsync("/api/publico/reservas", Pedido(EnDias(6), salonId, 8));

        res.EnsureSuccessStatusCode();
        var body = await res.Content.ReadFromJsonAsync<PublicoReservaResultado>();
        Assert.Equal("pendiente", body!.Estado);
    }

    [Fact]
    public async Task Reservar_sin_aceptar_privacidad_devuelve_400()
    {
        var client = _factory.CreateClient();
        var salonId = await SalonRestaurantIdAsync();

        var res = await client.PostAsJsonAsync("/api/publico/reservas", Pedido(EnDias(7), salonId, 2, acepta: false));

        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
    }

    [Fact]
    public async Task Reservar_en_fecha_bloqueada_devuelve_400()
    {
        var fecha = EnDias(8);
        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<BarrancasDbContext>();
            db.FechasBloqueadasBot.Add(new FechaBloqueadaBot { Fecha = fecha, Motivo = "Evento" });
            await db.SaveChangesAsync();
        }
        var client = _factory.CreateClient();
        var salonId = await SalonRestaurantIdAsync();

        var res = await client.PostAsJsonAsync("/api/publico/reservas", Pedido(fecha, salonId, 2));

        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
    }

    [Fact]
    public async Task Reservar_horario_que_no_es_de_la_planilla_devuelve_400()
    {
        var client = _factory.CreateClient();
        var salonId = await SalonRestaurantIdAsync();

        var res = await client.PostAsJsonAsync("/api/publico/reservas", Pedido(EnDias(9), salonId, 2, hora: "23:30"));

        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
    }
}
