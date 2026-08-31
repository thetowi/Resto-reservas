using Barrancas.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace Barrancas.Api.Data;

public class BarrancasDbContext : DbContext
{
    public BarrancasDbContext(DbContextOptions<BarrancasDbContext> options) : base(options) { }

    public DbSet<Salon> Salones => Set<Salon>();
    public DbSet<Mesa> Mesas => Set<Mesa>();
    public DbSet<Usuario> Usuarios => Set<Usuario>();
    public DbSet<Reserva> Reservas => Set<Reserva>();
    public DbSet<ReservaMesa> ReservaMesas => Set<ReservaMesa>();
    public DbSet<Espera> Esperas => Set<Espera>();
    public DbSet<ElementoPlano> ElementosPlano => Set<ElementoPlano>();
    public DbSet<WalkIn> WalkIns => Set<WalkIn>();
    public DbSet<CierreTurno> CierresTurno => Set<CierreTurno>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Salon>(e =>
        {
            e.HasIndex(s => s.Nombre).IsUnique();
        });

        modelBuilder.Entity<Mesa>(e =>
        {
            // Unico DENTRO de un salon, no en todo el restaurante (ver
            // Models/Mesa.cs): dos salones distintos pueden tener cada uno
            // su propia mesa "11".
            e.HasIndex(m => new { m.SalonId, m.Codigo }).IsUnique();
            // Restrict: no se puede borrar un salon que todavia tiene mesas
            // (hay que borrarlas/pasarlas primero) — reforzado tambien en
            // SalonesController.Borrar.
            e.HasOne(m => m.Salon)
                .WithMany()
                .HasForeignKey(m => m.SalonId)
                .OnDelete(DeleteBehavior.Restrict);
            // Restrict: no se puede borrar una mesa que todavia tiene
            // divisiones (hay que borrar/reasignar las divisiones primero).
            // Esto se refuerza tambien a nivel de MesasController.
            e.HasOne(m => m.MesaPadre)
                .WithMany(m => m.Divisiones)
                .HasForeignKey(m => m.MesaPadreId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<Usuario>(e =>
        {
            e.HasIndex(u => u.Username).IsUnique();
        });

                modelBuilder.Entity<Reserva>(e =>
        {
            e.HasIndex(r => new { r.Fecha, r.Turno, r.SalonId });
            e.HasOne(r => r.Salon)
                .WithMany()
                .HasForeignKey(r => r.SalonId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<ReservaMesa>(e =>
        {
            // Clave compuesta: una reserva no puede tener la misma mesa
            // repetida dos veces en su lista.
            e.HasKey(x => new { x.ReservaId, x.MesaId });
            e.HasOne(x => x.Reserva)
                .WithMany(r => r.ReservaMesas)
                .HasForeignKey(x => x.ReservaId)
                .OnDelete(DeleteBehavior.Cascade);
            // Cascade (no Restrict/SetNull): al borrar una mesa, solo
            // desaparece SU fila de ReservaMesas — la reserva sigue
            // existiendo (con el resto de sus mesas, si tenia mas de una).
            e.HasOne(x => x.Mesa)
                .WithMany(m => m.ReservaMesas)
                .HasForeignKey(x => x.MesaId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<Espera>(e =>
        {
            e.HasIndex(x => new { x.Fecha, x.Turno, x.SalonId });
            e.HasOne(x => x.Salon)
                .WithMany()
                .HasForeignKey(x => x.SalonId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<WalkIn>(e =>
        {
            // Una sola marca de walk-in por mesa y turno: togglear de nuevo
            // la libera en vez de crear una segunda marca. No hace falta
            // sumar SalonId aca: MesaId ya identifica un solo salon posible.
            e.HasIndex(x => new { x.Fecha, x.Turno, x.MesaId }).IsUnique();
            e.HasOne(x => x.Salon)
                .WithMany()
                .HasForeignKey(x => x.SalonId)
                .OnDelete(DeleteBehavior.Restrict);
                        e.HasOne(x => x.Mesa)
                .WithMany()
                .HasForeignKey(x => x.MesaId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<CierreTurno>(e =>
        {
            // Un solo cierre por fecha+turno+salon: togglear de nuevo lo
            // reabre en vez de crear un segundo registro.
            e.HasIndex(x => new { x.Fecha, x.Turno, x.SalonId }).IsUnique();
            e.HasOne(x => x.Salon)
                .WithMany()
                .HasForeignKey(x => x.SalonId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<ElementoPlano>(e =>
        {
            e.HasOne(x => x.Salon)
                .WithMany()
                .HasForeignKey(x => x.SalonId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        base.OnModelCreating(modelBuilder);
    }
}
