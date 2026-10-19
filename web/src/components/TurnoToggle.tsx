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
  // el mismo anillo en el botón.
  turnosConAviso?: Set<Turno>;
}

const NOMBRES: Record<Turno, string> = { almuerzo: "Almuerzo", merienda: "Merienda", cena: "Cena" };

// Control segmentado, igual que SalonSelector (mismo anillo rojo de aviso).
export default function TurnoToggle({ turno, onCambiar, permiteMerienda = false, turnosConAviso }: Props) {
  const turnos: Turno[] = permiteMerienda ? ["almuerzo", "merienda", "cena"] : ["almuerzo", "cena"];
  return (
    <div className="inline-flex gap-1 rounded-[13px] border border-borde bg-arena-suave p-1">
      {turnos.map((t) => {
        const activo = t === turno;
        const conAviso = !activo && (turnosConAviso?.has(t) ?? false);
        return (
          <button
            key={t}
            type="button"
            onClick={() => onCambiar(t)}
            aria-pressed={activo}
            title={conAviso ? `Hay reservas cargadas en ${NOMBRES[t]}` : undefined}
            className={`relative isolate rounded-[10px] px-4 py-2 text-sm font-semibold whitespace-nowrap transition-colors ${conAviso ? "boton-salon-aviso" : ""} ${
              activo ? "bg-marca text-white" : "text-tinta-suave hover:text-tinta"
            }`}
          >
            {NOMBRES[t]}
          </button>
        );
      })}
    </div>
  );
}
