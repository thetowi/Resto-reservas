using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using Barrancas.Api.Data;
using Barrancas.Api.Hubs;
using Barrancas.Api.Services;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;

var builder = WebApplication.CreateBuilder(args);

// --- Base de datos ---
var connectionString = builder.Configuration.GetConnectionString("Default")
    ?? Environment.GetEnvironmentVariable("DATABASE_URL")
    ?? throw new InvalidOperationException(
        "Falta la connection string de Postgres (ConnectionStrings:Default o DATABASE_URL).");

builder.Services.AddDbContext<BarrancasDbContext>(options =>
    options.UseNpgsql(NormalizarConnectionString(connectionString), npgsqlOptions =>
        npgsqlOptions.EnableRetryOnFailure(maxRetryCount: 5, maxRetryDelay: TimeSpan.FromSeconds(10), errorCodesToAdd: null)));

// --- Servicios de dominio ---
builder.Services.AddScoped<DiaService>();
builder.Services.AddScoped<TokenService>();

// --- JWT ---
var jwtSecret = builder.Configuration["Jwt:Secret"]
    ?? Environment.GetEnvironmentVariable("JWT_SECRET")
    ?? throw new InvalidOperationException("Falta configurar Jwt:Secret / JWT_SECRET");
var jwtIssuer = builder.Configuration["Jwt:Issuer"] ?? "barrancas-api";
var jwtAudience = builder.Configuration["Jwt:Audience"] ?? "barrancas-web";

builder.Services.AddAuthentication(options =>
{
    options.DefaultAuthenticateScheme = JwtBearerDefaults.AuthenticationScheme;
    options.DefaultChallengeScheme = JwtBearerDefaults.AuthenticationScheme;
})
.AddJwtBearer(options =>
{
    options.TokenValidationParameters = new TokenValidationParameters
    {
        ValidateIssuer = true,
        ValidIssuer = jwtIssuer,
        ValidateAudience = true,
        ValidAudience = jwtAudience,
        ValidateIssuerSigningKey = true,
        IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtSecret)),
        ValidateLifetime = true,
        ClockSkew = TimeSpan.FromMinutes(1),
    };

    // El cliente SignalR no puede mandar el header Authorization en el
    // handshake de WebSocket, asi que aceptamos el token por query string
    // solo para las conexiones al hub.
    options.Events = new JwtBearerEvents
    {
        OnMessageReceived = context =>
        {
            var accessToken = context.Request.Query["access_token"];
            var path = context.HttpContext.Request.Path;
            if (!string.IsNullOrEmpty(accessToken) && path.StartsWithSegments("/hubs/reservas"))
            {
                context.Token = accessToken;
            }
            return Task.CompletedTask;
        },
    };
});

builder.Services.AddAuthorization();

// --- CORS ---
var corsOrigin = builder.Configuration["Cors:Origin"] ?? Environment.GetEnvironmentVariable("CORS_ORIGIN");
builder.Services.AddCors(options =>
{
    options.AddPolicy("Frontend", policy =>
    {
        if (!string.IsNullOrWhiteSpace(corsOrigin))
        {
            policy.WithOrigins(corsOrigin.Split(',', StringSplitOptions.RemoveEmptyEntries))
                .AllowAnyHeader()
                .AllowAnyMethod()
                .AllowCredentials();
        }
        else
        {
            // Desarrollo local: cualquier origen, sin credenciales de cookies
            // (usamos JWT en header/query, no cookies).
            policy.AllowAnyOrigin().AllowAnyHeader().AllowAnyMethod();
        }
    });
});

// --- Controllers + SignalR, con enums serializados como texto en minuscula ---
builder.Services.AddControllers().AddJsonOptions(opts =>
{
    opts.JsonSerializerOptions.Converters.Add(
        new JsonStringEnumConverter(JsonNamingPolicy.CamelCase));
});

builder.Services.AddSignalR().AddJsonProtocol(opts =>
{
    opts.PayloadSerializerOptions.Converters.Add(
        new JsonStringEnumConverter(JsonNamingPolicy.CamelCase));
});

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

var app = builder.Build();

// --- Migraciones + seed automatico al iniciar ---
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<BarrancasDbContext>();
    await DbSeeder.SeedAsync(db);
}

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseCors("Frontend");
app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();
app.MapHub<ReservasHub>("/hubs/reservas");

app.MapGet("/api/health", () => Results.Ok(new { ok = true }));

app.Run();

static string NormalizarConnectionString(string raw)
{
    // Railway (y otros PaaS) suelen exponer la DB como una URL tipo
    // postgres://usuario:pass@host:puerto/db en vez de un connection
    // string clasico de Npgsql. La convertimos si hace falta.
    if (!raw.StartsWith("postgres://") && !raw.StartsWith("postgresql://"))
    {
        return raw;
    }

    var uri = new Uri(raw);
    var userInfo = uri.UserInfo.Split(':', 2);
    var builder = new Npgsql.NpgsqlConnectionStringBuilder
    {
        Host = uri.Host,
        Port = uri.Port > 0 ? uri.Port : 5432,
        Username = Uri.UnescapeDataString(userInfo[0]),
        Password = userInfo.Length > 1 ? Uri.UnescapeDataString(userInfo[1]) : "",
        Database = uri.AbsolutePath.TrimStart('/'),
        SslMode = Npgsql.SslMode.Require,
        TrustServerCertificate = true,
        // La imagen de Linux que usa Railway no trae libgssapi_krb5 (Kerberos),
        // y Npgsql 10 por defecto intenta negociar esa autenticacion en cada
        // conexion. Como no la usamos para nada, la desactivamos directamente
        // para que ni lo intente — si no, la negociacion fallida corrompe la
        // conexion y cada query termina en EndOfStreamException.
        GssEncryptionMode = Npgsql.GssEncryptionMode.Disable,
    };
    return builder.ConnectionString;
}

public partial class Program { }
