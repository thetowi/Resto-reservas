"use client";

import type { Turno } from "@/lib/types";

interface Props {
  turno: Turno;
  onCambiar: (turno: Turno) => void;
  // Solo se ofrece el botón "Merienda" cuando el salón elegido lo permite
  // (ver Salon.permiteMerienda) — pensado para el lobby bar, no para el
  // salón principal. Default false: si no se pasa, se comporta igual que
  // antes (solo Almuerzo/Cena).
  permiteMerienda?: boolean;
}

export default function TurnoToggle({ turno, onCambiar, permiteMerienda = false }: Props) {
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
      {permiteMerienda && (
        <button
          onClick={() => onCambiar("merienda")}
          aria-pressed={turno === "merienda"}
          className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
              turno === "merienda" ? "bg-marca text-white" : "text-tinta-suave hover:bg-superficie"
          }`}
        >
          Merienda
        </button>
      )}
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
