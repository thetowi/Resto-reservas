"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ApiError, abrirFechaWeb, actualizarFechaCerradaWeb, cerrarFechasWeb, getFechasCerradasWeb } from "@/lib/api";
import { esAdmin, haySesion } from "@/lib/auth";
import { todayISO } from "@/lib/date";
import type { FechaCerradaWeb, Turno } from "@/lib/types";
import { IconoCandado, MENSAJE_WEB_DEFAULT, fechaLarga } from "@/components/CierreWeb";
import { useConfirm } from "@/components/ConfirmProvider";

// Fechas sin reservas web (solo Admin): los dias en que el link no toma
// reservas y le muestra al cliente un mensaje con el boton de WhatsApp —
// Nochebuena, Fin de año, un evento. Se cargan con anticipacion, por rango.
// El mismo cierre se puede hacer desde el panel, en el turno de ese dia
// (components/CierreWeb.tsx). Ver FechasBloqueadasBotController.

type Alcance = "dia" | Turno;
const ALCANCES: { valor: Alcance; texto: string }[] = [
  { valor: "dia", texto: "Todo el día" },
  { valor: "almuerzo", texto: "Solo almuerzo" },
  { valor: "cena", texto: "Solo cena" },
];
const TEXTO_ALCANCE = (t: Turno | null) => (t === null ? "Todo el día" : t === "almuerzo" ? "Solo almuerzo" : t === "cena" ? "Solo cena" : "Solo merienda");

interface Formulario {
  id: number | null; // null = nueva (con rango)
  desde: string;
  hasta: string;
  alcance: Alcance;
  motivo: string;
  mensaje: string;
  incluyeBot: boolean;
}

const vacio = (): Formulario => ({ id: null, desde: todayISO(), hasta: "", alcance: "dia", motivo: "", mensaje: MENSAJE_WEB_DEFAULT, incluyeBot: true });

