using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Barrancas.Api.Data;
using Barrancas.Api.Dtos;
using Barrancas.Api.Models;
using Xunit;

namespace Barrancas.Api.Tests;

public class ReservasEndpointsTests : IClassFixture<BarrancasWebApplicationFactory>
{
    private readonly BarrancasWebApplicationFactory _factory;

    public ReservasEndpointsTests(BarrancasWebApplicationFactory factory)
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
    public async Task Meta_sin_token_devuelve_401()
    {
        var client = _factory.CreateClient();
        var res = await client.GetAsync("/api/meta");
        Assert.Equal(HttpStatusCode.Unauthorized, res.StatusCode);
    }

    [Fact]
    public async Task Login_con_password_incorrecta_devuelve_401()
    {
        var client = _factory.CreateClient();
        var res = await client.PostAsJsonAsync("/api/auth/login",
            new LoginRequest("admin", "password-incorrecta"));
        Assert.Equal(HttpStatusCode.Unauthorized, res.StatusCode);
    }

    [Fact]
    public async Task Login_correcto_permite_acceder_a_meta_con_40_mesas()
    {
        // 26 mesas base + 14 divisiones ("b") sembradas en DbSeeder.
        var client = await ClienteAutenticadoAsync();
        var meta = await client.GetFromJsonAsync<MetaDto>("/api/meta");

        Assert.NotNull(meta);
        Assert.Equal(40, meta!.Mesas.Count);
        Assert.Equal(26, meta.Mesas.Count(m => m.MesaPadreId is null));
        Assert.Equal(14, meta.Mesas.Count(m => m.MesaPadreId is not null));
    }

    [Fact]
    public async Task GetDia_autogenera_26_filas_por_turno_la_primera_vez()
    {
        var client = await ClienteAutenticadoAsync();
        var salonId = await ObtenerSalonIdAsync(client);
        var dia = await client.GetFromJsonAsync<DiaDto>($"/api/dias/2026-03-15?salonId={salonId}");

        Assert.NotNull(dia);
        Assert.Equal(26, dia!.Almuerzo.Reservas.Count);
        Assert.Equal(26, dia.Cena.Reservas.Count);
        Assert.Equal(0, dia.Almuerzo.TotalPax);
    }

    [Fact]
    public async Task Crear_editar_y_marcar_asistio_actualiza_los_totales()
    {
        var client = await ClienteAutenticadoAsync();
        var salonId = await ObtenerSalonIdAsync(client);
        var fecha = "2026-04-20";

        // aseguramos que el turno ya tenga las filas default generadas
        await client.GetFromJsonAsync<DiaDto>($"/api/dias/{fecha}?salonId={salonId}");

        var creada = await client.PostAsJsonAsync("/api/reservas",
            new CrearReservaRequest(DateOnly.Parse(fecha), Turno.Almuerzo, salonId, "13:00"));
        creada.EnsureSuccessStatusCode();
        var turnoTrasCrear = await creada.Content.ReadFromJsonAsync<TurnoDataDto>();
        Assert.NotNull(turnoTrasCrear);
        var nuevaFila = turnoTrasCrear!.Reservas.Last();

        var patchRequest = new HttpRequestMessage(new HttpMethod("PATCH"), $"/api/reservas/{nuevaFila.Id}")
        {
            Content = JsonContent.Create(new ActualizarReservaRequest(
                null, OptionalInt.Unset, OptionalInt.Of(4), "Perez", null, null, true, null)),
        };
        var patch = await client.SendAsync(patchRequest);
        patch.EnsureSuccessStatusCode();
        var turnoTrasPatch = await patch.Content.ReadFromJsonAsync<TurnoDataDto>();

        Assert.NotNull(turnoTrasPatch);
        Assert.Equal(4, turnoTrasPatch!.TotalPax);
        Assert.Equal(4, turnoTrasPatch.TotalAsistio);
        Assert.Contains(turnoTrasPatch.Reservas, r => r.Nombre == "Perez" && r.Asistio);
    }

