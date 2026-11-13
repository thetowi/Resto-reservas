import type { Reserva } from "./types";

// Orden de llegada de las reservas (columna «Recibida» de la planilla y la
// línea «recibida …» de las tarjetas del celular). El backend guarda cuándo
// entró cada reserva y quién la cargó (ver Models/Reserva.cs, RecibidaEn /
// RecibidaPor); acá se numeran, se ordenan y se arma el texto.

const ZONA = "America/Argentina/Buenos_Aires";
const DIAS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];

// ¿La fila tiene una reserva cargada? (una fila vacía de la planilla, con
// solo su horario, no cuenta).
export function tieneReserva(r: Reserva) {
  return (
    r.pax != null || !!r.nombre?.trim() || !!r.habTel?.trim() || !!r.comentarios?.trim() || r.mesaIds.length > 0
  );
}

function tiempo(r: Reserva) {
  return r.recibidaEn ? new Date(r.recibidaEn).getTime() : Number.NaN;
}

// Reservas del turno de la primera a la última que entró. Las que no tienen
// hora de llegada (cargadas antes de que existiera este dato) van al final,
// en el orden de la planilla. Las filas vacías no se incluyen.
export function compararLlegada(a: Reserva, b: Reserva) {
  const ta = tiempo(a);
  const tb = tiempo(b);
  if (Number.isNaN(ta) !== Number.isNaN(tb)) return Number.isNaN(ta) ? 1 : -1;
  return (Number.isNaN(ta) ? 0 : ta - tb) || a.orden - b.orden;
}

export function ordenarPorLlegada(reservas: Reserva[]) {
  return reservas.filter(tieneReserva).sort(compararLlegada);
}

// Número de llegada de cada reserva del turno (1 = la primera que entró).
export function numerosDeLlegada(reservas: Reserva[]) {
  const numeros = new Map<number, number>();
  ordenarPorLlegada(reservas)
    .filter((r) => r.recibidaEn)
    .forEach((r, i) => numeros.set(r.id, i + 1));
  return numeros;
}

function partes(d: Date) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: ZONA,
      year: "numeric",
      month: "numeric",
      day: "numeric",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(d)
      .map((x) => [x.type, x.value]),
  );
  const dia = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(p.weekday);
  return {
    clave: `${p.year}-${p.month}-${p.day}`,
    texto: `${DIAS[dia]} ${Number(p.day)}/${Number(p.month)}`,
    hora: `${p.hour}:${p.minute}`,
  };
}

// «hoy», «ayer» o «dom 8/11», y la hora («13:47»), en hora de Argentina.
export function cuandoLlego(recibidaEn: string, ahora: Date) {
  const llego = partes(new Date(recibidaEn));
  const hoy = partes(ahora);
  const ayer = partes(new Date(ahora.getTime() - 86_400_000));
  const dia = llego.clave === hoy.clave ? "hoy" : llego.clave === ayer.clave ? "ayer" : llego.texto;
  return { dia, hora: llego.hora };
}

// Quién la cargó: «Link», «WhatsApp» o «por Lu» (null si no se sabe).
export function quienLaCargo(r: Reserva) {
  if (r.origen === "web") return "Link";
  if (r.origen === "bot") return "WhatsApp";
  return r.recibidaPor ? `por ${r.recibidaPor}` : null;
}
