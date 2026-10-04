import type { ReporteDia, Salon, Turno } from "./types";

// Agrupa el reporte mensual por DIA DE LA SEMANA + TURNO: todos los lunes
// almuerzo del mes juntos, todos los lunes cena juntos, todos los martes
// almuerzo, etc. (en vez de una fila por fecha). tablasPorTurno() los arma
// como una tabla separada por turno (Almuerzo / Merienda / Cena), con los
// 7 días de la semana en cada una. Lo usan la pantalla de
// app/reportes/page.tsx y el PDF de lib/reportePdf.ts, así los dos muestran
// exactamente los mismos números.
//
// Se calcula en el frontend a partir de ReporteMensual.porDiaYTurno (ver
// ReportesController.Mensual): no hace falta tocar el backend.

export const NOMBRES_DIA = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

// Orden de los turnos dentro de cada día: el cronológico real.
const ORDEN_TURNO: Turno[] = ["almuerzo", "merienda", "cena"];

export interface FilaSemanal {
  // 0 = Lunes ... 6 = Domingo (semana que arranca en lunes).
  diaSemana: number;
  turno: Turno;
  // Cuántos días distintos (ej. cuántos lunes) tuvieron al menos una
  // reserva en ese turno. Un día sin reservas no cuenta: el backend también
  // devuelve las filas vacías que se auto-generan al abrir un turno (con 0
  // reservas), y esas no son un servicio real.
  dias: number;
  reservas: number;
  pax: number;
  asistio: number;
  // Asistió / Pax del grupo entero (no el promedio de los porcentajes de
  // cada día — mismo criterio que el backend para el total del mes).
  porcentajeAsistencia: number;
  // Pax promedio por día con reservas: permite comparar entre grupos aunque
  // un mes tenga 4 lunes y otro 5.
  paxPromedio: number;
}

// "2026-10-05" -> 0 (lunes). Se arma con el constructor local de Date
// (igual que lib/date.ts) para que la zona horaria no corra el día.
function diaSemanaLunesPrimero(fechaISO: string): number {
  const [y, m, d] = fechaISO.split("-").map(Number);
  return (new Date(y, m - 1, d).getDay() + 6) % 7;
}

function redondear1(n: number): number {
  return Math.round(n * 10) / 10;
}

// Turnos que tiene que mostrar el reporte aunque no tengan reservas:
// Almuerzo y Cena siempre; Merienda solo si el salón elegido la ofrece (o,
// con "Todos los salones", si alguno la ofrece) — mismo criterio que
// TurnoToggle en la pantalla principal (ver Salon.permiteMerienda).
export function turnosDelReporte(salones: Salon[], salonId?: number): Turno[] {
  const consideradas = salonId === undefined ? salones : salones.filter((s) => s.id === salonId);
  const conMerienda = consideradas.some((s) => s.permiteMerienda);
  return conMerienda ? ["almuerzo", "merienda", "cena"] : ["almuerzo", "cena"];
}

