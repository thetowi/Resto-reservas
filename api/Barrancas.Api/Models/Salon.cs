namespace Barrancas.Api.Models;

/// <summary>
/// Un salón del restaurante: una sección con sus propias mesas, su propio
/// plano visual, y sus propias reservas/lista de espera/walk-ins por turno.
/// Hasta ahora "el restaurante" era un único salón implícito; esto lo separa
/// en entidades propias ("Restaurant", "Bar", "Aqua Bar", etc.) para que cada
/// una tenga la misma lógica y las mismas funciones de forma independiente —
/// el staff elige con cuál trabajar desde un selector en pantalla (mismo
/// patrón que el selector Almuerzo/Cena), y un Admin puede crear/renombrar/
/// borrar salones desde /admin/salones. Siempre tiene que existir al menos
/// uno: la app no tiene sentido sin ningún salón (ver SalonesController.Borrar).
/// </summary>
public class Salon
{
    public int Id { get; set; }
    public string Nombre { get; set; } = string.Empty;
    public int Orden { get; set; }

    // Un salon "desactivado" sigue existiendo con todas sus mesas/reservas/
    // historial intactos (no es lo mismo que borrarlo, ver
    // SalonesController.Borrar: eso exige que esté vacío) — simplemente deja
    // de aparecer en el selector de la pantalla principal y en /plano y
    // /admin/mesas (MetaController.GetMeta solo trae los activos), para que
    // un salon que ya no se usa (de temporada, cerrado, etc.) no quede
    // compitiendo en el toggle con los que sí están operando. Pensado para
    // el caso típico que hacía que borrar un salón fallara: tiene reservas
    // (u otro historial) que no se pueden perder, así que no se puede borrar,
    // pero tampoco tiene sentido seguir viéndolo en el día a día. Se
    // reactiva en cualquier momento desde /admin/salones, sin perder nada.
    public bool Activo { get; set; } = true;

    // Si este salon ofrece el turno Merienda (16:00 a 18:00, cada 30 min):
    // pensado para el lobby bar, no para el salon principal. Con esto en
    // false (default), DiaService.GetDiaAsync ni siquiera calcula ese turno
    // para este salon (no tiene sentido generar filas vacias de merienda
    // para un salon que nunca la usa), y el frontend no ofrece la opcion en
    // el selector de turno.
    public bool PermiteMerienda { get; set; } = false;

    // ---- Configuración del salón (/admin/salones, ficha del salón) ----

    // Color para identificarlo en las pestañas del panel y del celular (hex).
    public string Color { get; set; } = string.Empty;

    // Turnos que ofrece (Merienda: PermiteMerienda, de arriba) y qué días de
    // la semana abre cada uno: máscara de bits lunes = 1, martes = 2, ...,
    // domingo = 64 (127 = todos). Un turno que no se ofrece, o un día que no
    // abre, queda cerrado en el panel y en el link (se puede reabrir un día
    // puntual desde el panel, ver CierreTurno.Reabierto).
    public bool OfreceAlmuerzo { get; set; } = true;
    public bool OfreceCena { get; set; } = true;
    public int DiasAlmuerzo { get; set; } = TodosLosDias;
    public int DiasMerienda { get; set; } = TodosLosDias;
    public int DiasCena { get; set; } = TodosLosDias;

    // Link de reservas: si el salón aparece, cómo se confirman las reservas
    // (ver ConfirmacionWeb), el máximo de personas, la anticipación mínima y
    // hasta cuántos días adelante se puede reservar.
    public bool MostrarEnLink { get; set; } = true;
    public ConfirmacionWeb Confirmacion { get; set; } = ConfirmacionWeb.Nunca;
    // Con ConfirmacionWeb.HastaPax: desde esta cantidad de personas queda a confirmar.
    public int ConfirmaHastaPax { get; set; } = 6;
    public int PaxMaximoWeb { get; set; } = 20;
    public int AnticipacionMinutos { get; set; } = 60;
    public int DiasAdelante { get; set; } = 60;

    // Minutos después de la hora reservada en que la reserva se marca "tarde".
    public int ToleranciaMinutos { get; set; } = 15;

    public const int TodosLosDias = 127;

    public bool Ofrece(Turno turno) => turno switch
    {
        Turno.Almuerzo => OfreceAlmuerzo,
        Turno.Merienda => PermiteMerienda,
        _ => OfreceCena,
    };

    public int DiasDe(Turno turno) => turno switch
    {
        Turno.Almuerzo => DiasAlmuerzo,
        Turno.Merienda => DiasMerienda,
        _ => DiasCena,
    };

    // Bit del día de la semana (lunes = 0 ... domingo = 6).
    public static int BitDe(DateOnly fecha) => 1 << (((int)fecha.DayOfWeek + 6) % 7);

    public bool AbreEl(Turno turno, DateOnly fecha) => Ofrece(turno) && (DiasDe(turno) & BitDe(fecha)) != 0;

    // ¿Una reserva del link de tantas personas se confirma sola en este salón?
    public bool ConfirmaSola(int pax) => Confirmacion switch
    {
        ConfirmacionWeb.Siempre => true,
        ConfirmacionWeb.HastaPax => pax < ConfirmaHastaPax,
        _ => false,
    };
}

// Cómo se confirman las reservas del link en un salón.
public enum ConfirmacionWeb
{
    // Se confirma sola si hay una mesa libre donde entren.
    Siempre = 0,
    // Se confirma sola por debajo de Salon.ConfirmaHastaPax personas; desde
    // ahí queda como solicitud.
    HastaPax = 1,
    // Todas quedan como solicitud: el equipo las aprueba en Reservas web.
    Nunca = 2,
}
