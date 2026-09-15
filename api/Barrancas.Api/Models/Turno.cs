namespace Barrancas.Api.Models;

public enum Turno
{
    Almuerzo = 0,
    Cena = 1,
    // Turno intermedio (16:00 a 18:00, cada 30 min): pensado para el lobby
    // bar, no para el salon principal — ver Salon.PermiteMerienda, que
    // controla en que salon aparece como opcion elegible. El resto de la
    // app (reservas, mesas ocupadas, lista de espera, walk-ins, cierres) ya
    // trata a Turno como un enum generico, asi que este tercer valor no
    // necesita casos especiales fuera de HorariosDefault y DiaService.
    Merienda = 2,
}