export default function FechasWebPage() {
  const router = useRouter();
  const { confirmar } = useConfirm();
  const [listo, setListo] = useState(false);
  const [fechas, setFechas] = useState<FechaCerradaWeb[] | null>(null);
  const [form, setForm] = useState<Formulario | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!haySesion()) {
      router.replace("/login");
      return;
    }
    if (!esAdmin()) {
      router.replace("/");
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setListo(true);
  }, [router]);

  const cargar = useCallback(() => {
    getFechasCerradasWeb()
      .then(setFechas)
      .catch((e) => setError(e instanceof ApiError ? e.message : "No se pudieron cargar las fechas"));
  }, []);

  useEffect(() => {
    if (listo) cargar();
  }, [listo, cargar]);

  async function guardar() {
    if (!form) return;
    setGuardando(true);
    setError(null);
    const datos = {
      turno: form.alcance === "dia" ? null : form.alcance,
      motivo: form.motivo.trim() || null,
      mensajeCliente: form.mensaje.trim() || null,
      incluyeBot: form.incluyeBot,
    };
    try {
      if (form.id === null) {
        await cerrarFechasWeb({ desde: form.desde, hasta: form.hasta || null, ...datos });
      } else {
        await actualizarFechaCerradaWeb(form.id, datos);
      }
      setForm(null);
      cargar();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo guardar");
    } finally {
      setGuardando(false);
    }
  }

  async function quitar(f: FechaCerradaWeb) {
    if (!(await confirmar(`¿Volver a abrir las reservas web del ${fechaLarga(f.fecha)}?`, { textoConfirmar: "Abrir de nuevo" }))) return;
    try {
      await abrirFechaWeb(f.id);
      cargar();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo quitar");
    }
  }

  if (!listo) return null;

  const campo = "rounded-lg border border-borde bg-superficie px-3 py-2 text-sm w-full";
  const etiqueta = "text-[11px] font-semibold tracking-wider text-tinta-suave uppercase";

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/" className="text-xs text-tinta-suave underline hover:text-tinta">
            ← Volver a reservas
          </Link>
          <h1 className="mt-1 text-lg font-bold">Fechas sin reservas web</h1>
          <p className="mt-0.5 max-w-[62ch] text-sm text-tinta-suave">
            Los días en que el link no toma reservas: el cliente ve el mensaje y el botón para reservar por WhatsApp. Ustedes siguen cargando reservas a mano
            normalmente.
          </p>
        </div>
        {!form && (
          <button type="button" onClick={() => setForm(vacio())} className="rounded-lg bg-marca px-3.5 py-2 text-sm font-semibold text-white">
            + Agregar fechas
          </button>
        )}
      </div>

      {error && <div className="mb-3 rounded-lg bg-ocupada-suave px-3 py-2 text-sm text-ocupada">{error}</div>}

      <section className="overflow-hidden rounded-2xl border border-borde bg-superficie">
        {form && (
          <div className="grid gap-3.5 border-b border-borde bg-arena-suave/40 p-4">
            {form.id === null ? (
              <div className="grid grid-cols-2 gap-3">
                <label className="grid gap-1.5">
                  <span className={etiqueta}>Desde</span>
                  <input type="date" className={campo} value={form.desde} min={todayISO()} onChange={(e) => setForm({ ...form, desde: e.target.value })} />
                </label>
                <label className="grid gap-1.5">
                  <span className={etiqueta}>Hasta (opcional)</span>
                  <input type="date" className={campo} value={form.hasta} min={form.desde} onChange={(e) => setForm({ ...form, hasta: e.target.value })} />
                </label>
              </div>
            ) : (
              <div className="text-sm font-semibold capitalize">{fechaLarga(form.desde)}</div>
            )}
            <div className="grid gap-1.5">
              <span className={etiqueta}>Qué se cierra</span>
              <div className="flex flex-wrap gap-1.5">
                {ALCANCES.map((a) => (
                  <button
                    key={a.valor}
                    type="button"
                    aria-pressed={form.alcance === a.valor}
                    onClick={() => setForm({ ...form, alcance: a.valor })}
                    className={`rounded-full border px-3 py-1.5 text-sm ${form.alcance === a.valor ? "border-transparent bg-marca font-semibold text-white" : "border-borde bg-superficie hover:bg-arena-suave"}`}
                  >
                    {a.texto}
                  </button>
                ))}
              </div>
            </div>
            <label className="grid gap-1.5">
              <span className={etiqueta}>Motivo</span>
              <input className={campo} value={form.motivo} maxLength={60} placeholder="Ej. Nochebuena" onChange={(e) => setForm({ ...form, motivo: e.target.value })} />
            </label>
            <label className="grid gap-1.5">
              <span className={etiqueta}>Mensaje para el cliente</span>
              <textarea className={`${campo} resize-y`} rows={3} maxLength={300} value={form.mensaje} onChange={(e) => setForm({ ...form, mensaje: e.target.value })} />
            </label>
            <label className="flex items-start gap-2.5 text-sm">
              <input type="checkbox" className="mt-0.5 h-4 w-4 accent-asistio" checked={form.incluyeBot} onChange={(e) => setForm({ ...form, incluyeBot: e.target.checked })} />
              <span>
                También el bot de WhatsApp
                <small className="block text-xs text-tinta-suave">Que el bot tampoco reserve solo esos días: deriva a una persona.</small>
              </span>
            </label>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setForm(null)} className="rounded-lg px-3 py-1.5 text-sm text-tinta-suave hover:bg-arena-suave">
                Cancelar
              </button>
              <button type="button" onClick={guardar} disabled={guardando || !form.desde} className="rounded-lg bg-marca px-3.5 py-1.5 text-sm font-semibold text-white disabled:opacity-50">
                {guardando ? "Guardando…" : "Guardar"}
              </button>
            </div>
          </div>
        )}

        {!fechas ? (
          <div className="px-4 py-6 text-sm text-tinta-suave">Cargando…</div>
        ) : fechas.length === 0 ? (
          <div className="px-4 py-6 text-sm text-tinta-suave">No hay fechas cerradas. El link toma reservas todos los días.</div>
        ) : (
          <ul className="m-0 list-none p-0">
            {fechas.map((f, i) => (
              <li key={f.id} className={`grid grid-cols-[120px_minmax(0,1fr)_auto] items-center gap-4 px-4 py-3 ${i > 0 ? "border-t border-borde" : ""}`}>
                <span>
                  <b className="block text-[15px] capitalize">{fechaLarga(f.fecha)}</b>
                  <span className="text-xs text-tinta-suave">{f.motivo ?? "—"}</span>
                </span>
                <span className="min-w-0">
                  <span className="block text-sm">{f.mensajeCliente ?? MENSAJE_WEB_DEFAULT}</span>
                  <span className="mt-1 flex flex-wrap gap-1.5">
                    <span className="inline-flex items-center gap-1 rounded-full bg-aviso-suave px-2 py-0.5 text-[11px] font-bold text-aviso">
                      <IconoCandado size={11} />
                      {TEXTO_ALCANCE(f.turno)}
                    </span>
                    {f.incluyeBot && <span className="rounded-full bg-arena-suave px-2 py-0.5 text-[11px] font-bold text-tinta-suave">También el bot</span>}
                  </span>
                </span>
                <span className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() =>
                      setForm({
                        id: f.id,
                        desde: f.fecha,
                        hasta: "",
                        alcance: f.turno ?? "dia",
                        motivo: f.motivo ?? "",
                        mensaje: f.mensajeCliente ?? MENSAJE_WEB_DEFAULT,
                        incluyeBot: f.incluyeBot,
                      })
                    }
                    className="rounded-lg border border-borde px-2.5 py-1 text-xs hover:bg-arena-suave"
                  >
                    Editar
                  </button>
                  <button type="button" onClick={() => quitar(f)} className="rounded-lg border border-borde px-2.5 py-1 text-xs hover:bg-arena-suave">
                    Quitar
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
