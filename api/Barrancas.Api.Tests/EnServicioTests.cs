using Barrancas.Api.Models;
using Barrancas.Api.Services;
using Xunit;

namespace Barrancas.Api.Tests;

/// <summary>
/// "Estamos en servicio" del link de reservas (ReservaOnlineService.EstaEnServicio):
/// hoy, desde el primer horario del turno hasta el ultimo + 90 min, el turno
/// es por orden de llegada. Con la planilla actual: almuerzo 12:30-15:30,
/// cena 20:30-23:30.
/// </summary>
public class EnServicioTests
{
    private static readonly DateOnly Hoy = new(2026, 10, 19);

    private static DateTime A(int h, int m) => Hoy.ToDateTime(new TimeOnly(h, m));

    [Theory]
    [InlineData(12, 29, false)]
    [InlineData(12, 30, true)]
    [InlineData(14, 0, true)]
    [InlineData(15, 29, true)]
    [InlineData(15, 30, false)]
    [InlineData(20, 45, false)]
    public void Almuerzo(int h, int m, bool esperado) =>
        Assert.Equal(esperado, ReservaOnlineService.EstaEnServicio(A(h, m), Hoy, Turno.Almuerzo));

    [Theory]
    [InlineData(20, 29, false)]
    [InlineData(20, 30, true)]
    [InlineData(23, 29, true)]
    [InlineData(23, 30, false)]
    [InlineData(13, 0, false)]
    public void Cena(int h, int m, bool esperado) =>
        Assert.Equal(esperado, ReservaOnlineService.EstaEnServicio(A(h, m), Hoy, Turno.Cena));

    [Fact]
    public void Otro_dia_nunca_esta_en_servicio() =>
        Assert.False(ReservaOnlineService.EstaEnServicio(A(13, 0), Hoy.AddDays(1), Turno.Almuerzo));

    [Fact]
    public void Fin_del_servicio_es_el_ultimo_horario_mas_90_minutos()
    {
        Assert.Equal("15:30", ReservaOnlineService.FinServicio(Turno.Almuerzo));
        Assert.Equal("23:30", ReservaOnlineService.FinServicio(Turno.Cena));
    }
}
