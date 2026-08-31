using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace Barrancas.Api.Migrations
{
    /// <inheritdoc />
    public partial class RolesYMozos : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Reservas_Usuarios_UsuarioId",
                table: "Reservas");

            migrationBuilder.RenameColumn(
                name: "UsuarioId",
                table: "Reservas",
                newName: "MozoId");

            migrationBuilder.RenameIndex(
                name: "IX_Reservas_UsuarioId",
                table: "Reservas",
                newName: "IX_Reservas_MozoId");

            migrationBuilder.AddColumn<int>(
                name: "Rol",
                table: "Usuarios",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.CreateTable(
                name: "Mozos",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    Nombre = table.Column<string>(type: "text", nullable: false),
                    Pin = table.Column<string>(type: "text", nullable: false),
                    Activo = table.Column<bool>(type: "boolean", nullable: false),
                    Orden = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Mozos", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Mozos_Pin",
                table: "Mozos",
                column: "Pin",
                unique: true,
                filter: "\"Activo\" = true");

            migrationBuilder.AddForeignKey(
                name: "FK_Reservas_Mozos_MozoId",
                table: "Reservas",
                column: "MozoId",
                principalTable: "Mozos",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Reservas_Mozos_MozoId",
                table: "Reservas");

            migrationBuilder.DropTable(
                name: "Mozos");

            migrationBuilder.DropColumn(
                name: "Rol",
                table: "Usuarios");

            migrationBuilder.RenameColumn(
                name: "MozoId",
                table: "Reservas",
                newName: "UsuarioId");

            migrationBuilder.RenameIndex(
                name: "IX_Reservas_MozoId",
                table: "Reservas",
                newName: "IX_Reservas_UsuarioId");

            migrationBuilder.AddForeignKey(
                name: "FK_Reservas_Usuarios_UsuarioId",
                table: "Reservas",
                column: "UsuarioId",
                principalTable: "Usuarios",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);
        }
    }
}
