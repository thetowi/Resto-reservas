using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Barrancas.Api.Migrations
{
    /// <inheritdoc />
    public partial class FormaDeMesa : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Forma visual de la mesa en el plano (ver Models/FormaMesa.cs):
            // 0 = Cuadrada, 1 = Redonda. Se elige a mano por mesa (ver
            // PlanoSalon.tsx), no se deriva mas de la capacidad.
            migrationBuilder.AddColumn<int>(
                name: "Forma",
                table: "Mesas",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            // Backfill para las mesas que ya existian antes de este cambio:
            // mantenemos el mismo criterio visual que usaba el plano antes
            // (mesas chicas, de 2 pax o menos, redondas; el resto cuadradas)
            // para que el plano no cambie de golpe con la migracion — a
            // partir de aca cada una se puede reajustar a mano.
            migrationBuilder.Sql(
                "UPDATE \"Mesas\" SET \"Forma\" = 1 WHERE \"Capacidad\" <= 2;");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Forma",
                table: "Mesas");
        }
    }
}
