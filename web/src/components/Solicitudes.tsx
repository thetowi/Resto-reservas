"use client";

import { useEffect, useRef, useState } from "react";
import { ApiError, confirmarReservaWeb, getChequeoSolicitud, rechazarReservaWeb } from "@/lib/api";
import type { ChequeoSolicitud, ReservaWeb, Turno } from "@/lib/types";
import { MOTIVOS_RECHAZO, fechaCorta, linkWhatsApp, linkWhatsAppTexto, mensajeAprobada, mensajeRechazo, numeroWhatsApp } from "@/lib/whatsapp";
import { IconoWhatsApp } from "@/components/BorrarReserva";

// Solicitudes del link (mockup capax-solicitudes-grupo): grupos de 6 o más y
// los salones que no confirman solos. No están en la grilla: se aprueban
// (recién ahí entran, con las mesas que se elijan) o se rechazan desde acá,
// con el mensaje de WhatsApp para el cliente ya armado.

const NOMBRE_TURNO: Record<Turno, string> = { almuerzo: "Almuerzo", merienda: "Merienda", cena: "Cena" };

function hace(iso: string) {
  const min = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60_000));
  if (min < 1) return "recién";
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24);
  return `hace ${d} ${d === 1 ? "día" : "días"}`;
}

function codigos(ch: ChequeoSolicitud, ids: number[]) {
  return ids.map((id) => ch.libres.find((m) => m.id === id)?.codigo).filter(Boolean) as string[];
}

// Texto del chequeo de lugar (ocupación por turno, como la grilla).
export function textoChequeo(ch: ChequeoSolicitud, r: ReservaWeb) {
  const sug = codigos(ch, ch.sugeridas);
  const sugerencia = sug.length === 0 ? "" : sug.length === 1 ? ` Sugerencia: mesa ${sug[0]}.` : ` Sugerencia: juntar ${sug.join(" + ")}.`;
  const horaLlena = ch.reservasALaHora >= ch.cupoHora ? ` A las ${r.hora} ya hay ${ch.reservasALaHora} reservas.` : "";
  if (ch.estado === "cerrado") return "Ese turno está cerrado en la grilla.";
  if (ch.estado === "sin_lugar") return `No entra: en ese turno quedan ${ch.lugaresLibres} lugares libres.${horaLlena}`;
  const base = `${ch.mesasLibres} mesas libres en ese turno (suman ${ch.lugaresLibres} lugares).`;
  return ch.estado === "justo" ? `Justo: quedan ${base}${horaLlena}${sugerencia}` : `Hay lugar: ${base}${sugerencia}`;
}

const CLASE_CHEQUEO: Record<ChequeoSolicitud["estado"], string> = {
  ok: "bg-asistio-suave text-[#1d7a69] [[data-theme=dark]_&]:text-[#6fd3bf]",
  justo: "bg-aviso-suave text-aviso",
  sin_lugar: "bg-ocupada-suave text-ocupada [[data-theme=dark]_&]:bg-[#3a1418] [[data-theme=dark]_&]:text-[#ff8a8a]",
  cerrado: "bg-ocupada-suave text-ocupada [[data-theme=dark]_&]:bg-[#3a1418] [[data-theme=dark]_&]:text-[#ff8a8a]",
};

function Chequeo({ ch, r }: { ch: ChequeoSolicitud | null | "error"; r: ReservaWeb }) {
  if (ch === null) return <div className="text-[12.5px] text-tinta-suave">Viendo si hay lugar…</div>;
  if (ch === "error") return <div className="text-[12.5px] text-tinta-suave">No se pudo ver el lugar ahora.</div>;
  return (
    <div className={`flex w-fit max-w-full items-start gap-2 rounded-[10px] px-2.5 py-1.5 text-[12.5px] ${CLASE_CHEQUEO[ch.estado]}`}>
      <span aria-hidden="true">{ch.estado === "ok" ? "✓" : "!"}</span>
      <span>{textoChequeo(ch, r)}</span>
    </div>
  );
}

function useChequeo(id: number, clave: unknown) {
  const [ch, setCh] = useState<ChequeoSolicitud | null | "error">(null);
  useEffect(() => {
    let vigente = true;
    getChequeoSolicitud(id)
      .then((c) => vigente && setCh(c))
      .catch(() => vigente && setCh("error"));
    return () => {
      vigente = false;
    };
  }, [id, clave]);
  return ch;
}

const chip = "rounded-full border border-borde bg-superficie px-2.5 py-0.5 text-[12.5px]";

