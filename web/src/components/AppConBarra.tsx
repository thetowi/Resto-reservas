"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { haySesion } from "@/lib/auth";
import BarraLateral from "./BarraLateral";

// Muestra la barra lateral en las pantallas del equipo (con sesion), no en
// el login, el link publico de reservas ni el cambio de contraseña (que
// puede ser obligatorio en el primer ingreso).
const SIN_BARRA = ["/login", "/reservar", "/cambiar-password"];

export default function AppConBarra() {
  const pathname = usePathname();
  const [sesion, setSesion] = useState(false);

  // Tocar un aviso con capax ya abierto (ver public/sw.js): el service worker
  // trae la ventana al frente y le pide que vaya a la pantalla del aviso.
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const alMensaje = (e: MessageEvent) => {
      const datos = e.data as { tipo?: string; url?: string } | null;
      if (datos?.tipo !== "capax:abrir" || !datos.url) return;
      const destino = new URL(datos.url, window.location.origin);
      if (destino.origin === window.location.origin) window.location.assign(destino.href);
    };
    navigator.serviceWorker.addEventListener("message", alMensaje);
    return () => navigator.serviceWorker.removeEventListener("message", alMensaje);
  }, []);

  useEffect(() => {
    // La sesion vive en localStorage: se mira en el navegador, en cada pantalla.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSesion(haySesion());
  }, [pathname]);

  if (!sesion || SIN_BARRA.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return null;
  return <BarraLateral />;
}
