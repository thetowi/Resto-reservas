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
/// Sectores del salón (/api/sectores): armarlos, cerrar uno en un turno o
/// dárselo a un grupo, y que la planilla se achique y se agrande sola.
/// </summary>
public class SectoresTests : IClassFixture<BarrancasWebApplicationFactory>
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web)
    {
        Converters = { new JsonStringEnumConverter(JsonNamingPolicy.CamelCase) },
    };

    private readonly BarrancasWebApplicationFactory _factory;

    public SectoresTests(BarrancasWebApplicationFactory factory)
    {
        _factory = factory;
    }

    private static DateOnly EnDias(int dias) => ReservaOnlineService.HoyLocal().AddDays(dias);

    private async Task<HttpClient> ClienteAsync(string usuario = "admin")
    {
        var client = _factory.CreateClient();
        var login = await client.PostAsJsonAsync("/api/auth/login", new LoginRequest(usuario, usuario));
        login.EnsureSuccessStatusCode();
        var body = await login.Content.ReadFromJsonAsync<LoginResponse>();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", body!.Token);
        return client;
    }

    private record Armado(int SalonId, SectorDto A, SectorDto B, List<MesaDto> Mesas);

    // Arma dos sectores en el Restaurant: la primera mitad de las mesas en A
    // y el resto en B (las divisiones van con su mesa).
    private async Task<Armado> ArmarAsync(HttpClient admin, string sufijo)
    {
        var meta = await admin.GetFromJsonAsync<MetaDto>("/api/meta", Json);
        var salonId = meta!.Salones.Single(s => s.Nombre == "Restaurant").Id;

        (await admin.PostAsJsonAsync("/api/sectores", new CrearSectorRequest(salonId, $"Bodega {sufijo}", null))).EnsureSuccessStatusCode();
        var res = await admin.PostAsJsonAsync("/api/sectores", new CrearSectorRequest(salonId, $"Terraza {sufijo}", null));
        res.EnsureSuccessStatusCode();
        var sectores = (await res.Content.ReadFromJsonAsync<List<SectorDto>>(Json))!;
        var a = sectores.Single(s => s.Nombre == $"Bodega {sufijo}");
        var b = sectores.Single(s => s.Nombre == $"Terraza {sufijo}");

        var bases = meta.Mesas.Where(m => m.SalonId == salonId && m.MesaPadreId is null).OrderBy(m => m.Orden).ToList();
        var mitad = bases.Count / 2;
        (await admin.PostAsJsonAsync("/api/sectores/asignar", new AsignarSectorRequest(a.Id, bases.Take(mitad).Select(m => m.Id).ToList()))).EnsureSuccessStatusCode();
        (await admin.PostAsJsonAsync("/api/sectores/asignar", new AsignarSectorRequest(b.Id, bases.Skip(mitad).Select(m => m.Id).ToList()))).EnsureSuccessStatusCode();

        meta = await admin.GetFromJsonAsync<MetaDto>("/api/meta", Json);
        return new Armado(salonId, a, b, meta!.Mesas.Where(m => m.SalonId == salonId).ToList());
    }

    private static async Task<TurnoDataDto> CenaAsync(HttpClient client, DateOnly fecha, int salonId)
    {
        var dia = await client.GetFromJsonAsync<DiaDto>($"/api/dias/{fecha:yyyy-MM-dd}?salonId={salonId}", Json);
        return dia!.Cena;
    }

    private static async Task<HttpResponseMessage> SectoresTurnoAsync(HttpClient client, DateOnly fecha, int salonId, params SectorEstadoRequest[] sectores) =>
        await client.PostAsJsonAsync("/api/sectores/turno", new SectoresTurnoRequest(fecha, Turno.Cena, salonId, sectores.ToList()));

    // Filas que tiene que tener la cena si queda abierta esa parte del salón.
    private static int FilasEsperadas(double factor) =>
        HorariosTurnoService.Escalar(HorariosTurnoService.PorDefecto(Turno.Cena), factor).Sum(f => f.Filas);

    [Fact]
    public async Task Las_mesas_quedan_con_su_sector_y_las_divisiones_con_su_mesa()
    {
        var admin = await ClienteAsync();
        var armado = await ArmarAsync(admin, "1");

        Assert.All(armado.Mesas, m => Assert.NotNull(m.SectorId));
        foreach (var division in armado.Mesas.Where(m => m.MesaPadreId is not null))
        {
            Assert.Equal(armado.Mesas.Single(m => m.Id == division.MesaPadreId).SectorId, division.SectorId);
        }
    }

    [Fact]
    public async Task Cerrar_un_sector_reduce_sus_mesas_y_achica_la_planilla_y_abrirlo_la_vuelve_a_armar()
    {
        var admin = await ClienteAsync();
        var armado = await ArmarAsync(admin, "2");
        var fecha = EnDias(40);
        Assert.Equal(HorariosDefault.Cena.Length, (await CenaAsync(admin, fecha, armado.SalonId)).Reservas.Count);

        var res = await SectoresTurnoAsync(admin, fecha, armado.SalonId, new SectorEstadoRequest(armado.B.Id, "cerrado", "Poco personal", null));
        res.EnsureSuccessStatusCode();

        var cena = await CenaAsync(admin, fecha, armado.SalonId);
        var deB = armado.Mesas.Where(m => m.SectorId == armado.B.Id).Select(m => m.Id).ToHashSet();
        Assert.All(cena.Mesas.Where(m => deB.Contains(m.Id)), m => Assert.True(m.Reducida));
        Assert.All(cena.Mesas.Where(m => !deB.Contains(m.Id)), m => Assert.False(m.Reducida));
        var estado = cena.Sectores!.Single(s => s.SectorId == armado.B.Id);
        Assert.Equal("cerrado", estado.Estado);
        Assert.Equal("Poco personal", estado.Motivo);
        Assert.Equal(FilasEsperadas(DiaService.FactorAbierto(cena)), cena.Reservas.Count);
        Assert.True(cena.Reservas.Count < HorariosDefault.Cena.Length);

        (await SectoresTurnoAsync(admin, fecha, armado.SalonId, new SectorEstadoRequest(armado.B.Id, "abierto", null, null))).EnsureSuccessStatusCode();

        var abierta = await CenaAsync(admin, fecha, armado.SalonId);
        Assert.Equal(HorariosDefault.Cena.Length, abierta.Reservas.Count);
        Assert.All(abierta.Mesas, m => Assert.False(m.Reducida));
        Assert.Equal("abierto", abierta.Sectores!.Single(s => s.SectorId == armado.B.Id).Estado);
    }

    [Fact]
    public async Task Achicar_la_planilla_nunca_borra_reservas()
    {
        var admin = await ClienteAsync();
        var armado = await ArmarAsync(admin, "3");
        var fecha = EnDias(41);
        var cena = await CenaAsync(admin, fecha, armado.SalonId);
        // Las 4 filas de las 20:30 con reserva (sin mesa).
        foreach (var fila in cena.Reservas.Where(r => r.Hora == "20:30"))
        {
            (await admin.PatchAsJsonAsync($"/api/reservas/{fila.Id}", new { nombre = $"Reserva {fila.Id}", pax = 2 })).EnsureSuccessStatusCode();
        }

        (await SectoresTurnoAsync(admin, fecha, armado.SalonId, new SectorEstadoRequest(armado.B.Id, "cerrado", null, null))).EnsureSuccessStatusCode();

        var despues = await CenaAsync(admin, fecha, armado.SalonId);
        Assert.Equal(4, despues.Reservas.Count(r => r.Hora == "20:30" && r.Nombre != null));
    }

    [Fact]
    public async Task Un_grupo_ocupa_todo_el_sector_con_una_sola_reserva_y_al_borrarla_el_sector_se_abre()
    {
        var admin = await ClienteAsync();
        var armado = await ArmarAsync(admin, "4");
        var fecha = EnDias(42);

        var res = await SectoresTurnoAsync(admin, fecha, armado.SalonId,
            new SectorEstadoRequest(armado.B.Id, "grupo", null, new GrupoSectorRequest("Cumpleaños Fernández", 40, "21:00", "11 4012-3344", null)));
        res.EnsureSuccessStatusCode();

        var cena = await CenaAsync(admin, fecha, armado.SalonId);
        var estado = cena.Sectores!.Single(s => s.SectorId == armado.B.Id);
        Assert.Equal("grupo", estado.Estado);
        var grupo = cena.Reservas.Single(r => r.Id == estado.ReservaId);
        Assert.Equal("Cumpleaños Fernández", grupo.Nombre);
        Assert.Equal(40, grupo.Pax);
        Assert.Equal("21:00", grupo.Hora);
        Assert.Equal(armado.B.Id, grupo.SectorId);
        Assert.True(grupo.PidioMesa);
        Assert.Equal(estado.MesaIds.OrderBy(x => x), grupo.MesaIds.OrderBy(x => x));
        Assert.All(estado.MesaIds, id => Assert.Contains(id, cena.MesasOcupadas));
        Assert.Equal(FilasEsperadas(DiaService.FactorAbierto(cena)) + 1, cena.Reservas.Count);

        (await admin.PostAsync($"/api/reservas/{grupo.Id}/vaciar", null)).EnsureSuccessStatusCode();

        var despues = await CenaAsync(admin, fecha, armado.SalonId);
        Assert.Equal("abierto", despues.Sectores!.Single(s => s.SectorId == armado.B.Id).Estado);
        Assert.Equal(HorariosDefault.Cena.Length, despues.Reservas.Count);
        Assert.Empty(despues.MesasOcupadas);
    }

    [Fact]
    public async Task No_se_puede_cerrar_un_sector_con_reservas_en_sus_mesas()
    {
        var admin = await ClienteAsync();
        var armado = await ArmarAsync(admin, "5");
        var fecha = EnDias(43);
        var cena = await CenaAsync(admin, fecha, armado.SalonId);
        var mesaB = armado.Mesas.First(m => m.SectorId == armado.B.Id && m.MesaPadreId is null);
        var fila = cena.Reservas.First();
        (await admin.PatchAsJsonAsync($"/api/reservas/{fila.Id}", new { nombre = "Paz", mesaIds = new[] { mesaB.Id } })).EnsureSuccessStatusCode();

        var res = await SectoresTurnoAsync(admin, fecha, armado.SalonId, new SectorEstadoRequest(armado.B.Id, "cerrado", null, null));

        Assert.Equal(HttpStatusCode.Conflict, res.StatusCode);
        Assert.Contains(mesaB.Codigo, await res.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Un_grupo_sin_nombre_no_se_carga()
    {
        var admin = await ClienteAsync();
        var armado = await ArmarAsync(admin, "6");

        var res = await SectoresTurnoAsync(admin, EnDias(44), armado.SalonId,
            new SectorEstadoRequest(armado.A.Id, "grupo", null, new GrupoSectorRequest(" ", 20, "21:00", null, null)));

        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
    }

    [Fact]
    public async Task Staff_no_puede_cambiar_los_sectores()
    {
        var admin = await ClienteAsync();
        var armado = await ArmarAsync(admin, "7");
        var staff = await ClienteAsync("staff");

        var res = await SectoresTurnoAsync(staff, EnDias(45), armado.SalonId, new SectorEstadoRequest(armado.B.Id, "cerrado", null, null));

        Assert.Equal(HttpStatusCode.Forbidden, res.StatusCode);
    }

    [Fact]
    public async Task Reducir_mesas_sueltas_tambien_achica_la_planilla()
    {
        var admin = await ClienteAsync();
        var armado = await ArmarAsync(admin, "8");
        var fecha = EnDias(46);
        await CenaAsync(admin, fecha, armado.SalonId);
        var mitad = armado.Mesas.Where(m => m.SectorId == armado.A.Id).Select(m => m.Id).ToList();

        (await admin.PostAsJsonAsync("/api/reducciones/set", new ReducirSalonRequest(fecha, Turno.Cena, armado.SalonId, mitad))).EnsureSuccessStatusCode();

        var cena = await CenaAsync(admin, fecha, armado.SalonId);
        Assert.Equal(FilasEsperadas(DiaService.FactorAbierto(cena)), cena.Reservas.Count);
        Assert.True(cena.Reservas.Count < HorariosDefault.Cena.Length);
    }
}
