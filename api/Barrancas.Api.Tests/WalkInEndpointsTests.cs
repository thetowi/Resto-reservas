using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Barrancas.Api.Data;
using Barrancas.Api.Dtos;
using Barrancas.Api.Models;
using Xunit;

namespace Barrancas.Api.Tests;

public class WalkInEndpointsTests : IClassFixture<BarrancasWebApplicationFactory>
{
    private readonly BarrancasWebApplicationFactory _factory;

    public WalkInEndpointsTests(BarrancasWebApplicationFactory factory)
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

    [Fact]
    public async Task Toggle_marca_la_mesa_como_walkin_sin_agregar_una_fila_de_reserva()
    {
        var client = await ClienteAutenticadoAsync();
        var fecha = "2026-07-01";
        var meta = await client.GetFromJsonAsync<MetaDto>("/api/meta");
        var salonId = meta!.Salones[0].Id;
        await client.GetFromJsonAsync<DiaDto>($"/api/dias/{fecha}?salonId={salonId}");
        var mesaId = meta.Mesas.First(m => m.MesaPadreId is null).Id;

        var res = await client.PostAsJsonAsync("/api/walkin/toggle",
            new ToggleWalkInRequest(DateOnly.Parse(fecha), Turno.Almuerzo, mesaId));
        res.EnsureSuccessStatusCode();
        var turno = await res.Content.ReadFromJsonAsync<TurnoDataDto>();

        Assert.Contains(mesaId, turno!.MesasWalkIn);
        // A proposito no aparece en MesasOcupadas ni genera una fila nueva:
        // un walk-in no es una reserva.
        Assert.DoesNotContain(mesaId, turno.MesasOcupadas);
        Assert.DoesNotContain(turno.Reservas, r => r.MesaId == mesaId);
    }

    [Fact]
    public async Task Toggle_de_nuevo_libera_la_mesa()
    {
        var client = await ClienteAutenticadoAsync();
        var fecha = "2026-07-02";
        var meta = await client.GetFromJsonAsync<MetaDto>("/api/meta");
        var salonId = meta!.Salones[0].Id;
        await client.GetFromJsonAsync<DiaDto>($"/api/dias/{fecha}?salonId={salonId}");
        var mesaId = meta.Mesas.First(m => m.MesaPadreId is null).Id;
        var req = new ToggleWalkInRequest(DateOnly.Parse(fecha), Turno.Almuerzo, mesaId);

        await client.PostAsJsonAsync("/api/walkin/toggle", req);
        var segundo = await client.PostAsJsonAsync("/api/walkin/toggle", req);
        segundo.EnsureSuccessStatusCode();
        var turno = await segundo.Content.ReadFromJsonAsync<TurnoDataDto>();

        Assert.DoesNotContain(mesaId, turno!.MesasWalkIn);
    }

    [Fact]
    public async Task Toggle_sobre_una_mesa_con_reserva_real_devuelve_400()
    {
        var client = await ClienteAutenticadoAsync();
        var fecha = "2026-07-03";
        var meta = await client.GetFromJsonAsync<MetaDto>("/api/meta");
        var salonId = meta!.Salones[0].Id;
        await client.GetFromJsonAsync<DiaDto>($"/api/dias/{fecha}?salonId={salonId}");
        var mesaId = meta.Mesas.First(m => m.MesaPadreId is null).Id;

        var creada = await client.PostAsJsonAsync("/api/reservas",
            new CrearReservaRequest(DateOnly.Parse(fecha), Turno.Almuerzo, salonId, "21:00"));
        var fila = (await creada.Content.ReadFromJsonAsync<TurnoDataDto>())!.Reservas.Last();
        await client.PatchAsJsonAsync($"/api/reservas/{fila.Id}",
            new ActualizarReservaRequest(null, OptionalInt.Of(mesaId), OptionalInt.Unset, null, null, null, null, null));

        var res = await client.PostAsJsonAsync("/api/walkin/toggle",
            new ToggleWalkInRequest(DateOnly.Parse(fecha), Turno.Almuerzo, mesaId));

        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
    }
}
