import { DIRECCION_CLIENTE, MAPS_APPLE_CLIENTE, MAPS_CLIENTE, NOMBRE_PUBLICO, WAZE_CLIENTE } from "./marca";
import type { UbicacionPublica } from "./reservaPublica";

// "Cómo llegar" del link de reservas: el cliente elige la app (Google Maps,
// Apple Maps o Waze). Primero vale lo que cargo el Admin en
// /admin/restaurante (llega en la config publica); lo que falte sale de las
// variables de entorno (NEXT_PUBLIC_CLIENTE_DIRECCION, _MAPS_URL,
// _MAPS_APPLE_URL, _WAZE_URL). Cada link puede venir cargado o armarse con
// la direccion. Sin direccion ni links no hay opciones y el boton no se ve.

export type AppMapa = "google" | "apple" | "waze";

export interface OpcionMapa {
  app: AppMapa;
  nombre: string;
  href: string;
}

const enc = encodeURIComponent;

export function direccionMapa(u?: UbicacionPublica | null) {
  return (u?.direccion || DIRECCION_CLIENTE).trim();
}

export function opcionesMapa(u?: UbicacionPublica | null): OpcionMapa[] {
  const dir = direccionMapa(u);
  const google = u?.googleMapsUrl || MAPS_CLIENTE || (dir ? `https://www.google.com/maps/search/?api=1&query=${enc(`${NOMBRE_PUBLICO}, ${dir}`)}` : "");
  const apple = u?.appleMapsUrl || MAPS_APPLE_CLIENTE || (dir ? `https://maps.apple.com/?q=${enc(NOMBRE_PUBLICO)}&address=${enc(dir)}` : "");
  const waze = u?.wazeUrl || WAZE_CLIENTE || (dir ? `https://waze.com/ul?q=${enc(dir)}&navigate=yes` : "");
  const todas: OpcionMapa[] = [
    { app: "google", nombre: "Google Maps", href: google },
    { app: "apple", nombre: "Apple Maps", href: apple },
    { app: "waze", nombre: "Waze", href: waze },
  ];
  return todas.filter((o) => o.href);
}
