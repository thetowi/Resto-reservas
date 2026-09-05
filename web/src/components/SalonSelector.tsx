"use client";

import type { Salon } from "@/lib/types";

// después
interface Props {
  salones: Salon[];
  salonId: number;
  onCambiar: (salonId: number) => void;
}

// Selector de salón (Restaurant, Bar, Aqua Bar, etc): un <select> en vez de
// pastillas como TurnoToggle porque acá la cantidad de opciones no está
// fija en dos — puede crecer con el tiempo desde /admin/salones.
export default function SalonSelector({ salones, salonId, onCambiar }: Props) {
  if (salones.length === 0) return null;

  return (
    <select
      className="rounded-lg border border-borde bg-superficie px-3 py-1.5 text-sm font-medium"
      value={salonId}
      onChange={(e) => onCambiar(Number(e.target.value))}
    >
      {salones.map((s) => (
        <option key={s.id} value={s.id}>
          {s.nombre}
        </option>
      ))}
    </select>
  );
}