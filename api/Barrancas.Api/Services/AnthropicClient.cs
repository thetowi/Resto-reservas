using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.Extensions.Configuration;

namespace Barrancas.Api.Services;

/// <summary>
/// Cliente chico para la Messages API de Claude (Anthropic), con soporte de
/// tool calling. Lo usa ClaudeAgentService para armar cada turno de la
/// conversacion del bot de WhatsApp.
///
/// Se trabaja con JsonNode (JsonObject/JsonArray) en vez de records tipados
/// para los mensajes/tools: el historial de la conversacion mezcla bloques
/// de texto, de uso de herramienta (tool_use) y de resultado de herramienta
/// (tool_result) con formas distintas, y se va armando/guardando tal cual
/// como JSON de un turno al siguiente (ver Models/ConversacionBot.cs) — un
/// modelo fuertemente tipado para esto terminaria siendo mas lio que ayuda.
///
/// Igual que WhatsAppClient, las credenciales (Anthropic:ApiKey) se leen
/// recien al llamar, no al arrancar la app.
/// </summary>
public class AnthropicClient
{
    private readonly HttpClient _http;
    private readonly IConfiguration _config;

    public AnthropicClient(HttpClient http, IConfiguration config)
    {
        _http = http;
        _config = config;
    }

    public async Task<JsonObject> EnviarAsync(string systemPrompt, JsonArray messages, JsonArray tools)
    {
        var apiKey = _config["Anthropic:ApiKey"];
        var model = _config["Anthropic:Model"];

        if (string.IsNullOrWhiteSpace(apiKey) || string.IsNullOrWhiteSpace(model))
        {
            throw new InvalidOperationException(
                "Falta configurar Anthropic:ApiKey / Anthropic:Model — todavia no se puede usar el bot. " +
                "El modelo tiene que ser un id vigente de la Messages API (ver docs.claude.com/en/docs/about-claude/models).");
        }

        // Parseo manual (sin GetValue<T>, que viene del paquete aparte
        // Microsoft.Extensions.Configuration.Binder) para no depender de
        // una referencia que este .csproj no tiene declarada.
        var maxTokens = int.TryParse(_config["Anthropic:MaxTokens"], out var valorConfigurado) ? valorConfigurado : 1024;

        // DeepClone: un JsonNode solo puede tener un padre a la vez. Sin
        // esto, asignar directamente el "messages"/"tools" del llamador
        // aca adentro se los "roba" (les cambia el padre), y la proxima
        // vez que ClaudeAgentService intente reusarlos para otro llamado
        // del mismo loop de tool calling, tira InvalidOperationException.
        var body = new JsonObject
        {
            ["model"] = model,
            ["max_tokens"] = maxTokens,
            ["system"] = systemPrompt,
            ["messages"] = messages.DeepClone(),
            ["tools"] = tools.DeepClone(),
        };

        using var request = new HttpRequestMessage(HttpMethod.Post, "https://api.anthropic.com/v1/messages")
        {
            Content = new StringContent(body.ToJsonString(), Encoding.UTF8, "application/json"),
        };
        request.Headers.Add("x-api-key", apiKey);
        // Version de la Messages API (formato del request/response), no del
        // modelo — es la que esta vigente desde que se publico la API y no
        // cambia salvo que Anthropic anuncie una nueva.
        request.Headers.Add("anthropic-version", "2023-06-01");
        request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));

        var response = await _http.SendAsync(request);
        var crudo = await response.Content.ReadAsStringAsync();

        if (!response.IsSuccessStatusCode)
        {
            throw new InvalidOperationException($"La API de Claude devolvio {response.StatusCode}: {crudo}");
        }

        return JsonNode.Parse(crudo)?.AsObject()
            ?? throw new InvalidOperationException("Respuesta vacia o invalida de la API de Claude.");
    }
}
