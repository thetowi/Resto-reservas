using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Barrancas.Api.Data;
using Barrancas.Api.Dtos;
using Xunit;

namespace Barrancas.Api.Tests;

public class MesasEndpointsTests : IClassFixture<BarrancasWebApplicationFactory>
{
    private readonly BarrancasWebApplicationFactory _factory;

    public MesasEndpointsTests(BarrancasWebApplicationFactory factory)
    {
        _factory = factory;
    }

    private async Task<HttpClient> ClienteAutenticadoAsync() => await LoginComoAsync("admin", "admin");

    private async Task<HttpClient> ClienteStaffAsync() => await LoginComoAsync("staff", "staff");

    // Todos los tests operan sobre el salon default sembrado por DbSeeder
    // ("Restaurant"): las mesas base de este archivo viven ahi.
    private static async Task<int> ObtenerSalonIdAsync(HttpClient client)
    {
        var meta = await client.GetFromJsonAsync<MetaDto>("/api/meta");
        return meta!.Salones[0].Id;
    }

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
    public async Task Crear_como_staff_devuelve_403()
    {
        var client = await ClienteStaffAsync();
        var salonId = await ObtenerSalonIdAsync(client);

        var res = await client.PostAsJsonAsync("/api/mesas", new CrearMesaRequest("71", 4, salonId));

        Assert.Equal(HttpStatusCode.Forbidden, res.StatusCode);
    }

    [Fact]
    public async Task Crear_agrega_una_mesa_base_nueva()
    {
        var client = await ClienteAutenticadoAsync();
        var salonId = await ObtenerSalonIdAsync(client);

        var res = await client.PostAsJsonAsync("/api/mesas", new CrearMesaRequest("70", 6, salonId));
        res.EnsureSuccessStatusCode();
        var mesas = await res.Content.ReadFromJsonAsync<List<MesaDto>>();

        Assert.NotNull(mesas);
        var nueva = Assert.Single(mesas!, m => m.Codigo == "70");
        Assert.Equal(6, nueva.Capacidad);
        Assert.Null(nueva.MesaPadreId);
    }

    [Fact]
    public async Task Crear_con_codigo_repetido_devuelve_400()
    {
        var client = await ClienteAutenticadoAsync();
        var salonId = await ObtenerSalonIdAsync(client);

        var res = await client.PostAsJsonAsync("/api/mesas", new CrearMesaRequest("11", 4, salonId));

        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
    }

    [Fact]
    public async Task Dividir_crea_una_mesa_hija_con_su_propia_capacidad()
    {
        var client = await ClienteAutenticadoAsync();
        var meta = await client.GetFromJsonAsync<MetaDto>("/api/meta");
        var mesa24 = meta!.Mesas.Single(m => m.Codigo == "24" && m.MesaPadreId is null);

        var res = await client.PostAsJsonAsync($"/api/mesas/{mesa24.Id}/dividir",
            new DividirMesaRequest("24b", 2));
        res.EnsureSuccessStatusCode();
        var mesas = await res.Content.ReadFromJsonAsync<List<MesaDto>>();

        var hija = Assert.Single(mesas!, m => m.Codigo == "24b");
        Assert.Equal(mesa24.Id, hija.MesaPadreId);
        Assert.Equal(2, hija.Capacidad);
    }

    [Fact]
    public async Task Dividir_una_division_devuelve_400()
    {
        var client = await ClienteAutenticadoAsync();
        var meta = await client.GetFromJsonAsync<MetaDto>("/api/meta");
        var division = meta!.Mesas.Single(m => m.Codigo == "11b");

        var res = await client.PostAsJsonAsync($"/api/mesas/{division.Id}/dividir",
            new DividirMesaRequest("11c", 2));

        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
    }

    [Fact]
    public async Task Actualizar_capacidad_persiste_el_nuevo_valor()
    {
        var client = await ClienteAutenticadoAsync();
        var meta = await client.GetFromJsonAsync<MetaDto>("/api/meta");
        var mesa14 = meta!.Mesas.Single(m => m.Codigo == "14");

        var res = await client.PatchAsJsonAsync($"/api/mesas/{mesa14.Id}",
            new ActualizarMesaRequest(null, 8, null, null));
        res.EnsureSuccessStatusCode();
        var mesas = await res.Content.ReadFromJsonAsync<List<MesaDto>>();

        Assert.Equal(8, mesas!.Single(m => m.Id == mesa14.Id).Capacidad);
    }

