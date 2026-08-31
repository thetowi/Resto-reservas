using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Barrancas.Api.Migrations
{
    /// <inheritdoc />
    public partial class AdministracionMesas : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "CodigoAlt",
                table: "Mesas");

            migrationBuilder.AddColumn<int>(
                name: "Capacidad",
                table: "Mesas",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<int>(
                name: "MesaPadreId",
                table: "Mesas",
                type: "integer",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_Mesas_MesaPadreId",
                table: "Mesas",
                column: "MesaPadreId");

            migrationBuilder.AddForeignKey(
                name: "FK_Mesas_Mesas_MesaPadreId",
                table: "Mesas",
                column: "MesaPadreId",
                principalTable: "Mesas",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Mesas_Mesas_MesaPadreId",
                table: "Mesas");

            migrationBuilder.DropIndex(
                name: "IX_Mesas_MesaPadreId",
                table: "Mesas");

            migrationBuilder.DropColumn(
                name: "Capacidad",
                table: "Mesas");

            migrationBuilder.DropColumn(
                name: "MesaPadreId",
                table: "Mesas");

            migrationBuilder.AddColumn<string>(
                name: "CodigoAlt",
                table: "Mesas",
                type: "text",
                nullable: true);
        }
    }
}
