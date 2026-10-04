namespace Barrancas.Api.Models;

/// <summary>
/// Memoria de una conversacion de WhatsApp con un numero de telefono puntual
/// (ver ClaudeAgentService). Cada webhook de Meta llega como un request HTTP
/// nuevo e independiente — esto es lo que le permite al bot "acordarse" de lo
/// que se charlo antes en los mensajes siguientes del mismo numero (fecha que
/// ya pidio, a nombre de quien, etc.) sin tener que volver a preguntar todo
/// de cero en cada mensaje.
///
/// HistorialJson guarda la lista de mensajes de la conversacion tal cual los
/// entiende la Messages API de Claude (roles "user"/"assistant", con bloques
/// de texto y de uso de herramientas incluidos) serializada como JSON — se
/// manda de vuelta tal cual en cada llamado nuevo a Claude, y se recorta a
/// los ultimos mensajes (ver ClaudeAgentService.MaxMensajesHistorial) para
/// que no crezca sin limite con una conversacion larga.
/// </summary>
public class ConversacionBot
{
    public int Id { get; set; }

    // Numero de telefono tal cual lo manda Meta (wa_id: codigo de pais +
    // numero, sin "+" ni espacios) — identifica de forma unica la
    // conversacion con ese cliente.
    public string Telefono { get; set; } = string.Empty;

    public string HistorialJson { get; set; } = "[]";
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
