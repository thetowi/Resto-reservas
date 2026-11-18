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
/// Configuración de cada salón (Admin → Salones): turnos y días que ofrece,
/// cómo toma reservas el link (si aparece, confirmación, máximo de personas,
/// días hacia adelante) y el orden de la lista.
/// </summary>
public class ConfiguracionSalonTests : IClassFixture<BarrancasWebApplicationFactory>
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web)
    {
        Converters = { new JsonStringEnumConverter(JsonNamingPolicy.CamelCase) },
    };

    private readonly BarrancasWebApplicationFactory _factory;

    public ConfiguracionSalonTests(BarrancasWebApplicationFactory factory)
    {
        _factory = factory;
    }

    private async Task<HttpClient> AdminAsync()
    {
        var client = _factory.CreateClient();
        var login = await client.PostAsJsonAsync("/api/auth/login", new LoginRequest("admin", "admin"));
        login.EnsureSuccessStatusCode();
        var body = await login.Content.ReadFromJsonAsync<LoginResponse>();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", body!.Token);
        return client;
    }

    private static async Task<SalonDto> RestaurantAsync(HttpClient admin)
    {
        var meta = await admin.GetFromJsonAsync<MetaDto>("/api/meta", Json);
        return meta!.Salones.Single(s => s.Nombre == "Restaurant");
    }

    private static async Task<SalonDto> PatchAsync(HttpClient admin, int salonId, object cambios)
    {
        var res = await admin.PatchAsync($"/api/salones/{salonId}", JsonContent.Create(cambios));
        res.EnsureSuccessStatusCode();
        var salones = await res.Content.ReadFromJsonAsync<List<SalonDto>>(Json);
        return salones!.Single(s => s.Id == salonId);
    }

    // Lo que tenía el salón al arrancar (para dejarlo igual al terminar cada test).
    private static readonly object Original = new
    {
        ofreceAlmuerzo = true,
        ofreceCena = true,
        diasAlmuerzo = Salon.TodosLosDias,
        diasCena = Salon.TodosLosDias,
        mostrarEnLink = true,
        confirmacion = "hastaPax",
        confirmaHastaPax = 6,
        paxMaximoWeb = 20,
        anticipacionMinutos = 60,
        diasAdelante = 60,
        toleranciaMinutos = 15,
    };

    // Primera fecha (desde dentro de 3 días) que cae en ese día de la semana.
    private static DateOnly Proximo(DayOfWeek dia)
    {
        var f = ReservaOnlineService.HoyLocal().AddDays(3);
        while (f.DayOfWeek != dia) f = f.AddDays(1);
        return f;
    }

    private static PublicoReservaRequest Pedido(DateOnly fecha, int salonId, int pax) =>
        new(fecha, salonId, "cena", "21:00", pax, "Laura Gómez", "11 4444-" + Random.Shared.Next(1000, 9999), null, null, null, true, null);

    [Fact]
    public async Task Guardar_la_configuracion_la_devuelve_en_meta()
    {
        var admin = await AdminAsync();
        var salon = await RestaurantAsync(admin);

        var nuevo = await PatchAsync(admin, salon.Id, new
        {
            color = "#2f7d6d",
            diasCena = 0b0111110, // martes a domingo
            confirmacion = "siempre",
            paxMaximoWeb = 12,
            anticipacionMinutos = 120,
            diasAdelante = 30,
            toleranciaMinutos = 20,
        });

        Assert.Equal("#2f7d6d", nuevo.Color);
        Assert.Equal(0b0111110, nuevo.DiasCena);
        Assert.Equal(ConfirmacionWeb.Siempre, nuevo.Confirmacion);
        Assert.Equal(12, nuevo.PaxMaximoWeb);
        Assert.Equal(120, nuevo.AnticipacionMinutos);
        Assert.Equal(30, nuevo.DiasAdelante);
        Assert.Equal(20, nuevo.ToleranciaMinutos);
        Assert.Equal(nuevo, await RestaurantAsync(admin));

        await PatchAsync(admin, salon.Id, Original);
    }

    [Theory]
    [InlineData("{\"color\":\"verde\"}")]
    [InlineData("{\"diasCena\":200}")]
    [InlineData("{\"paxMaximoWeb\":0}")]
    [InlineData("{\"toleranciaMinutos\":500}")]
    public async Task Valores_invalidos_devuelven_400(string cuerpo)
    {
        var admin = await AdminAsync();
        var salon = await RestaurantAsync(admin);

        var res = await admin.PatchAsync($"/api/salones/{salon.Id}",
            new StringContent(cuerpo, System.Text.Encoding.UTF8, "application/json"));

        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
    }

    [Fact]
    public async Task Reordenar_deja_los_salones_en_el_orden_nuevo()
    {
        var admin = await AdminAsync();
        (await admin.PostAsJsonAsync("/api/salones", new { nombre = "Terraza orden" })).EnsureSuccessStatusCode();
        var meta = await admin.GetFromJsonAsync<MetaDto>("/api/meta", Json);
        var ids = meta!.Salones.OrderBy(s => s.Orden).Select(s => s.Id).Reverse().ToList();

        var res = await admin.PostAsJsonAsync("/api/salones/orden", new OrdenSalonesRequest(ids));
        res.EnsureSuccessStatusCode();

        var salones = (await res.Content.ReadFromJsonAsync<List<SalonDto>>(Json))!;
        Assert.Equal(ids, salones.OrderBy(s => s.Orden).Select(s => s.Id).ToList());

        // Faltando alguno no se puede.
        var incompleto = await admin.PostAsJsonAsync("/api/salones/orden", new OrdenSalonesRequest(ids.Skip(1).ToList()));
        Assert.Equal(HttpStatusCode.BadRequest, incompleto.StatusCode);
    }

    [Fact]
    public async Task Un_dia_que_el_salon_no_abre_queda_cerrado_y_se_puede_abrir_igual()
    {
        var admin = await AdminAsync();
        var salon = await RestaurantAsync(admin);
        await PatchAsync(admin, salon.Id, new { diasCena = Salon.TodosLosDias & ~1 }); // sin lunes
        var lunes = Proximo(DayOfWeek.Monday);

        var dia = await admin.GetFromJsonAsync<DiaDto>($"/api/dias/{lunes:yyyy-MM-dd}?salonId={salon.Id}", Json);
        Assert.True(dia!.Cena.EstaCerrado);
        Assert.Contains("lunes", dia.Cena.MotivoCierre);
        Assert.Empty(dia.Cena.Reservas); // no se arma la planilla de un turno cerrado
        Assert.False(dia.Almuerzo.EstaCerrado);

        // «Cerrar en todos los salones» no lo reabre por error.
        (await admin.PostAsJsonAsync("/api/cierres/toggle", new ToggleCierreRequest(lunes, Turno.Cena, salon.Id, "Evento", Cerrar: true))).EnsureSuccessStatusCode();
        dia = await admin.GetFromJsonAsync<DiaDto>($"/api/dias/{lunes:yyyy-MM-dd}?salonId={salon.Id}", Json);
        Assert.True(dia!.Cena.EstaCerrado);

        // El link no lo ofrece.
        var publico = _factory.CreateClient();
        var res = await publico.PostAsJsonAsync("/api/publico/reservas", Pedido(lunes, salon.Id, 2));
        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);

        // Abrirlo ese lunes en particular (el candado del turno).
        (await admin.PostAsJsonAsync("/api/cierres/toggle", new ToggleCierreRequest(lunes, Turno.Cena, salon.Id, null))).EnsureSuccessStatusCode();
        dia = await admin.GetFromJsonAsync<DiaDto>($"/api/dias/{lunes:yyyy-MM-dd}?salonId={salon.Id}", Json);
        Assert.False(dia!.Cena.EstaCerrado);

        // Y volverlo a cerrar.
        (await admin.PostAsJsonAsync("/api/cierres/toggle", new ToggleCierreRequest(lunes, Turno.Cena, salon.Id, null))).EnsureSuccessStatusCode();
        dia = await admin.GetFromJsonAsync<DiaDto>($"/api/dias/{lunes:yyyy-MM-dd}?salonId={salon.Id}", Json);
        Assert.True(dia!.Cena.EstaCerrado);

        await PatchAsync(admin, salon.Id, Original);
    }

    [Fact]
    public async Task Sin_ofrecer_almuerzo_el_turno_queda_cerrado_todos_los_dias()
    {
        var admin = await AdminAsync();
        var salon = await RestaurantAsync(admin);
        await PatchAsync(admin, salon.Id, new { ofreceAlmuerzo = false });
        var fecha = ReservaOnlineService.HoyLocal().AddDays(12);

        var dia = await admin.GetFromJsonAsync<DiaDto>($"/api/dias/{fecha:yyyy-MM-dd}?salonId={salon.Id}", Json);
        Assert.True(dia!.Almuerzo.EstaCerrado);

        var disp = await _factory.CreateClient().GetFromJsonAsync<PublicoDisponibilidadDto>($"/api/publico/disponibilidad?fecha={fecha:yyyy-MM-dd}&pax=2");
        var turnos = disp!.Salones.Single(s => s.SalonId == salon.Id).Turnos.Select(t => t.Turno).ToList();
        Assert.DoesNotContain("almuerzo", turnos);
        Assert.Contains("cena", turnos);

        await PatchAsync(admin, salon.Id, Original);
    }

    [Fact]
    public async Task Confirmacion_nunca_deja_la_reserva_como_solicitud()
    {
        var admin = await AdminAsync();
        var salon = await RestaurantAsync(admin);
        await PatchAsync(admin, salon.Id, new { confirmacion = "nunca" });

        var res = await _factory.CreateClient().PostAsJsonAsync("/api/publico/reservas", Pedido(ReservaOnlineService.HoyLocal().AddDays(14), salon.Id, 2));

        res.EnsureSuccessStatusCode();
        var creada = await res.Content.ReadFromJsonAsync<PublicoReservaResultado>();
        Assert.Equal("pendiente", creada!.Estado);

        await PatchAsync(admin, salon.Id, Original);
    }

    [Fact]
    public async Task Confirmacion_siempre_confirma_tambien_un_grupo()
    {
        var admin = await AdminAsync();
        var salon = await RestaurantAsync(admin);
        await PatchAsync(admin, salon.Id, new { confirmacion = "siempre" });

        var res = await _factory.CreateClient().PostAsJsonAsync("/api/publico/reservas", Pedido(ReservaOnlineService.HoyLocal().AddDays(15), salon.Id, 8));

        res.EnsureSuccessStatusCode();
        var creada = await res.Content.ReadFromJsonAsync<PublicoReservaResultado>();
        Assert.Equal("confirmada", creada!.Estado);

        await PatchAsync(admin, salon.Id, Original);
    }

    [Fact]
    public async Task El_link_respeta_el_maximo_de_personas_y_los_dias_del_salon()
    {
        var admin = await AdminAsync();
        var salon = await RestaurantAsync(admin);
        await PatchAsync(admin, salon.Id, new { paxMaximoWeb = 4, diasAdelante = 10 });
        var publico = _factory.CreateClient();

        var muchos = await publico.PostAsJsonAsync("/api/publico/reservas", Pedido(ReservaOnlineService.HoyLocal().AddDays(5), salon.Id, 6));
        Assert.Equal(HttpStatusCode.BadRequest, muchos.StatusCode);

        var lejos = await publico.PostAsJsonAsync("/api/publico/reservas", Pedido(ReservaOnlineService.HoyLocal().AddDays(20), salon.Id, 2));
        Assert.Equal(HttpStatusCode.BadRequest, lejos.StatusCode);

        var config = await publico.GetFromJsonAsync<PublicoConfigDto>("/api/publico/config");
        var s = config!.Salones.Single(x => x.Id == salon.Id);
        Assert.Equal(4, s.PaxMaximo);
        Assert.Equal(10, s.DiasAdelante);
        Assert.Equal(6, s.ConfirmaHasta);

        await PatchAsync(admin, salon.Id, Original);
    }

    [Fact]
    public async Task Un_salon_oculto_no_aparece_en_el_link()
    {
        var admin = await AdminAsync();
        var salon = await RestaurantAsync(admin);
        await PatchAsync(admin, salon.Id, new { mostrarEnLink = false });
        var publico = _factory.CreateClient();

        var config = await publico.GetFromJsonAsync<PublicoConfigDto>("/api/publico/config");
        Assert.DoesNotContain(config!.Salones, s => s.Id == salon.Id);

        var res = await publico.PostAsJsonAsync("/api/publico/reservas", Pedido(ReservaOnlineService.HoyLocal().AddDays(8), salon.Id, 2));
        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);

        await PatchAsync(admin, salon.Id, Original);
    }
}
