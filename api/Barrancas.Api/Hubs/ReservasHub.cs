using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;

namespace Barrancas.Api.Hubs;

[Authorize]
public class ReservasHub : Hub
{
    // El grupo ahora incluye el salon (ademas de fecha:turno): cada salon
    // tiene su propia lista de reservas/espera independiente, asi que un
    // cliente mirando "Bar" no tiene que recibir los broadcasts de
    // "Restaurant" aunque esten viendo la misma fecha/turno.
    public static string GrupoDe(string fecha, string turno, int salonId) =>
        $"{fecha}:{turno}:{salonId}".ToLowerInvariant();

    public async Task Suscribirse(string fecha, string turno, int salonId)
    {
        await Groups.AddToGroupAsync(Context.ConnectionId, GrupoDe(fecha, turno, salonId));
    }

    public async Task Desuscribirse(string fecha, string turno, int salonId)
    {
        await Groups.RemoveFromGroupAsync(Context.ConnectionId, GrupoDe(fecha, turno, salonId));
    }
}
