"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ApiError, abrirFechaWeb, cerrarFechasWeb } from "@/lib/api";
import type { FechaCerradaWeb, Turno } from "@/lib/types";
import { useConfirm } from "./ConfirmProvider";

// Cerrar las reservas web de un dia (o de un turno) desde el panel: boton al
// lado de "Reducir salón" / "Cerrar turno" y la franja que avisa que el link
// no toma reservas. Lo cambia solo Admin; el resto del equipo ve la franja.
// Ver FechasBloqueadasBotController y app/admin/fechas-web (la lista).

export const MENSAJE_WEB_DEFAULT = "Ese día tomamos las reservas por WhatsApp. ¡Escribinos!";
// Con articulo: "el almuerzo", "la merienda", "la cena".
const EL_TURNO: Record<Turno, string> = { almuerzo: "el almuerzo", merienda: "la merienda", cena: "la cena" };
const SEM = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

export function fechaLarga(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return `${SEM[dt.getDay()]} ${d}/${m}`;
}

// ¿Esta fecha cerrada aplica a este turno?
export const cierraTurno = (c: FechaCerradaWeb | null | undefined, turno: Turno) => !!c && (c.turno === null || c.turno === turno);

export function IconoCandado({ size = 14 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

/** Modal para cerrar (o editar) las reservas web de una fecha. */
export function ModalCierreWeb({
  fecha,
  turno,
  tituloTurno,
  cierre,
  onCerrar,
  onGuardado,
}: {
  fecha: string;
  turno: Turno;
  tituloTurno: string;
  cierre: FechaCerradaWeb | null;
  onCerrar: () => void;
  onGuardado: () => void;
}) {
  const [soloTurno, setSoloTurno] = useState(cierre ? cierre.turno !== null : false);
  const [motivo, setMotivo] = useState(cierre?.motivo ?? "");
  const [mensaje, setMensaje] = useState(cierre?.mensajeCliente ?? MENSAJE_WEB_DEFAULT);
  const [incluyeBot, setIncluyeBot] = useState(cierre?.incluyeBot ?? true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const primero = useRef<HTMLInputElement>(null);

  useEffect(() => {
    primero.current?.focus();
    const alTeclear = (e: KeyboardEvent) => e.key === "Escape" && onCerrar();
    document.addEventListener("keydown", alTeclear);
    return () => document.removeEventListener("keydown", alTeclear);
  }, [onCerrar]);

  async function guardar() {
    setGuardando(true);
    setError(null);
    // Una fecha guarda un solo cierre: si ya estaba cerrado OTRO turno y
    // ahora se cierra este, pasa a cerrarse todo el dia.
    const otroTurnoCerrado = !!cierre && cierre.turno !== null && cierre.turno !== turno;
    const turnoFinal = soloTurno && !otroTurnoCerrado ? turno : null;
    try {
      await cerrarFechasWeb({
        desde: fecha,
        turno: turnoFinal,
        motivo: motivo.trim() || null,
        mensajeCliente: mensaje.trim() || null,
        incluyeBot,
      });
      onGuardado();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo guardar");
    } finally {
      setGuardando(false);
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-tinta/40 p-4 backdrop-blur-sm"
      onMouseDown={(e) => e.target === e.currentTarget && onCerrar()}
    >
      <div role="dialog" aria-modal="true" aria-labelledby="cierre-web-t" className="grid w-full max-w-md gap-4 rounded-2xl border border-borde bg-superficie p-5 text-left text-tinta shadow-lg">
        <h2 id="cierre-web-t" className="m-0 text-base font-bold">
          {cierre ? "Reservas web cerradas" : "Cerrar las reservas web"} del {fechaLarga(fecha)}
        </h2>

        <div className="grid gap-1.5">
          <span className="text-[11px] font-semibold tracking-wider text-tinta-suave uppercase">Qué se cierra</span>
          <div className="flex flex-wrap gap-1.5">
            {[
              [false, "Todo el día"],
              [true, `Solo ${tituloTurno.toLowerCase()}`],
            ].map(([valor, texto]) => (
              <button
                key={String(valor)}
                type="button"
                aria-pressed={soloTurno === valor}
                onClick={() => setSoloTurno(valor as boolean)}
                className={`rounded-full border px-3 py-1.5 text-sm ${soloTurno === valor ? "border-transparent bg-marca font-semibold text-white" : "border-borde hover:bg-arena-suave"}`}
              >
                {texto as string}
              </button>
            ))}
          </div>
        </div>

        <label className="grid gap-1.5">
          <span className="text-[11px] font-semibold tracking-wider text-tinta-suave uppercase">Motivo</span>
          <input
            ref={primero}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            maxLength={60}
            placeholder="Ej. Nochebuena"
            className="rounded-lg border border-borde bg-fondo px-3 py-2 text-sm"
          />
          <small className="text-xs text-tinta-suave">Lo ve el equipo, y el cliente como título del aviso.</small>
        </label>

        <label className="grid gap-1.5">
          <span className="text-[11px] font-semibold tracking-wider text-tinta-suave uppercase">Mensaje para el cliente</span>
          <textarea
            value={mensaje}
            onChange={(e) => setMensaje(e.target.value)}
            maxLength={300}
            rows={3}
            className="resize-y rounded-lg border border-borde bg-fondo px-3 py-2 text-sm"
          />
          <small className="text-xs text-tinta-suave">Se muestra en el link junto al botón «Reservar por WhatsApp».</small>
        </label>

        <label className="flex items-start gap-2.5 text-sm">
          <input type="checkbox" checked={incluyeBot} onChange={(e) => setIncluyeBot(e.target.checked)} className="mt-0.5 h-4 w-4 accent-asistio" />
          <span>
            También el bot de WhatsApp
            <small className="block text-xs text-tinta-suave">Que el bot tampoco reserve solo: deriva a una persona.</small>
          </span>
        </label>

        {error && <div className="rounded-lg bg-ocupada-suave px-3 py-2 text-sm text-ocupada">{error}</div>}

        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" onClick={onCerrar} className="rounded-lg px-3 py-1.5 text-sm text-tinta-suave hover:bg-arena-suave">
            Cancelar
          </button>
          <button type="button" onClick={guardar} disabled={guardando} className="rounded-lg bg-marca px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50">
            {guardando ? "Guardando…" : cierre ? "Guardar" : "Cerrar reservas web"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** Boton del encabezado del turno (solo Admin). */
export function BotonCierreWeb({
  fecha,
  turno,
  tituloTurno,
  cierre,
  onCambio,
}: {
  fecha: string;
  turno: Turno;
  tituloTurno: string;
  cierre: FechaCerradaWeb | null;
  onCambio: () => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const cerrada = cierraTurno(cierre, turno);
  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        title={cerrada ? "El link no toma reservas en este turno: tocá para editar" : "Cerrar las reservas por el link para este día o turno"}
        className={
          cerrada
            ? "inline-flex items-center gap-1.5 rounded-lg bg-aviso-suave px-2.5 py-1 text-xs font-semibold text-aviso"
            : "inline-flex items-center gap-1.5 rounded-lg border border-borde px-2.5 py-1 text-xs text-tinta-suave hover:border-arena hover:text-tinta"
        }
      >
        {cerrada ? <IconoCandado size={13} /> : <i className="h-2 w-2 rounded-full bg-asistio" aria-hidden="true" />}
        {cerrada ? "Reservas web cerradas" : "Reservas web abiertas"}
      </button>
      {abierto && (
        <ModalCierreWeb
          fecha={fecha}
          turno={turno}
          tituloTurno={tituloTurno}
          cierre={cierre}
          onCerrar={() => setAbierto(false)}
          onGuardado={() => {
            setAbierto(false);
            onCambio();
          }}
        />
      )}
    </>
  );
}

/** Franja del turno cuando el link no toma reservas. */
export function FranjaCierreWeb({
  turno,
  cierre,
  admin,
  onCambio,
}: {
  turno: Turno;
  cierre: FechaCerradaWeb | null;
  admin: boolean;
  onCambio: () => void;
}) {
  const { confirmar } = useConfirm();
  const [abriendo, setAbriendo] = useState(false);
  if (!cierre || !cierraTurno(cierre, turno)) return null;

  async function abrir() {
    if (!cierre) return;
    const todoElDia = cierre.turno === null;
    const ok = await confirmar(
      todoElDia
        ? "¿Volver a abrir las reservas web de todo el día? El link vuelve a tomar reservas en todos los turnos."
        : `¿Volver a abrir las reservas web en ${EL_TURNO[turno]}?`,
      { textoConfirmar: "Abrir de nuevo" },
    );
    if (!ok) return;
    setAbriendo(true);
    try {
      await abrirFechaWeb(cierre.id);
      onCambio();
    } finally {
      setAbriendo(false);
    }
  }

  return (
    <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg bg-aviso-suave px-3 py-2 text-xs text-aviso">
      <IconoCandado />
      <span className="min-w-0 flex-1">
        <b className="text-tinta">El link no toma reservas {cierre.turno === null ? "este día" : `en ${EL_TURNO[turno]}`}</b>
        {cierre.motivo ? ` · ${cierre.motivo}` : ""}. Los clientes ven el botón para reservar por WhatsApp
        {cierre.incluyeBot ? " (y el bot tampoco reserva solo)" : ""}. Ustedes pueden seguir cargando reservas acá.
      </span>
      {admin && (
        <button
          type="button"
          onClick={abrir}
          disabled={abriendo}
          className="rounded-lg border border-current/30 bg-superficie px-2.5 py-1 font-semibold text-tinta hover:bg-arena-suave disabled:opacity-50"
        >
          Abrir de nuevo
        </button>
      )}
    </div>
  );
}