// Devuelve SIEMPRE una fila por cada combinación día de la semana x turno
// de "turnos" (7 x 2, o 7 x 3 con Merienda), con ceros cuando ese día/turno
// no tuvo reservas en el mes — así el reporte (y el PDF) se ve completo y
// "0" dice explícitamente que no hubo nada, en vez de que la fila falte.
// Si los datos traen un turno que no está en "turnos" (ej. un salón al que
// después le sacaron Merienda pero quedaron reservas viejas), también se
// incluye: nunca se descartan reservas reales.
export function agruparPorDiaSemana(porDiaYTurno: ReporteDia[], turnos: Turno[]): FilaSemanal[] {
  const grupos = new Map<string, FilaSemanal>();

  for (const d of porDiaYTurno) {
    if (d.cantidadReservas === 0) continue;
    const diaSemana = diaSemanaLunesPrimero(d.fecha);
    const clave = `${diaSemana}:${d.turno}`;
    const g = grupos.get(clave) ?? {
      diaSemana,
      turno: d.turno,
      dias: 0,
      reservas: 0,
      pax: 0,
      asistio: 0,
      porcentajeAsistencia: 0,
      paxPromedio: 0,
    };
    g.dias += 1;
    g.reservas += d.cantidadReservas;
    g.pax += d.totalPax;
    g.asistio += d.totalAsistio;
    grupos.set(clave, g);
  }

  const turnosAMostrar = ORDEN_TURNO.filter(
    (t) => turnos.includes(t) || [...grupos.values()].some((g) => g.turno === t),
  );

  const filas: FilaSemanal[] = [];
  for (let diaSemana = 0; diaSemana < 7; diaSemana++) {
    for (const turno of turnosAMostrar) {
      const g = grupos.get(`${diaSemana}:${turno}`) ?? {
        diaSemana,
        turno,
        dias: 0,
        reservas: 0,
        pax: 0,
        asistio: 0,
        porcentajeAsistencia: 0,
        paxPromedio: 0,
      };
      filas.push({
        ...g,
        porcentajeAsistencia: g.pax === 0 ? 0 : redondear1((100 * g.asistio) / g.pax),
        paxPromedio: g.dias === 0 ? 0 : redondear1(g.pax / g.dias),
      });
    }
  }
  return filas;
}

export const NOMBRE_TURNO: Record<Turno, string> = {
  almuerzo: "Almuerzo",
  merienda: "Merienda",
  cena: "Cena",
};

// Fila de una tabla por turno: los mismos números de FilaSemanal más
// "ocupacion", que es lo que pesa esa fila dentro de las reservas de SU
// tabla (turno): reservas de la fila / reservas totales del turno en el mes,
// de 0 a 100. Es lo que dibuja la "píldora" de la columna Ocupación — sirve
// para ver de un vistazo qué día concentra más reservas. (Se mide en
// reservas, no en pax, ni contra el mes entero: cada tabla es su propio
// 100%, así que sus filas suman ~100.)
export type FilaTabla = FilaSemanal & { ocupacion: number };

// Una tabla por turno: los 7 días (Lunes a Domingo) más una fila de total de
// ese turno en el mes.
export interface TablaTurno {
  turno: Turno;
  filas: FilaTabla[];
  // Mayor "ocupacion" entre las filas (0 si el turno no tuvo reservas): la
  // pantalla y el PDF resaltan la/s fila/s que la alcanzan.
  maxOcupacion: number;
  total: Omit<FilaTabla, "diaSemana" | "turno">;
}

export function tablasPorTurno(porDiaYTurno: ReporteDia[], turnos: Turno[]): TablaTurno[] {
  const todas = agruparPorDiaSemana(porDiaYTurno, turnos);
  return ORDEN_TURNO.filter((t) => todas.some((f) => f.turno === t)).map((turno) => {
    const delTurno = todas.filter((f) => f.turno === turno);
    const dias = delTurno.reduce((acc, f) => acc + f.dias, 0);
    const reservas = delTurno.reduce((acc, f) => acc + f.reservas, 0);
    const pax = delTurno.reduce((acc, f) => acc + f.pax, 0);
    const asistio = delTurno.reduce((acc, f) => acc + f.asistio, 0);
    const filas: FilaTabla[] = delTurno.map((f) => ({
      ...f,
      ocupacion: reservas === 0 ? 0 : redondear1((100 * f.reservas) / reservas),
    }));
    return {
      turno,
      filas,
      maxOcupacion: filas.reduce((max, f) => Math.max(max, f.ocupacion), 0),
      total: {
        dias,
        reservas,
        pax,
        asistio,
        porcentajeAsistencia: pax === 0 ? 0 : redondear1((100 * asistio) / pax),
        paxPromedio: dias === 0 ? 0 : redondear1(pax / dias),
        ocupacion: reservas === 0 ? 0 : 100,
      },
    };
  });
}
