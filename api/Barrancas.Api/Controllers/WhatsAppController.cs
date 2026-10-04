using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Barrancas.Api.Dtos;
using Barrancas.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Configuration;

namespace Barrancas.Api.Controllers;

/// <summary>
/// Webhook de la Cloud API de WhatsApp (Meta) — ver
/// claude/whatsapp-bot-reservas.md en el proyecto. Dos endpoints, ambos
/// definidos por Meta (no se pueden renombrar ni cambiar el metodo HTTP):
///
/// - GET /api/whatsapp/webhook: handshake de verificacion, UNA sola vez,
///   cuando se configura esta URL como webhook en el panel de Meta.
/// - POST /api/whatsapp/webhook: un mensaje nuevo (o cualquier otro evento,
///   que se ignora) llega aca en cada interaccion.
///
/// Sin [Authorize]: Meta no manda ningun JWT nuestro, asi que la seguridad
/// la da la firma HMAC (X-Hub-Signature-256, con WhatsApp:AppSecret) en el
/// POST, y el verify token en el GET — no el esquema de auth del resto de
/// la API.
/// </summary>
[ApiController]
[AllowAnonymous]
[Route("api/whatsapp")]
public class WhatsAppController : ControllerBase
{
    private readonly IConfiguration _config;
    private readonly ClaudeAgentService _claudeAgent;
    private readonly WhatsAppClient _whatsAppClient;
    private readonly ILogger<WhatsAppController> _logger;

    public WhatsAppController(
        IConfiguration config, ClaudeAgentService claudeAgent, WhatsAppClient whatsAppClient, ILogger<WhatsAppController> logger)
    {
        _config = config;
        _claudeAgent = claudeAgent;
        _whatsAppClient = whatsAppClient;
        _logger = logger;
    }

    [HttpGet("webhook")]
    public IActionResult VerificarWebhook()
    {
        var modo = Request.Query["hub.mode"].ToString();
        var token = Request.Query["hub.verify_token"].ToString();
        var challenge = Request.Query["hub.challenge"].ToString();
        var verifyTokenConfigurado = _config["WhatsApp:VerifyToken"];

        if (modo == "subscribe" && !string.IsNullOrEmpty(verifyTokenConfigurado) && token == verifyTokenConfigurado)
        {
            return Content(challenge, "text/plain");
        }

        _logger.LogWarning("Verificacion de webhook de WhatsApp rechazada (token no coincide o falta configurar).");
        return StatusCode(403);
    }

    [HttpPost("webhook")]
    public async Task<IActionResult> RecibirWebhook()
    {
        string cuerpoCrudo;
        using (var lector = new StreamReader(Request.Body, Encoding.UTF8))
        {
            cuerpoCrudo = await lector.ReadToEndAsync();
        }

        var appSecret = _config["WhatsApp:AppSecret"];
        if (!string.IsNullOrWhiteSpace(appSecret))
        {
            if (!FirmaValida(cuerpoCrudo, appSecret, Request.Headers["X-Hub-Signature-256"].ToString()))
            {
                _logger.LogWarning("Webhook de WhatsApp con firma invalida — descartado.");
                return Unauthorized();
            }
        }
        else
        {
            _logger.LogWarning("WhatsApp:AppSecret no esta configurado: se acepta el webhook sin validar la firma.");
        }

        WhatsAppWebhookPayload? payload;
        try
        {
            payload = JsonSerializer.Deserialize<WhatsAppWebhookPayload>(cuerpoCrudo);
        }
        catch (JsonException ex)
        {
            // 200 igual: Meta reintenta el webhook si no responde 200, y un
            // payload que no podemos leer no va a mejorar reintentando.
            _logger.LogWarning(ex, "Webhook de WhatsApp con JSON invalido.");
            return Ok();
        }

        var mensaje = payload?.Entry?.FirstOrDefault()?.Changes?.FirstOrDefault()?.Value?.Messages?.FirstOrDefault();

        // Meta manda este mismo webhook para bastante mas que mensajes de
        // texto nuevos (confirmaciones de entrega/lectura, otros tipos de
        // mensaje como audio/imagen, etc.) — el bot por ahora solo entiende
        // texto, asi que todo lo demas se ignora sin error.
        if (mensaje is null || mensaje.Type != "text" || string.IsNullOrWhiteSpace(mensaje.Text?.Body) || string.IsNullOrWhiteSpace(mensaje.From))
        {
            return Ok();
        }

        try
        {
            var respuesta = await _claudeAgent.ProcesarMensajeAsync(mensaje.From, mensaje.Text!.Body!);
            await _whatsAppClient.EnviarTextoAsync(mensaje.From, respuesta);
        }
        catch (Exception ex)
        {
            // No se vuelve a tirar: Meta reintentaria este mismo webhook, y
            // un reintento no arregla un error nuestro (credenciales mal
            // puestas, la API de Claude caida, etc.) — mejor loguearlo y
            // seguir. El cliente se queda sin respuesta esa vez; se podria
            // mandar un mensaje generico de "estamos con problemas" aca si
            // hiciera falta mas adelante.
            _logger.LogError(ex, "Fallo al procesar el mensaje de WhatsApp de {Telefono}", mensaje.From);
        }

        return Ok();
    }

    private static bool FirmaValida(string cuerpo, string appSecret, string firmaHeader)
    {
        const string prefijo = "sha256=";
        if (string.IsNullOrEmpty(firmaHeader) || !firmaHeader.StartsWith(prefijo))
        {
            return false;
        }

        var firmaRecibida = firmaHeader[prefijo.Length..];
        using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(appSecret));
        var hash = hmac.ComputeHash(Encoding.UTF8.GetBytes(cuerpo));
        var firmaCalculada = Convert.ToHexStringLower(hash);

        return CryptographicOperations.FixedTimeEquals(
            Encoding.UTF8.GetBytes(firmaCalculada), Encoding.UTF8.GetBytes(firmaRecibida));
    }
}
