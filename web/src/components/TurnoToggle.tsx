"use client";

import type { Turno } from "@/lib/types";

interface Props {
  turno: Turno;
  onCambiar: (turno: Turno) => void;
}

export default function TurnoToggle({ turno, onCambiar }: Props) {
  return (
    <div className="inline-flex rounded-lg border border-borde bg-arena-suave/60 p-1">
      <button
        onClick={() => onCambiar("almuerzo")}
        aria-pressed={turno === "almuerzo"}
        className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
            turno === "almuerzo" ? "bg-marca text-white" : "text-tinta-suave hover:bg-superficie"
        }`}
      >
        Almuerzo
      </button>
      <button
        onClick={() => onCambiar("cena")}
        aria-pressed={turno === "cena"}
        className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
            turno === "cena" ? "bg-marca text-white" : "text-tinta-suave hover:bg-superficie"
        }`}
      >
        Cena
      </button>
    </div>
  );
}