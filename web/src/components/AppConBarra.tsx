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

  useEffect(() => {
    // La sesion vive en localStorage: se mira en el navegador, en cada pantalla.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSesion(haySesion());
  }, [pathname]);

  if (!sesion || SIN_BARRA.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return null;
  return <BarraLateral />;
}