export function TarjetaSolicitud({
  r,
  resaltada,
  actualizacion,
  onAprobar,
  onRechazar,
}: {
  r: ReservaWeb;
  resaltada: boolean;
  actualizacion: number;
  onAprobar: () => void;
  onRechazar: () => void;
}) {
  const ch = useChequeo(r.id, actualizacion);
  const ref = useRef<HTMLElement>(null);
  const numero = numeroWhatsApp(r.telefono);

  useEffect(() => {
    if (resaltada) ref.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [resaltada]);

  return (
    <article
      ref={ref}
      className={`grid grid-cols-[70px_minmax(0,1fr)] items-center gap-4 rounded-2xl border bg-superficie px-4 py-3.5 md:grid-cols-[70px_minmax(0,1fr)_auto] ${
        resaltada ? "border-arena ring-2 ring-arena/40" : "border-borde"
      }`}
    >
      <div className="grid justify-items-center rounded-xl bg-aviso-suave py-2 text-aviso">
        <b className="text-[26px] leading-none">{r.pax}</b>
        <small className="text-[11px] font-bold tracking-[0.06em] uppercase">pax</small>
      </div>
      <div className="grid min-w-0 gap-1.5">
        <div className="flex flex-wrap items-baseline gap-x-2.5">
          <b className="text-base">{r.nombre}</b>
          <span className="text-xs text-tinta-suave tabular-nums">{r.codigo}</span>
          <span className="ml-auto text-xs text-tinta-suave">entró {hace(r.creadaEn)}</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <span className={`${chip} capitalize`}>{fechaCorta(r.fecha)}</span>
          <span className={chip}>
            {NOMBRE_TURNO[r.turno]} {r.hora}
          </span>
          <span className={chip}>{r.salon}</span>
          <span className={`${chip} tabular-nums`}>{r.telefono}</span>
          {r.habitacion && <span className={chip}>Hab {r.habitacion}</span>}
        </div>
        {r.pedido && <p className="m-0 text-[13px] text-tinta-suave italic">“{r.pedido}”</p>}
        <Chequeo ch={ch} r={r} />
      </div>
      <div className="col-span-2 flex items-center gap-2 md:col-span-1">
        <button type="button" onClick={onAprobar} className="h-[38px] rounded-[11px] bg-asistio px-3.5 text-[13.5px] font-bold text-[#04221c] hover:brightness-95">
          ✓ Aprobar
        </button>
        <button
          type="button"
          onClick={onRechazar}
          className="h-[38px] rounded-[11px] border border-ocupada/30 bg-ocupada-suave px-3.5 text-[13.5px] font-bold text-ocupada [[data-theme=dark]_&]:border-[#4a2024] [[data-theme=dark]_&]:bg-[#3a1418] [[data-theme=dark]_&]:text-[#ff8a8a]"
        >
          ✕ Rechazar
        </button>
        {numero && (
          <a
            href={linkWhatsApp(numero, r.nombre, r.fecha, r.hora)}
            target="_blank"
            rel="noreferrer"
            title="Escribirle por WhatsApp"
            aria-label={`Escribirle a ${r.nombre} por WhatsApp`}
            className="grid h-[38px] w-[38px] place-items-center rounded-[11px] border border-borde text-[#1fa855] hover:bg-arena-suave"
          >
            <IconoWhatsApp />
          </a>
        )}
      </div>
    </article>
  );
}

// ---------- ventanas

function Ventana({ titulo, sub, onCerrar, children }: { titulo: string; sub: string; onCerrar: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onCerrar();
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [onCerrar]);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/55 p-4" onMouseDown={(e) => e.target === e.currentTarget && onCerrar()}>
      <div role="dialog" aria-modal="true" aria-labelledby="sol-t" className="grid w-full max-w-[560px] gap-3.5 rounded-[20px] border border-borde bg-superficie p-5 text-tinta shadow-2xl">
        <div>
          <h2 id="sol-t" className="m-0 text-lg font-bold">
            {titulo}
          </h2>
          <p className="m-0 mt-0.5 text-[13px] text-tinta-suave">{sub}</p>
        </div>
        {children}
      </div>
    </div>
  );
}

const etiqueta = "text-[11px] font-bold tracking-[0.1em] text-tinta-suave uppercase";
const areaMensaje =
  "min-h-[96px] w-full resize-y rounded-[14px_14px_14px_4px] border border-[#9fd8c9] bg-[#eefaf6] px-3 py-2.5 text-[13.5px] leading-normal text-tinta [[data-theme=dark]_&]:border-[#1d4a3c] [[data-theme=dark]_&]:bg-[#0f2a22] [[data-theme=dark]_&]:text-[#d9efe8]";
