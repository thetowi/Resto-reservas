using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using Barrancas.Api.Dtos;
using Barrancas.Api.Models;
using Barrancas.Api.Services;
using Xunit;

namespace Barrancas.Api.Tests;

/// <summary>
/// Fechas sin reservas web (FechasBloqueadasBotController): cerrar un dia o
/// un turno para el link, con el mensaje que ve el cliente.
/// </summary>
public class FechasSinReservasWebTests : IClassFixture<BarrancasWebApplicationFactory>
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web)
    {
        Converters = { new JsonStringEnumConverter(JsonNamingPolicy.CamelCase) },
    };

    private readonly BarrancasWebApplicationFactory _factory;

    public FechasSinReservasWebTests(BarrancasWebApplicationFactory factory)
    {
        _factory = factory;
    }

    private static DateOnly EnDias(int dias) => ReservaOnlineService.HoyLocal().AddDays(dias);

    private async Task<HttpClient> AdminAsync()
    {
        var client = _factory.CreateClient();
        var login = await client.PostAsJsonAsync("/api/auth/login", new LoginRequest("admin", "admin"));
        login.EnsureSuccessStatusCode();
        var body = await login.Content.ReadFromJsonAsync<LoginResponse>();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", body!.Token);
        return client;
    }

    private async Task<int> RestaurantAsync(HttpClient client)
    {
        var config = await client.GetFromJsonAsync<PublicoConfigDto>("/api/publico/config");
        return config!.Salones.Single(s => s.Nombre == "Restaurant").Id;
    }

    private static Task<HttpResponseMessage> CerrarAsync(HttpClient client, DateOnly desde, DateOnly? hasta, Turno? turno, string mensaje) =>
        client.PostAsJsonAsync("/api/fechas-bloqueadas-bot",
            new CrearFechaBloqueadaBotRequest(desde, hasta, turno, "Nochebuena", mensaje, true), Json);

    [Fact]
    public async Task Cerrar_un_rango_bloquea_el_link_con_el_mensaje()
    {
        var client = await AdminAsync();
        var desde = EnDias(20);

        var res = await CerrarAsync(client, desde, desde.AddDays(1), null, "Reservas por WhatsApp");

        res.EnsureSuccessStatusCode();
        var lista = await client.GetFromJsonAsync<List<FechaBloqueadaBotDto>>("/api/fechas-bloqueadas-bot", Json);
        Assert.Contains(lista!, f => f.Fecha == desde);
        Assert.Contains(lista!, f => f.Fecha == desde.AddDays(1));

        var dias = await client.GetFromJsonAsync<List<PublicoDiaDto>>("/api/publico/dias?pax=2&cantidad=30");
        var dia = Assert.Single(dias!, d => d.Fecha == desde);
        Assert.Equal("bloqueado", dia.Estado);
        Assert.Equal("Reservas por WhatsApp", dia.Mensaje);

        var salonId = await RestaurantAsync(client);
        var reserva = await client.PostAsJsonAsync("/api/publico/reservas",
            new PublicoReservaRequest(desde, salonId, "cena", "21:00", 2, "Ana Paz", "11 4000-1234", null, null, null, true, null));
        Assert.Equal(HttpStatusCode.BadRequest, reserva.StatusCode);
        Assert.Contains("Reservas por WhatsApp", await reserva.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Cerrar_solo_la_cena_deja_abierto_el_almuerzo()
    {
        var client = await AdminAsync();
        var fecha = EnDias(23);
        (await CerrarAsync(client, fecha, null, Turno.Cena, "La cena se reserva por WhatsApp")).EnsureSuccessStatusCode();

        var disp = await client.GetFromJsonAsync<PublicoDisponibilidadDto>($"/api/publico/disponibilidad?fecha={fecha:yyyy-MM-dd}&pax=2");

        Assert.False(disp!.Bloqueada);
        var salon = disp.Salones.First(s => s.Turnos.Any(t => t.Turno == "cena"));
        Assert.True(salon.Turnos.Single(t => t.Turno == "cena").PorWhatsApp);
        Assert.False(salon.Turnos.Single(t => t.Turno == "almuerzo").PorWhatsApp);
        Assert.Contains(salon.Turnos.Single(t => t.Turno == "almuerzo").Horarios, h => h.Estado != "sin_lugar");
    }

    [Fact]
    public async Task Quitar_la_fecha_vuelve_a_abrir_el_dia()
    {
        var client = await AdminAsync();
        var fecha = EnDias(25);
        var creadas = await (await CerrarAsync(client, fecha, null, null, "x")).Content.ReadFromJsonAsync<List<FechaBloqueadaBotDto>>(Json);

        (await client.DeleteAsync($"/api/fechas-bloqueadas-bot/{creadas!.Single().Id}")).EnsureSuccessStatusCode();

        var dias = await client.GetFromJsonAsync<List<PublicoDiaDto>>("/api/publico/dias?pax=2&cantidad=30");
        Assert.NotEqual("bloqueado", dias!.Single(d => d.Fecha == fecha).Estado);
    }

    [Fact]
    public async Task Cerrar_fechas_requiere_login()
    {
        var res = await CerrarAsync(_factory.CreateClient(), EnDias(27), null, null, "x");
        Assert.Equal(HttpStatusCode.Unauthorized, res.StatusCode);
    }
}
