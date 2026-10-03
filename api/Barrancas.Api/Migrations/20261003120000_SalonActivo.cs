using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Barrancas.Api.Migrations
{
    /// <inheritdoc />
    public partial class SalonActivo : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Si este salon aparece en el uso diario (selector de la
            // pantalla principal, /plano, /admin/mesas) o no (ver
            // Models/Salon.cs) — un salon inactivo sigue existiendo con toda
            // su data (mesas, reservas, historial), solo deja de ofrecerse.
            // Arranca en true para todos los salones existentes: nada
            // desaparece del selector por aplicar esta migración.
            migrationBuilder.AddColumn<bool>(
                name: "Activo",
                table: "Salones",
                type: "boolean",
                nullable: false,
                defaultValue: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Activo",
                table: "Salones");
        }
    }
}
