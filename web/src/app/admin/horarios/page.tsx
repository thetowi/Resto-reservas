"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ApiError, getHorarios, getMeta, guardarHorarios, restaurarHorarios } from "@/lib/api";
import { esAdmin, haySesion } from "@/lib/auth";
import type { FranjaHoraria, HorariosTurno, Salon, Turno } from "@/lib/types";
import { useConfirm } from "@/components/ConfirmProvider";
import SalonSelector from "@/components/SalonSelector";

// Horarios de cada turno por salón (ver api/Models/HorarioTurno.cs): qué
// horarios tiene la planilla y cuántas filas trae cada uno. Solo Admin. Un
// salón que nunca se configuró usa los de siempre (los de la planilla
// original). Lo que se guarda vale para los días que se abran después: los
// días que ya tienen la planilla abierta no cambian. En el link de reservas,
// el cupo de cada horario es su cantidad de filas.

const NOMBRE: Record<Turno, string> = { almuerzo: "Almuerzo", merienda: "Merienda", cena: "Cena" };
const MAX_HORARIOS = 40;
const MAX_FILAS = 30;

function sumarMinutos(hora: string, min: number) {
  const [h, m] = hora.split(":").map(Number);
  const total = Math.min(23 * 60 + 45, h * 60 + m + min);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function iguales(a: FranjaHoraria[], b: FranjaHoraria[]) {
  return a.length === b.length && a.every((f, i) => f.hora === b[i].hora && f.filas === b[i].filas);
}

export default function AdminHorariosPage() {
  const router = useRouter();
  const [listo, setListo] = useState(false);
  const [salones, setSalones] = useState<Salon[]>([]);
  const [salonId, setSalonId] = useState<number | null>(null);
  // Horarios del salón elegido (se descartan si se cambió de salón mientras cargaban).
  const [datos, setDatos] = useState<{ salonId: number; turnos: HorariosTurno[] } | null>(null);
  const turnos = datos && datos.salonId === salonId ? datos.turnos : null;
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

  useEffect(() => {
    if (!listo) return;
    getMeta()
      .then((m) => {
        setSalones(m.salones);
        setSalonId((id) => id ?? m.salones[0]?.id ?? null);
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : "No se pudieron cargar los salones"));
  }, [listo]);

  useEffect(() => {
    if (salonId === null) return;
    getHorarios(salonId)
      .then((r) => setDatos({ salonId: r.salonId, turnos: r.turnos }))
      .catch((e) => setError(e instanceof ApiError ? e.message : "No se pudieron cargar los horarios"));
  }, [salonId]);

  if (!listo) return null;

  return (
    <div className="mx-auto grid max-w-3xl gap-6 px-4 py-8 sm:px-6">
      <div>
        <Link href="/" className="text-xs text-tinta-suave underline hover:text-tinta">
          ← Volver a reservas
        </Link>
        <h1 className="mt-1 text-lg font-bold">Horarios</h1>
        <p className="mt-1 max-w-[70ch] text-sm leading-relaxed text-tinta-suave">
          Los horarios de cada turno y cuántas filas trae la planilla en cada uno. Los cambios se usan desde el próximo
          día que se abra: los días que ya tienen la planilla abierta quedan como están. En el link de reservas, cada
          horario acepta tantas reservas como filas tiene.
        </p>
      </div>

      {salones.length > 1 && salonId !== null && (
        <div className="overflow-x-auto">
          <SalonSelector salones={salones} salonId={salonId} onCambiar={setSalonId} />
        </div>
      )}

      {error && <div className="rounded-xl bg-ocupada-suave px-4 py-2.5 text-sm text-ocupada">{error}</div>}

      {!turnos ? (
        <div className="p-10 text-center text-tinta-suave">Cargando…</div>
      ) : (
        turnos.map((t) => (
          <EditorTurno
            key={`${salonId}-${t.turno}`}
            salonId={salonId!}
            datos={t}
            onGuardado={(r) => {
              setDatos({ salonId: salonId!, turnos: r });
              setError(null);
            }}
            onError={setError}
          />
        ))
      )}
    </div>
  );
}

function EditorTurno({
  salonId,
  datos,
  onGuardado,
  onError,
}: {
  salonId: number;
  datos: HorariosTurno;
  onGuardado: (turnos: HorariosTurno[]) => void;
  onError: (mensaje: string) => void;
}) {
  const { confirmar } = useConfirm();
  const [lista, setLista] = useState<FranjaHoraria[]>(datos.horarios);
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const cambiado = !iguales(lista, datos.horarios);
  const totalFilas = lista.reduce((a, f) => a + f.filas, 0);
  const ordenada = [...lista].sort((a, b) => a.hora.localeCompare(b.hora));
  const repetidas = new Set(lista.map((f) => f.hora).filter((h, i, arr) => arr.indexOf(h) !== i));

  function cambiar(i: number, cambio: Partial<FranjaHoraria>) {
    setLista((l) => l.map((f, j) => (j === i ? { ...f, ...cambio } : f)));
    setAviso(null);
  }

  function agregar() {
    const ultima = ordenada.at(-1)?.hora;
    setLista((l) => [...l, { hora: ultima ? sumarMinutos(ultima, 15) : "21:00", filas: 2 }]);
    setAviso(null);
  }

  async function guardar() {
    setGuardando(true);
    try {
      const r = await guardarHorarios(salonId, datos.turno, ordenada);
      setLista(r.turnos.find((t) => t.turno === datos.turno)?.horarios ?? ordenada);
      onGuardado(r.turnos);
      setAviso("Guardado. Se usa desde el próximo día que se abra.");
    } catch (e) {
      onError(e instanceof ApiError ? e.message : "No se pudieron guardar los horarios");
    } finally {
      setGuardando(false);
    }
  }

  async function restaurar() {
    const ok = await confirmar(`¿Volver a los horarios de siempre en ${NOMBRE[datos.turno]}?`, { textoConfirmar: "Volver a los de siempre" });
    if (!ok) return;
    setGuardando(true);
    try {
      const r = await restaurarHorarios(salonId, datos.turno);
      setLista(r.turnos.find((t) => t.turno === datos.turno)?.horarios ?? lista);
      onGuardado(r.turnos);
      setAviso("Volvió a los horarios de siempre.");
    } catch (e) {
      onError(e instanceof ApiError ? e.message : "No se pudieron restaurar los horarios");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <section className="grid gap-3 rounded-2xl border border-borde bg-superficie p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 className="text-base font-bold">{NOMBRE[datos.turno]}</h2>
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
            datos.personalizado ? "bg-asistio-suave text-asistio" : "bg-arena-suave text-tinta-suave"
          }`}
        >
          {datos.personalizado ? "Personalizados" : "Los de siempre"}
        </span>
        <span className="ml-auto text-xs text-tinta-suave tabular-nums">
          {lista.length} {lista.length === 1 ? "horario" : "horarios"} · {totalFilas} filas
        </span>
      </div>

      <div className="grid gap-1.5">
        <div className="flex items-center gap-3 px-1 text-[11px] font-bold tracking-[0.08em] text-tinta-suave uppercase">
          <span className="w-32">Horario</span>
          <span>Filas</span>
        </div>
        {lista.map((f, i) => (
          <div key={i} className="flex items-center gap-3">
            <input
              type="time"
              step={900}
              value={f.hora}
              onChange={(e) => e.target.value && cambiar(i, { hora: e.target.value })}
              aria-label="Horario"
              aria-invalid={repetidas.has(f.hora)}
              className={`h-10 w-32 rounded-[10px] border bg-superficie px-3 text-sm tabular-nums ${
                repetidas.has(f.hora) ? "border-ocupada" : "border-borde"
              }`}
            />
            <div className="flex h-10 flex-none items-center rounded-[10px] border border-borde">
              <button
                type="button"
                onClick={() => cambiar(i, { filas: Math.max(1, f.filas - 1) })}
                disabled={f.filas <= 1}
                className="grid h-full w-10 place-items-center text-lg disabled:opacity-30"
                aria-label={`Una fila menos a las ${f.hora}`}
              >
                −
              </button>
              <span className="w-8 text-center text-sm font-bold tabular-nums">{f.filas}</span>
              <button
                type="button"
                onClick={() => cambiar(i, { filas: Math.min(MAX_FILAS, f.filas + 1) })}
                disabled={f.filas >= MAX_FILAS}
                className="grid h-full w-10 place-items-center text-lg disabled:opacity-30"
                aria-label={`Una fila más a las ${f.hora}`}
              >
                +
              </button>
            </div>
            <button
              type="button"
              onClick={() => setLista((l) => l.filter((_, j) => j !== i))}
              disabled={lista.length <= 1}
              className="h-10 rounded-[10px] px-3 text-sm text-tinta-suave hover:bg-ocupada-suave hover:text-ocupada disabled:opacity-30"
              aria-label={`Quitar el horario de las ${f.hora}`}
            >
              Quitar
            </button>
          </div>
        ))}
        {repetidas.size > 0 && <p className="text-xs text-ocupada">Hay horarios repetidos: dejá uno solo de cada uno.</p>}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={agregar}
          disabled={lista.length >= MAX_HORARIOS}
          className="rounded-[10px] border border-dashed border-arena px-3.5 py-2 text-sm hover:bg-arena-suave disabled:opacity-40"
        >
          + Agregar horario
        </button>
        {datos.personalizado && (
          <button
            type="button"
            onClick={restaurar}
            disabled={guardando}
            className="rounded-[10px] px-3 py-2 text-sm text-tinta-suave underline hover:text-tinta"
          >
            Volver a los de siempre
          </button>
        )}
        <div className="ml-auto flex items-center gap-2">
          {cambiado && (
            <button
              type="button"
              onClick={() => {
                setLista(datos.horarios);
                setAviso(null);
              }}
              className="rounded-[10px] border border-borde px-3.5 py-2 text-sm hover:bg-arena-suave"
            >
              Descartar
            </button>
          )}
          <button
            type="button"
            onClick={guardar}
            disabled={!cambiado || guardando || repetidas.size > 0}
            className="rounded-[10px] bg-marca px-4 py-2 text-sm font-semibold text-white disabled:opacity-40 [[data-theme=dark]_&]:bg-asistio [[data-theme=dark]_&]:text-[#04221c]"
          >
            {guardando ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </div>
      {aviso && (
        <p role="status" className="text-xs text-asistio">
          {aviso}
        </p>
      )}
    </section>
  );
}
