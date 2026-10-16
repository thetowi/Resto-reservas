import { MAPS_CLIENTE, NOMBRE_PUBLICO } from "./marca";

// "Agregar al calendario" de la confirmacion del link de reservas.
// - iPhone / iPad / Safari en Mac: se abre /reservar/calendario, que responde
//   un evento .ics "inline" -> el sistema muestra "Agregar al calendario".
// - El resto (Android, Chrome/Edge/Firefox en compu): Google Calendar con el
//   evento ya cargado (en Android abre la app).
// Antes se descargaba un .ics desde el navegador: en Android y en la compu
// quedaba como un archivo en Descargas y no se agregaba a ningun lado.

export interface EventoReserva {
  codigo: string;
  fecha: string; // yyyy-mm-dd
  hora: string; // HH:mm
  pax: number;
  salon: string;
}

export const ZONA_RESTAURANTE = "America/Argentina/Buenos_Aires";
const DURACION_HORAS = 2;

const RE_FECHA = /^\d{4}-\d{2}-\d{2}$/;
const RE_HORA = /^\d{2}:\d{2}$/;
const RE_CODIGO = /^[A-Za-z0-9-]{1,24}$/;

export function eventoValido(e: Partial<EventoReserva>): e is EventoReserva {
  return (
    !!e.fecha && RE_FECHA.test(e.fecha) &&
    !!e.hora && RE_HORA.test(e.hora) &&
    !!e.codigo && RE_CODIGO.test(e.codigo) &&
    Number.isInteger(e.pax) && (e.pax as number) >= 1 && (e.pax as number) <= 999 &&
    typeof e.salon === "string" && e.salon.length <= 60
  );
}

// Inicio y fin como "yyyymmddTHHmmss" (hora del restaurante, sin zona). El fin
// puede pasar al dia siguiente (una cena a las 23:30).
function inicioYFin(e: EventoReserva) {
  const [y, m, d] = e.fecha.split("-").map(Number);
  const [hh, mm] = e.hora.split(":").map(Number);
  const base = Date.UTC(y, m - 1, d, hh, mm);
  const fmt = (ms: number) => new Date(ms).toISOString().slice(0, 19).replace(/[-:]/g, "");
  return { inicio: fmt(base), fin: fmt(base + DURACION_HORAS * 3600_000) };
}

const titulo = () => `Reserva en ${NOMBRE_PUBLICO}`;
const persona = (pax: number) => `${pax} ${pax === 1 ? "persona" : "personas"}`;

function detalle(e: EventoReserva) {
  const partes = [`${persona(e.pax)}${e.salon ? ` · ${e.salon}` : ""}`, `Código de reserva: ${e.codigo}`];
  if (MAPS_CLIENTE) partes.push(`Cómo llegar: ${MAPS_CLIENTE}`);
  return partes.join("\n");
}

export function linkGoogleCalendar(e: EventoReserva) {
  const { inicio, fin } = inicioYFin(e);
  const q = new URLSearchParams({
    action: "TEMPLATE",
    text: titulo(),
    dates: `${inicio}/${fin}`,
    ctz: ZONA_RESTAURANTE,
    details: detalle(e),
    location: NOMBRE_PUBLICO,
  });
  return `https://calendar.google.com/calendar/render?${q}`;
}

export function linkIcs(e: EventoReserva) {
  const q = new URLSearchParams({ codigo: e.codigo, fecha: e.fecha, hora: e.hora, pax: String(e.pax), salon: e.salon });
  return `/reservar/calendario?${q}`;
}

// Texto del .ics (RFC 5545): comas, punto y coma y saltos escapados; lineas
// de mas de 75 bytes plegadas.
const escapar = (t: string) => t.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

function plegar(linea: string) {
  const bytes = new TextEncoder();
  const salida: string[] = [];
  let actual = "";
  for (const ch of linea) {
    if (bytes.encode(actual + ch).length > (salida.length ? 74 : 75)) {
      salida.push(actual);
      actual = ch;
    } else {
      actual += ch;
    }
  }
  salida.push(actual);
  return salida.join("\r\n ");
}

export function textoIcs(e: EventoReserva, ahora = new Date()) {
  const { inicio, fin } = inicioYFin(e);
  const sello = ahora.toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//capax//reservas//ES",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${e.codigo}@capax.ar`,
    `DTSTAMP:${sello}`,
    `DTSTART:${inicio}`,
    `DTEND:${fin}`,
    `SUMMARY:${escapar(titulo())}`,
    `DESCRIPTION:${escapar(detalle(e))}`,
    `LOCATION:${escapar(NOMBRE_PUBLICO)}`,
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    `DESCRIPTION:${escapar(titulo())}`,
    "TRIGGER:-PT2H",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ]
    .map(plegar)
    .join("\r\n");
}

// iPhone/iPad (tambien el iPad que se presenta como Mac) o Safari en Mac.
export function usaCalendarioApple() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const ios = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  const safariMac = /Macintosh/.test(ua) && /Safari\//.test(ua) && !/Chrome|Chromium|CriOS|Edg|Firefox|FxiOS|OPR/.test(ua);
  return ios || safariMac;
}
