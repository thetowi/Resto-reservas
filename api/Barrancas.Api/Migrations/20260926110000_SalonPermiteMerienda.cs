using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Barrancas.Api.Migrations
{
    /// <inheritdoc />
    public partial class SalonPermiteMerienda : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Si este salon ofrece el turno Merienda (16:00 a 18:00, ver
            // Models/Salon.cs y Data/HorariosDefault.cs) — pensado para el
            // lobby bar. Arranca en false para todos los salones existentes;
            // se activa a mano desde /admin/salones para el que corresponda.
            migrationBuilder.AddColumn<bool>(
                name: "PermiteMerienda",
                table: "Salones",
                type: "boolean",
                nullable: false,
                defaultValue: false);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "PermiteMerienda",
                table: "Salones");
        }
    }
}
