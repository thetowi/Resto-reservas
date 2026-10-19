"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { getSolicitudesDelDia } from "@/lib/api";
import type { ReservaWeb, Turno } from "@/lib/types";
import { EVENTO_AVISOS_WEB } from "@/components/BarraLateral";
import { IconoWhatsApp } from "@/components/BorrarReserva";

// Franja arriba del turno en el panel (paso 4 del mockup
// capax-solicitudes-grupo): las solicitudes del link para este día, turno y
// salón todavía no están en la grilla, pero quien mira el turno se entera.
// «Revisar» lleva a la solicitud en Reservas web. Se vuelve a pedir cada
// minuto y cuando el panel avisa que llegó algo (EVENTO_AVISOS_WEB).

const EL_TURNO: Record<Turno, string> = { almuerzo: "este almuerzo", merienda: "esta merienda", cena: "esta cena" };

export default function SolicitudesTurno({ fecha, turno, salonId }: { fecha: string; turno: Turno; salonId: number }) {
  const [delDia, setDelDia] = useState<{ fecha: string; lista: ReservaWeb[] } | null>(null);

  const cargar = useCallback(() => {
    getSolicitudesDelDia(fecha)
      // Si el back todavía no tiene este pedido (o contesta otra cosa), no
      // se muestra nada en vez de romper el panel.
      .then((lista) => setDelDia({ fecha, lista: Array.isArray(lista) ? lista : [] }))
      .catch(() => {});
  }, [fecha]);

  useEffect(() => {
    cargar();
    const intervalo = setInterval(cargar, 60_000);
    window.addEventListener(EVENTO_AVISOS_WEB, cargar);
    return () => {
      clearInterval(intervalo);
      window.removeEventListener(EVENTO_AVISOS_WEB, cargar);
    };
  }, [cargar]);

  const lista = delDia?.fecha === fecha ? delDia.lista.filter((r) => r.turno === turno && r.salonId === salonId) : [];
  if (lista.length === 0) return null;
  const [primera, ...resto] = lista;

  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-aviso/30 bg-aviso-suave px-3.5 py-2.5 text-[13.5px] text-aviso"
    >
      <IconoWhatsApp />
      <span className="min-w-0 flex-1">
        <b className="font-bold">
          {lista.length === 1 ? `1 solicitud para ${EL_TURNO[turno]}` : `${lista.length} solicitudes para ${EL_TURNO[turno]}`}
        </b>{" "}
        sin aprobar: {primera.nombre} · {primera.pax} pax · {primera.hora}
        {resto.length > 0 && ` (y ${resto.length} más)`}. No están en la grilla hasta que se aprueban.
      </span>
      <Link
        href={`/reservas-web?solicitud=${primera.id}`}
        className="rounded-[9px] bg-asistio px-3 py-1.5 text-[12.5px] font-bold text-[#04221c] hover:brightness-95"
      >
        Revisar
      </Link>
    </div>
  );
}
