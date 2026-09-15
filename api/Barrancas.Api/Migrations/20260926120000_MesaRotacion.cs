using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Barrancas.Api.Migrations
{
    /// <inheritdoc />
    public partial class MesaRotacion : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Rotacion del dibujo de la mesa (mesa + sillitas) en el plano
            // visual, en grados (ver Models/Mesa.cs). Arranca en 0 para todas
            // las mesas existentes (sin rotar, como se veian hasta ahora).
            migrationBuilder.AddColumn<int>(
                name: "Rotacion",
                table: "Mesas",
                type: "integer",
                nullable: false,
                defaultValue: 0);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Rotacion",
                table: "Mesas");
        }
    }
}
