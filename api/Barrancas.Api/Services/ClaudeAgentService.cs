using System.Text.Json;
using System.Text.Json.Nodes;
using Barrancas.Api.Data;
using Barrancas.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace Barrancas.Api.Services;

/// <summary>
/// El "cerebro" del bot de WhatsApp: recibe un mensaje de texto de un
/// telefono, mantiene la conversacion con Claude (con las dos herramientas
/// de ReservaBotService) hasta que hay una respuesta final de texto para
/// mandarle al cliente, y persiste el historial en ConversacionBot para que
/// la charla tenga memoria entre un mensaje y el siguiente.
///
/// Lo llama WhatsAppController por cada mensaje de texto entrante; el
/// controller es el que se encarga de mandar la respuesta de vuelta por
/// WhatsApp (ver WhatsAppClient) — este servicio no sabe nada de la Cloud
/// API de Meta, solo de Claude y de las reservas.
/// </summary>
public class ClaudeAgentService
{
    // Mensajes (no turnos: un turno con tool calling puede ser varios
    // mensajes seguidos) que se guardan como maximo por conversacion — se
    // recortan los mas viejos para que una charla larga no crezca sin
    // limite en la base.
    private const int MaxMensajesHistorial = 30;

    // Vueltas de tool calling como maximo por mensaje entrante, para no
    // quedar en un loop infinito si Claude no llega a una respuesta final.
    private const int MaxIteracionesHerramientas = 6;

    private const string SystemPrompt = """
        Sos el asistente de reservas de Barrancas, un restaurante, y atendés
        por WhatsApp. Respondé siempre en español, en un tono cordial y
        breve, como un mensaje de WhatsApp (sin markdown, sin listas con
        guiones ni asteriscos).

        Solo manejás reservas para el salón "Restaurant" (el principal), en
        los turnos Almuerzo o Cena. Si el cliente pide el Bar, el Aqua Bar,
        otro salón, o el turno Merienda, explicale amablemente que para eso
        alguien del restaurante lo va a contactar directamente, y no
        intentes reservar nada en ese caso.

        Para cargar una reserva necesitás: fecha, turno (Almuerzo o Cena),
        cantidad de personas, horario, y el nombre a quien poner la reserva.
        No le preguntes el teléfono: ya se sabe porque es el mismo WhatsApp
        desde el que escribe.

        Antes de pedirle el nombre, usá la herramienta
        consultar_disponibilidad para confirmar que hay lugar — así no le
        pedís datos de más si ese día/turno ya no queda lugar. Recién
        cuando el cliente confirmó fecha, turno, horario, cantidad de
        personas, y dio su nombre, usá crear_reserva.

        Si crear_reserva devuelve estado "confirmada", confirmale la mesa y
        el horario con naturalidad. Si devuelve "pendiente", avisale que
        quedó anotada pero que alguien del restaurante la va a confirmar
        (por ejemplo porque son 6 personas o más, o porque no queda lugar
        automático para esa cantidad) y que no la dé por confirmada todavía.
        Si devuelve "rechazada", explicale el motivo que te da la
        herramienta (por ejemplo que esa fecha no toma reservas por este
        medio, o que el turno está cerrado) y sugerile comunicarse
        directamente con el restaurante.

        No inventes disponibilidad, mesas, ni confirmaciones: solo las que
        te den las herramientas.
        """;

    private readonly BarrancasDbContext _db;
    private readonly AnthropicClient _anthropic;
    private readonly ReservaBotService _reservaBot;
    private readonly ILogger<ClaudeAgentService> _logger;

    public ClaudeAgentService(
        BarrancasDbContext db, AnthropicClient anthropic, ReservaBotService reservaBot, ILogger<ClaudeAgentService> logger)
    {
        _db = db;
        _anthropic = anthropic;
        _reservaBot = reservaBot;
        _logger = logger;
    }

