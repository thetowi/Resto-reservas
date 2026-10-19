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
/// Solicitudes del link (grupos de 6 o mas): no entran a la grilla hasta que
/// el equipo las aprueba en Reservas web; se pueden aprobar con mesas o
/// rechazar con un motivo. Clase aparte (base propia).
/// </summary>
public class SolicitudesWebTests : IClassFixture<BarrancasWebApplicationFactory>
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web)
    {
        Converters = { new JsonStringEnumConverter(JsonNamingPolicy.CamelCase) },
    };

    private readonly BarrancasWebApplicationFactory _factory;

    public SolicitudesWebTests(BarrancasWebApplicationFactory factory)
    {
        _factory = factory;
    }

    private static DateOnly EnDias(int dias) => ReservaOnlineService.HoyLocal().AddDays(dias);

    private async Task<HttpClient> ClienteAsync()
    {
        var client = _factory.CreateClient();
        var login = await client.PostAsJsonAsync("/api/auth/login", new LoginRequest("admin", "admin"));
        login.EnsureSuccessStatusCode();
        var body = await login.Content.ReadFromJsonAsync<LoginResponse>();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", body!.Token);
        return client;
    }

    private static async Task<int> RestaurantAsync(HttpClient client)
    {
        var config = await client.GetFromJsonAsync<PublicoConfigDto>("/api/publico/config");
        return config!.Salones.Single(s => s.Nombre == "Restaurant").Id;
    }

    private static async Task<ReservaWebDto> ReservarAsync(HttpClient client, DateOnly fecha, int pax, string nombre)
    {
        var salonId = await RestaurantAsync(client);
        var res = await client.PostAsJsonAsync("/api/publico/reservas",
            new PublicoReservaRequest(fecha, salonId, "cena", "21:00", pax, nombre, "11 4777-" + Random.Shared.Next(1000, 9999), null, null, null, true, null));
        res.EnsureSuccessStatusCode();
        var creada = await res.Content.ReadFromJsonAsync<PublicoReservaResultado>();
        var lista = await client.GetFromJsonAsync<List<ReservaWebDto>>("/api/reservas-web", Json);
        return Assert.Single(lista!, w => w.Codigo == creada!.Codigo);
    }

    private static async Task<TurnoDataDto> CenaAsync(HttpClient client, DateOnly fecha)
    {
        var salonId = await RestaurantAsync(client);
        var dia = await client.GetFromJsonAsync<DiaDto>($"/api/dias/{fecha:yyyy-MM-dd}?salonId={salonId}", Json);
        return dia!.Cena;
    }

    private static string Iso(DateOnly d) => d.ToString("yyyy-MM-dd");

    [Fact]
    public async Task La_solicitud_espera_afuera_de_la_grilla_y_al_aprobarla_entra_con_sus_mesas()
    {
        var client = await ClienteAsync();
        var fecha = EnDias(20);
        var web = await ReservarAsync(client, fecha, 8, "Familia Ruiz");

        Assert.Equal("pendiente", web.Estado);
        Assert.Null(web.ReservaId);
        Assert.DoesNotContain((await CenaAsync(client, fecha)).Reservas, r => r.Nombre == "Familia Ruiz");
        var delDia = await client.GetFromJsonAsync<List<ReservaWebDto>>($"/api/reservas-web/solicitudes?fecha={Iso(fecha)}", Json);
        Assert.Contains(delDia!, w => w.Id == web.Id);

        var chequeo = await client.GetFromJsonAsync<ChequeoSolicitudDto>($"/api/reservas-web/{web.Id}/chequeo");
        Assert.NotEqual("sin_lugar", chequeo!.Estado);
        Assert.NotEmpty(chequeo.Sugeridas);
        Assert.True(chequeo.LugaresLibres >= 8);

        var res = await client.PostAsJsonAsync($"/api/reservas-web/{web.Id}/confirmar", new AprobarSolicitudRequest(chequeo.Sugeridas));

        res.EnsureSuccessStatusCode();
        var aprobada = await res.Content.ReadFromJsonAsync<ReservaWebDto>(Json);
        Assert.Equal("confirmada", aprobada!.Estado);
        Assert.Equal("Admin", aprobada.ConfirmadaPor);
        var fila = Assert.Single((await CenaAsync(client, fecha)).Reservas, r => r.Nombre == "Familia Ruiz");
        Assert.Equal(aprobada.ReservaId, fila.Id);
        Assert.Equal(8, fila.Pax);
        Assert.Equal("21:00", fila.Hora);
        Assert.Equal(OrigenReserva.Web, fila.Origen);
        Assert.Equal(chequeo.Sugeridas.OrderBy(x => x), fila.MesaIds.OrderBy(x => x));
        var despues = await client.GetFromJsonAsync<List<ReservaWebDto>>($"/api/reservas-web/solicitudes?fecha={Iso(fecha)}", Json);
        Assert.DoesNotContain(despues!, w => w.Id == web.Id);
    }

    [Fact]
    public async Task Rechazar_guarda_el_motivo_baja_el_contador_y_no_se_puede_aprobar_despues()
    {
        var client = await ClienteAsync();
        var fecha = EnDias(21);
        var web = await ReservarAsync(client, fecha, 10, "Lucía Benítez");
        var antes = await client.GetFromJsonAsync<ReservaWebResumenDto>("/api/reservas-web/resumen");

        var res = await client.PostAsJsonAsync($"/api/reservas-web/{web.Id}/rechazar", new RechazarSolicitudRequest("Ofrecer otro horario"));

        res.EnsureSuccessStatusCode();
        var rechazada = await res.Content.ReadFromJsonAsync<ReservaWebDto>(Json);
        Assert.Equal("rechazada", rechazada!.Estado);
        Assert.Equal("Ofrecer otro horario", rechazada.MotivoRechazo);
        Assert.NotNull(rechazada.RechazadaEn);
        var despues = await client.GetFromJsonAsync<ReservaWebResumenDto>("/api/reservas-web/resumen");
        Assert.Equal(antes!.AConfirmar - 1, despues!.AConfirmar);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsync($"/api/reservas-web/{web.Id}/confirmar", null)).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsync($"/api/reservas-web/{web.Id}/rechazar", null)).StatusCode);
        Assert.DoesNotContain((await CenaAsync(client, fecha)).Reservas, r => r.Nombre == "Lucía Benítez");
    }

    [Fact]
    public async Task Aprobar_con_una_mesa_ya_ocupada_devuelve_409()
    {
        var client = await ClienteAsync();
        var fecha = EnDias(22);
        var chica = await ReservarAsync(client, fecha, 2, "Ana Paz"); // se confirma sola, con mesa
        var mesaOcupada = Assert.Single((await CenaAsync(client, fecha)).Reservas, r => r.Id == chica.ReservaId).MesaIds.First();
        var grupo = await ReservarAsync(client, fecha, 8, "Familia Gil");

        var res = await client.PostAsJsonAsync($"/api/reservas-web/{grupo.Id}/confirmar", new AprobarSolicitudRequest([mesaOcupada]));

        Assert.Equal(HttpStatusCode.Conflict, res.StatusCode);
        var lista = await client.GetFromJsonAsync<List<ReservaWebDto>>("/api/reservas-web", Json);
        Assert.Equal("pendiente", Assert.Single(lista!, w => w.Id == grupo.Id).Estado);
    }

    [Fact]
    public async Task Aprobar_sin_mesas_la_deja_en_la_grilla_para_asignarlas_despues()
    {
        var client = await ClienteAsync();
        var fecha = EnDias(23);
        var web = await ReservarAsync(client, fecha, 7, "Grupo Sosa");

        (await client.PostAsync($"/api/reservas-web/{web.Id}/confirmar", null)).EnsureSuccessStatusCode();

        var fila = Assert.Single((await CenaAsync(client, fecha)).Reservas, r => r.Nombre == "Grupo Sosa");
        Assert.Empty(fila.MesaIds);
        Assert.Equal(EstadoReserva.Confirmada, fila.Estado);
    }
}
