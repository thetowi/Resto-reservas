using System;
using Barrancas.Api.Data;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Barrancas.Api.Migrations
{
    // Sin archivo .Designer.cs: los dos atributos de abajo alcanzan para que
    // EF la encuentre y la aplique al arrancar.
    [DbContext(typeof(BarrancasDbContext))]
    [Migration("20261113120000_OrdenDeLlegada")]
    public partial class OrdenDeLlegada : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Orden de llegada de las reservas (ver Models/Reserva.cs):
            // cuándo entró cada una y quién la cargó.
            migrationBuilder.AddColumn<DateTime>(
                name: "RecibidaEn",
                table: "Reservas",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "RecibidaPor",
                table: "Reservas",
                type: "text",
                nullable: true);

            // Las que ya están en la grilla y vinieron por el link toman la
            // hora real en que el cliente la mandó (registro de Reservas
            // web; Origen 2 = Web, Estado 2 = Cancelada). Las cargadas a
            // mano antes de hoy no tienen ese dato y quedan en null.
            migrationBuilder.Sql("""
                UPDATE "Reservas" r
                SET "RecibidaEn" = w."CreadaEn"
                FROM "ReservasWeb" w
                WHERE w."ReservaId" = r."Id" AND w."Estado" <> 2 AND r."Origen" = 2;
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(name: "RecibidaEn", table: "Reservas");
            migrationBuilder.DropColumn(name: "RecibidaPor", table: "Reservas");
        }
    }
}
