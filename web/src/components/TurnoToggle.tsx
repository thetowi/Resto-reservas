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
  // Turnos (de ESTE salón) que tienen alguna reserva cargada pero no son el
  // que se está mirando ahora — ver turnosConAviso en app/page.tsx. Hoy en
  // la práctica solo trae "merienda": es la segunda mitad del aviso que
  // arranca en SalonSelector (ver salonesConAviso ahí) para los salones que
  // SÍ ofrecen Merienda — te "trae" hasta el salón correcto con el anillo
  // del selector, y una vez ahí te termina de llevar hasta el turno con
  // este mismo anillo en el botón.
  turnosConAviso?: Set<Turno>;
}

export default function TurnoToggle({ turno, onCambiar, permiteMerienda = false, turnosConAviso }: Props) {
  return (
    <div className="inline-flex rounded-lg border border-borde bg-arena-suave/60 p-1">
      <button
        onClick={() => onCambiar("almuerzo")}
        aria-pressed={turno === "almuerzo"}
        className={`relative isolate rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
            turno === "almuerzo" ? "bg-marca text-white" : "text-tinta-suave hover:bg-superficie"
        } ${turno !== "almuerzo" && turnosConAviso?.has("almuerzo") ? "boton-salon-aviso" : ""}`}
      >
        Almuerzo
      </button>
      {permiteMerienda && (
        <button
          onClick={() => onCambiar("merienda")}
          aria-pressed={turno === "merienda"}
          title={turno !== "merienda" && turnosConAviso?.has("merienda") ? "Hay reservas cargadas en Merienda" : undefined}
          className={`relative isolate rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
              turno === "merienda" ? "bg-marca text-white" : "text-tinta-suave hover:bg-superficie"
          } ${turno !== "merienda" && turnosConAviso?.has("merienda") ? "boton-salon-aviso" : ""}`}
        >
          Merienda
        </button>
      )}
      <button
        onClick={() => onCambiar("cena")}
        aria-pressed={turno === "cena"}
        className={`relative isolate rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
            turno === "cena" ? "bg-marca text-white" : "text-tinta-suave hover:bg-superficie"
        } ${turno !== "cena" && turnosConAviso?.has("cena") ? "boton-salon-aviso" : ""}`}
      >
        Cena
      </button>
    </div>
  );
}
