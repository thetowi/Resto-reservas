using Barrancas.Api.Data;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Barrancas.Api.Migrations
{
    // Sin archivo .Designer.cs: los dos atributos de abajo alcanzan para que
    // EF la encuentre y la aplique al arrancar.
    [DbContext(typeof(BarrancasDbContext))]
    [Migration("20261118120000_ConfiguracionSalon")]
    public partial class ConfiguracionSalon : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Configuración de cada salón (ver Models/Salon.cs). Los valores
            // por defecto son los que estaban fijos en el código, así nada
            // cambia hasta que el Admin los toque.
            void Entero(string nombre, int valor) => migrationBuilder.AddColumn<int>(
                name: nombre, table: "Salones", type: "integer", nullable: false, defaultValue: valor);
            void Booleano(string nombre, bool valor) => migrationBuilder.AddColumn<bool>(
                name: nombre, table: "Salones", type: "boolean", nullable: false, defaultValue: valor);

            migrationBuilder.AddColumn<string>(
                name: "Color", table: "Salones", type: "text", nullable: false, defaultValue: "");
            Booleano("OfreceAlmuerzo", true);
            Booleano("OfreceCena", true);
            Entero("DiasAlmuerzo", 127);
            Entero("DiasMerienda", 127);
            Entero("DiasCena", 127);
            Booleano("MostrarEnLink", true);
            // 2 = Nunca (todas a confirmar), como estaban los salones salvo «Restaurant».
            Entero("Confirmacion", 2);
            Entero("ConfirmaHastaPax", 6);
            Entero("PaxMaximoWeb", 20);
            Entero("AnticipacionMinutos", 60);
            Entero("DiasAdelante", 60);
            Entero("ToleranciaMinutos", 15);

            // «Restaurant» confirmaba solo por debajo de 6 personas (estaba
            // fijo en el código): 1 = HastaPax.
            migrationBuilder.Sql("""
                UPDATE "Salones" SET "Confirmacion" = 1 WHERE lower(trim("Nombre")) = 'restaurant';
                """);

            migrationBuilder.AddColumn<bool>(
                name: "Reabierto", table: "CierresTurno", type: "boolean", nullable: false, defaultValue: false);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            foreach (var c in new[] { "Color", "OfreceAlmuerzo", "OfreceCena", "DiasAlmuerzo", "DiasMerienda", "DiasCena",
                "MostrarEnLink", "Confirmacion", "ConfirmaHastaPax", "PaxMaximoWeb", "AnticipacionMinutos", "DiasAdelante", "ToleranciaMinutos" })
            {
                migrationBuilder.DropColumn(name: c, table: "Salones");
            }
            migrationBuilder.DropColumn(name: "Reabierto", table: "CierresTurno");
        }
    }
}
