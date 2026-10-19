namespace Barrancas.Api.Dtos;

// DTOs del link publico de reservas (/api/publico, sin login — ver
// ReservaOnlineService / ReservasPublicasController). A proposito NO exponen
// nada interno: ni mesas, ni nombres de otros clientes, ni cantidades exactas
// de reservas; solo si hay lugar o no.

// ConfirmaSola: si una reserva de menos de LimitePaxConfirmaSola personas en
// este salon se confirma al instante (true) o queda como solicitud que el
// equipo confirma por WhatsApp (false).
public record PublicoSalonDto(int Id, string Nombre, bool PermiteMerienda, bool ConfirmaSola);

// Horarios: "almuerzo"/"merienda"/"cena" -> horarios ofrecidos (los de la
// planilla, ver HorariosDefault). Hoy: fecha local del restaurante.
// Ubicacion: lo que cargo el Admin en /admin/restaurante (null si todavia no
// cargo nada; el link usa entonces las variables de entorno).
public record PublicoConfigDto(
    List<PublicoSalonDto> Salones,
    Dictionary<string, List<string>> Horarios,
    int LimitePaxConfirmaSola,
    int PaxMaximo,
    int DiasAdelante,
    DateOnly Hoy,
    PublicoUbicacionDto? Ubicacion = null);

// "Cómo llegar": direccion y links opcionales de cada app de mapas.
public record PublicoUbicacionDto(string? Direccion, string? GoogleMapsUrl, string? AppleMapsUrl, string? WazeUrl);

// Estado: "ok" | "pocos" | "lleno" | "bloqueado" (sin reservas online ese
// dia: el link muestra Motivo/Mensaje y el boton de WhatsApp) | "servicio"
// (hoy, sin horarios para reservar porque el turno ya esta en servicio: por
// orden de llegada).
public record PublicoDiaDto(DateOnly Fecha, string Estado, string? Motivo = null, string? Mensaje = null);

// Estado: "disponible" | "pocas" (ultimas mesas) | "sin_lugar".
public record PublicoHorarioDto(string Hora, string Estado);

// PorWhatsApp: el turno esta cerrado para la web por una fecha especial
// (ver FechaBloqueadaBot): el link muestra el mensaje y el boton de WhatsApp.
// EnServicio: hoy, el turno ya empezo; hasta FinServicio ("15:00") es por
// orden de llegada (ver ReservaOnlineService.EstaEnServicio).
public record PublicoTurnoDto(string Turno, bool Cerrado, List<PublicoHorarioDto> Horarios, bool PorWhatsApp = false, bool EnServicio = false, string? FinServicio = null);

public record PublicoSalonDisponibilidadDto(int SalonId, bool HayLugar, List<PublicoTurnoDto> Turnos);

public record PublicoDisponibilidadDto(DateOnly Fecha, bool Bloqueada, List<PublicoSalonDisponibilidadDto> Salones, string? Motivo = null, string? Mensaje = null);

// Sitio: campo trampa (honeypot) que el formulario real deja siempre vacio;
// si viene con algo, es un bot llenando todos los campos.
public record PublicoReservaRequest(
    DateOnly Fecha,
    int SalonId,
    string Turno,
    string Hora,
    int Pax,
    string Nombre,
    string Telefono,
    string? Habitacion,
    string? Ocasion,
    string? Comentarios,
    bool AceptaPrivacidad,
    string? Sitio);

// Estado: "confirmada" | "pendiente" (solicitud que confirma el equipo).
public record PublicoReservaResultado(
    string Estado,
    string Codigo,
    DateOnly Fecha,
    string Hora,
    string Turno,
    string Salon,
    int Pax);
