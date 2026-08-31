using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace Barrancas.Api.Migrations
{
    /// <inheritdoc />
    public partial class WalkInYElementosPlano : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "EsWalkIn",
                table: "Reservas",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.CreateTable(
                name: "ElementosPlano",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    Etiqueta = table.Column<string>(type: "text", nullable: false),
                    PosX = table.Column<double>(type: "double precision", nullable: false),
                    PosY = table.Column<double>(type: "double precision", nullable: false),
                    Ancho = table.Column<double>(type: "double precision", nullable: false),
                    Alto = table.Column<double>(type: "double precision", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ElementosPlano", x => x.Id);
                });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ElementosPlano");

            migrationBuilder.DropColumn(
                name: "EsWalkIn",
                table: "Reservas");
        }
    }
}