const botonSec = "h-10 rounded-[11px] border border-borde px-3.5 text-[13.5px] font-bold hover:bg-arena-suave disabled:opacity-50";

const subtitulo = (r: ReservaWeb) => `${r.pax} pax · ${fechaCorta(r.fecha)} · ${NOMBRE_TURNO[r.turno]} ${r.hora} · ${r.salon}`;
const datosMensaje = (r: ReservaWeb) => ({ nombre: r.nombre, pax: r.pax, fecha: r.fecha, hora: r.hora, salon: r.salon, codigo: r.codigo });

// Abre la pestaña de WhatsApp en el mismo click (si se abre después de la
// respuesta del servidor, el navegador la bloquea) y le pone el link al
// terminar; si algo falla, la cierra.
async function conWhatsApp(numero: string | null, texto: string, accion: () => Promise<void>) {
  const pestana = numero ? window.open("about:blank", "_blank") : null;
  try {
    await accion();
    if (pestana && numero) pestana.location.href = linkWhatsAppTexto(numero, texto);
  } catch (e) {
    pestana?.close();
    throw e;
  }
}

export function DialogoAprobar({ r, onCerrar, onHecho }: { r: ReservaWeb; onCerrar: () => void; onHecho: (nueva: ReservaWeb) => void }) {
  const ch = useChequeo(r.id, 0);
  const [elegidas, setElegidas] = useState<number[] | null>(null);
  const [mensaje, setMensaje] = useState(() => mensajeAprobada(datosMensaje(r)));
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const numero = numeroWhatsApp(r.telefono);
  const chequeo = ch && ch !== "error" ? ch : null;
  // Arranca con las sugeridas; después manda lo que se toque.
  const seleccion = elegidas ?? chequeo?.sugeridas ?? [];
  const suma = chequeo ? chequeo.libres.filter((m) => seleccion.includes(m.id)).reduce((a, m) => a + m.capacidad, 0) : 0;

  async function aprobar(escribir: boolean) {
    setEnviando(true);
    setError(null);
    try {
      await conWhatsApp(escribir ? numero : null, mensaje, async () => onHecho(await confirmarReservaWeb(r.id, seleccion)));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo aprobar");
      setEnviando(false);
    }
  }

  return (
    <Ventana titulo={`Aprobar la reserva de ${r.nombre}`} sub={subtitulo(r)} onCerrar={onCerrar}>
      <Chequeo ch={ch} r={r} />
      {chequeo && chequeo.libres.length > 0 && (
        <div className="grid gap-2">
          <span className={etiqueta}>
            Mesas <small className="ml-1.5 font-medium tracking-normal normal-case">opcional, se pueden asignar después en la grilla</small>
          </span>
          <div className="flex max-h-[148px] flex-wrap gap-1.5 overflow-y-auto">
            {chequeo.libres.map((m) => {
              const on = seleccion.includes(m.id);
              return (
                <button
                  key={m.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setElegidas(on ? seleccion.filter((x) => x !== m.id) : [...seleccion, m.id])}
                  className={`grid h-11 w-[52px] place-items-center rounded-[10px] border text-[13px] leading-tight font-bold ${
                    on ? "border-arena bg-marca text-white" : "border-borde bg-arena-suave/60 hover:bg-arena-suave"
                  }`}
                >
                  {m.codigo}
                  <small className={`text-[10px] font-semibold ${on ? "text-white/75" : "text-tinta-suave"}`}>{m.capacidad}p</small>
                </button>
              );
            })}
          </div>
          {seleccion.length > 0 && (
            <small className={`text-[12.5px] ${suma >= r.pax ? "text-[#1d7a69] [[data-theme=dark]_&]:text-[#6fd3bf]" : "text-aviso"}`}>
              {codigos(chequeo, seleccion).join(" + ")} = {suma} lugares para {r.pax} personas{suma < r.pax ? " (no alcanza)" : ""}
            </small>
          )}
        </div>
      )}
      <label className="grid gap-2">
        <span className={etiqueta}>Mensaje para el cliente</span>
        <textarea className={areaMensaje} value={mensaje} onChange={(e) => setMensaje(e.target.value)} />
      </label>
      {error && <div className="rounded-lg bg-ocupada-suave px-3 py-2 text-sm text-ocupada [[data-theme=dark]_&]:bg-[#3a1418] [[data-theme=dark]_&]:text-[#ff8a8a]">{error}</div>}
      <div className="flex flex-wrap justify-end gap-2 pt-1">
        <button type="button" onClick={onCerrar} className={`${botonSec} mr-auto`}>
          Volver
        </button>
        <button type="button" disabled={enviando} onClick={() => aprobar(false)} className={botonSec}>
          Aprobar sin escribirle
        </button>
        <button
          type="button"
          disabled={enviando || !numero}
          title={numero ? undefined : "El teléfono no parece un WhatsApp"}
          onClick={() => aprobar(true)}
          className="inline-flex h-10 items-center gap-2 rounded-[11px] bg-asistio px-4 text-[13.5px] font-bold text-[#04221c] hover:brightness-95 disabled:opacity-50"
        >
          <IconoWhatsApp />
          {enviando ? "Aprobando…" : "Aprobar y escribirle"}
        </button>
      </div>
    </Ventana>
  );
}

