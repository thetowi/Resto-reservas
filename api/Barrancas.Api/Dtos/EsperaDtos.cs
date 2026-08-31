using Barrancas.Api.Models;

namespace Barrancas.Api.Dtos;

// Lista de espera de un dia/turno: gente sin reserva que llega y espera
// mesa. Orden = orden de llegada (FIFO): el primero en anotarse es el
// primero al que hay que asignarle mesa cuando se libera una.
public record EsperaDto(
    int Id,
    DateOnly Fecha,
    Turno Turno,
    int Orden,
    string? Nombre,
    string? HabTel,
    int? Pax,
    bool Ubicada,
    DateTime CreatedAt
);

public record CrearEsperaRequest(DateOnly Fecha, Turno Turno, int SalonId, string? Nombre, string? HabTel, int? Pax);

// Payload del broadcast de SignalR ("EsperaActualizada"): a diferencia de la
// respuesta HTTP (que devuelve la lista sola, porque el caller ya sabe
// fecha/turno/salon del propio request), acá van explicitos para que quien
// esta escuchando el evento pueda filtrar por fecha/turno/salon aunque la
// lista este vacia.
public record EsperaListaDto(DateOnly Fecha, Turno Turno, int SalonId, List<EsperaDto> Lista);

// Misma convencion que ActualizarReservaRequest: Nombre/HabTel null = no
// tocar; Pax usa OptionalInt porque se tiene que poder vaciar de verdad.
// Ubicada no necesita ese tratamiento (nunca se "vacia", solo se tilda o
// destilda).
public record ActualizarEsperaRequest(string? Nombre, string? HabTel, OptionalInt Pax, bool? Ubicada);
