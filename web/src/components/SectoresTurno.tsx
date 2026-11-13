"use client";

import { useEffect, useRef, useState } from "react";
import { ApiError, setSectoresTurno, type SectorEstado } from "@/lib/api";
import type { Mesa, Reserva, SectorTurno, Turno } from "@/lib/types";

// Modal «Sectores» de un turno (reemplaza a «Reducir salón» en los salones
// que tienen sectores): cada sector queda abierto, cerrado (con un motivo) o
// para un grupo que ocupa todas sus mesas con una sola reserva. Al confirmar,
// el backend achica o agranda la planilla solo (DiaService.AjustarFilasAsync).

const MOTIVOS = ["Poco personal", "Clima", "Mantenimiento", "Evento"];

type Estado = SectorTurno["estado"];

interface Borrador {
  estado: Estado;
  motivo: string | null;
  nombre: string;
  pax: string;
  hora: string;
  habTel: string;
  comentarios: string;
}

interface Props {
  titulo: string;
  fecha: string;
  turno: Turno;
  salonId: number;
  sectores: SectorTurno[];
  mesas: Mesa[];
  reservas: Reserva[];
  mesasWalkIn: number[];
  onCerrar: () => void;
  onAjustarMesas: () => void;
}

export default function SectoresTurnoModal({
  titulo,
  fecha,
  turno,
  salonId,
  sectores,
  mesas,
  reservas,
  mesasWalkIn,
  onCerrar,
  onAjustarMesas,
}: Props) {
  const horas = [...new Set(reservas.map((r) => r.hora).filter((h): h is string => !!h))].sort();
  const [borradores, setBorradores] = useState<Record<number, Borrador>>(() =>
    Object.fromEntries(
      sectores.map((s) => {
        const g = s.reservaId ? reservas.find((r) => r.id === s.reservaId) : undefined;
        return [
          s.sectorId,
          {
            estado: s.estado,
            motivo: s.motivo ?? (s.estado === "cerrado" ? null : MOTIVOS[0]),
            nombre: g?.nombre ?? "",
            pax: g?.pax != null ? String(g.pax) : "",
            hora: g?.hora ?? horas[Math.floor(horas.length / 2)] ?? "",
            habTel: g?.habTel ?? "",
            comentarios: g?.comentarios ?? "",
          },
        ];
      }),
    ),
  );
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const primerBoton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    primerBoton.current?.focus();
    const alTeclear = (e: KeyboardEvent) => e.key === "Escape" && onCerrar();
    document.addEventListener("keydown", alTeclear);
    return () => document.removeEventListener("keydown", alTeclear);
  }, [onCerrar]);

  function cambiar(id: number, cambios: Partial<Borrador>) {
    setBorradores((prev) => ({ ...prev, [id]: { ...prev[id], ...cambios } }));
  }

  // Reservas o walk-ins que ya están en las mesas de un sector (sin contar
  // el grupo de ese mismo sector): no se puede cerrar ni dar a un grupo.
  function ocupadasEn(s: SectorTurno) {
    const propias = new Set(s.mesaIds);
    const conGente = new Set([
      ...reservas.filter((r) => r.id !== s.reservaId && !r.retirada).flatMap((r) => r.mesaIds),
      ...mesasWalkIn,
    ]);
    return mesas.filter((m) => propias.has(m.id) && conGente.has(m.id)).map((m) => m.codigo);
  }

  const problemas = sectores.flatMap((s) => {
    const b = borradores[s.sectorId];
    if (b.estado === "abierto") return [];
    const lista: string[] = [];
    if (s.mesaIds.length === 0) lista.push(`${s.nombre} no tiene mesas: asignáselas en Administrar mesas.`);
    const ocupadas = ocupadasEn(s);
    if (ocupadas.length > 0) {
      lista.push(
        `${s.nombre} tiene reservas o walk-ins en ${ocupadas.length === 1 ? "la mesa" : "las mesas"} ${ocupadas.join(", ")}: pasalas a otra mesa antes.`,
      );
    }
    if (b.estado === "grupo" && (!b.nombre.trim() || !(Number(b.pax) > 0) || !b.hora)) {
      lista.push(`Completá el nombre, los pax y la hora del grupo de ${s.nombre}.`);
    }
    return lista;
  });

  // Lo que queda para reservas nuevas: mesas no reducidas de sectores
  // abiertos (o sin sector).
  const noAbiertas = new Set(
    sectores.filter((s) => borradores[s.sectorId].estado !== "abierto").flatMap((s) => s.mesaIds),
  );
  const deSectoresCerradosHoy = new Set(sectores.filter((s) => s.estado === "cerrado").flatMap((s) => s.mesaIds));
  const disponibles = mesas.filter(
    (m) => !noAbiertas.has(m.id) && (!m.reducida || deSectoresCerradosHoy.has(m.id)),
  );
  const paxTotal = mesas.reduce((a, m) => a + m.capacidad, 0);
  const paxDisponibles = disponibles.reduce((a, m) => a + m.capacidad, 0);

  async function confirmar() {
    setEnviando(true);
    setError(null);
    try {
      const payload: SectorEstado[] = sectores.map((s) => {
        const b = borradores[s.sectorId];
        return {
          sectorId: s.sectorId,
          estado: b.estado,
          motivo: b.estado === "cerrado" ? b.motivo : null,
          grupo:
            b.estado === "grupo"
              ? {
                  nombre: b.nombre.trim(),
                  pax: Number(b.pax),
                  hora: b.hora,
                  habTel: b.habTel.trim() || null,
                  comentarios: b.comentarios.trim() || null,
                }
              : null,
        };
      });
      await setSectoresTurno(fecha, turno, salonId, payload);
      onCerrar();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudieron guardar los sectores");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <>
      <button type="button" aria-label="Cerrar" className="fixed inset-0 z-40 cursor-default bg-tinta/30" onClick={onCerrar} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="sectores-titulo"
        className="fixed top-1/2 left-1/2 z-50 grid max-h-[92vh] w-[calc(100%-32px)] max-w-lg -translate-x-1/2 -translate-y-1/2 gap-3.5 overflow-y-auto rounded-2xl border border-borde bg-superficie p-5 shadow-lg"
      >
        <div>
          <h3 id="sectores-titulo" className="text-base font-bold">
            Sectores · {titulo}
          </h3>
          <p className="text-xs text-tinta-suave">Solo para este turno: el próximo vuelve a estar todo abierto.</p>
        </div>

        {sectores.map((s, i) => {
          const b = borradores[s.sectorId];
          const delSector = mesas.filter((m) => s.mesaIds.includes(m.id));
          const pax = delSector.reduce((a, m) => a + m.capacidad, 0);
          return (
            <div key={s.sectorId} className="grid gap-2.5 rounded-xl border border-borde p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <i className="inline-block h-3 w-3 rounded-full" style={{ background: s.color }} />
                  <b className="text-sm">{s.nombre}</b>
                  <span className="text-xs text-tinta-suave">
                    {delSector.length} mesas · {pax} pax
                  </span>
                </div>
                <div role="group" aria-label={`Estado de ${s.nombre}`} className="inline-flex gap-0.5 rounded-lg bg-arena-suave p-0.5">
                  {(["abierto", "cerrado", "grupo"] as const).map((e, j) => (
                    <button
                      key={e}
                      ref={i === 0 && j === 0 ? primerBoton : undefined}
                      type="button"
                      aria-pressed={b.estado === e}
                      onClick={() => cambiar(s.sectorId, { estado: e })}
                      className={`rounded-md px-2.5 py-1 text-xs font-bold ${
                        b.estado !== e
                          ? "text-tinta-suave hover:text-tinta"
                          : e === "abierto"
                            ? "bg-superficie text-tinta shadow-sm"
                            : e === "cerrado"
                              ? "bg-tinta-suave text-superficie"
                              : "text-white"
                      }`}
                      style={b.estado === e && e === "grupo" ? { background: s.color } : undefined}
                    >
                      {e === "abierto" ? "Abierto" : e === "cerrado" ? "Cerrado" : "Grupo"}
                    </button>
                  ))}
                </div>
              </div>

              {b.estado === "cerrado" && (
                <div className="flex flex-wrap gap-1.5" role="group" aria-label="Motivo">
                  {MOTIVOS.map((m) => (
                    <button
                      key={m}
                      type="button"
                      aria-pressed={b.motivo === m}
                      onClick={() => cambiar(s.sectorId, { motivo: b.motivo === m ? null : m })}
                      className={`rounded-full border px-2.5 py-0.5 text-xs ${
                        b.motivo === m ? "border-tinta bg-tinta text-superficie" : "border-borde hover:bg-arena-suave"
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              )}

              {b.estado === "grupo" && (
                <div className="grid grid-cols-2 gap-2 rounded-lg bg-arena-suave p-2.5">
                  <label className="col-span-2 grid min-w-0 gap-1 text-[11px] font-bold text-tinta-suave">
                    Nombre del grupo
                    <input
                      id={`grupo-nombre-${s.sectorId}`}
                      value={b.nombre}
                      onChange={(e) => cambiar(s.sectorId, { nombre: e.target.value })}
                      placeholder="Ej: Cumpleaños Fernández"
                      className="w-full min-w-0 rounded-md border border-borde bg-superficie px-2 py-1.5 text-sm font-normal text-tinta"
                    />
                  </label>
                  <label className="grid min-w-0 gap-1 text-[11px] font-bold text-tinta-suave">
                    Pax
                    <input
                      id={`grupo-pax-${s.sectorId}`}
                      type="number"
                      min={1}
                      value={b.pax}
                      onChange={(e) => cambiar(s.sectorId, { pax: e.target.value })}
                      className="w-full min-w-0 rounded-md border border-borde bg-superficie px-2 py-1.5 text-sm font-normal text-tinta"
                    />
                  </label>
                  <label className="grid min-w-0 gap-1 text-[11px] font-bold text-tinta-suave">
                    Hora
                    <select
                      id={`grupo-hora-${s.sectorId}`}
                      value={b.hora}
                      onChange={(e) => cambiar(s.sectorId, { hora: e.target.value })}
                      className="w-full min-w-0 rounded-md border border-borde bg-superficie px-2 py-1.5 text-sm font-normal text-tinta"
                    >
                      {(b.hora && !horas.includes(b.hora) ? [b.hora, ...horas] : horas).map((h) => (
                        <option key={h}>{h}</option>
                      ))}
                    </select>
                  </label>
                  <label className="grid min-w-0 gap-1 text-[11px] font-bold text-tinta-suave">
                    WhatsApp / Hab
                    <input
                      id={`grupo-tel-${s.sectorId}`}
                      value={b.habTel}
                      onChange={(e) => cambiar(s.sectorId, { habTel: e.target.value })}
                      className="w-full min-w-0 rounded-md border border-borde bg-superficie px-2 py-1.5 text-sm font-normal text-tinta"
                    />
                  </label>
                  <label className="grid min-w-0 gap-1 text-[11px] font-bold text-tinta-suave">
                    Comentarios
                    <input
                      id={`grupo-com-${s.sectorId}`}
                      value={b.comentarios}
                      onChange={(e) => cambiar(s.sectorId, { comentarios: e.target.value })}
                      className="w-full min-w-0 rounded-md border border-borde bg-superficie px-2 py-1.5 text-sm font-normal text-tinta"
                    />
                  </label>
                  <p className="col-span-2 text-xs text-tinta-suave">
                    Se carga como una reserva con las {delSector.length} mesas de {s.nombre}.
                    {Number(b.pax) > pax && pax > 0 && " Ojo: son más pax que los lugares del sector."}
                  </p>
                </div>
              )}
            </div>
          );
        })}

        {problemas.length > 0 && (
          <div className="grid gap-1 rounded-lg bg-aviso-suave px-3 py-2 text-xs text-aviso">
            {problemas.map((p) => (
              <span key={p}>{p}</span>
            ))}
          </div>
        )}
        {error && <div className="rounded-lg bg-ocupada-suave px-3 py-2 text-xs text-ocupada">{error}</div>}

        <div className="flex items-center justify-between gap-2 rounded-lg bg-fondo px-3 py-2 text-xs">
          <span className="text-tinta-suave">Quedan para reservas nuevas</span>
          <b className="tabular-nums">
            {disponibles.length} {disponibles.length === 1 ? "mesa" : "mesas"} · {paxDisponibles} de {paxTotal} pax
          </b>
        </div>
        <p className="-mt-2 text-xs text-tinta-suave">
          La planilla se achica sola según lo que quede abierto, sin borrar reservas.
        </p>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <button type="button" onClick={onAjustarMesas} className="text-xs text-tinta-suave underline hover:text-tinta">
            Ajustar mesas una por una
          </button>
          <div className="flex gap-2">
            <button type="button" onClick={onCerrar} className="rounded-lg px-3 py-1.5 text-sm text-tinta-suave hover:bg-arena-suave">
              Cancelar
            </button>
            <button
              type="button"
              onClick={confirmar}
              disabled={enviando || problemas.length > 0}
              className="rounded-lg bg-marca px-3.5 py-1.5 text-sm text-white disabled:opacity-50"
            >
              {enviando ? "Guardando…" : "Confirmar"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
