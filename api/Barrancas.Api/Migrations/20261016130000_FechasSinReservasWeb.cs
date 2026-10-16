using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Barrancas.Api.Migrations
{
    /// <inheritdoc />
    public partial class FechasSinReservasWeb : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Fechas sin reservas web (ver Models/FechaBloqueadaBot.cs): ahora
            // pueden cerrar un solo turno (Turno null = todo el dia), llevan
            // el mensaje que ve el cliente en el link y eligen si frenan
            // tambien al bot. Las fechas que ya existian frenaban al bot y al
            // link todo el dia: siguen igual (Turno null, IncluyeBot true).
            migrationBuilder.AddColumn<bool>(
                name: "IncluyeBot",
                table: "FechasBloqueadasBot",
                type: "boolean",
                nullable: false,
                defaultValue: true);

            migrationBuilder.AddColumn<string>(
                name: "MensajeCliente",
                table: "FechasBloqueadasBot",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "Turno",
                table: "FechasBloqueadasBot",
                type: "integer",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(name: "IncluyeBot", table: "FechasBloqueadasBot");
            migrationBuilder.DropColumn(name: "MensajeCliente", table: "FechasBloqueadasBot");
            migrationBuilder.DropColumn(name: "Turno", table: "FechasBloqueadasBot");
        }
    }
}
