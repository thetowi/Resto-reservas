using Barrancas.Api.Data;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Barrancas.Api.Migrations
{
    // Sin archivo .Designer.cs: los dos atributos de abajo alcanzan para que
    // EF la encuentre y la aplique al arrancar.
    [DbContext(typeof(BarrancasDbContext))]
    [Migration("20261114130000_ContactoRestaurante")]
    public partial class ContactoRestaurante : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Teléfono y WhatsApp del restaurante (ver Models/DatosRestaurante.cs).
            migrationBuilder.AddColumn<string>(
                name: "Telefono",
                table: "DatosRestaurante",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Whatsapp",
                table: "DatosRestaurante",
                type: "text",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(name: "Telefono", table: "DatosRestaurante");
            migrationBuilder.DropColumn(name: "Whatsapp", table: "DatosRestaurante");
        }
    }
}
