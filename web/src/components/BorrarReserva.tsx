"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ApiError, restaurarReserva, vaciarReserva } from "@/lib/api";
import type { Reserva } from "@/lib/types";
import { linkWhatsApp, numeroWhatsApp } from "@/lib/whatsapp";

// Cuanto tiempo queda el aviso con "Deshacer" despues de borrar.
const DESHACER_MS = 8000;

// ¿La fila tiene algo cargado? (si esta vacia no hay nada que borrar).
export function filaConDatos(r: Reserva) {
  return !!(r.nombre?.trim() || r.pax != null || r.habTel?.trim() || r.comentarios?.trim() || r.mesaIds.length || r.asistio || r.pidioMesa || r.retirada);
}

function IconoTacho() {
  return (
    <svg viewBox="0 0 24 24" width={15} height={15} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 7h16M10 11v6M14 11v6M5.5 7l1 12a2 2 0 0 0 2 2h7a2 2 0 0 0 2-2l1-12M9 7V4.5A1.5 1.5 0 0 1 10.5 3h3A1.5 1.5 0 0 1 15 4.5V7" />
    </svg>
  );
}

function IconoWhatsApp() {
  return (
    <svg viewBox="0 0 24 24" width={15} height={15} fill="currentColor" aria-hidden="true">
      <path d="M12 2.2a9.7 9.7 0 0 0-8.3 14.7L2.3 21.8l5-1.3A9.7 9.7 0 1 0 12 2.2Zm0 17.7c-1.5 0-3-.4-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8 8 0 1 1 12 19.9Zm4.4-6c-.2-.1-1.4-.7-1.7-.8-.2-.1-.4-.1-.5.1l-.8.9c-.1.2-.3.2-.5.1a6.6 6.6 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.5-.4h-.5a.9.9 0 0 0-.7.3 2.8 2.8 0 0 0-.9 2.1c0 1.2.9 2.4 1 2.6.1.2 1.8 2.8 4.4 3.9 1.6.7 2.3.8 3.1.6.5-.1 1.4-.6 1.6-1.1.2-.6.2-1 .1-1.1l-.5-.3Z" />
    </svg>
  );
}

export { IconoWhatsApp };

/**
 * Tachito de una fila de la grilla: borra la reserva pero deja la fila con
 * su horario de la planilla (ver ReservasController.Vaciar). Pide
 * confirmacion; si la fila tiene un WhatsApp cargado ofrece avisarle al
 * cliente, y despues de borrar muestra unos segundos "Deshacer".
 */
