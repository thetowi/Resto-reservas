using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace Barrancas.Api.Migrations
{
    /// <inheritdoc />
    public partial class AgregarDivisionMesaTurno : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "EsTemporal",
                table: "Mesas",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.CreateTable(
                name: "DivisionesMesaTurno",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    Fecha = table.Column<DateOnly>(type: "date", nullable: false),
                    Turno = table.Column<int>(type: "integer", nullable: false),
                    SalonId = table.Column<int>(type: "integer", nullable: false),
                    MesaBaseId = table.Column<int>(type: "integer", nullable: false),
                    MesaHijaAId = table.Column<int>(type: "integer", nullable: false),
                    MesaHijaBId = table.Column<int>(type: "integer", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_DivisionesMesaTurno", x => x.Id);
                    table.ForeignKey(
                        name: "FK_DivisionesMesaTurno_Mesas_MesaBaseId",
                        column: x => x.MesaBaseId,
                        principalTable: "Mesas",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_DivisionesMesaTurno_Mesas_MesaHijaAId",
                        column: x => x.MesaHijaAId,
                        principalTable: "Mesas",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_DivisionesMesaTurno_Mesas_MesaHijaBId",
                        column: x => x.MesaHijaBId,
                        principalTable: "Mesas",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_DivisionesMesaTurno_Salones_SalonId",
                        column: x => x.SalonId,
                        principalTable: "Salones",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_DivisionesMesaTurno_Fecha_Turno_MesaBaseId",
                table: "DivisionesMesaTurno",
                columns: new[] { "Fecha", "Turno", "MesaBaseId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_DivisionesMesaTurno_MesaBaseId",
                table: "DivisionesMesaTurno",
                column: "MesaBaseId");

            migrationBuilder.CreateIndex(
                name: "IX_DivisionesMesaTurno_MesaHijaAId",
                table: "DivisionesMesaTurno",
                column: "MesaHijaAId");

            migrationBuilder.CreateIndex(
                name: "IX_DivisionesMesaTurno_MesaHijaBId",
                table: "DivisionesMesaTurno",
                column: "MesaHijaBId");

            migrationBuilder.CreateIndex(
                name: "IX_DivisionesMesaTurno_SalonId",
                table: "DivisionesMesaTurno",
                column: "SalonId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "DivisionesMesaTurno");

            migrationBuilder.DropColumn(
                name: "EsTemporal",
                table: "Mesas");
        }
    }
}
