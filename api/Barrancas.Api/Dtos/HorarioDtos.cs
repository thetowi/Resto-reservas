namespace Barrancas.Api.Dtos;

// Horarios de cada turno por salón (/admin/horarios, ver
// Models/HorarioTurno.cs y Controllers/HorariosController.cs).

public record FranjaHorariaDto(string Hora, int Filas);

// Personalizado = false: el salón usa los horarios de siempre para ese turno.
public record HorariosTurnoDto(string Turno, bool Personalizado, List<FranjaHorariaDto> Horarios);

// DiasActualizados: al guardar o restaurar, cuántos días ya abiertos (de hoy
// en adelante) se rearmaron con los horarios nuevos.
public record HorariosSalonDto(int SalonId, List<HorariosTurnoDto> Turnos, int DiasActualizados = 0);

public record GuardarHorariosRequest(List<FranjaHorariaDto> Horarios);
