import type { Reserva } from "./types";

// Tolerancia (en minutos) antes de avisar que una reserva no se presentó a
// la hora cargada: pasado este margen, ReservaRow resalta la fila (y ofrece
// liberar la mesa al toque) y ShiftSection suma un contador en el
// encabezado del turno. Un solo lugar para el número, por si en algún
// momento se quiere hacer configurable.
export const TOLERANCIA_MINUTOS = 15;

function fechaLocalYMD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Una reserva está "completa" cuando tiene mesa asignada, pax cargado, y
// nombre O número de habitación — no hace falta el nombre en particular:
// puede venir un huésped a una reserva y no dejar registrado su nombre,
// alcanza con el número de habitación para poder ubicarlo. Una fila con
// menos que eso todavía se está cargando (o es una fila vacía sembrada por
// el horario default), así que no tiene sentido avisar que "no llegó".
export function esReservaCompleta(reserva: Reserva): boolean {
  return (
    reserva.mesaIds.length > 0 &&
    reserva.pax !== null &&
    reserva.pax > 0 &&
    (!!reserva.nombre?.trim() || !!reserva.habTel?.trim())
  );
}

// ¿Esta reserva superó la tolerancia? Solo aplica a reservas completas (ver
// esReservaCompleta) del día de HOY (fecha local del navegador), que
// todavía no se marcaron ni "Asistió" ni "Se fue" — apenas se tilda
// cualquiera de las dos, el aviso desaparece solo (ver ReservaRow.tsx).
export function excedioTolerancia(reserva: Reserva, ahora: Date): boolean {
  if (reserva.asistio || reserva.retirada) return false;
  if (!esReservaCompleta(reserva)) return false;
  if (!reserva.hora) return false;
  if (reserva.fecha !== fechaLocalYMD(ahora)) return false;

  const match = /^(\d{1,2}):(\d{2})$/.exec(reserva.hora.trim());
  if (!match) return false;
  const horas = Number(match[1]);
  const minutos = Number(match[2]);
  if (horas > 23 || minutos > 59) return false;

  const horaReserva = new Date(ahora);
  horaReserva.setHours(horas, minutos, 0, 0);
  const minutosTarde = (ahora.getTime() - horaReserva.getTime()) / 60000;
  return minutosTarde >= TOLERANCIA_MINUTOS;
}