export function DialogoRechazar({ r, onCerrar, onHecho }: { r: ReservaWeb; onCerrar: () => void; onHecho: (nueva: ReservaWeb) => void }) {
  const [motivo, setMotivo] = useState<string>("Esa hora está completa");
  const [propuesta, setPropuesta] = useState("");
  const [editado, setEditado] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const numero = numeroWhatsApp(r.telefono);
  // El mensaje se arma solo con el motivo y la propuesta, hasta que se
  // escribe a mano.
  const mensaje = editado ?? mensajeRechazo(datosMensaje(r), motivo, propuesta);

  async function rechazar(escribir: boolean) {
    setEnviando(true);
    setError(null);
    try {
      await conWhatsApp(escribir ? numero : null, mensaje, async () => onHecho(await rechazarReservaWeb(r.id, motivo)));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo rechazar");
      setEnviando(false);
    }
  }

  return (
    <Ventana titulo={`Rechazar la solicitud de ${r.nombre}`} sub={subtitulo(r)} onCerrar={onCerrar}>
      <div className="grid gap-2">
        <span className={etiqueta}>¿Por qué?</span>
        <div className="flex flex-wrap gap-1.5">
          {MOTIVOS_RECHAZO.map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={motivo === m}
              onClick={() => setMotivo(m)}
              className={`rounded-full border px-3 py-1.5 text-[13px] ${motivo === m ? "border-arena bg-marca text-white" : "border-borde hover:bg-arena-suave"}`}
            >
              {m}
            </button>
          ))}
        </div>
      </div>
      <label className="grid gap-2">
        <span className={etiqueta}>Ofrecer otra opción (opcional)</span>
        <input
          value={propuesta}
          onChange={(e) => setPropuesta(e.target.value)}
          placeholder="Ej. el mismo día a las 20:30, o el sábado a las 21:00"
          className="rounded-lg border border-borde bg-superficie px-3 py-2 text-sm"
        />
      </label>
      <label className="grid gap-2">
        <span className={etiqueta}>
          Mensaje para el cliente
          {editado !== null && (
            <button type="button" onClick={() => setEditado(null)} className="ml-2 font-semibold tracking-normal normal-case underline">
              volver a armarlo
            </button>
          )}
        </span>
        <textarea className={areaMensaje} value={mensaje} onChange={(e) => setEditado(e.target.value)} />
      </label>
      {error && <div className="rounded-lg bg-ocupada-suave px-3 py-2 text-sm text-ocupada [[data-theme=dark]_&]:bg-[#3a1418] [[data-theme=dark]_&]:text-[#ff8a8a]">{error}</div>}
      <div className="flex flex-wrap justify-end gap-2 pt-1">
        <button type="button" onClick={onCerrar} className={`${botonSec} mr-auto`}>
          Volver
        </button>
        <button type="button" disabled={enviando} onClick={() => rechazar(false)} className={botonSec}>
          Rechazar sin escribirle
        </button>
        <button
          type="button"
          disabled={enviando || !numero}
          title={numero ? undefined : "El teléfono no parece un WhatsApp"}
          onClick={() => rechazar(true)}
          className="inline-flex h-10 items-center gap-2 rounded-[11px] bg-[#c0333a] px-4 text-[13.5px] font-bold text-white hover:brightness-95 disabled:opacity-50"
        >
          <IconoWhatsApp />
          {enviando ? "Rechazando…" : "Rechazar y escribirle"}
        </button>
      </div>
    </Ventana>
  );
}
