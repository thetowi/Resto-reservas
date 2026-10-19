using Barrancas.Api.Models;
using Barrancas.Api.Services;
using Xunit;

namespace Barrancas.Api.Tests;

/// <summary>
/// "Estamos en servicio" del link de reservas (ReservaOnlineService.EstaEnServicio):
/// hoy, desde el primer horario del turno hasta que cierra la cocina, el turno
/// es por orden de llegada. Almuerzo 12:30-15:00, cena 20:30-00:00.
/// </summary>
public class EnServicioTests
{
    private static readonly DateOnly Hoy = new(2026, 10, 19);

    private static DateTime A(int h, int m) => Hoy.ToDateTime(new TimeOnly(h, m));

    [Theory]
    [InlineData(12, 29, false)]
    [InlineData(12, 30, true)]
    [InlineData(14, 59, true)]
    [InlineData(15, 0, false)]
    [InlineData(20, 45, false)]
    public void Almuerzo(int h, int m, bool esperado) =>
        Assert.Equal(esperado, ReservaOnlineService.EstaEnServicio(A(h, m), Hoy, Turno.Almuerzo));

    [Theory]
    [InlineData(20, 29, false)]
    [InlineData(20, 30, true)]
    [InlineData(23, 59, true)]
    [InlineData(13, 0, false)]
    public void Cena(int h, int m, bool esperado) =>
        Assert.Equal(esperado, ReservaOnlineService.EstaEnServicio(A(h, m), Hoy, Turno.Cena));

    [Fact]
    public void Pasada_la_medianoche_ya_es_otro_dia() =>
        Assert.False(ReservaOnlineService.EstaEnServicio(Hoy.AddDays(1).ToDateTime(new TimeOnly(0, 10)), Hoy, Turno.Cena));

    [Fact]
    public void Otro_dia_nunca_esta_en_servicio() =>
        Assert.False(ReservaOnlineService.EstaEnServicio(A(13, 0), Hoy.AddDays(1), Turno.Almuerzo));

    [Fact]
    public void Fin_del_servicio()
    {
        Assert.Equal("15:00", ReservaOnlineService.FinServicio(Turno.Almuerzo));
        Assert.Equal("00:00", ReservaOnlineService.FinServicio(Turno.Cena));
    }
}
