"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ApiError, moverReserva } from "@/lib/api";
import type { Reserva } from "@/lib/types";
import { linkWhatsAppCambio, numeroWhatsApp } from "@/lib/whatsapp";
import { IconoWhatsApp, filaConDatos } from "./BorrarReserva";

// Cuanto queda el aviso con "Deshacer" despues de mover.
const AVISO_MS = 9000;
// Cerca del borde de la ventana, la pagina se desplaza sola mientras se
// arrastra (para llegar a filas que no se ven).
const BORDE_AUTOSCROLL = 70;

export interface Arrastre {
  origenId: number | null;
  destinoId: number | null;
  empezar: (e: React.PointerEvent<HTMLElement>, reserva: Reserva) => void;
}

type Aviso = { texto: string; deshacer?: { de: number; a: number }; whatsapp?: string };

/**
 * Arrastrar una reserva a otra fila vacia del mismo turno, para cambiarle el
 * horario sin volver a cargar los datos (ver ReservasController.Mover). Se
 * toma de la manija de la fila (AsaArrastre) y se suelta sobre una fila
 * vacia, que se marca en verde mientras se arrastra. Hecho con pointer
 * events (no con el drag & drop nativo) para que funcione igual con mouse,
 * en tablet y en celular.
 */
export function useArrastreReservas(reservas: Reserva[]) {
  const [origenId, setOrigenId] = useState<number | null>(null);
  const [destinoId, setDestinoId] = useState<number | null>(null);
  const [aviso, setAviso] = useState<Aviso | null>(null);
  // Donde arranca el cartelito que sigue al dedo/mouse (despues se mueve
  // directo sobre el DOM, sin re-render en cada movimiento).
  const [inicio, setInicio] = useState({ x: 0, y: 0 });
  const fantasma = useRef<HTMLDivElement>(null);
  const destinoRef = useRef<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const reservasRef = useRef(reservas);

  useEffect(() => {
    reservasRef.current = reservas;
  }, [reservas]);

  useEffect(() => () => clearTimeout(timer.current), []);

  const mostrarAviso = useCallback((a: Aviso) => {
    clearTimeout(timer.current);
    setAviso(a);
    timer.current = setTimeout(() => setAviso(null), AVISO_MS);
  }, []);

  const mover = useCallback(
    async (de: number, a: number, esDeshacer = false) => {
      const origen = reservasRef.current.find((r) => r.id === de);
      const destino = reservasRef.current.find((r) => r.id === a);
      try {
        await moverReserva(de, a);
        if (esDeshacer || !origen || !destino) {
          setAviso(null);
          return;
        }
        const numero = numeroWhatsApp(origen.habTel);
        mostrarAviso({
          texto: `${origen.nombre?.trim() || "La reserva"} pasó a las ${destino.hora ?? "—"}`,
          deshacer: { de: a, a: de },
          whatsapp: numero ? linkWhatsAppCambio(numero, origen.nombre, destino.fecha, destino.hora) : undefined,
        });
      } catch (e) {
        mostrarAviso({ texto: e instanceof ApiError ? `No se pudo mover: ${e.message}` : "No se pudo mover la reserva" });
      }
    },
    [mostrarAviso],
  );

  const empezar = useCallback(
    (e: React.PointerEvent<HTMLElement>, reserva: Reserva) => {
      if (e.button !== 0) return;
      e.preventDefault();
      const tabla = e.currentTarget.closest("table");
      if (!tabla) return;
      setOrigenId(reserva.id);
      setInicio({ x: e.clientX, y: e.clientY });
      destinoRef.current = null;
      const posicionar = (x: number, y: number) => {
        if (fantasma.current) fantasma.current.style.transform = `translate(${x + 14}px, ${y + 10}px)`;
      };

      const alMover = (ev: PointerEvent) => {
        posicionar(ev.clientX, ev.clientY);
        if (ev.clientY < BORDE_AUTOSCROLL) window.scrollBy(0, -14);
        else if (ev.clientY > window.innerHeight - BORDE_AUTOSCROLL) window.scrollBy(0, 14);
        const fila = document.elementFromPoint(ev.clientX, ev.clientY)?.closest<HTMLElement>("tr[data-reserva-id]");
        let id: number | null = null;
        if (fila && tabla.contains(fila)) {
          const candidata = reservasRef.current.find((r) => r.id === Number(fila.dataset.reservaId));
          if (candidata && candidata.id !== reserva.id && !filaConDatos(candidata)) id = candidata.id;
        }
        if (id !== destinoRef.current) {
          destinoRef.current = id;
          setDestinoId(id);
        }
      };
      const terminar = (soltar: boolean) => {
        window.removeEventListener("pointermove", alMover);
        window.removeEventListener("pointerup", alSoltar);
        window.removeEventListener("pointercancel", alCancelar);
        window.removeEventListener("keydown", alTeclear);
        document.body.style.removeProperty("user-select");
        const destino = destinoRef.current;
        destinoRef.current = null;
        setOrigenId(null);
        setDestinoId(null);
        if (soltar && destino !== null) void mover(reserva.id, destino);
      };
      const alSoltar = () => terminar(true);
      const alCancelar = () => terminar(false);
      const alTeclear = (ev: KeyboardEvent) => ev.key === "Escape" && terminar(false);
      document.body.style.userSelect = "none";
      window.addEventListener("pointermove", alMover);
      window.addEventListener("pointerup", alSoltar);
      window.addEventListener("pointercancel", alCancelar);
      window.addEventListener("keydown", alTeclear);
    },
    [mover],
  );

  const arrastrada = origenId !== null ? reservas.find((r) => r.id === origenId) : null;
  const destino = destinoId !== null ? reservas.find((r) => r.id === destinoId) : null;

  const capas = !(arrastrada || aviso)
    ? null
    : createPortal(
          <>
            {arrastrada && (
              <div
                ref={fantasma}
                aria-hidden="true"
                style={{ transform: `translate(${inicio.x + 14}px, ${inicio.y + 10}px)` }}
                className="pointer-events-none fixed top-0 left-0 z-[120] rounded-lg border border-borde bg-superficie px-3 py-1.5 text-sm text-tinta shadow-lg"
              >
                <b>{arrastrada.nombre?.trim() || "Reserva"}</b>
                {arrastrada.pax != null && <span className="text-tinta-suave"> · {arrastrada.pax} pax</span>}
                <span className={`ml-2 text-xs ${destino ? "text-asistio" : "text-tinta-suave"}`}>
                  {destino ? `→ ${destino.hora ?? "—"}` : "Soltala en una fila vacía"}
                </span>
              </div>
            )}
            {aviso && (
              <div
                role="status"
                className="fixed bottom-6 left-1/2 z-[110] flex -translate-x-1/2 items-center gap-3 rounded-xl bg-tinta py-2.5 pr-2.5 pl-4 text-sm text-fondo shadow-lg"
              >
                <span>{aviso.texto}</span>
                {aviso.whatsapp && (
                  <a
                    href={aviso.whatsapp}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[#1fa855] px-2.5 py-1 font-semibold text-white hover:brightness-95"
                  >
                    <IconoWhatsApp />
                    Avisar
                  </a>
                )}
                {aviso.deshacer && (
                  <button
                    type="button"
                    onClick={() => aviso.deshacer && void mover(aviso.deshacer.de, aviso.deshacer.a, true)}
                    className="rounded-md px-2 py-1 font-bold text-[#6fd3bf] hover:bg-white/10 [[data-theme=dark]_&]:text-[#1d7a69] [[data-theme=dark]_&]:hover:bg-black/10"
                  >
                    Deshacer
                  </button>
                )}
              </div>
            )}
          </>,
          document.body,
        );

  const arrastre: Arrastre = { origenId, destinoId, empezar };
  return { arrastre, capas };
}

// Manija de la fila (seis puntitos). Solo en filas con datos.
export function AsaArrastre({ reserva, arrastre }: { reserva: Reserva; arrastre?: Arrastre }) {
  if (!arrastre || !filaConDatos(reserva)) return null;
  return (
    <span
      role="button"
      tabIndex={-1}
      aria-label={`Arrastrar la reserva de ${reserva.nombre?.trim() || "esta fila"} a otra fila`}
      title="Arrastrá para mover la reserva a otra fila vacía (otro horario)"
      onPointerDown={(e) => arrastre.empezar(e, reserva)}
      className="grid h-7 w-5 cursor-grab touch-none place-items-center rounded text-tinta-suave opacity-60 select-none hover:bg-arena-suave hover:opacity-100 active:cursor-grabbing"
    >
      <svg viewBox="0 0 24 24" width={14} height={14} fill="currentColor" aria-hidden="true">
        <circle cx="9" cy="6" r="1.6" />
        <circle cx="15" cy="6" r="1.6" />
        <circle cx="9" cy="12" r="1.6" />
        <circle cx="15" cy="12" r="1.6" />
        <circle cx="9" cy="18" r="1.6" />
        <circle cx="15" cy="18" r="1.6" />
      </svg>
    </span>
  );
}
