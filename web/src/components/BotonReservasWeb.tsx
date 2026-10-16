"use client";

import { useState } from "react";
import Link from "next/link";
import { textoAvisosWeb } from "@/lib/avisosWeb";
import type { ResumenReservasWeb } from "@/lib/types";

// Boton "Reservas web" del header del panel con el contador tipo
// notificacion (burbuja roja en la esquina): reservas del link nuevas o a
// confirmar, sin contar dos veces la misma (ver ReservaWebService.ResumenAsync
// y lib/avisosWeb.ts). Cuando el numero sube, la burbuja vuelve a "saltar".
export default function BotonReservasWeb({ resumen }: { resumen: ResumenReservasWeb | null }) {
  const n = resumen?.avisos ?? 0;
  const detalle = resumen ? textoAvisosWeb(resumen.nuevas, resumen.aConfirmar) : "";

  // Volver a animar solo cuando sube (ajuste de estado durante el render,
  // el patron que recomienda React para "comparar con el valor anterior").
  const [anterior, setAnterior] = useState(n);
  const [pulso, setPulso] = useState(0);
  if (n !== anterior) {
    if (n > anterior) setPulso((p) => p + 1);
    setAnterior(n);
  }

  return (
    <Link
      href="/reservas-web"
      title={n > 0 ? `Reservas web: ${detalle}` : "Reservas que hicieron los clientes desde el link de reservas"}
      aria-label={n > 0 ? `Reservas web: ${detalle}` : "Reservas web"}
      className="relative inline-flex items-center rounded-lg border border-borde px-3 py-1.5 hover:bg-arena-suave"
    >
      Reservas web
      {n > 0 && (
        <span key={pulso} className="aviso-web" aria-hidden="true">
          {n > 99 ? "99+" : n}
        </span>
      )}
    </Link>
  );
}
