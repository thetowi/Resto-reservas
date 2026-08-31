using System.Net.Http.Headers;
using System.Net.Http.Json;
using Barrancas.Api.Data;
using Barrancas.Api.Dtos;
using Xunit;

namespace Barrancas.Api.Tests;

public class ElementosPlanoEndpointsTests : IClassFixture<BarrancasWebApplicationFactory>
{
    private readonly BarrancasWebApplicationFactory _factory;

    public ElementosPlanoEndpointsTests(BarrancasWebApplicationFactory factory)
    {
        _factory = factory;
    }

    private async Task<HttpClient> ClienteAutenticadoAsync()
    {
        var client = _factory.CreateClient();
        var login = await client.PostAsJsonAsync("/api/auth/login",
            new LoginRequest("admin", "admin"));
        login.EnsureSuccessStatusCode();
        var body = await login.Content.ReadFromJsonAsync<LoginResponse>();
        Assert.NotNull(body);
        client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", body!.Token);
        return client;
    }

    // Todos los tests operan sobre el salon default sembrado por DbSeeder.
    private static async Task<int> ObtenerSalonIdAsync(HttpClient client)
    {
        var meta = await client.GetFromJsonAsync<MetaDto>("/api/meta");
        return meta!.Salones[0].Id;
    }

    [Fact]
    public async Task Crear_agrega_un_elemento_con_la_etiqueta_pedida()
    {
        var client = await ClienteAutenticadoAsync();
        var salonId = await ObtenerSalonIdAsync(client);

        var res = await client.PostAsJsonAsync("/api/elementos-plano",
            new CrearElementoPlanoRequest("Cocina", 40, 60, salonId));
        res.EnsureSuccessStatusCode();
        var lista = await res.Content.ReadFromJsonAsync<List<ElementoPlanoDto>>();

        var nuevo = Assert.Single(lista!, e => e.Etiqueta == "Cocina");
        Assert.Equal(40, nuevo.PosX);
        Assert.Equal(60, nuevo.PosY);
    }

    [Fact]
    public async Task Actualizar_mueve_y_redimensiona_el_elemento()
    {
        var client = await ClienteAutenticadoAsync();
        var salonId = await ObtenerSalonIdAsync(client);
        var creado = await client.PostAsJsonAsync("/api/elementos-plano",
            new CrearElementoPlanoRequest("Ventana", 0, 0, salonId));
        var elemento = (await creado.Content.ReadFromJsonAsync<List<ElementoPlanoDto>>())!.Last();

        var res = await client.PatchAsJsonAsync($"/api/elementos-plano/{elemento.Id}",
            new ActualizarElementoPlanoRequest(null, 150, 200, 120, 80));
        res.EnsureSuccessStatusCode();
        var lista = await res.Content.ReadFromJsonAsync<List<ElementoPlanoDto>>();

        var actualizado = lista!.Single(e => e.Id == elemento.Id);
        Assert.Equal(150, actualizado.PosX);
        Assert.Equal(200, actualizado.PosY);
        Assert.Equal(120, actualizado.Ancho);
        Assert.Equal(80, actualizado.Alto);
    }

    [Fact]
    public async Task Borrar_saca_el_elemento_de_la_lista()
    {
        var client = await ClienteAutenticadoAsync();
        var salonId = await ObtenerSalonIdAsync(client);
        var creado = await client.PostAsJsonAsync("/api/elementos-plano",
            new CrearElementoPlanoRequest("Bodega", 10, 10, salonId));
        var elemento = (await creado.Content.ReadFromJsonAsync<List<ElementoPlanoDto>>())!.Last();

        var res = await client.DeleteAsync($"/api/elementos-plano/{elemento.Id}");
        res.EnsureSuccessStatusCode();
        var lista = await res.Content.ReadFromJsonAsync<List<ElementoPlanoDto>>();

        Assert.DoesNotContain(lista!, e => e.Id == elemento.Id);
    }
}
