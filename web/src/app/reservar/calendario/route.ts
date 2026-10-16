import type { NextRequest } from "next/server";
import { eventoValido, textoIcs } from "@/lib/calendario";

// Evento .ics de una reserva, para "Agregar al calendario" en iPhone/Mac
// (ver lib/calendario.ts). Se sirve "inline" como text/calendar: Safari
// muestra la hoja "Agregar al calendario" en vez de descargar un archivo.
// No toca la base: arma el evento con los datos que ya tiene la confirmacion.
export function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const evento = {
    codigo: p.get("codigo") ?? "",
    fecha: p.get("fecha") ?? "",
    hora: p.get("hora") ?? "",
    pax: Number(p.get("pax")),
    salon: p.get("salon") ?? "",
  };
  if (!eventoValido(evento)) {
    return new Response("Reserva inválida", { status: 400 });
  }
  return new Response(textoIcs(evento), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `inline; filename="reserva-${evento.codigo}.ics"`,
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}
