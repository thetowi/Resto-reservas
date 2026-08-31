using Barrancas.Api.Data;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Barrancas.Api.Tests;

/// <summary>
/// Levanta la API completa en memoria para tests de integracion, reemplazando
/// Postgres por el proveedor InMemory de EF Core (una base nueva por cada
/// instancia de la factory, para que los tests no se pisen entre si).
///
/// Program.cs lee DATABASE_URL/JWT_SECRET/CORS_ORIGIN directamente de
/// variables de entorno del proceso (no solo de IConfiguration), asi que las
/// seteamos aca antes de que WebApplicationFactory arranque el host — es la
/// forma confiable de que ese codigo (que corre ANTES de que los hooks de
/// configuracion de test se apliquen) encuentre valores validos.
/// </summary>
public class BarrancasWebApplicationFactory : WebApplicationFactory<Program>
{
    public readonly string DbName = Guid.NewGuid().ToString();

    public BarrancasWebApplicationFactory()
    {
        Environment.SetEnvironmentVariable("DATABASE_URL",
            "Host=localhost;Database=placeholder;Username=x;Password=x");
        Environment.SetEnvironmentVariable("JWT_SECRET",
            "clave-de-test-suficientemente-larga-1234567890");
        Environment.SetEnvironmentVariable("CORS_ORIGIN", "http://localhost:3000");
    }

    protected override void ConfigureWebHost(Microsoft.AspNetCore.Hosting.IWebHostBuilder builder)
    {
        builder.ConfigureServices(services =>
        {
            var descriptor = services.SingleOrDefault(
                d => d.ServiceType == typeof(DbContextOptions<BarrancasDbContext>));
            if (descriptor is not null) services.Remove(descriptor);

            services.AddDbContext<BarrancasDbContext>(options =>
                options.UseInMemoryDatabase(DbName));
        });
    }
}
