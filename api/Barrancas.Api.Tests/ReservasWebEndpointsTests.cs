using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using Barrancas.Api.Data;
using Barrancas.Api.Dtos;
using Barrancas.Api.Models;
using Barrancas.Api.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace Barrancas.Api.Tests;

/// <summary>
/// Registro de reservas web (panel "Reservas por el link"), tachito (vaciar
/// la fila dejando su horario), deshacer, quitar fila y confirmar.
/// </summary>
public class ReservasWebEndpointsTests : IClassFixture<BarrancasWebApplicationFactory>
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web)
    {
        Converters = { new JsonStringEnumConverter(JsonNamingPolicy.CamelCase) },
    };

    private readonly BarrancasWebApplicationFactory _factory;

    public ReservasWebEndpointsTests(BarrancasWebApplicationFactory factory)
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

    private async Task<int> SalonRestaurantIdAsync(HttpClient client)
    {
        var config = await client.GetFromJsonAsync<PublicoConfigDto>("/api/publico/config");
        return config!.Salones.Single(s => s.Nombre == "Restaurant").Id;
    }

    // Reserva por el link y devuelve su registro en el panel.
    private async Task<ReservaWebDto> ReservarPorLinkAsync(HttpClient client, DateOnly fecha, int pax, string nombre)
    {
        var salonId = await SalonRestaurantIdAsync(client);
        var tel = "11 4444-" + Random.Shared.Next(1000, 9999);
        var res = await client.PostAsJsonAsync("/api/publico/reservas",
            new PublicoReservaRequest(fecha, salonId, "cena", "21:00", pax, nombre, tel, null, "Aniversario", null, true, null));
        res.EnsureSuccessStatusCode();
        var creada = await res.Content.ReadFromJsonAsync<PublicoReservaResultado>();
        var lista = await ListarAsync(client);
        return Assert.Single(lista, w => w.Codigo == creada!.Codigo);
    }

    private static async Task<List<ReservaWebDto>> ListarAsync(HttpClient client) =>
        (await client.GetFromJsonAsync<List<ReservaWebDto>>("/api/reservas-web", Json))!;

    [Fact]
    public async Task Listado_requiere_login()
    {
        var res = await _factory.CreateClient().GetAsync("/api/reservas-web");
        Assert.Equal(HttpStatusCode.Unauthorized, res.StatusCode);
    }

    [Fact]
    public async Task Reserva_por_el_link_queda_registrada_como_confirmada()
    {
        var client = await ClienteAutenticadoAsync();

        var web = await ReservarPorLinkAsync(client, EnDias(11), 2, "Ana Torres");

        Assert.Equal("confirmada", web.Estado);
        Assert.Equal("Aniversario", web.Pedido);
        Assert.NotNull(web.ReservaId);
    }

    [Fact]
    public async Task Tachito_vacia_la_fila_deja_la_hora_y_cancela_la_reserva_web()
    {
        var client = await ClienteAutenticadoAsync();
        var web = await ReservarPorLinkAsync(client, EnDias(12), 2, "Bruno Díaz");

        var res = await client.PostAsync($"/api/reservas/{web.ReservaId}/vaciar", null);

        res.EnsureSuccessStatusCode();
        var resultado = await res.Content.ReadFromJsonAsync<VaciarReservaResultado>();
        Assert.Equal(web.Id, resultado!.ReservaWebId);

        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<BarrancasDbContext>();
            var fila = await db.Reservas.Include(r => r.ReservaMesas).SingleAsync(r => r.Id == web.ReservaId);
            Assert.Equal("21:00", fila.Hora);
            Assert.Null(fila.Nombre);
            Assert.Null(fila.Pax);
            Assert.Null(fila.HabTel);
            Assert.Null(fila.Comentarios);
            Assert.Empty(fila.ReservaMesas);
            Assert.Equal(OrigenReserva.Staff, fila.Origen);
        }

        var despues = Assert.Single(await ListarAsync(client), w => w.Id == web.Id);
        Assert.Equal("cancelada", despues.Estado);
        Assert.NotNull(despues.CanceladaEn);
        Assert.Null(despues.ReservaId);
    }

    [Fact]
    public async Task Deshacer_el_tachito_vuelve_a_cargar_la_reserva()
    {
        var client = await ClienteAutenticadoAsync();
        var web = await ReservarPorLinkAsync(client, EnDias(13), 2, "Carla Vera");
        var filaId = web.ReservaId!.Value;
        (await client.PostAsync($"/api/reservas/{filaId}/vaciar", null)).EnsureSuccessStatusCode();

        var res = await client.PostAsJsonAsync($"/api/reservas/{filaId}/restaurar",
            new RestaurarReservaRequest("21:00", 2, "Carla Vera", web.Telefono, "Aniversario", false, false, false,
                new List<int>(), OrigenReserva.Web, EstadoReserva.Confirmada, web.Id));

        res.EnsureSuccessStatusCode();
        var despues = Assert.Single(await ListarAsync(client), w => w.Id == web.Id);
        Assert.Equal("confirmada", despues.Estado);
        Assert.Equal(filaId, despues.ReservaId);
    }

    [Fact]
    public async Task Deshacer_no_pisa_una_fila_que_ya_se_volvio_a_usar()
    {
        var client = await ClienteAutenticadoAsync();
        var web = await ReservarPorLinkAsync(client, EnDias(14), 2, "Diego Luna");
        var filaId = web.ReservaId!.Value;
        (await client.PostAsync($"/api/reservas/{filaId}/vaciar", null)).EnsureSuccessStatusCode();
        (await client.PatchAsJsonAsync($"/api/reservas/{filaId}", new { nombre = "Otra persona" })).EnsureSuccessStatusCode();

        var res = await client.PostAsJsonAsync($"/api/reservas/{filaId}/restaurar",
            new RestaurarReservaRequest("21:00", 2, "Diego Luna", web.Telefono, null, false, false, false,
                null, OrigenReserva.Web, EstadoReserva.Confirmada, web.Id));

        Assert.Equal(HttpStatusCode.Conflict, res.StatusCode);
    }

    [Fact]
    public async Task Quitar_la_fila_de_una_reserva_web_la_deja_como_cancelada()
    {
        var client = await ClienteAutenticadoAsync();
        var web = await ReservarPorLinkAsync(client, EnDias(15), 2, "Elena Ríos");

        (await client.DeleteAsync($"/api/reservas/{web.ReservaId}")).EnsureSuccessStatusCode();

        var despues = Assert.Single(await ListarAsync(client), w => w.Id == web.Id);
        Assert.Equal("cancelada", despues.Estado);
    }

    [Fact]
    public async Task Confirmar_una_solicitud_la_pasa_a_confirmada_en_el_registro_y_en_la_grilla()
    {
        var client = await ClienteAutenticadoAsync();
        var web = await ReservarPorLinkAsync(client, EnDias(16), 8, "Familia Ortiz");
        Assert.Equal("pendiente", web.Estado);
        var antes = await client.GetFromJsonAsync<ReservaWebResumenDto>("/api/reservas-web/resumen");

        var res = await client.PostAsync($"/api/reservas-web/{web.Id}/confirmar", null);

        res.EnsureSuccessStatusCode();
        var confirmada = await res.Content.ReadFromJsonAsync<ReservaWebDto>(Json);
        Assert.Equal("confirmada", confirmada!.Estado);
        var despues = await client.GetFromJsonAsync<ReservaWebResumenDto>("/api/reservas-web/resumen");
        Assert.Equal(antes!.AConfirmar - 1, despues!.AConfirmar);
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<BarrancasDbContext>();
        var fila = await db.Reservas.SingleAsync(r => r.Id == web.ReservaId);
        Assert.Equal(EstadoReserva.Confirmada, fila.Estado);
    }
}
