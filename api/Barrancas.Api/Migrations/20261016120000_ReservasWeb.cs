using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace Barrancas.Api.Migrations
{
    /// <inheritdoc />
    public partial class ReservasWeb : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Registro aparte de cada reserva hecha por el link publico (ver
            // Models/ReservaWeb.cs): queda aunque la fila de la grilla se
            // vacie o se quite, para el panel "Reservas por el link".
            migrationBuilder.CreateTable(
                name: "ReservasWeb",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    CreadaEn = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    ReservaId = table.Column<int>(type: "integer", nullable: true),
                    Fecha = table.Column<DateOnly>(type: "date", nullable: false),
                    Turno = table.Column<int>(type: "integer", nullable: false),
                    SalonId = table.Column<int>(type: "integer", nullable: false),
                    Hora = table.Column<string>(type: "text", nullable: false),
                    Pax = table.Column<int>(type: "integer", nullable: false),
                    Nombre = table.Column<string>(type: "text", nullable: false),
                    Telefono = table.Column<string>(type: "text", nullable: false),
                    Habitacion = table.Column<string>(type: "text", nullable: true),
                    Ocasion = table.Column<string>(type: "text", nullable: true),
                    Comentarios = table.Column<string>(type: "text", nullable: true),
                    Estado = table.Column<int>(type: "integer", nullable: false),
                    ConfirmadaEn = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    ConfirmadaPor = table.Column<string>(type: "text", nullable: true),
                    CanceladaEn = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    CanceladaPor = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ReservasWeb", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ReservasWeb_Reservas_ReservaId",
                        column: x => x.ReservaId,
                        principalTable: "Reservas",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_ReservasWeb_Salones_SalonId",
                        column: x => x.SalonId,
                        principalTable: "Salones",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_ReservasWeb_Fecha",
                table: "ReservasWeb",
                column: "Fecha");

            migrationBuilder.CreateIndex(
                name: "IX_ReservasWeb_ReservaId",
                table: "ReservasWeb",
                column: "ReservaId");

            migrationBuilder.CreateIndex(
                name: "IX_ReservasWeb_SalonId",
                table: "ReservasWeb",
                column: "SalonId");

            // Las reservas web que ya estaban en la grilla (Origen = Web = 2)
            // pasan al registro. HabTel viene como "Hab 214 · 11 5555-5555"
            // o solo el telefono; Estado 0 = Confirmada, 1 = PendienteBot.
            migrationBuilder.Sql("""
                INSERT INTO "ReservasWeb" ("CreadaEn", "ReservaId", "Fecha", "Turno", "SalonId", "Hora", "Pax", "Nombre",
                    "Telefono", "Habitacion", "Ocasion", "Comentarios", "Estado")
                SELECT r."UpdatedAt", r."Id", r."Fecha", r."Turno", r."SalonId", COALESCE(r."Hora", ''), COALESCE(r."Pax", 0),
                    COALESCE(r."Nombre", ''),
                    CASE WHEN r."HabTel" LIKE 'Hab % · %' THEN split_part(r."HabTel", ' · ', 2) ELSE COALESCE(r."HabTel", '') END,
                    CASE WHEN r."HabTel" LIKE 'Hab % · %' THEN substr(split_part(r."HabTel", ' · ', 1), 5) ELSE NULL END,
                    NULL, r."Comentarios",
                    CASE WHEN r."Estado" = 0 THEN 0 ELSE 1 END
                FROM "Reservas" r
                WHERE r."Origen" = 2;
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ReservasWeb");
        }
    }
}
