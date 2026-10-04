using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace Barrancas.Api.Migrations
{
    /// <inheritdoc />
    public partial class BotWhatsapp : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // De donde vino esta reserva (Staff/Bot) y, si vino del bot, si
            // la pudo confirmar sola o quedo pendiente (ver
            // Models/OrigenReserva.cs / Models/EstadoReserva.cs). Arrancan
            // en 0 (Staff / Confirmada) para todas las reservas existentes:
            // ninguna reserva ya cargada por el staff cambia de
            // comportamiento al aplicar esta migración.
            migrationBuilder.AddColumn<int>(
                name: "Origen",
                table: "Reservas",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<int>(
                name: "Estado",
                table: "Reservas",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.CreateTable(
                name: "FechasBloqueadasBot",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    Fecha = table.Column<DateOnly>(type: "date", nullable: false),
                    Motivo = table.Column<string>(type: "text", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_FechasBloqueadasBot", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_FechasBloqueadasBot_Fecha",
                table: "FechasBloqueadasBot",
                column: "Fecha",
                unique: true);

            migrationBuilder.CreateTable(
                name: "ConversacionesBot",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    Telefono = table.Column<string>(type: "text", nullable: false),
                    HistorialJson = table.Column<string>(type: "text", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ConversacionesBot", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_ConversacionesBot_Telefono",
                table: "ConversacionesBot",
                column: "Telefono",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ConversacionesBot");

            migrationBuilder.DropTable(
                name: "FechasBloqueadasBot");

            migrationBuilder.DropColumn(
                name: "Estado",
                table: "Reservas");

            migrationBuilder.DropColumn(
                name: "Origen",
                table: "Reservas");
        }
    }
}