    [Fact]
    public async Task Actualizar_posicion_persiste_las_coordenadas()
    {
        var client = await ClienteAutenticadoAsync();
        var meta = await client.GetFromJsonAsync<MetaDto>("/api/meta");
        var mesa21 = meta!.Mesas.Single(m => m.Codigo == "21");

        var res = await client.PatchAsJsonAsync($"/api/mesas/{mesa21.Id}",
            new ActualizarMesaRequest(null, null, 123.5, 87));
        res.EnsureSuccessStatusCode();
        var mesas = await res.Content.ReadFromJsonAsync<List<MesaDto>>();

        var actualizada = mesas!.Single(m => m.Id == mesa21.Id);
        Assert.Equal(123.5, actualizada.PosX);
        Assert.Equal(87, actualizada.PosY);
    }

    [Fact]
    public async Task Dividir_resta_la_capacidad_a_la_mesa_base()
    {
        var client = await ClienteAutenticadoAsync();
        var meta = await client.GetFromJsonAsync<MetaDto>("/api/meta");
        // Seed: mesas base arrancan con 4 pax (ver DbSeeder.CapacidadBaseDefault).
        var mesa22 = meta!.Mesas.Single(m => m.Codigo == "22" && m.MesaPadreId is null);
        Assert.Equal(4, mesa22.Capacidad);

        var res = await client.PostAsJsonAsync($"/api/mesas/{mesa22.Id}/dividir",
            new DividirMesaRequest("22b", 3));
        res.EnsureSuccessStatusCode();
        var mesas = await res.Content.ReadFromJsonAsync<List<MesaDto>>();

        Assert.Equal(1, mesas!.Single(m => m.Id == mesa22.Id).Capacidad);
        Assert.Equal(3, mesas.Single(m => m.Codigo == "22b").Capacidad);
    }

    [Fact]
    public async Task Dividir_con_capacidad_igual_o_mayor_a_la_disponible_devuelve_400()
    {
        var client = await ClienteAutenticadoAsync();
        var meta = await client.GetFromJsonAsync<MetaDto>("/api/meta");
        var mesa23 = meta!.Mesas.Single(m => m.Codigo == "23" && m.MesaPadreId is null);

        var res = await client.PostAsJsonAsync($"/api/mesas/{mesa23.Id}/dividir",
            new DividirMesaRequest("23b", mesa23.Capacidad));

        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
    }

    [Fact]
    public async Task Borrar_una_division_le_devuelve_la_capacidad_a_la_base()
    {
        var client = await ClienteAutenticadoAsync();
        var meta = await client.GetFromJsonAsync<MetaDto>("/api/meta");
        var base11 = meta!.Mesas.Single(m => m.Codigo == "11");
        var division = meta.Mesas.Single(m => m.Codigo == "11b");
        // Seed: "11" (base, 4 pax) dividida en "11b" (2 pax) -> "11" queda en 2.
        Assert.Equal(2, base11.Capacidad);

        var res = await client.DeleteAsync($"/api/mesas/{division.Id}");
        res.EnsureSuccessStatusCode();
        var mesas = await res.Content.ReadFromJsonAsync<List<MesaDto>>();

        Assert.Equal(4, mesas!.Single(m => m.Id == base11.Id).Capacidad);
    }

    [Fact]
    public async Task Borrar_una_mesa_base_con_divisiones_devuelve_400()
    {
        var client = await ClienteAutenticadoAsync();
        var meta = await client.GetFromJsonAsync<MetaDto>("/api/meta");
        var mesa11 = meta!.Mesas.Single(m => m.Codigo == "11");

        var res = await client.DeleteAsync($"/api/mesas/{mesa11.Id}");

        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
    }

    [Fact]
    public async Task Borrar_una_division_la_saca_de_la_lista()
    {
        var client = await ClienteAutenticadoAsync();
        var meta = await client.GetFromJsonAsync<MetaDto>("/api/meta");
        var division = meta!.Mesas.Single(m => m.Codigo == "12b");

        var res = await client.DeleteAsync($"/api/mesas/{division.Id}");
        res.EnsureSuccessStatusCode();
        var mesas = await res.Content.ReadFromJsonAsync<List<MesaDto>>();

        Assert.DoesNotContain(mesas!, m => m.Codigo == "12b");
    }

