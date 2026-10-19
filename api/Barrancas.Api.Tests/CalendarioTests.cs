using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Barrancas.Api.Dtos;
using Barrancas.Api.Services;
using Xunit;

namespace Barrancas.Api.Tests;

/// <summary>
/// Calendario del encabezado del panel (GET /api/calendario): reservas y
/// gente por dia, sumando salones y turnos, para todo el equipo.
/// </summary>
public class CalendarioTests : IClassFixture<BarrancasWebApplicationFactory>
{
    private readonly BarrancasWebApplicationFactory _factory;

    public CalendarioTests(BarrancasWebApplicationFactory factory)
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

    private static async Task ReservarAsync(HttpClient client, DateOnly fecha, int pax, string nombre)
    {
        var config = await client.GetFromJsonAsync<PublicoConfigDto>("/api/publico/config");
        var salonId = config!.Salones.Single(s => s.Nombre == "Restaurant").Id;
        var res = await client.PostAsJsonAsync("/api/publico/reservas",
            new PublicoReservaRequest(fecha, salonId, "cena", "21:00", pax, nombre, "11 4666-" + Random.Shared.Next(1000, 9999), null, null, null, true, null));
        res.EnsureSuccessStatusCode();
    }

    private static string Iso(DateOnly d) => d.ToString("yyyy-MM-dd");

    [Fact]
    public async Task Suma_reservas_y_gente_por_dia_y_lo_ve_el_staff()
    {
        var dia = ReservaOnlineService.HoyLocal().AddDays(11);
        var publico = _factory.CreateClient();
        await ReservarAsync(publico, dia, 2, "Ana Paz");
        await ReservarAsync(publico, dia, 4, "Bruno Gil");

        var staff = await ClienteAsync("staff");
        var dias = await staff.GetFromJsonAsync<List<CalendarioDiaDto>>(
            $"/api/calendario?desde={Iso(dia.AddDays(-3))}&hasta={Iso(dia.AddDays(3))}");

        var d = Assert.Single(dias!, x => x.Fecha == dia);
        Assert.Equal(2, d.Reservas);
        Assert.Equal(6, d.Pax);
        // Las filas vacias de los otros dias no cuentan.
        Assert.DoesNotContain(dias!, x => x.Pax == 0);
    }

    [Fact]
    public async Task Un_rango_muy_largo_o_al_reves_se_rechaza()
    {
        var staff = await ClienteAsync("staff");
        Assert.Equal(HttpStatusCode.BadRequest, (await staff.GetAsync("/api/calendario?desde=2026-01-01&hasta=2026-06-01")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await staff.GetAsync("/api/calendario?desde=2026-02-10&hasta=2026-02-01")).StatusCode);
    }

    [Fact]
    public async Task Sin_sesion_no_se_puede()
    {
        var res = await _factory.CreateClient().GetAsync("/api/calendario?desde=2026-02-01&hasta=2026-02-10");
        Assert.Equal(HttpStatusCode.Unauthorized, res.StatusCode);
    }
}
