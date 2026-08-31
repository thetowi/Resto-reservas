using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Barrancas.Api.Migrations
{
    /// <inheritdoc />
    public partial class PlanoDeSalon : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<double>(
                name: "PosX",
                table: "Mesas",
                type: "double precision",
                nullable: true);

            migrationBuilder.AddColumn<double>(
                name: "PosY",
                table: "Mesas",
                type: "double precision",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "PosX",
                table: "Mesas");

            migrationBuilder.DropColumn(
                name: "PosY",
                table: "Mesas");
        }
    }
}
