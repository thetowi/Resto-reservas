using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace Barrancas.Api.Migrations
{
    /// <inheritdoc />
    public partial class AgregarDivisionMesaDefault : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "DivisionesMesaDefault",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    MesaBaseId = table.Column<int>(type: "integer", nullable: false),
                    PosXA = table.Column<double>(type: "double precision", nullable: true),
                    PosYA = table.Column<double>(type: "double precision", nullable: true),
                    FormaA = table.Column<int>(type: "integer", nullable: false),
                    FijadaA = table.Column<bool>(type: "boolean", nullable: false),
                    RotacionA = table.Column<int>(type: "integer", nullable: false),
                    PosXB = table.Column<double>(type: "double precision", nullable: true),
                    PosYB = table.Column<double>(type: "double precision", nullable: true),
                    FormaB = table.Column<int>(type: "integer", nullable: false),
                    FijadaB = table.Column<bool>(type: "boolean", nullable: false),
                    RotacionB = table.Column<int>(type: "integer", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_DivisionesMesaDefault", x => x.Id);
                    table.ForeignKey(
                        name: "FK_DivisionesMesaDefault_Mesas_MesaBaseId",
                        column: x => x.MesaBaseId,
                        principalTable: "Mesas",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_DivisionesMesaDefault_MesaBaseId",
                table: "DivisionesMesaDefault",
                column: "MesaBaseId",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "DivisionesMesaDefault");
        }
    }
}
