namespace Barrancas.Api.Models;

// De donde vino esta reserva: la cargo el staff a mano (como siempre) o la
// creo el chatbot de WhatsApp (ver ClaudeAgentService/ReservaBotService). No
// cambia en nada el comportamiento de la reserva — es solo informativo, para
// que el staff pueda distinguir a simple vista cuales entraron solas por el
// bot (y filtrar/auditarlas si hace falta mas adelante).
public enum OrigenReserva
{
    Staff = 0,
    Bot = 1,
}
