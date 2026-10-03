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

// Selector de salón (Restaurant, Bar, Aqua Bar, etc): mismas pastillas que
// TurnoToggle (antes era un <select> — se cambió a pedido para que se vea y
// se use igual que el toggle de Almuerzo/Merienda/Cena). A propósito SIN
// flex-wrap: envolver a una segunda fila agranda la caja "Salones" del
// header y rompe el resto del layout — si la lista crece mucho desde
// /admin/salones, la fila se ensancha (y el header entero scrollea
// horizontal, ver overflow-x-auto en page.tsx) en vez de apilarse.
//
// El botón de un salón con reservas cargadas en otro lado (ver
// salonesConAviso) recibe la clase "boton-salon-aviso" (ver globals.css):
// un "cometa" rojo que recorre el borde entero sin parar, más el fondo que
// respira una vez cada ciclo — pensado para notarse sin necesidad de
// acercar el mouse, en un mostrador donde nadie mira la pantalla fijo todo
// el día.
export default function SalonSelector({ salones, salonId, onCambiar, salonesConAviso }: Props) {
  if (salones.length === 0) return null;

  return (
    <div className="inline-flex flex-nowrap gap-1 rounded-lg border border-borde bg-arena-suave/60 p-1">
      {salones.map((s) => {
        const activo = s.id === salonId;
        const conAviso = !activo && (salonesConAviso?.has(s.id) ?? false);
        return (
          <button
            key={s.id}
            onClick={() => onCambiar(s.id)}
            aria-pressed={activo}
            title={conAviso ? `Hay reservas cargadas en ${s.nombre}` : undefined}
            className={`relative isolate rounded-md px-4 py-1.5 text-sm font-medium whitespace-nowrap transition-colors ${
              activo ? "bg-marca text-white" : "text-tinta-suave hover:bg-superficie"
            } ${conAviso ? "boton-salon-aviso" : ""}`}
          >
            {s.nombre}
          </button>
        );
      })}
    </div>
  );
}
