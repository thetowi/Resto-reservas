using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Barrancas.Api.Data;
using Barrancas.Api.Dtos;
using Barrancas.Api.Models;
using Xunit;

namespace Barrancas.Api.Tests;

public class EsperaEndpointsTests : IClassFixture<BarrancasWebApplicationFactory>
{
    private readonly BarrancasWebApplicationFactory _factory;

    public EsperaEndpointsTests(BarrancasWebApplicationFactory factory)
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
    public async Task Lista_arranca_vacia_para_un_dia_sin_espera()
    {
        var client = await ClienteAutenticadoAsync();
        var salonId = await ObtenerSalonIdAsync(client);
        var lista = await client.GetFromJsonAsync<List<EsperaDto>>($"/api/espera/2026-06-01/almuerzo?salonId={salonId}");
        Assert.NotNull(lista);
        Assert.Empty(lista!);
    }

    [Fact]
    public async Task Crear_asigna_orden_de_llegada_creciente()
    {
        var client = await ClienteAutenticadoAsync();
        var salonId = await ObtenerSalonIdAsync(client);
        var fecha = DateOnly.Parse("2026-06-02");

        var r1 = await client.PostAsJsonAsync("/api/espera",
            new CrearEsperaRequest(fecha, Turno.Cena, salonId, "Gomez", "305", 2));
        r1.EnsureSuccessStatusCode();
        var r2 = await client.PostAsJsonAsync("/api/espera",
            new CrearEsperaRequest(fecha, Turno.Cena, salonId, "Diaz", null, 4));
        r2.EnsureSuccessStatusCode();

        var lista = await r2.Content.ReadFromJsonAsync<List<EsperaDto>>();

        Assert.NotNull(lista);
        Assert.Equal(2, lista!.Count);
        Assert.Equal("Gomez", lista[0].Nombre);
        Assert.Equal("Diaz", lista[1].Nombre);
        Assert.True(lista[0].Orden < lista[1].Orden);
    }

    [Fact]
    public async Task Borrar_una_entrada_no_reordena_las_demas()
    {
        var client = await ClienteAutenticadoAsync();
        var salonId = await ObtenerSalonIdAsync(client);
        var fecha = DateOnly.Parse("2026-06-03");

        await client.PostAsJsonAsync("/api/espera", new CrearEsperaRequest(fecha, Turno.Almuerzo, salonId, "Primero", null, 2));
        var segundo = await client.PostAsJsonAsync("/api/espera", new CrearEsperaRequest(fecha, Turno.Almuerzo, salonId, "Segundo", null, 3));
        await client.PostAsJsonAsync("/api/espera", new CrearEsperaRequest(fecha, Turno.Almuerzo, salonId, "Tercero", null, 1));

        var listaInicial = await segundo.Content.ReadFromJsonAsync<List<EsperaDto>>();
        var idSegundo = listaInicial!.Single(e => e.Nombre == "Segundo").Id;

        var borrado = await client.DeleteAsync($"/api/espera/{idSegundo}");
        borrado.EnsureSuccessStatusCode();
        var listaFinal = await borrado.Content.ReadFromJsonAsync<List<EsperaDto>>();

        Assert.Equal(new[] { "Primero", "Tercero" }, listaFinal!.Select(e => e.Nombre));
    }

    [Fact]
    public async Task Actualizar_pax_persiste_el_nuevo_valor()
    {
        var client = await ClienteAutenticadoAsync();
        var salonId = await ObtenerSalonIdAsync(client);
        var fecha = DateOnly.Parse("2026-06-04");

        var creada = await client.PostAsJsonAsync("/api/espera",
            new CrearEsperaRequest(fecha, Turno.Cena, salonId, "Lopez", "12", 2));
        var entrada = (await creada.Content.ReadFromJsonAsync<List<EsperaDto>>())!.Single();

        var patch = await client.PatchAsJsonAsync($"/api/espera/{entrada.Id}",
            new ActualizarEsperaRequest(null, null, OptionalInt.Of(5), null));
        patch.EnsureSuccessStatusCode();
        var lista = await patch.Content.ReadFromJsonAsync<List<EsperaDto>>();

        Assert.Equal(5, lista!.Single(e => e.Id == entrada.Id).Pax);
    }

    [Fact]
    public async Task Marcar_ubicada_no_saca_la_entrada_de_la_lista()
    {
        var client = await ClienteAutenticadoAsync();
        var salonId = await ObtenerSalonIdAsync(client);
        var fecha = DateOnly.Parse("2026-06-05");

        var creada = await client.PostAsJsonAsync("/api/espera",
            new CrearEsperaRequest(fecha, Turno.Cena, salonId, "Diaz", "14", 3));
        var entrada = (await creada.Content.ReadFromJsonAsync<List<EsperaDto>>())!.Single();
        Assert.False(entrada.Ubicada);

        var patch = await client.PatchAsJsonAsync($"/api/espera/{entrada.Id}",
            new ActualizarEsperaRequest(null, null, OptionalInt.Unset, true));
        patch.EnsureSuccessStatusCode();
        var lista = await patch.Content.ReadFromJsonAsync<List<EsperaDto>>();

        // Sigue en la lista (no se borro), solo marcada.
        var actualizada = Assert.Single(lista!, e => e.Id == entrada.Id);
        Assert.True(actualizada.Ubicada);
    }
}
