using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Barrancas.Api.Dtos;
using Barrancas.Api.Models;
using Xunit;

namespace Barrancas.Api.Tests;

public class ReportesEndpointsTests : IClassFixture<BarrancasWebApplicationFactory>
{
    private readonly BarrancasWebApplicationFactory _factory;

    public ReportesEndpointsTests(BarrancasWebApplicationFactory factory)
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
    public async Task Mensual_como_staff_devuelve_403()
    {
        var client = await ClienteStaffAsync();
        var res = await client.GetAsync("/api/reportes/mensual?anio=2026&mes=8");
        Assert.Equal(HttpStatusCode.Forbidden, res.StatusCode);
    }

    [Fact]
    public async Task Mensual_solo_cuenta_reservas_reales_e_ignora_las_filas_vacias()
    {
        var client = await ClienteAdminAsync();
        var fecha = "2026-09-05";
        var meta = await client.GetFromJsonAsync<Barrancas.Api.Dtos.MetaDto>("/api/meta");
        var salonId = meta!.Salones[0].Id;

        // Autogenera las 26 filas default del turno (todas sin Pax: no
        // deberian contarse como reservas reales en el reporte).
        await client.GetFromJsonAsync<Barrancas.Api.Dtos.DiaDto>($"/api/dias/{fecha}?salonId={salonId}");

        var creada = await client.PostAsJsonAsync("/api/reservas",
            new CrearReservaRequest(DateOnly.Parse(fecha), Turno.Almuerzo, salonId, "13:00"));
        var fila = (await creada.Content.ReadFromJsonAsync<TurnoDataDto>())!.Reservas.Last();

        await client.PatchAsJsonAsync($"/api/reservas/{fila.Id}",
            new ActualizarReservaRequest(null, OptionalInt.Unset, OptionalInt.Of(4), "Perez", null, null, true, null));

        var reporte = await client.GetFromJsonAsync<ReporteMensualDto>("/api/reportes/mensual?anio=2026&mes=9");

        Assert.NotNull(reporte);
        Assert.Equal(1, reporte!.TotalReservas);
        Assert.Equal(4, reporte.TotalPax);
        Assert.Equal(4, reporte.TotalAsistio);
        Assert.Equal(100, reporte.PorcentajeAsistencia);

        var dia = reporte.PorDiaYTurno.Single(d => d.Fecha == DateOnly.Parse(fecha) && d.Turno == Turno.Almuerzo);
        Assert.Equal(1, dia.CantidadReservas);
        Assert.Equal(4, dia.TotalPax);
    }

    [Fact]
    public async Task Mensual_con_mes_invalido_devuelve_400()
    {
        var client = await ClienteAdminAsync();
        var res = await client.GetAsync("/api/reportes/mensual?anio=2026&mes=13");
        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
    }
}
