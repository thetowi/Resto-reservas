using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Barrancas.Api.Migrations
{
    /// <inheritdoc />
    public partial class MultiMesa : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "ReservaMesas",
                columns: table => new
                {
                    ReservaId = table.Column<int>(type: "integer", nullable: false),
                    MesaId = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ReservaMesas", x => new { x.ReservaId, x.MesaId });
                    table.ForeignKey(
                        name: "FK_ReservaMesas_Mesas_MesaId",
                        column: x => x.MesaId,
                        principalTable: "Mesas",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_ReservaMesas_Reservas_ReservaId",
                        column: x => x.ReservaId,
                        principalTable: "Reservas",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_ReservaMesas_MesaId",
                table: "ReservaMesas",
                column: "MesaId");

            // Copia cada reserva que ya tenia mesa asignada a la tabla
            // nueva ANTES de borrar la columna vieja, para no perder datos.
            migrationBuilder.Sql(
                "INSERT INTO \"ReservaMesas\" (\"ReservaId\", \"MesaId\") " +
                "SELECT \"Id\", \"MesaId\" FROM \"Reservas\" WHERE \"MesaId\" IS NOT NULL;");

            migrationBuilder.DropForeignKey(
                name: "FK_Reservas_Mesas_MesaId",
                table: "Reservas");

            migrationBuilder.DropIndex(
                name: "IX_Reservas_MesaId",
                table: "Reservas");

            migrationBuilder.DropColumn(
                name: "MesaId",
                table: "Reservas");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "MesaId",
                table: "Reservas",
                type: "integer",
                nullable: true);

            // Backfill para el rollback: si una reserva tenia mas de una
            // mesa, solo se puede volver a guardar UNA en la columna vieja
            // (se elige la de MesaId mas chico) — es una perdida de datos
            // esperable al bajar de "varias mesas" a "una sola columna".
            migrationBuilder.Sql(
                "UPDATE \"Reservas\" SET \"MesaId\" = sub.\"MesaId\" " +
                "FROM (SELECT \"ReservaId\", MIN(\"MesaId\") AS \"MesaId\" FROM \"ReservaMesas\" GROUP BY \"ReservaId\") AS sub " +
                "WHERE \"Reservas\".\"Id\" = sub.\"ReservaId\";");

            migrationBuilder.CreateIndex(
                name: "IX_Reservas_MesaId",
                table: "Reservas",
                column: "MesaId");

            migrationBuilder.AddForeignKey(
                name: "FK_Reservas_Mesas_MesaId",
                table: "Reservas",
                column: "MesaId",
                principalTable: "Mesas",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);

            migrationBuilder.DropTable(
                name: "ReservaMesas");
        }
    }
}