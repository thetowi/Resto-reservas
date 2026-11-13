"use client";

import { useState } from "react";
import { ApiError, asignarSector, borrarSector, crearSector, editarSector } from "@/lib/api";
import type { Mesa, Sector } from "@/lib/types";
import { useConfirm } from "./ConfirmProvider";

// Administrar mesas → pestaña «Sectores»: armar los sectores del salón
// (Bodega, Terraza...) y pintar sus mesas tocándolas en el plano. Las
// divisiones van siempre con su mesa (lo resuelve el backend, ver
// SectoresController.Asignar). En cada turno, desde el panel, cada sector se
// puede cerrar o dar a un grupo (components/SectoresTurno.tsx).

const COLORES = ["#8a5a2b", "#2f7d6d", "#2f6f9f", "#a33b5c", "#6b7a1f", "#7a4fb3"];
const SIN_SECTOR = "#8a959c";

// Misma grilla de arranque que PlanoSalon para las mesas sin acomodar.
function posicion(m: Mesa) {
  if (m.posX !== null && m.posY !== null) return { x: m.posX, y: m.posY };
  return { x: 30 + (m.orden % 8) * 100, y: 30 + Math.floor(m.orden / 8) * 100 };
}

function lado(capacidad: number) {
  return Math.min(84, Math.max(46, 30 + capacidad * 5));
}

interface Props {
  salonId: number;
  mesas: Mesa[];
  sectores: Sector[];
  onSectores: (salonId: number, sectores: Sector[]) => void;
  onMesas: (mesas: Mesa[]) => void;
  todasLasMesas: Mesa[];
}

