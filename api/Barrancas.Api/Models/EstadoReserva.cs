namespace Barrancas.Api.Models;

// Estado de una reserva frente al chatbot de WhatsApp (ver
// claude/whatsapp-bot-reservas.md en el proyecto). Una reserva cargada por el
// staff siempre es Confirmada (el default): este estado solo tiene sentido
// real para las que vienen con OrigenReserva.Bot.
public enum EstadoReserva
{
    // El bot encontro mesa libre con la capacidad pedida y confirmo sola,
    // sin intervencion humana (reglas: menos de 6 pax, turno Almuerzo o
    // Cena, salon Restaurant, fecha no bloqueada para el bot, turno no
    // cerrado). Igual de "firme" que una reserva cargada por el staff.
    Confirmada = 0,

    // El bot NO pudo confirmar sola (6 pax o mas, no encontro mesa libre, o
    // cualquier otro caso que necesite que alguien del staff la revise y
    // llame/escriba para confirmar) pero igual dejo la fila cargada con los
    // datos que junto, para que el staff la vea en la lista de reservas de
    // ese turno y la termine de resolver a mano (asignar mesa, confirmar por
    // telefono, etc.) en vez de perder el pedido.
    PendienteBot = 1,
}
