using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Barrancas.Api.Dtos;
using Barrancas.Api.Models;
using Xunit;

namespace Barrancas.Api.Tests;

public class UsuariosEndpointsTests : IClassFixture<BarrancasWebApplicationFactory>
{
    private readonly BarrancasWebApplicationFactory _factory;

    public UsuariosEndpointsTests(BarrancasWebApplicationFactory factory)
    {
        _factory = factory;
    }

    private async Task<HttpClient> ClienteAdminAsync() => await LoginComoAsync("admin", "admin");

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
    public async Task GetLista_como_staff_devuelve_403()
    {
        var client = await ClienteStaffAsync();
        var res = await client.GetAsync("/api/usuarios");
        Assert.Equal(HttpStatusCode.Forbidden, res.StatusCode);
    }

    [Fact]
    public async Task Login_devuelve_el_rol_de_la_cuenta()
    {
        var clientAdmin = _factory.CreateClient();
        var loginAdmin = await clientAdmin.PostAsJsonAsync("/api/auth/login", new LoginRequest("admin", "admin"));
        var bodyAdmin = await loginAdmin.Content.ReadFromJsonAsync<LoginResponse>();
        Assert.Equal(Rol.Admin, bodyAdmin!.Rol);

        var clientStaff = _factory.CreateClient();
        var loginStaff = await clientStaff.PostAsJsonAsync("/api/auth/login", new LoginRequest("staff", "staff"));
        var bodyStaff = await loginStaff.Content.ReadFromJsonAsync<LoginResponse>();
        Assert.Equal(Rol.Staff, bodyStaff!.Rol);
    }

    [Fact]
    public async Task Crear_agrega_una_cuenta_nueva_que_puede_loguearse()
    {
        var admin = await ClienteAdminAsync();

        var res = await admin.PostAsJsonAsync("/api/usuarios",
            new CrearUsuarioRequest("Majo", "majo", "clave-inicial", Rol.Staff));
        res.EnsureSuccessStatusCode();
        var lista = await res.Content.ReadFromJsonAsync<List<UsuarioDto>>();
        Assert.Contains(lista!, u => u.Username == "majo" && u.Rol == Rol.Staff);

        var loginNuevo = _factory.CreateClient();
        var login = await loginNuevo.PostAsJsonAsync("/api/auth/login",
            new LoginRequest("majo", "clave-inicial"));
        login.EnsureSuccessStatusCode();
    }

    [Fact]
    public async Task Crear_con_username_repetido_devuelve_400()
    {
        var admin = await ClienteAdminAsync();

        var res = await admin.PostAsJsonAsync("/api/usuarios",
            new CrearUsuarioRequest("Otro Admin", "admin", "clave-inicial", Rol.Admin));

        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
    }

    [Fact]
    public async Task No_se_puede_desactivar_al_unico_admin_activo()
    {
        var admin = await ClienteAdminAsync();
        var lista = await admin.GetFromJsonAsync<List<UsuarioDto>>("/api/usuarios");
        var cuentaAdmin = lista!.Single(u => u.Username == "admin");

        var res = await admin.PatchAsJsonAsync($"/api/usuarios/{cuentaAdmin.Id}",
            new ActualizarUsuarioRequest(null, null, false, null));

        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
    }

    [Fact]
    public async Task Resetear_password_fuerza_el_cambio_en_el_proximo_login()
    {
        var admin = await ClienteAdminAsync();
        var lista = await admin.GetFromJsonAsync<List<UsuarioDto>>("/api/usuarios");
        var cuentaStaff = lista!.Single(u => u.Username == "staff");

        var res = await admin.PatchAsJsonAsync($"/api/usuarios/{cuentaStaff.Id}",
            new ActualizarUsuarioRequest(null, null, null, "otra-clave"));
        res.EnsureSuccessStatusCode();

        var loginConClaveVieja = _factory.CreateClient();
        var fallido = await loginConClaveVieja.PostAsJsonAsync("/api/auth/login", new LoginRequest("staff", "staff"));
        Assert.Equal(HttpStatusCode.Unauthorized, fallido.StatusCode);

        var loginConClaveNueva = _factory.CreateClient();
        var exitoso = await loginConClaveNueva.PostAsJsonAsync("/api/auth/login",
            new LoginRequest("staff", "otra-clave"));
        exitoso.EnsureSuccessStatusCode();
        var body = await exitoso.Content.ReadFromJsonAsync<LoginResponse>();
        Assert.True(body!.DebeCambiarPassword);
    }
}
