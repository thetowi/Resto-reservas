using Barrancas.Api.Data;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace Barrancas.Api.Migrations
{
    // Sin archivo .Designer.cs: los dos atributos de abajo alcanzan para que
    // EF la encuentre y la aplique al arrancar.
    [DbContext(typeof(BarrancasDbContext))]
    [Migration("20261031120000_HorariosPorSalon")]
    public partial class HorariosPorSalon : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Horarios de cada turno por salon, configurables desde
            // /admin/horarios (ver Models/HorarioTurno.cs). Arranca vacia: un
            // salon sin horarios cargados sigue usando los de siempre
            // (Data/HorariosDefault.cs), asi que no cambia nada hasta que el
            // Admin guarde algo, y nunca toca los dias ya abiertos.
            migrationBuilder.CreateTable(
                name: "HorariosTurno",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    SalonId = table.Column<int>(type: "integer", nullable: false),
                    Turno = table.Column<int>(type: "integer", nullable: false),
                    Hora = table.Column<string>(type: "text", nullable: false),
                    Filas = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_HorariosTurno", x => x.Id);
                    table.ForeignKey(
                        name: "FK_HorariosTurno_Salones_SalonId",
                        column: x => x.SalonId,
                        principalTable: "Salones",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_HorariosTurno_SalonId_Turno_Hora",
                table: "HorariosTurno",
                columns: new[] { "SalonId", "Turno", "Hora" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(name: "HorariosTurno");
        }
    }
}
