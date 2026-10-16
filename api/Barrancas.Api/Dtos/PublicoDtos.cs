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
public record PublicoConfigDto(
    List<PublicoSalonDto> Salones,
    Dictionary<string, List<string>> Horarios,
    int LimitePaxConfirmaSola,
    int PaxMaximo,
    int DiasAdelante,
    DateOnly Hoy);

// Estado: "ok" | "pocos" | "lleno" | "bloqueado" (sin reservas online ese dia).
public record PublicoDiaDto(DateOnly Fecha, string Estado);

// Estado: "disponible" | "pocas" (ultimas mesas) | "sin_lugar".
public record PublicoHorarioDto(string Hora, string Estado);

public record PublicoTurnoDto(string Turno, bool Cerrado, List<PublicoHorarioDto> Horarios);

public record PublicoSalonDisponibilidadDto(int SalonId, bool HayLugar, List<PublicoTurnoDto> Turnos);

public record PublicoDisponibilidadDto(DateOnly Fecha, bool Bloqueada, List<PublicoSalonDisponibilidadDto> Salones);

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