export default function BorrarReserva({ reserva }: { reserva: Reserva }) {
  const [abierto, setAbierto] = useState(false);
  const [aviso, setAviso] = useState<{ texto: string; copia?: Reserva; reservaWebId?: number | null } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const botonBorrar = useRef<HTMLButtonElement>(null);

  useEffect(() => () => clearTimeout(timer.current), []);

  useEffect(() => {
    if (!abierto) return;
    botonBorrar.current?.focus();
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAbierto(false);
    };
    document.addEventListener("keydown", alTeclear);
    return () => document.removeEventListener("keydown", alTeclear);
  }, [abierto]);

  function mostrarAviso(a: NonNullable<typeof aviso>) {
    clearTimeout(timer.current);
    setAviso(a);
    timer.current = setTimeout(() => setAviso(null), DESHACER_MS);
  }

  async function borrar() {
    const copia = { ...reserva, mesaIds: [...reserva.mesaIds] };
    setAbierto(false);
    try {
      const r = await vaciarReserva(reserva.id);
      mostrarAviso({ texto: `Reserva de ${copia.nombre?.trim() || "la fila"} borrada`, copia, reservaWebId: r.reservaWebId });
    } catch (e) {
      mostrarAviso({ texto: e instanceof ApiError ? `No se pudo borrar: ${e.message}` : "No se pudo borrar la reserva" });
    }
  }

  async function deshacer() {
    if (!aviso?.copia) return;
    const { copia, reservaWebId } = aviso;
    clearTimeout(timer.current);
    setAviso(null);
    try {
      await restaurarReserva(copia, reservaWebId ?? null);
    } catch (e) {
      mostrarAviso({ texto: e instanceof ApiError ? `No se pudo deshacer: ${e.message}` : "No se pudo deshacer" });
    }
  }

  const numero = numeroWhatsApp(reserva.habTel);
  const esWeb = reserva.origen === "web";
  const datos = [
    reserva.hora,
    reserva.pax != null ? `${reserva.pax} ${reserva.pax === 1 ? "persona" : "personas"}` : null,
    reserva.mesaCodigos.length ? `Mesa ${reserva.mesaCodigos.join(", ")}` : null,
    reserva.habTel?.trim() || null,
  ].filter(Boolean) as string[];

  return (
    <>
      {filaConDatos(reserva) && (
        <button
          type="button"
          title="Borrar reserva (la fila queda vacía con su horario)"
          aria-label={`Borrar la reserva de ${reserva.nombre?.trim() || "esta fila"}`}
          className="rounded p-0.5 text-tinta-suave opacity-40 hover:bg-ocupada-suave hover:text-ocupada hover:opacity-100 focus-visible:opacity-100"
          onClick={() => setAbierto(true)}
        >
          <IconoTacho />
        </button>
      )}

      {abierto &&
        createPortal(
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-tinta/40 p-4 backdrop-blur-sm"
            onMouseDown={(e) => e.target === e.currentTarget && setAbierto(false)}
          >
            <div role="dialog" aria-modal="true" aria-labelledby={`borrar-${reserva.id}`} className="grid w-full max-w-md gap-3.5 rounded-2xl border border-borde bg-superficie p-5 text-left text-tinta shadow-lg">
              <h2 id={`borrar-${reserva.id}`} className="m-0 text-base font-bold">
                ¿Borrar la reserva de {reserva.nombre?.trim() || "esta fila"}?
              </h2>
              {datos.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {datos.map((d) => (
                    <span key={d} className="rounded-full bg-arena-suave px-2.5 py-0.5 text-xs">
                      {d}
                    </span>
                  ))}
                </div>
              )}
              <p className="m-0 text-sm text-tinta-suave">
                Se borran todos los datos{reserva.mesaIds.length ? " y la mesa queda libre" : ""}. La fila
                {reserva.hora ? ` de las ${reserva.hora}` : ""} queda vacía para cargar otra reserva.
                {esWeb && " Como vino por el link, queda registrada como cancelada en «Reservas por el link»."}
              </p>
              {numero && (
                <div className="grid gap-2 rounded-xl bg-asistio-suave p-3 text-sm">
                  <span>Tiene WhatsApp cargado. Si la cancelás vos, avisale al cliente:</span>
                  <a
                    href={linkWhatsApp(numero, reserva.nombre, reserva.fecha, reserva.hora)}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex w-fit items-center gap-2 rounded-lg bg-[#1fa855] px-3 py-1.5 text-sm font-semibold text-white hover:brightness-95"
                  >
                    <IconoWhatsApp />
                    Avisar por WhatsApp
                  </a>
                </div>
              )}
              <div className="flex flex-wrap justify-end gap-2">
                <button type="button" onClick={() => setAbierto(false)} className="rounded-lg px-3 py-1.5 text-sm text-tinta-suave hover:bg-arena-suave">
                  Cancelar
                </button>
                <button ref={botonBorrar} type="button" onClick={borrar} className="rounded-lg bg-ocupada px-3 py-1.5 text-sm font-semibold text-white hover:brightness-95">
                  Borrar reserva
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}

      {aviso &&
        createPortal(
          <div
            role="status"
            className="fixed bottom-6 left-1/2 z-[110] flex -translate-x-1/2 items-center gap-3 rounded-xl bg-tinta py-2.5 pr-2.5 pl-4 text-sm text-fondo shadow-lg"
          >
            <span>{aviso.texto}</span>
            {aviso.copia && (
              <button type="button" onClick={deshacer} className="rounded-md px-2 py-1 font-bold text-[#6fd3bf] hover:bg-white/10 [[data-theme=dark]_&]:text-[#1d7a69] [[data-theme=dark]_&]:hover:bg-black/10">
                Deshacer
              </button>
            )}
          </div>,
          document.body,
        )}
    </>
  );
}
