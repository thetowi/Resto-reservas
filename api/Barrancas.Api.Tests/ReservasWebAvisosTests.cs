using System.Net.Http.Headers;
using System.Net.Http.Json;
using Barrancas.Api.Dtos;
using Barrancas.Api.Services;
using Xunit;

namespace Barrancas.Api.Tests;

/// <summary>
/// Contador del boton "Reservas web" (GET /api/reservas-web/resumen): nuevas
/// desde la ultima vista, a confirmar, y avisos sin contar dos veces. Clase
/// aparte (base y limite de reservas por hora propios).
/// </summary>
public class ReservasWebAvisosTests : IClassFixture<BarrancasWebApplicationFactory>
{
    private readonly BarrancasWebApplicationFactory _factory;

    public ReservasWebAvisosTests(BarrancasWebApplicationFactory factory)
    {
        _factory = factory;
    }

    private static DateOnly EnDias(int dias) => ReservaOnlineService.HoyLocal().AddDays(dias);

    private async Task<HttpClient> ClienteAutenticadoAsync()
    {
        var client = _factory.CreateClient();
        var login = await client.PostAsJsonAsync("/api/auth/login", new LoginRequest("admin", "admin"));
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
            new PublicoReservaRequest(fecha, salonId, "cena", "21:00", pax, nombre, "11 4555-" + Random.Shared.Next(1000, 9999), null, null, null, true, null));
        res.EnsureSuccessStatusCode();
    }

    private static async Task<ReservaWebResumenDto> ResumenAsync(HttpClient client, string? vistoHasta = null) =>
        (await client.GetFromJsonAsync<ReservaWebResumenDto>(
            "/api/reservas-web/resumen" + (vistoHasta is null ? "" : $"?vistoHasta={Uri.EscapeDataString(vistoHasta)}")))!;

    [Fact]
    public async Task Cuenta_las_nuevas_desde_la_ultima_vista_sin_repetir_las_a_confirmar()
    {
        var client = await ClienteAutenticadoAsync();
        await ReservarAsync(client, EnDias(9), 2, "Ana Paz");
        var visto = (await ResumenAsync(client)).UltimaCreadaEn;
        Assert.NotNull(visto);
        var vistoTexto = visto!.Value.ToString("O");

        // Ya vista: no es nueva.
        Assert.Equal(0, (await ResumenAsync(client, vistoTexto)).Nuevas);

        // Entran dos: una se confirma sola, la otra (8 pax) queda a confirmar.
        await ReservarAsync(client, EnDias(10), 2, "Bruno Gil");
        await ReservarAsync(client, EnDias(10), 8, "Familia Ortiz");

        var resumen = await ResumenAsync(client, vistoTexto);
        Assert.Equal(2, resumen.Nuevas);
        Assert.Equal(1, resumen.AConfirmar);
        Assert.Equal(2, resumen.Avisos); // la de 8 pax es nueva y a confirmar: cuenta una vez
        Assert.True(resumen.UltimaCreadaEn > visto);

        // Sin vistoHasta no cuenta nuevas (solo las a confirmar).
        var sinVista = await ResumenAsync(client);
        Assert.Equal(0, sinVista.Nuevas);
        Assert.Equal(1, sinVista.Avisos);
    }
}
