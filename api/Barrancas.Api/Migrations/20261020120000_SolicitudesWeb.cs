using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Barrancas.Api.Migrations
{
    /// <inheritdoc />
    public partial class SolicitudesWeb : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Solicitudes del link (grupos de 6 o mas, salones que no
            // confirman solos): ahora se aprueban o se rechazan desde
            // Reservas web antes de entrar a la grilla. Quien la rechazo,
            // cuando y por que (EstadoReservaWeb.Rechazada = 3).
            migrationBuilder.AddColumn<DateTime>(
                name: "RechazadaEn",
                table: "ReservasWeb",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "RechazadaPor",
                table: "ReservasWeb",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "MotivoRechazo",
                table: "ReservasWeb",
                type: "text",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(name: "RechazadaEn", table: "ReservasWeb");
            migrationBuilder.DropColumn(name: "RechazadaPor", table: "ReservasWeb");
            migrationBuilder.DropColumn(name: "MotivoRechazo", table: "ReservasWeb");
        }
    }
}
