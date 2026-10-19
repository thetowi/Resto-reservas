using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Barrancas.Api.Dtos;
using Xunit;

namespace Barrancas.Api.Tests;

/// <summary>
/// Datos del restaurante (/api/datos-restaurante): el Admin carga la
/// ubicacion y el link de reservas la recibe en /api/publico/config.
/// </summary>
public class DatosRestauranteTests : IClassFixture<BarrancasWebApplicationFactory>
{
    private readonly BarrancasWebApplicationFactory _factory;

    public DatosRestauranteTests(BarrancasWebApplicationFactory factory)
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

    [Fact]
    public async Task El_admin_carga_la_ubicacion_y_el_link_la_recibe()
    {
        var admin = await ClienteAsync("admin");

        var res = await admin.PutAsJsonAsync("/api/datos-restaurante",
            new GuardarDatosRestauranteRequest("  Av. Costanera 1234, San Isidro  ", "https://maps.app.goo.gl/abc", "", null));

        res.EnsureSuccessStatusCode();
        var guardado = await res.Content.ReadFromJsonAsync<DatosRestauranteDto>();
        Assert.Equal("Av. Costanera 1234, San Isidro", guardado!.Direccion);
        Assert.Null(guardado.AppleMapsUrl);
        Assert.Equal("Admin", guardado.UpdatedBy);

        var config = await _factory.CreateClient().GetFromJsonAsync<PublicoConfigDto>("/api/publico/config");
        Assert.NotNull(config!.Ubicacion);
        Assert.Equal("Av. Costanera 1234, San Isidro", config.Ubicacion!.Direccion);
        Assert.Equal("https://maps.app.goo.gl/abc", config.Ubicacion.GoogleMapsUrl);
    }

    [Fact]
    public async Task El_staff_la_ve_pero_no_la_cambia()
    {
        var staff = await ClienteAsync("staff");

        (await staff.GetAsync("/api/datos-restaurante")).EnsureSuccessStatusCode();
        var res = await staff.PutAsJsonAsync("/api/datos-restaurante", new GuardarDatosRestauranteRequest("x", null, null, null));

        Assert.Equal(HttpStatusCode.Forbidden, res.StatusCode);
    }

    [Fact]
    public async Task Un_link_que_no_es_web_se_rechaza()
    {
        var admin = await ClienteAsync("admin");

        var res = await admin.PutAsJsonAsync("/api/datos-restaurante",
            new GuardarDatosRestauranteRequest("Av. Costanera 1234", "javascript:alert(1)", null, null));

        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
    }
}
