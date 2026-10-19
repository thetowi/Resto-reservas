import { DIRECCION_CLIENTE, MAPS_APPLE_CLIENTE, MAPS_CLIENTE, NOMBRE_PUBLICO, WAZE_CLIENTE } from "./marca";

// "Cómo llegar" del link de reservas: el cliente elige la app (Google Maps,
// Apple Maps o Waze). Cada link sale de su variable de entorno o, si no esta,
// se arma con NEXT_PUBLIC_CLIENTE_DIRECCION. Sin direccion ni links no hay
// opciones y el boton no se muestra.

export type AppMapa = "google" | "apple" | "waze";

export interface OpcionMapa {
  app: AppMapa;
  nombre: string;
  href: string;
}

const enc = encodeURIComponent;

export function opcionesMapa(): OpcionMapa[] {
  const dir = DIRECCION_CLIENTE.trim();
  const google = MAPS_CLIENTE || (dir ? `https://www.google.com/maps/search/?api=1&query=${enc(`${NOMBRE_PUBLICO}, ${dir}`)}` : "");
  const apple = MAPS_APPLE_CLIENTE || (dir ? `https://maps.apple.com/?q=${enc(NOMBRE_PUBLICO)}&address=${enc(dir)}` : "");
  const waze = WAZE_CLIENTE || (dir ? `https://waze.com/ul?q=${enc(dir)}&navigate=yes` : "");
  const todas: OpcionMapa[] = [
    { app: "google", nombre: "Google Maps", href: google },
    { app: "apple", nombre: "Apple Maps", href: apple },
    { app: "waze", nombre: "Waze", href: waze },
  ];
  return todas.filter((o) => o.href);
}
