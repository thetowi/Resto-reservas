"use client";

import type { Salon } from "@/lib/types";

interface Props {
  salones: Salon[];
  salonId: number;
  onCambiar: (salonId: number) => void;
  // Ids de salones (siempre DISTINTOS al elegido — ver salonesConReservas en
  // app/page.tsx) que tienen alguna reserva cargada en el turno que se está
  // mirando ahora. Al salón elegido nunca se le marca el aviso (no hace
  // falta avisarse a uno mismo), aunque tenga reservas.
  salonesConAviso?: Set<number>;
}

// Selector de salón (Restaurant, Lobby bar, etc): control segmentado, igual
// que TurnoToggle (opción A del mockup capax-encabezado-prototipo). A
// propósito SIN flex-wrap: si la lista crece mucho desde /admin/salones, el
// encabezado pasa Salón y Turno a una segunda línea entera.
//
// Un salón con reservas cargadas en otro lado (ver salonesConAviso) lleva
// un punto rojo que late al lado del nombre (.aviso-punto en globals.css):
// reemplaza al borde animado y a la leyenda «Hay reservas» de antes.
export default function SalonSelector({ salones, salonId, onCambiar, salonesConAviso }: Props) {
  if (salones.length === 0) return null;

  return (
    <div className="inline-flex flex-nowrap gap-0.5 rounded-[13px] border border-borde bg-arena-suave p-1">
      {salones.map((s) => {
        const activo = s.id === salonId;
        const conAviso = !activo && (salonesConAviso?.has(s.id) ?? false);
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => onCambiar(s.id)}
            aria-pressed={activo}
            title={conAviso ? `Hay reservas cargadas en ${s.nombre}` : undefined}
            className={`relative rounded-[10px] py-2 pl-4 text-sm font-semibold whitespace-nowrap transition-colors ${conAviso ? "pr-[26px]" : "pr-4"} ${
              activo ? "bg-marca text-white" : "text-tinta-suave hover:text-tinta"
            }`}
          >
            {s.nombre}
            {conAviso && <i className="aviso-punto" aria-label="hay reservas" />}
          </button>
        );
      })}
    </div>
  );
}
