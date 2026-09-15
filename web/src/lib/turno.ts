import type { Turno } from "./types";

// Antes de las 16hs se considera "Almuerzo"; de 16 a 18 "Merienda" (turno
// intermedio del lobby bar — ver Salon.permiteMerienda); de ahi en mas
// "Cena". Regla unica compartida por la pantalla principal (app/page.tsx) y
// el plano (app/plano/page.tsx), para que las dos sigan siempre el mismo
// horario de corte sin poder desincronizarse entre sí.
//
// Esta funcion es agnostica del salon elegido (no sabe si permite merienda o
// no): el caller es quien decide si el resultado "merienda" es valido para
// el salon actual, y si no, cae a turnoPorDefectoSinMerienda.
export function turnoPorDefecto(): Turno {
  const hora = new Date().getHours();
  if (hora < 16) return "almuerzo";
  if (hora < 18) return "merienda";
  return "cena";
}

// Mismo horario de corte de siempre (solo almuerzo/cena), para salones que
// no ofrecen merienda: evita que a esos salones se les proponga por
// default un turno que ni siquiera pueden elegir.
export function turnoPorDefectoSinMerienda(): Turno {
  return new Date().getHours() < 16 ? "almuerzo" : "cena";
}
