import { NOMBRE_PUBLICO } from "./marca";

// Saca un numero de WhatsApp de lo que haya en "Hab / Tel" (ej. "11 5555-0142"
// o "Hab 214 · 11 5555-0142") y lo arma en formato internacional para
// wa.me. Pensado para Argentina: un celular de 10 digitos (area + numero,
// "11 5555-0142") pasa a 549 + numero; si ya viene con 54/549 se respeta.
// Numeros de menos de 10 digitos (un fijo sin caracteristica, un numero de
// habitacion) no cuentan como WhatsApp: devuelve null y no se ofrece el boton.
export function numeroWhatsApp(texto: string | null | undefined): string | null {
  if (!texto) return null;
  for (const parte of texto.split(/[·,;/|]/)) {
    if (/^\s*hab/i.test(parte)) continue;
    let d = parte.replace(/\D/g, "");
    if (d.length < 10 || d.length > 15) continue;
    if (d.startsWith("549")) return d;
    if (d.startsWith("54")) return `549${d.slice(2)}`;
    d = d.replace(/^0/, "");
    if (d.length === 10) return `549${d}`;
    return d;
  }
  return null;
}

const SEM = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];

// "2026-10-17" -> "sáb 17/10"
export function fechaCorta(fechaISO: string): string {
  const [y, m, d] = fechaISO.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return `${SEM[dt.getDay()]} ${d}/${m}`;
}

// Link a un chat de WhatsApp con un mensaje ya escrito (el equipo lo
// completa antes de mandarlo).
export function linkWhatsApp(numero: string, nombre: string | null | undefined, fechaISO: string, hora: string | null | undefined) {
  const primerNombre = (nombre ?? "").trim().split(/\s+/)[0];
  const cuando = `${fechaCorta(fechaISO)}${hora ? ` a las ${hora}` : ""}`;
  const texto = `Hola${primerNombre ? ` ${primerNombre}` : ""}, te escribimos de ${NOMBRE_PUBLICO} por tu reserva del ${cuando}. `;
  return `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`;
}

// Mismo link, para avisar un cambio de horario.
export function linkWhatsAppCambio(numero: string, nombre: string | null | undefined, fechaISO: string, hora: string | null | undefined) {
  const primerNombre = (nombre ?? "").trim().split(/\s+/)[0];
  const texto = `Hola${primerNombre ? ` ${primerNombre}` : ""}, te escribimos de ${NOMBRE_PUBLICO}: tu reserva del ${fechaCorta(fechaISO)} quedó para las ${hora ?? ""}. `;
  return `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`;
}
