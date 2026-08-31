using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace Barrancas.Api.Migrations
{
    /// <inheritdoc />
    public partial class WalkInsYUbicada : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "EsWalkIn",
                table: "Reservas");

            migrationBuilder.AddColumn<bool>(
                name: "Ubicada",
                table: "Esperas",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.CreateTable(
                name: "WalkIns",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    Fecha = table.Column<DateOnly>(type: "date", nullable: false),
                    Turno = table.Column<int>(type: "integer", nullable: false),
                    MesaId = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_WalkIns", x => x.Id);
                    table.ForeignKey(
                        name: "FK_WalkIns_Mesas_MesaId",
                        column: x => x.MesaId,
                        principalTable: "Mesas",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_WalkIns_Fecha_Turno_MesaId",
                table: "WalkIns",
                columns: new[] { "Fecha", "Turno", "MesaId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_WalkIns_MesaId",
                table: "WalkIns",
                column: "MesaId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "WalkIns");

            migrationBuilder.DropColumn(
                name: "Ubicada",
                table: "Esperas");

            migrationBuilder.AddColumn<bool>(
                name: "EsWalkIn",
                table: "Reservas",
                type: "boolean",
                nullable: false,
                defaultValue: false);
        }
    }
}
