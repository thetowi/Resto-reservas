using System;
using Barrancas.Api.Data;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace Barrancas.Api.Migrations
{
    // Sin archivo .Designer.cs: los dos atributos de abajo alcanzan para que
    // EF la encuentre y la aplique al arrancar.
    [DbContext(typeof(BarrancasDbContext))]
    [Migration("20261114120000_SectoresDelSalon")]
    public partial class SectoresDelSalon : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Sectores de cada salón (ver Models/Sector.cs) y su estado en
            // cada turno (Models/SectorTurno.cs). Arranca sin sectores: nada
            // cambia hasta que el Admin los arme en Administrar mesas.
            migrationBuilder.CreateTable(
                name: "Sectores",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    SalonId = table.Column<int>(type: "integer", nullable: false),
                    Nombre = table.Column<string>(type: "text", nullable: false),
                    Color = table.Column<string>(type: "text", nullable: false),
                    Orden = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Sectores", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Sectores_Salones_SalonId",
                        column: x => x.SalonId,
                        principalTable: "Salones",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Sectores_SalonId_Nombre",
                table: "Sectores",
                columns: new[] { "SalonId", "Nombre" },
                unique: true);

            migrationBuilder.AddColumn<int>(
                name: "SectorId",
                table: "Mesas",
                type: "integer",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_Mesas_SectorId",
                table: "Mesas",
                column: "SectorId");

            migrationBuilder.AddForeignKey(
                name: "FK_Mesas_Sectores_SectorId",
                table: "Mesas",
                column: "SectorId",
                principalTable: "Sectores",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);

            migrationBuilder.AddColumn<int>(
                name: "SectorId",
                table: "Reservas",
                type: "integer",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "SectoresTurno",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    Fecha = table.Column<DateOnly>(type: "date", nullable: false),
                    Turno = table.Column<int>(type: "integer", nullable: false),
                    SalonId = table.Column<int>(type: "integer", nullable: false),
                    SectorId = table.Column<int>(type: "integer", nullable: false),
                    Estado = table.Column<int>(type: "integer", nullable: false),
                    Motivo = table.Column<string>(type: "text", nullable: true),
                    ReservaId = table.Column<int>(type: "integer", nullable: true),
                    CreadoEn = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CreadoPor = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SectoresTurno", x => x.Id);
                    table.ForeignKey(
                        name: "FK_SectoresTurno_Sectores_SectorId",
                        column: x => x.SectorId,
                        principalTable: "Sectores",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_SectoresTurno_Fecha_Turno_SectorId",
                table: "SectoresTurno",
                columns: new[] { "Fecha", "Turno", "SectorId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_SectoresTurno_SectorId",
                table: "SectoresTurno",
                column: "SectorId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(name: "SectoresTurno");
            migrationBuilder.DropForeignKey(name: "FK_Mesas_Sectores_SectorId", table: "Mesas");
            migrationBuilder.DropIndex(name: "IX_Mesas_SectorId", table: "Mesas");
            migrationBuilder.DropColumn(name: "SectorId", table: "Mesas");
            migrationBuilder.DropColumn(name: "SectorId", table: "Reservas");
            migrationBuilder.DropTable(name: "Sectores");
        }
    }
}
