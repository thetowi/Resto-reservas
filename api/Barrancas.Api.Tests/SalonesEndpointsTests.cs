using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Barrancas.Api.Data;
using Barrancas.Api.Dtos;
using Xunit;

namespace Barrancas.Api.Tests;

public class SalonesEndpointsTests : IClassFixture<BarrancasWebApplicationFactory>
{
    private readonly BarrancasWebApplicationFactory _factory;

    public SalonesEndpointsTests(BarrancasWebApplicationFactory factory)
    {
        _factory = factory;
    }

    private async Task<HttpClient> ClienteAutenticadoAsync() => await LoginComoAsync("admin", "admin");

    private async Task<HttpClient> ClienteStaffAsync() => await LoginComoAsync("staff", "staff");

    private async Task<HttpClient> LoginComoAsync(string username, string password)
    {
        var client = _factory.CreateClient();
        var login = await client.PostAsJsonAsync("/api/auth/login", new LoginRequest(username, password));
        login.EnsureSuccessStatusCode();
        var body = await login.Content.ReadFromJsonAsync<LoginResponse>();
        Assert.NotNull(body);
        client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", body!.Token);
        return client;
    }

    [Fact]
    public async Task GetLista_incluye_el_salon_default_sembrado()
    {
        // Staff tambien puede LEER la lista (la necesita para el selector),
        // aunque no pueda crear/editar/borrar salones.
        var client = await ClienteStaffAsync();

        var lista = await client.GetFromJsonAsync<List<SalonDto>>("/api/salones");

        Assert.NotNull(lista);
        Assert.Contains(lista!, s => s.Nombre == "Restaurant");
    }

    [Fact]
    public async Task Crear_como_staff_devuelve_403()
    {
        var client = await ClienteStaffAsync();

        var res = await client.PostAsJsonAsync("/api/salones", new CrearSalonRequest("Bar"));

        Assert.Equal(HttpStatusCode.Forbidden, res.StatusCode);
    }

    [Fact]
    public async Task Crear_agrega_un_salon_nuevo()
    {
        var client = await ClienteAutenticadoAsync();

        var res = await client.PostAsJsonAsync("/api/salones", new CrearSalonRequest("Aqua Bar"));
        res.EnsureSuccessStatusCode();
        var lista = await res.Content.ReadFromJsonAsync<List<SalonDto>>();

        Assert.Contains(lista!, s => s.Nombre == "Aqua Bar");
    }

    [Fact]
    public async Task Crear_con_nombre_repetido_devuelve_400()
    {
        var client = await ClienteAutenticadoAsync();

        var res = await client.PostAsJsonAsync("/api/salones", new CrearSalonRequest("Restaurant"));

        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
    }

    [Fact]
    public async Task Actualizar_renombra_el_salon()
    {
        var client = await ClienteAutenticadoAsync();
        var creado = await client.PostAsJsonAsync("/api/salones", new CrearSalonRequest("Terraza"));
        var salon = (await creado.Content.ReadFromJsonAsync<List<SalonDto>>())!.Single(s => s.Nombre == "Terraza");

        var res = await client.PatchAsJsonAsync($"/api/salones/{salon.Id}",
            new ActualizarSalonRequest("Terraza VIP", null));
        res.EnsureSuccessStatusCode();
        var lista = await res.Content.ReadFromJsonAsync<List<SalonDto>>();

        Assert.Contains(lista!, s => s.Id == salon.Id && s.Nombre == "Terraza VIP");
    }

    [Fact]
    public async Task Borrar_el_unico_salon_devuelve_400()
    {
        var client = await ClienteAutenticadoAsync();
        var lista = await client.GetFromJsonAsync<List<SalonDto>>("/api/salones");

        // Este factory arranca con exactamente un salon sembrado
        // ("Restaurant"): borrarlo tiene que quedar bloqueado porque no
        // puede quedar la app sin ningun salon.
        if (lista!.Count == 1)
        {
            var res = await client.DeleteAsync($"/api/salones/{lista[0].Id}");
            Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
        }
    }

    [Fact]
    public async Task Borrar_un_salon_con_mesas_devuelve_400()
    {
        var client = await ClienteAutenticadoAsync();
        var creado = await client.PostAsJsonAsync("/api/salones", new CrearSalonRequest("Deck"));
        var salon = (await creado.Content.ReadFromJsonAsync<List<SalonDto>>())!.Single(s => s.Nombre == "Deck");
        await client.PostAsJsonAsync("/api/mesas", new CrearMesaRequest("D1", 4, salon.Id));

        var res = await client.DeleteAsync($"/api/salones/{salon.Id}");

        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
    }

    [Fact]
    public async Task Borrar_un_salon_vacio_lo_saca_de_la_lista()
    {
        var client = await ClienteAutenticadoAsync();
        var creado = await client.PostAsJsonAsync("/api/salones", new CrearSalonRequest("Jardín"));
        var salon = (await creado.Content.ReadFromJsonAsync<List<SalonDto>>())!.Single(s => s.Nombre == "Jardín");

        var res = await client.DeleteAsync($"/api/salones/{salon.Id}");
        res.EnsureSuccessStatusCode();
        var lista = await res.Content.ReadFromJsonAsync<List<SalonDto>>();

        Assert.DoesNotContain(lista!, s => s.Id == salon.Id);
    }
}
