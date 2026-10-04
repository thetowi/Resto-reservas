using System.Text.Json.Serialization;

namespace Barrancas.Api.Dtos;

// Forma del payload que manda Meta al webhook de WhatsApp Cloud API
// (POST /api/whatsapp/webhook) cuando llega un mensaje nuevo. A diferencia
// del resto de la API (que serializa todo camelCase, ver Program.cs), este
// JSON lo define Meta con sus propios nombres en snake_case, asi que cada
// propiedad necesita su [JsonPropertyName] explicito. Solo se modelan los
// campos que el bot realmente usa — Meta manda bastante mas (fotos de
// perfil, estados de entrega "delivered"/"read", plantillas, etc.) que se
// ignora sin problema al deserializar.
public record WhatsAppWebhookPayload(
    [property: JsonPropertyName("entry")] List<WhatsAppEntry>? Entry
);

public record WhatsAppEntry(
    [property: JsonPropertyName("changes")] List<WhatsAppChange>? Changes
);

public record WhatsAppChange(
    [property: JsonPropertyName("value")] WhatsAppValue? Value
);

public record WhatsAppValue(
    [property: JsonPropertyName("messages")] List<WhatsAppMessage>? Messages
);

public record WhatsAppMessage(
    // wa_id del remitente (codigo de pais + numero, sin "+"): identifica la
    // conversacion (ver Models/ConversacionBot.cs).
    [property: JsonPropertyName("from")] string? From,
    [property: JsonPropertyName("type")] string? Type,
    [property: JsonPropertyName("text")] WhatsAppText? Text
);

public record WhatsAppText(
    [property: JsonPropertyName("body")] string? Body
);