    [Fact]
    public async Task MesasPedidas_incluye_la_mesa_de_una_reserva_con_pidio_mesa()
    {
        var client = await ClienteAutenticadoAsync();
        var fecha = "2026-06-02";
        var meta = await client.GetFromJsonAsync<MetaDto>("/api/meta");
        var salonId = meta!.Salones[0].Id;
        await client.GetFromJsonAsync<DiaDto>($"/api/dias/{fecha}?salonId={salonId}");
        var mesaId = meta.Mesas.First(m => m.MesaPadreId is null).Id;

        var creada = await client.PostAsJsonAsync("/api/reservas",
            new CrearReservaRequest(DateOnly.Parse(fecha), Turno.Almuerzo, salonId, "20:00"));
        var fila = (await creada.Content.ReadFromJsonAsync<TurnoDataDto>())!.Reservas.Last();

        var patch = await client.PatchAsJsonAsync($"/api/reservas/{fila.Id}",
            new ActualizarReservaRequest(null, OptionalInt.Of(mesaId), OptionalInt.Unset, null, null, null, null, true));
        patch.EnsureSuccessStatusCode();
        var turno = await patch.Content.ReadFromJsonAsync<TurnoDataDto>();

        Assert.Contains(mesaId, turno!.MesasOcupadas);
        Assert.Contains(mesaId, turno.MesasPedidas);
    }

    [Fact]
    public async Task PidioMesa_bloquea_reasignar_la_mesa_hasta_destildarlo()
    {
        var client = await ClienteAutenticadoAsync();
        var fecha = "2026-05-11";
        var meta = await client.GetFromJsonAsync<MetaDto>("/api/meta");
        var salonId = meta!.Salones[0].Id;
        await client.GetFromJsonAsync<DiaDto>($"/api/dias/{fecha}?salonId={salonId}");
        var mesaA = meta.Mesas.First(m => m.MesaPadreId is null).Id;
        var mesaB = meta.Mesas.First(m => m.MesaPadreId is null && m.Id != mesaA).Id;

        var creada = await client.PostAsJsonAsync("/api/reservas",
            new CrearReservaRequest(DateOnly.Parse(fecha), Turno.Almuerzo, salonId, "21:00"));
        var fila = (await creada.Content.ReadFromJsonAsync<TurnoDataDto>())!.Reservas.Last();

        // Asigna mesa y tilda "Pidio mesa" en el mismo PATCH.
        var conMesaPedida = await client.PatchAsJsonAsync($"/api/reservas/{fila.Id}",
            new ActualizarReservaRequest(null, OptionalInt.Of(mesaA), OptionalInt.Unset, null, null, null, null, true));
        conMesaPedida.EnsureSuccessStatusCode();

        // Intentar reasignarla mientras sigue tildado: rechazado.
        var intentoCambio = await client.PatchAsJsonAsync($"/api/reservas/{fila.Id}",
            new ActualizarReservaRequest(null, OptionalInt.Of(mesaB), OptionalInt.Unset, null, null, null, null, null));
        Assert.Equal(HttpStatusCode.BadRequest, intentoCambio.StatusCode);

        // Destildando en el mismo PATCH que cambia la mesa: permitido.
        var destildado = await client.PatchAsJsonAsync($"/api/reservas/{fila.Id}",
            new ActualizarReservaRequest(null, OptionalInt.Of(mesaB), OptionalInt.Unset, null, null, null, null, false));
        destildado.EnsureSuccessStatusCode();
        var turno = await destildado.Content.ReadFromJsonAsync<TurnoDataDto>();
        var filaFinal = turno!.Reservas.Single(r => r.Id == fila.Id);
        Assert.Equal(mesaB, filaFinal.MesaId);
        Assert.False(filaFinal.PidioMesa);
    }

}