export default function SectoresEditor({ salonId, mesas, sectores, onSectores, onMesas, todasLasMesas }: Props) {
  const { confirmar } = useConfirm();
  // Con qué se pinta al tocar una mesa: un sector, o null = sin sector.
  const [pincel, setPincel] = useState<number | null | undefined>(sectores[0]?.id);
  const [nuevo, setNuevo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pincelActual = pincel === undefined ? (sectores[0]?.id ?? null) : pincel;
  const colorDe = (id: number | null | undefined) => sectores.find((s) => s.id === id)?.color ?? SIN_SECTOR;

  function fallo(e: unknown, texto: string) {
    setError(e instanceof ApiError ? e.message : texto);
  }

  async function agregar() {
    const nombre = nuevo?.trim();
    if (!nombre) return;
    setError(null);
    try {
      const lista = await crearSector(salonId, nombre, COLORES[sectores.length % COLORES.length]);
      onSectores(salonId, lista);
      setPincel(lista.find((s) => s.nombre === nombre)?.id ?? pincelActual);
      setNuevo(null);
    } catch (e) {
      fallo(e, "No se pudo crear el sector");
    }
  }

  async function renombrar(s: Sector, nombre: string) {
    if (!nombre.trim() || nombre.trim() === s.nombre) return;
    setError(null);
    try {
      onSectores(salonId, await editarSector(s.id, { nombre: nombre.trim() }));
    } catch (e) {
      fallo(e, "No se pudo renombrar el sector");
    }
  }

  async function pintarColor(s: Sector, color: string) {
    setError(null);
    try {
      onSectores(salonId, await editarSector(s.id, { color }));
    } catch (e) {
      fallo(e, "No se pudo cambiar el color");
    }
  }

  async function quitar(s: Sector) {
    const ok = await confirmar(`¿Borrar el sector «${s.nombre}»? Sus mesas quedan sin sector.`, { textoConfirmar: "Borrar" });
    if (!ok) return;
    setError(null);
    try {
      onSectores(salonId, await borrarSector(s.id));
      if (pincelActual === s.id) setPincel(null);
    } catch (e) {
      fallo(e, "No se pudo borrar el sector");
    }
  }

  async function tocar(m: Mesa) {
    const base = m.mesaPadreId ?? m.id;
    if ((mesas.find((x) => x.id === base)?.sectorId ?? null) === pincelActual) return;
    setError(null);
    // Se ve al instante; el backend confirma con la lista completa.
    const previas = todasLasMesas;
    onMesas(todasLasMesas.map((x) => (x.id === base || x.mesaPadreId === base ? { ...x, sectorId: pincelActual } : x)));
    try {
      onMesas(await asignarSector(pincelActual, [m.id]));
    } catch (e) {
      onMesas(previas);
      fallo(e, "No se pudo cambiar el sector de la mesa");
    }
  }

  // Encuadre del plano: todas las mesas, con un margen.
  const cajas = mesas.map((m) => ({ m, ...posicion(m), l: lado(m.capacidad) }));
  const minX = Math.min(0, ...cajas.map((c) => c.x)) - 20;
  const minY = Math.min(0, ...cajas.map((c) => c.y)) - 20;
  const maxX = Math.max(400, ...cajas.map((c) => c.x + c.l)) + 20;
  const maxY = Math.max(240, ...cajas.map((c) => c.y + c.l)) + 20;

  const resumen = [...sectores.map((s) => s.id), null].map((id) => {
    const delSector = mesas.filter((m) => (m.sectorId ?? null) === id);
    return { id, mesas: delSector.length, pax: delSector.reduce((a, m) => a + m.capacidad, 0) };
  });

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="grid gap-3 rounded-2xl border border-borde bg-superficie p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-1 text-[11px] font-bold tracking-wide text-tinta-suave uppercase">Pintar:</span>
          {sectores.map((s) => (
            <button
              key={s.id}
              type="button"
              aria-pressed={pincelActual === s.id}
              onClick={() => setPincel(s.id)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-semibold ${
                pincelActual === s.id ? "border-tinta ring-1 ring-tinta" : "border-borde hover:bg-arena-suave"
              }`}
            >
              <i className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />
              {s.nombre}
            </button>
          ))}
          <button
            type="button"
            aria-pressed={pincelActual === null}
            onClick={() => setPincel(null)}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-semibold ${
              pincelActual === null ? "border-tinta ring-1 ring-tinta" : "border-borde hover:bg-arena-suave"
            }`}
          >
            <i className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: SIN_SECTOR }} />
            Sin sector
          </button>
          {nuevo === null ? (
            <button
              type="button"
              onClick={() => setNuevo("")}
              className="rounded-full border border-dashed border-arena px-3 py-1 text-sm text-tinta-suave hover:bg-arena-suave"
            >
              + Nuevo sector
            </button>
          ) : (
            <form
              className="inline-flex items-center gap-1.5"
              onSubmit={(e) => {
                e.preventDefault();
                agregar();
              }}
            >
              <input
                id="nuevo-sector"
                autoFocus
                value={nuevo}
                onChange={(e) => setNuevo(e.target.value)}
                placeholder="Ej: Terraza"
                maxLength={40}
                className="w-32 rounded-lg border border-borde bg-fondo px-2 py-1 text-sm"
              />
              <button type="submit" className="rounded-lg bg-marca px-2.5 py-1 text-sm text-white">
                Agregar
              </button>
              <button type="button" onClick={() => setNuevo(null)} className="px-1.5 text-sm text-tinta-suave">
                Cancelar
              </button>
            </form>
          )}
        </div>

        {error && <div className="rounded-lg bg-ocupada-suave px-3 py-2 text-xs text-ocupada">{error}</div>}

        <p className="text-xs text-tinta-suave">
          {sectores.length === 0
            ? "Creá los sectores del salón (por ejemplo Bodega y Terraza) y después tocá las mesas para pintarlas."
            : "Elegí un sector arriba y tocá las mesas que van en él. Las divisiones van con su mesa."}
        </p>

        <div className="overflow-hidden rounded-xl border border-borde bg-fondo">
          <svg
            viewBox={`${minX} ${minY} ${maxX - minX} ${maxY - minY}`}
            className="block max-h-[640px] w-full"
            role="group"
            aria-label="Plano del salón: tocá una mesa para pintarla con el sector elegido"
          >
            {cajas.map(({ m, x, y, l }) => {
              const color = colorDe(m.sectorId);
              const centro = { x: x + l / 2, y: y + l / 2 };
              return (
                <g
                  key={m.id}
                  role="button"
                  tabIndex={0}
                  aria-label={`Mesa ${m.codigo}, ${sectores.find((s) => s.id === m.sectorId)?.nombre ?? "sin sector"}`}
                  className="cursor-pointer focus:outline-none [&:focus-visible>*:first-child]:stroke-[5]"
                  onClick={() => tocar(m)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      tocar(m);
                    }
                  }}
                >
                  {m.forma === "redonda" ? (
                    <circle cx={centro.x} cy={centro.y} r={l / 2 - 2} fill={color} fillOpacity={0.16} stroke={color} strokeWidth={3} />
                  ) : (
                    <rect x={x + 2} y={y + 2} width={l - 4} height={l - 4} rx={10} fill={color} fillOpacity={0.16} stroke={color} strokeWidth={3} />
                  )}
                  <text x={centro.x} y={centro.y - 2} textAnchor="middle" fontSize={17} fontWeight={800} fill={color}>
                    {m.codigo}
                  </text>
                  <text x={centro.x} y={centro.y + 15} textAnchor="middle" fontSize={11} fontWeight={600} fill={color} opacity={0.8}>
                    {m.capacidad}p
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      </div>

      <div className="grid h-fit min-w-0 gap-3 rounded-2xl border border-borde bg-superficie p-4 shadow-sm">
        <div className="text-[11px] font-bold tracking-wide text-tinta-suave uppercase">Sectores de este salón</div>
        {sectores.map((s) => {
          const r = resumen.find((x) => x.id === s.id)!;
          return (
            <div key={s.id} className="grid min-w-0 gap-2 rounded-xl border border-borde p-3">
              <div className="flex items-center gap-2">
                <i className="inline-block h-3 w-3 shrink-0 rounded-full" style={{ background: s.color }} />
                <input
                  id={`sector-${s.id}`}
                  defaultValue={s.nombre}
                  key={s.nombre}
                  aria-label="Nombre del sector"
                  maxLength={40}
                  size={1}
                  onBlur={(e) => renombrar(s, e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                  className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1.5 py-0.5 text-sm font-semibold hover:border-borde focus:border-arena focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => quitar(s)}
                  className="text-xs text-tinta-suave hover:text-ocupada"
                  aria-label={`Borrar el sector ${s.nombre}`}
                >
                  Borrar
                </button>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex gap-1" role="group" aria-label={`Color de ${s.nombre}`}>
                  {COLORES.map((c) => (
                    <button
                      key={c}
                      type="button"
                      aria-label={`Color ${c}`}
                      aria-pressed={s.color === c}
                      onClick={() => pintarColor(s, c)}
                      className={`h-5 w-5 rounded-full ${s.color === c ? "ring-2 ring-tinta ring-offset-1 ring-offset-superficie" : ""}`}
                      style={{ background: c }}
                    />
                  ))}
                </div>
                <span className="text-xs text-tinta-suave tabular-nums">
                  <strong className="text-tinta">{r.mesas}</strong> mesas · <strong className="text-tinta">{r.pax}</strong> pax
                </span>
              </div>
            </div>
          );
        })}
        {(() => {
          const r = resumen.find((x) => x.id === null)!;
          return (
            <div className="flex items-center justify-between rounded-xl bg-arena-suave px-3 py-2 text-xs text-tinta-suave">
              <span>Sin sector</span>
              <span className="tabular-nums">
                <strong className="text-tinta">{r.mesas}</strong> mesas · <strong className="text-tinta">{r.pax}</strong> pax
              </span>
            </div>
          );
        })()}
        <p className="text-xs leading-relaxed text-tinta-suave">
          En cada turno, desde el botón «Sectores» del panel, cada sector se puede dejar abierto, cerrarlo o dárselo a un
          grupo. La planilla se achica sola.
        </p>
      </div>
    </div>
  );
}
