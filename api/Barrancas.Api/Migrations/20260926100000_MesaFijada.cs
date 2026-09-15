using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Barrancas.Api.Migrations
{
    /// <inheritdoc />
    public partial class MesaFijada : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Si la mesa esta "fijada" en el plano visual (ver Models/Mesa.cs):
            // el frontend bloquea el arrastre para que no se mueva por un
            // click accidental durante el servicio. Arranca en false para
            // todas las mesas existentes (nadie la fijo todavia).
            migrationBuilder.AddColumn<bool>(
                name: "Fijada",
                table: "Mesas",
                type: "boolean",
                nullable: false,
                defaultValue: false);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Fijada",
                table: "Mesas");
        }
    }
}