    public async Task<string> ProcesarMensajeAsync(string telefono, string textoEntrante)
    {
        var conversacion = await _db.ConversacionesBot.FirstOrDefaultAsync(c => c.Telefono == telefono);
        if (conversacion is null)
        {
            conversacion = new ConversacionBot { Telefono = telefono };
            _db.ConversacionesBot.Add(conversacion);
        }

        var historial = ParsearHistorial(conversacion.HistorialJson);
        historial.Add(new JsonObject { ["role"] = "user", ["content"] = textoEntrante });

        var tools = ConstruirHerramientas();
        var respuestaFinal =
            "Disculpá, tuve un problema para procesar tu mensaje. Probá de nuevo en un rato, o comunicate directamente con el restaurante.";

        for (var intento = 0; intento < MaxIteracionesHerramientas; intento++)
        {
            JsonObject respuesta;
            try
            {
                respuesta = await _anthropic.EnviarAsync(SystemPrompt, historial, tools);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Fallo el llamado a la API de Claude para el telefono {Telefono}", telefono);
                break;
            }

            // DeepClone antes de agregarlo al historial: el nodo que viene
            // de "respuesta" ya tiene padre (el JsonObject de la respuesta
            // completa), y un JsonNode no puede tener dos padres a la vez.
            var contenido = respuesta["content"] is JsonArray original
                ? (JsonArray)original.DeepClone()
                : new JsonArray();
            historial.Add(new JsonObject { ["role"] = "assistant", ["content"] = contenido });

            var bloques = contenido.OfType<JsonObject>().ToList();
            var bloquesTexto = bloques.Where(b => (string?)b["type"] == "text").ToList();
            var bloquesHerramienta = bloques.Where(b => (string?)b["type"] == "tool_use").ToList();

            if (bloquesHerramienta.Count == 0)
            {
                respuestaFinal = string.Join("\n\n", bloquesTexto.Select(b => (string?)b["text"] ?? "")).Trim();
                if (respuestaFinal.Length == 0)
                {
                    respuestaFinal = "Disculpá, no tengo una respuesta para eso ahora. ¿Podés reformularlo?";
                }
                break;
            }

            var resultados = new JsonArray();
            foreach (var bloque in bloquesHerramienta)
            {
                var nombreHerramienta = (string?)bloque["name"] ?? "";
                var toolUseId = (string?)bloque["id"] ?? "";
                var input = bloque["input"] as JsonObject ?? new JsonObject();

                string resultadoTexto;
                try
                {
                    resultadoTexto = await EjecutarHerramientaAsync(nombreHerramienta, input, telefono);
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Fallo la herramienta {Herramienta} del bot para {Telefono}", nombreHerramienta, telefono);
                    resultadoTexto = JsonSerializer.Serialize(new
                    {
                        error = "Hubo un error interno al procesar esto. Decile al cliente que un empleado lo va a contactar.",
                    });
                }

                resultados.Add(new JsonObject
                {
                    ["type"] = "tool_result",
                    ["tool_use_id"] = toolUseId,
                    ["content"] = resultadoTexto,
                });
            }

            historial.Add(new JsonObject { ["role"] = "user", ["content"] = resultados });
        }

        while (historial.Count > MaxMensajesHistorial)
        {
            historial.RemoveAt(0);
        }

        conversacion.HistorialJson = historial.ToJsonString();
        conversacion.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();

        return respuestaFinal;
    }

    private static JsonArray ParsearHistorial(string json)
    {
        try
        {
            return JsonNode.Parse(json) as JsonArray ?? new JsonArray();
        }
        catch (JsonException)
        {
            return new JsonArray();
        }
    }

    private async Task<string> EjecutarHerramientaAsync(string nombre, JsonObject input, string telefono)
    {
        switch (nombre)
        {
            case "consultar_disponibilidad":
            {
                var fecha = (string?)input["fecha"] ?? "";
                var turno = (string?)input["turno"] ?? "";
                var pax = (int?)input["pax"] ?? 0;
                var resultado = await _reservaBot.ConsultarDisponibilidadAsync(fecha, turno, pax);
                return JsonSerializer.Serialize(resultado);
            }
            case "crear_reserva":
            {
                var fecha = (string?)input["fecha"] ?? "";
                var turno = (string?)input["turno"] ?? "";
                var pax = (int?)input["pax"] ?? 0;
                var hora = (string?)input["hora"] ?? "";
                var nombreCliente = (string?)input["nombre"] ?? "";
                var comentarios = (string?)input["comentarios"];
                var resultado = await _reservaBot.CrearReservaAsync(fecha, turno, pax, hora, nombreCliente, telefono, comentarios);
                return JsonSerializer.Serialize(resultado);
            }
            default:
                return JsonSerializer.Serialize(new { error = $"Herramienta desconocida: {nombre}" });
        }
    }

    private static JsonArray ConstruirHerramientas() => new JsonArray
    {
        new JsonObject
        {
            ["name"] = "consultar_disponibilidad",
            ["description"] =
                "Consulta si hay lugar para una reserva en el salón Restaurant, para una fecha, turno y cantidad de personas. Usar ANTES de pedirle el nombre al cliente.",
            ["input_schema"] = new JsonObject
            {
                ["type"] = "object",
                ["properties"] = new JsonObject
                {
                    ["fecha"] = new JsonObject { ["type"] = "string", ["description"] = "Fecha en formato YYYY-MM-DD" },
                    ["turno"] = new JsonObject { ["type"] = "string", ["enum"] = new JsonArray { "almuerzo", "cena" } },
                    ["pax"] = new JsonObject { ["type"] = "integer", ["description"] = "Cantidad de personas" },
                },
                ["required"] = new JsonArray { "fecha", "turno", "pax" },
            },
        },
        new JsonObject
        {
            ["name"] = "crear_reserva",
            ["description"] =
                "Crea la reserva en el sistema. Usar solo después de que el cliente confirmó fecha, turno, horario, cantidad de personas, y dio su nombre. No pidas el teléfono: ya se conoce.",
            ["input_schema"] = new JsonObject
            {
                ["type"] = "object",
                ["properties"] = new JsonObject
                {
                    ["fecha"] = new JsonObject { ["type"] = "string", ["description"] = "Fecha en formato YYYY-MM-DD" },
                    ["turno"] = new JsonObject { ["type"] = "string", ["enum"] = new JsonArray { "almuerzo", "cena" } },
                    ["pax"] = new JsonObject { ["type"] = "integer", ["description"] = "Cantidad de personas" },
                    ["hora"] = new JsonObject { ["type"] = "string", ["description"] = "Horario pedido, formato HH:mm (24hs)" },
                    ["nombre"] = new JsonObject { ["type"] = "string", ["description"] = "Nombre a quien poner la reserva" },
                    ["comentarios"] = new JsonObject { ["type"] = "string", ["description"] = "Pedido especial, opcional" },
                },
                ["required"] = new JsonArray { "fecha", "turno", "pax", "hora", "nombre" },
            },
        },
    };
}
