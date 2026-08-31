using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace Barrancas.Api.Migrations
{
    /// <inheritdoc />
    public partial class Salones : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Reservas_Fecha_Turno",
                table: "Reservas");

            migrationBuilder.DropIndex(
                name: "IX_Mesas_Codigo",
                table: "Mesas");

            migrationBuilder.DropIndex(
                name: "IX_Esperas_Fecha_Turno",
                table: "Esperas");

            migrationBuilder.AddColumn<int>(
                name: "SalonId",
                table: "WalkIns",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<int>(
                name: "SalonId",
                table: "Reservas",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<int>(
                name: "SalonId",
                table: "Mesas",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<int>(
                name: "SalonId",
                table: "Esperas",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<int>(
                name: "SalonId",
                table: "ElementosPlano",
                type: "integer",
                nullable: false,
                defaultValue: 0);

                        migrationBuilder.CreateTable(
                name: "Salones",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    Nombre = table.Column<string>(type: "text", nullable: false),
                    Orden = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Salones", x => x.Id);
                });

            migrationBuilder.Sql(@"
                INSERT INTO ""Salones"" (""Nombre"", ""Orden"") VALUES ('Restaurant', 0);
            ");

            migrationBuilder.Sql(@"
                UPDATE ""Mesas"" SET ""SalonId"" = (SELECT ""Id"" FROM ""Salones"" ORDER BY ""Id"" LIMIT 1);
                UPDATE ""Reservas"" SET ""SalonId"" = (SELECT ""Id"" FROM ""Salones"" ORDER BY ""Id"" LIMIT 1);
                UPDATE ""Esperas"" SET ""SalonId"" = (SELECT ""Id"" FROM ""Salones"" ORDER BY ""Id"" LIMIT 1);
                UPDATE ""WalkIns"" SET ""SalonId"" = (SELECT ""Id"" FROM ""Salones"" ORDER BY ""Id"" LIMIT 1);
                UPDATE ""ElementosPlano"" SET ""SalonId"" = (SELECT ""Id"" FROM ""Salones"" ORDER BY ""Id"" LIMIT 1);
            ");

            migrationBuilder.CreateIndex(
                name: "IX_WalkIns_SalonId",
                table: "WalkIns",
                column: "SalonId");

            migrationBuilder.CreateIndex(
                name: "IX_Reservas_Fecha_Turno_SalonId",
                table: "Reservas",
                columns: new[] { "Fecha", "Turno", "SalonId" });

            migrationBuilder.CreateIndex(
                name: "IX_Reservas_SalonId",
                table: "Reservas",
                column: "SalonId");

            migrationBuilder.CreateIndex(
                name: "IX_Mesas_SalonId_Codigo",
                table: "Mesas",
                columns: new[] { "SalonId", "Codigo" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Esperas_Fecha_Turno_SalonId",
                table: "Esperas",
                columns: new[] { "Fecha", "Turno", "SalonId" });

            migrationBuilder.CreateIndex(
                name: "IX_Esperas_SalonId",
                table: "Esperas",
                column: "SalonId");

            migrationBuilder.CreateIndex(
                name: "IX_ElementosPlano_SalonId",
                table: "ElementosPlano",
                column: "SalonId");

            migrationBuilder.CreateIndex(
                name: "IX_Salones_Nombre",
                table: "Salones",
                column: "Nombre",
                unique: true);

            migrationBuilder.AddForeignKey(
                name: "FK_ElementosPlano_Salones_SalonId",
                table: "ElementosPlano",
                column: "SalonId",
                principalTable: "Salones",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_Esperas_Salones_SalonId",
                table: "Esperas",
                column: "SalonId",
                principalTable: "Salones",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_Mesas_Salones_SalonId",
                table: "Mesas",
                column: "SalonId",
                principalTable: "Salones",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_Reservas_Salones_SalonId",
                table: "Reservas",
                column: "SalonId",
                principalTable: "Salones",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_WalkIns_Salones_SalonId",
                table: "WalkIns",
                column: "SalonId",
                principalTable: "Salones",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_ElementosPlano_Salones_SalonId",
                table: "ElementosPlano");

            migrationBuilder.DropForeignKey(
                name: "FK_Esperas_Salones_SalonId",
                table: "Esperas");

            migrationBuilder.DropForeignKey(
                name: "FK_Mesas_Salones_SalonId",
                table: "Mesas");

            migrationBuilder.DropForeignKey(
                name: "FK_Reservas_Salones_SalonId",
                table: "Reservas");

            migrationBuilder.DropForeignKey(
                name: "FK_WalkIns_Salones_SalonId",
                table: "WalkIns");

            migrationBuilder.DropTable(
                name: "Salones");

            migrationBuilder.DropIndex(
                name: "IX_WalkIns_SalonId",
                table: "WalkIns");

            migrationBuilder.DropIndex(
                name: "IX_Reservas_Fecha_Turno_SalonId",
                table: "Reservas");

            migrationBuilder.DropIndex(
                name: "IX_Reservas_SalonId",
                table: "Reservas");

            migrationBuilder.DropIndex(
                name: "IX_Mesas_SalonId_Codigo",
                table: "Mesas");

            migrationBuilder.DropIndex(
                name: "IX_Esperas_Fecha_Turno_SalonId",
                table: "Esperas");

            migrationBuilder.DropIndex(
                name: "IX_Esperas_SalonId",
                table: "Esperas");

            migrationBuilder.DropIndex(
                name: "IX_ElementosPlano_SalonId",
                table: "ElementosPlano");

            migrationBuilder.DropColumn(
                name: "SalonId",
                table: "WalkIns");

            migrationBuilder.DropColumn(
                name: "SalonId",
                table: "Reservas");

            migrationBuilder.DropColumn(
                name: "SalonId",
                table: "Mesas");

            migrationBuilder.DropColumn(
                name: "SalonId",
                table: "Esperas");

            migrationBuilder.DropColumn(
                name: "SalonId",
                table: "ElementosPlano");

            migrationBuilder.CreateIndex(
                name: "IX_Reservas_Fecha_Turno",
                table: "Reservas",
                columns: new[] { "Fecha", "Turno" });

            migrationBuilder.CreateIndex(
                name: "IX_Mesas_Codigo",
                table: "Mesas",
                column: "Codigo",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Esperas_Fecha_Turno",
                table: "Esperas",
                columns: new[] { "Fecha", "Turno" });
        }
    }
}
