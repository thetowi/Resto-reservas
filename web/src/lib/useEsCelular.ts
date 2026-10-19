"use client";

import { useSyncExternalStore } from "react";

// Pantallas de celular (hasta 767 px de ancho): el panel cambia a la versión
// en tarjetas (ver PanelCelular) y la barra lateral pasa a ser la barra de
// abajo. El mismo corte está en globals.css (.barra-celular).
const CONSULTA = "(max-width: 767px)";

function suscribir(avisar: () => void) {
  const mq = window.matchMedia(CONSULTA);
  mq.addEventListener("change", avisar);
  return () => mq.removeEventListener("change", avisar);
}

export function useEsCelular() {
  return useSyncExternalStore(
    suscribir,
    () => window.matchMedia(CONSULTA).matches,
    () => false,
  );
}
