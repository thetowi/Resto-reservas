using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Barrancas.Api.Migrations
{
    /// <inheritdoc />
    public partial class MesaCodigoUnicoSoloPermanente : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // El indice unico (SalonId, Codigo) pasa a aplicar SOLO a las
            // mesas permanentes (EsTemporal = false, las de /admin/mesas).
            // Antes de este cambio, dividir la misma mesa base en dos
            // turnos distintos del mismo dia (o de dias distintos) chocaba:
            // el codigo "{codigo}a"/"{codigo}b" de la primera division
            // bloqueaba a la segunda, aunque fueran turnos totalmente
            // independientes entre si (ver DividirPorTurno en
            // MesasController). Con el filtro, dos mesas temporales pueden
            // compartir el mismo texto de codigo sin problema (cada una
            // vive solo dentro de su propio turno, nunca se muestran juntas
            // — ver DiaService.GetTurnoAsync), mientras que las mesas
            // permanentes del salon siguen siendo unicas como siempre.
            migrationBuilder.DropIndex(
                name: "IX_Mesas_SalonId_Codigo",
                table: "Mesas");

            migrationBuilder.CreateIndex(
                name: "IX_Mesas_SalonId_Codigo",
                table: "Mesas",
                columns: new[] { "SalonId", "Codigo" },
                unique: true,
                filter: "\"EsTemporal\" = false");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Mesas_SalonId_Codigo",
                table: "Mesas");

            migrationBuilder.CreateIndex(
                name: "IX_Mesas_SalonId_Codigo",
                table: "Mesas",
                columns: new[] { "SalonId", "Codigo" },
                unique: true);
        }
    }
}
