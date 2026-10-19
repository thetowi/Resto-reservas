import type { MetadataRoute } from "next";
import { NOMBRE_CLIENTE } from "@/lib/marca";

// Para poder instalar capax como app (Agregar a inicio): en el iPhone es la
// condición para recibir los avisos de reservas web (ver lib/push.ts). El
// link público /reservar no lo usa (ver app/reservar/layout.tsx).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `capax · ${NOMBRE_CLIENTE}`,
    short_name: "capax",
    description: `Reservas de ${NOMBRE_CLIENTE}`,
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#0f2a3d",
    theme_color: "#0f2a3d",
    lang: "es",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
