using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace Barrancas.Api.Services;

/// <summary>
/// Envia mensajes de texto por WhatsApp usando la Cloud API de Meta
/// (https://developers.facebook.com/docs/whatsapp/cloud-api). Es el lado de
/// "salida": lo usa ClaudeAgentService despues de generar la respuesta del
/// bot, para mandarsela de vuelta al cliente por el mismo numero.
///
/// Las credenciales (WhatsApp:AccessToken / WhatsApp:PhoneNumberId) se leen
/// de la configuracion recien al mandar un mensaje, no al arrancar la app
/// (ver Program.cs): mientras no esten configuradas, el resto de la API
/// sigue funcionando normal, y solo falla puntualmente lo que dependa del
/// bot.
/// </summary>
public class WhatsAppClient
{
    private readonly HttpClient _http;
    private readonly IConfiguration _config;
    private readonly ILogger<WhatsAppClient> _logger;

    public WhatsAppClient(HttpClient http, IConfiguration config, ILogger<WhatsAppClient> logger)
    {
        _http = http;
        _config = config;
        _logger = logger;
    }

    public async Task EnviarTextoAsync(string telefonoDestino, string texto)
    {
        var accessToken = _config["WhatsApp:AccessToken"];
        var phoneNumberId = _config["WhatsApp:PhoneNumberId"];

        if (string.IsNullOrWhiteSpace(accessToken) || string.IsNullOrWhiteSpace(phoneNumberId))
        {
            throw new InvalidOperationException(
                "Falta configurar WhatsApp:AccessToken / WhatsApp:PhoneNumberId — todavia no se puede mandar mensajes por WhatsApp.");
        }

        // v21.0 es la version de la Graph API vigente al escribir esto;
        // Meta la va subiendo con el tiempo (ver "Changelog" en la
        // documentacion de la Cloud API) — si en algun momento deja de
        // responder, probar con una version mas nueva aca.
        var url = $"https://graph.facebook.com/v21.0/{phoneNumberId}/messages";

        var body = new
        {
            messaging_product = "whatsapp",
            to = telefonoDestino,
            type = "text",
            text = new { body = texto },
        };

        using var request = new HttpRequestMessage(HttpMethod.Post, url)
        {
            Content = new StringContent(JsonSerializer.Serialize(body), Encoding.UTF8, "application/json"),
        };
        request.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", accessToken);

        var response = await _http.SendAsync(request);
        if (!response.IsSuccessStatusCode)
        {
            var detalle = await response.Content.ReadAsStringAsync();
            _logger.LogError("Fallo el envio de WhatsApp a {Telefono}: {Status} {Detalle}", telefonoDestino, response.StatusCode, detalle);
            throw new InvalidOperationException($"Meta devolvio {response.StatusCode} al mandar el mensaje de WhatsApp.");
        }
    }
}