    [Fact]
    public async Task DividirEnDos_como_staff_funciona()
    {
        // A diferencia del resto de este controller, dividir-en-dos es la
        // unica accion que un Staff puede usar (ver el comentario de rol en
        // MesasController): se llama desde "Mesas disponibles" en la
        // pantalla de reservas, sin pasar por /admin/mesas.
        var client = await ClienteStaffAsync();
        var meta = await client.GetFromJsonAsync<MetaDto>("/api/meta");
        var mesa21 = meta!.Mesas.Single(m => m.Codigo == "21" && m.MesaPadreId is null);

        var res = await client.PostAsync($"/api/mesas/{mesa21.Id}/dividir-en-dos", null);
        res.EnsureSuccessStatusCode();
        var mesas = await res.Content.ReadFromJsonAsync<List<MesaDto>>();

        var mitadA = Assert.Single(mesas!, m => m.Codigo == "21a");
        var mitadB = Assert.Single(mesas!, m => m.Codigo == "21b");
        Assert.Equal(mesa21.Id, mitadA.MesaPadreId);
        Assert.Equal(mesa21.Id, mitadB.MesaPadreId);
        Assert.Equal(0, mesas!.Single(m => m.Id == mesa21.Id).Capacidad);
        Assert.Equal(mesa21.Capacidad, mitadA.Capacidad + mitadB.Capacidad);
    }

    [Fact]
    public async Task DividirEnDos_ubica_las_dos_mitades_justo_despues_de_la_base()
    {
        var client = await ClienteAutenticadoAsync();
        var meta = await client.GetFromJsonAsync<MetaDto>("/api/meta");
        var mesa31 = meta!.Mesas.Single(m => m.Codigo == "31" && m.MesaPadreId is null);
        // La mesa que sigue a "31" en el orden actual: si el corrimiento de
        // Orden funciona bien, despues de dividir tiene que quedar 2 lugares
        // mas adelante (le cedio el paso a las dos mitades nuevas).
        var siguiente = meta.Mesas.Where(m => m.Orden > mesa31.Orden).OrderBy(m => m.Orden).First();

        var res = await client.PostAsync($"/api/mesas/{mesa31.Id}/dividir-en-dos", null);
        res.EnsureSuccessStatusCode();
        var mesas = await res.Content.ReadFromJsonAsync<List<MesaDto>>();

        var mitadA = mesas!.Single(m => m.Codigo == "31a");
        var mitadB = mesas.Single(m => m.Codigo == "31b");
        // Las dos mitades ocupan los dos lugares justo despues de la base
        // (no al final de la lista).
        Assert.Equal(mesa31.Orden + 1, mitadA.Orden);
        Assert.Equal(mesa31.Orden + 2, mitadB.Orden);
        Assert.Equal(siguiente.Orden + 2, mesas.Single(m => m.Id == siguiente.Id).Orden);
    }

    [Fact]
    public async Task DividirEnDos_con_menos_de_2_pax_devuelve_400()
    {
        var client = await ClienteAutenticadoAsync();
        var salonId = await ObtenerSalonIdAsync(client);

        // Una mesa base con 1 solo pax no tiene nada para repartir entre dos
        // mitades.
        var creada = await client.PostAsJsonAsync("/api/mesas", new CrearMesaRequest("72", 1, salonId));
        creada.EnsureSuccessStatusCode();
        var mesaChica = (await creada.Content.ReadFromJsonAsync<List<MesaDto>>())!.Single(m => m.Codigo == "72");

        var res = await client.PostAsync($"/api/mesas/{mesaChica.Id}/dividir-en-dos", null);

        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
    }

    [Fact]
    public async Task Crear_permite_repetir_codigo_en_otro_salon()
    {
        // El codigo de mesa solo tiene que ser unico DENTRO de un salon (ver
        // el indice (SalonId, Codigo) en BarrancasDbContext) — dos salones
        // distintos pueden tener cada uno su propia mesa "73" sin pisarse.
        var client = await ClienteAutenticadoAsync();
        var salonPrincipal = await ObtenerSalonIdAsync(client);
        var otroSalon = await client.PostAsJsonAsync("/api/salones", new CrearSalonRequest("Bar de prueba"));
        var salonBarId = (await otroSalon.Content.ReadFromJsonAsync<List<SalonDto>>())!
            .Single(s => s.Nombre == "Bar de prueba").Id;

        var enPrincipal = await client.PostAsJsonAsync("/api/mesas", new CrearMesaRequest("73", 4, salonPrincipal));
        enPrincipal.EnsureSuccessStatusCode();

        var enBar = await client.PostAsJsonAsync("/api/mesas", new CrearMesaRequest("73", 4, salonBarId));
        enBar.EnsureSuccessStatusCode();
        var mesas = await enBar.Content.ReadFromJsonAsync<List<MesaDto>>();

        Assert.Equal(2, mesas!.Count(m => m.Codigo == "73"));
    }

    [Fact]
    public async Task DividirEnDos_una_division_devuelve_400()
    {
        var client = await ClienteAutenticadoAsync();
        var meta = await client.GetFromJsonAsync<MetaDto>("/api/meta");
        var division = meta!.Mesas.Single(m => m.Codigo == "13b");

        var res = await client.PostAsync($"/api/mesas/{division.Id}/dividir-en-dos", null);

        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
    }
}
