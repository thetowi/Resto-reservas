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
/// Orden de llegada de las reservas (columna «Recibida» del panel): cuándo
/// entró cada una y quién la cargó.
/// </summary>
public class OrdenDeLlegadaTests : IClassFixture<BarrancasWebApplicationFactory>
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web)
    {
        Converters = { new JsonStringEnumConverter(JsonNamingPolicy.CamelCase) },
    };

    private readonly BarrancasWebApplicationFactory _factory;

    public OrdenDeLlegadaTests(BarrancasWebApplicationFactory factory)
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

    private static async Task<int> RestaurantIdAsync(HttpClient client)
    {
        var config = await client.GetFromJsonAsync<PublicoConfigDto>("/api/publico/config");
        return config!.Salones.Single(s => s.Nombre == "Restaurant").Id;
    }

    private static async Task<TurnoDataDto> CenaAsync(HttpClient client, DateOnly fecha)
    {
        var salonId = await RestaurantIdAsync(client);
        var dia = await client.GetFromJsonAsync<DiaDto>($"/api/dias/{fecha:yyyy-MM-dd}?salonId={salonId}", Json);
        return dia!.Cena;
    }

    private static ReservaDto FilaVacia(TurnoDataDto turno, string hora) =>
        turno.Reservas.First(r => r.Hora == hora && r.Pax is null && string.IsNullOrEmpty(r.Nombre));

    private static async Task<ReservaDto> FilaAsync(HttpClient client, DateOnly fecha, int id) =>
        (await CenaAsync(client, fecha)).Reservas.Single(r => r.Id == id);

    [Fact]
    public async Task Una_fila_vacia_no_tiene_hora_de_llegada()
    {
        var client = await ClienteAsync();

        var cena = await CenaAsync(client, EnDias(30));

        Assert.All(cena.Reservas, r => Assert.Null(r.RecibidaEn));
    }

    [Fact]
    public async Task Cargar_la_reserva_anota_cuando_entro_y_quien_la_cargo()
    {
        var client = await ClienteAsync();
        var fecha = EnDias(31);
        var fila = FilaVacia(await CenaAsync(client, fecha), "21:00");
        var antes = DateTime.UtcNow;

        (await client.PatchAsJsonAsync($"/api/reservas/{fila.Id}", new { nombre = "Gómez" })).EnsureSuccessStatusCode();

        var cargada = await FilaAsync(client, fecha, fila.Id);
        Assert.NotNull(cargada.RecibidaEn);
        Assert.InRange(cargada.RecibidaEn!.Value, antes.AddSeconds(-1), DateTime.UtcNow.AddSeconds(1));
        Assert.Equal("Admin", cargada.RecibidaPor);
    }

    [Fact]
    public async Task Editarla_despues_no_cambia_su_lugar()
    {
        var client = await ClienteAsync();
        var fecha = EnDias(32);
        var fila = FilaVacia(await CenaAsync(client, fecha), "21:00");
        (await client.PatchAsJsonAsync($"/api/reservas/{fila.Id}", new { nombre = "Paz" })).EnsureSuccessStatusCode();
        var primera = (await FilaAsync(client, fecha, fila.Id)).RecibidaEn;
        await Task.Delay(20);

        (await client.PatchAsJsonAsync($"/api/reservas/{fila.Id}", new { comentarios = "Ventana", pax = 3 })).EnsureSuccessStatusCode();

        Assert.Equal(primera, (await FilaAsync(client, fecha, fila.Id)).RecibidaEn);
    }

    [Fact]
    public async Task Una_reserva_cargada_antes_de_esta_funcion_sigue_sin_hora_aunque_se_edite()
    {
        var client = await ClienteAsync();
        var fecha = EnDias(38);
        var fila = FilaVacia(await CenaAsync(client, fecha), "21:00");
        using (var scope = _factory.Services.CreateScope())
        {
            // Como quedaron en la base las reservas de antes: con datos y sin hora.
            var db = scope.ServiceProvider.GetRequiredService<BarrancasDbContext>();
            var r = await db.Reservas.SingleAsync(x => x.Id == fila.Id);
            r.Nombre = "Quiroga";
            r.Pax = 4;
            await db.SaveChangesAsync();
        }

        (await client.PatchAsJsonAsync($"/api/reservas/{fila.Id}", new { comentarios = "Ventana" })).EnsureSuccessStatusCode();

        Assert.Null((await FilaAsync(client, fecha, fila.Id)).RecibidaEn);
    }

    [Fact]
    public async Task Solo_cambiar_la_hora_de_una_fila_vacia_no_la_cuenta_como_reserva()
    {
        var client = await ClienteAsync();
        var fecha = EnDias(33);
        var fila = FilaVacia(await CenaAsync(client, fecha), "21:00");

        (await client.PatchAsJsonAsync($"/api/reservas/{fila.Id}", new { hora = "21:15" })).EnsureSuccessStatusCode();

        Assert.Null((await FilaAsync(client, fecha, fila.Id)).RecibidaEn);
    }

    [Fact]
    public async Task Borrarle_todo_a_mano_la_deja_sin_hora_y_la_proxima_cuenta_como_nueva()
    {
        var client = await ClienteAsync();
        var fecha = EnDias(34);
        var fila = FilaVacia(await CenaAsync(client, fecha), "21:00");
        (await client.PatchAsJsonAsync($"/api/reservas/{fila.Id}", new { nombre = "Ruiz" })).EnsureSuccessStatusCode();

        (await client.PatchAsJsonAsync($"/api/reservas/{fila.Id}", new { nombre = "" })).EnsureSuccessStatusCode();

        var vacia = await FilaAsync(client, fecha, fila.Id);
        Assert.Null(vacia.RecibidaEn);
        Assert.Null(vacia.RecibidaPor);
    }

    [Fact]
    public async Task El_tachito_borra_la_hora_y_deshacer_la_devuelve()
    {
        var client = await ClienteAsync();
        var fecha = EnDias(35);
        var fila = FilaVacia(await CenaAsync(client, fecha), "21:00");
        (await client.PatchAsJsonAsync($"/api/reservas/{fila.Id}", new { nombre = "Sosa", pax = 2 })).EnsureSuccessStatusCode();
        var cargada = await FilaAsync(client, fecha, fila.Id);

        (await client.PostAsync($"/api/reservas/{fila.Id}/vaciar", null)).EnsureSuccessStatusCode();
        Assert.Null((await FilaAsync(client, fecha, fila.Id)).RecibidaEn);

        (await client.PostAsJsonAsync($"/api/reservas/{fila.Id}/restaurar",
            new RestaurarReservaRequest("21:00", 2, "Sosa", null, null, false, false, false, null,
                OrigenReserva.Staff, EstadoReserva.Confirmada, null, cargada.RecibidaEn, cargada.RecibidaPor)))
            .EnsureSuccessStatusCode();

        var devuelta = await FilaAsync(client, fecha, fila.Id);
        Assert.Equal(cargada.RecibidaEn, devuelta.RecibidaEn);
        Assert.Equal("Admin", devuelta.RecibidaPor);
    }

    [Fact]
    public async Task Moverla_de_horario_conserva_su_hora_de_llegada()
    {
        var client = await ClienteAsync();
        var fecha = EnDias(36);
        var cena = await CenaAsync(client, fecha);
        var origen = FilaVacia(cena, "21:00");
        var destino = FilaVacia(cena, "21:30");
        (await client.PatchAsJsonAsync($"/api/reservas/{origen.Id}", new { nombre = "Álvarez" })).EnsureSuccessStatusCode();
        var cargada = await FilaAsync(client, fecha, origen.Id);

        (await client.PostAsJsonAsync($"/api/reservas/{origen.Id}/mover", new MoverReservaRequest(destino.Id))).EnsureSuccessStatusCode();

        var despues = await CenaAsync(client, fecha);
        Assert.Null(despues.Reservas.Single(r => r.Id == origen.Id).RecibidaEn);
        var movida = despues.Reservas.Single(r => r.Id == destino.Id);
        Assert.Equal(cargada.RecibidaEn, movida.RecibidaEn);
        Assert.Equal("Admin", movida.RecibidaPor);
    }

    [Fact]
    public async Task Una_reserva_del_link_toma_la_hora_en_que_el_cliente_la_mando()
    {
        var client = await ClienteAsync();
        var fecha = EnDias(37);
        var salonId = await RestaurantIdAsync(client);

        var res = await client.PostAsJsonAsync("/api/publico/reservas",
            new PublicoReservaRequest(fecha, salonId, "cena", "21:00", 2, "Lucía Ferro", "11 4444-1234", null, null, null, true, null));
        res.EnsureSuccessStatusCode();
        var creada = await res.Content.ReadFromJsonAsync<PublicoReservaResultado>();
        var registro = Assert.Single(
            (await client.GetFromJsonAsync<List<ReservaWebDto>>("/api/reservas-web", Json))!,
            w => w.Codigo == creada!.Codigo);

        var fila = await FilaAsync(client, fecha, registro.ReservaId!.Value);
        Assert.Equal(registro.CreadaEn, fila.RecibidaEn);
        Assert.Null(fila.RecibidaPor);
        Assert.Equal(OrigenReserva.Web, fila.Origen);
    }
}
