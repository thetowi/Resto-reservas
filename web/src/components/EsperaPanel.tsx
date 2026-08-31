"use client";

import { useState } from "react";
import { borrarEspera, crearEspera, patchEspera, ApiError } from "@/lib/api";
import type { Espera, Turno } from "@/lib/types";

interface Props {
  fecha: string;
  turno: Turno;
  salonId: number;
  lista: Espera[];
  onListaActualizada: (lista: Espera[]) => void;
}

// Estilo liviano para los inputs de este panel: a diferencia de la clase
// compartida ".celda" (que fija width:100%, pensada para una celda de tabla
// sola), acá varios inputs conviven en una misma fila con anchos fijos —
// mezclar los dos hace que el layout de flexbox se rompa (el ancho fijo de
// Tailwind pierde contra el width:100% de .celda), así que estos definen su
// propio ancho en vez de heredarlo.
const campoClase =
  "rounded-md border px-1 py-0.5 text-xs text-tinta focus:border-arena focus:bg-superficie focus:outline-none";

export default function EsperaPanel({ fecha, turno, salonId, lista, onListaActualizada }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [nombre, setNombre] = useState("");
  const [habTel, setHabTel] = useState("");
  const [pax, setPax] = useState("");
  const [enviando, setEnviando] = useState(false);

  function manejarError(e: unknown) {
    setError(e instanceof ApiError ? e.message : "No se pudo completar la acción");
  }

  async function onAgregar() {
    if (!nombre.trim() && !habTel.trim()) return;
    setEnviando(true);
    try {
      const lista = await crearEspera(fecha, turno, salonId, {
        nombre: nombre.trim() || undefined,
        habTel: habTel.trim() || undefined,
        pax: pax ? Number(pax) : undefined,
      });
      onListaActualizada(lista);
      setNombre("");
      setHabTel("");
      setPax("");
      setError(null);
    } catch (e) {
      manejarError(e);
    } finally {
      setEnviando(false);
    }
  }

  async function onQuitar(entrada: Espera) {
    if (!window.confirm("¿Ya se le asignó mesa (o se retiró)? Se va a sacar de la lista de espera.")) {
      return;
    }
    try {
      onListaActualizada(await borrarEspera(entrada.id));
      setError(null);
    } catch (e) {
      manejarError(e);
    }
  }

  async function onEditar(entrada: Espera, campo: "nombre" | "habTel", valor: string) {
    if (valor === (entrada[campo] ?? "")) return;
    try {
      onListaActualizada(await patchEspera(entrada.id, { [campo]: valor }));
      setError(null);
    } catch (e) {
      manejarError(e);
    }
  }

  async function onEditarPax(entrada: Espera, valor: string) {
    const num = valor === "" ? null : Number(valor);
    if (num === entrada.pax) return;
    try {
      onListaActualizada(await patchEspera(entrada.id, { pax: num }));
      setError(null);
    } catch (e) {
      manejarError(e);
    }
  }

  // Sienta (o repone en espera) a un grupo: se marca "ubicada" pero se deja
  // la fila en la lista — es un toggle a proposito, asi si alguien lo marca
  // por error puede deshacerlo sin perder el dato (ver punto 4 del feedback:
  // "que siga estando, asi es un dato que no perdemos").
  async function onSentar(entrada: Espera) {
    try {
      onListaActualizada(await patchEspera(entrada.id, { ubicada: !entrada.ubicada }));
      setError(null);
    } catch (e) {
      manejarError(e);
    }
  }

  const pendientes = lista.filter((e) => !e.ubicada).length;
  // Posicion en la fila de cada entrada, contando solo las que siguen
  // esperando (una "ubicada" ya no ocupa lugar en la cola). Se precalcula
  // como un array puro con reduce (en vez de mutar una variable capturada
  // adentro del .map que arma el JSX) porque el compilador de React no
  // permite reasignar una variable externa dentro de ese callback.
  const posiciones = lista.reduce<number[]>((acc, entrada) => {
    const anterior = acc.length > 0 ? acc[acc.length - 1] : 0;
    acc.push(entrada.ubicada ? anterior : anterior + 1);
    return acc;
  }, []);

  return (
    <div className="rounded-2xl border border-borde bg-superficie p-4 shadow-sm">
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <div className="text-xs font-semibold tracking-wide text-tinta-suave uppercase">
          Lista de espera
        </div>
        {lista.length > 0 && (
          <div className="text-xs text-tinta-suave">
            {pendientes} esperando
            {pendientes !== lista.length ? ` · ${lista.length - pendientes} ubicada${lista.length - pendientes === 1 ? "" : "s"}` : ""}
          </div>
        )}
      </div>

      {error && (
        <div className="mb-2.5 rounded-lg bg-ocupada-suave px-2.5 py-2 text-xs text-ocupada">{error}</div>
      )}

      {lista.length === 0 ? (
        <p className="mb-3 text-xs text-tinta-suave">Nadie esperando mesa por ahora.</p>
      ) : (
        // max-h + overflow-y-auto: si la lista crece mucho, scrollea acá
        // adentro en vez de estirar el panel y arrastrar hacia abajo la
        // lista de reservas del lado izquierdo (ver punto 3 del feedback).
        <ol className="mb-3 flex max-h-72 flex-col gap-1.5 overflow-y-auto pr-1">
          {lista.map((entrada, i) => {
            const posicion = posiciones[i];
            return (
              <li
                key={entrada.id}
                className={`rounded-lg border px-2 py-1.5 ${
                  entrada.ubicada ? "border-borde bg-fondo opacity-60" : "border-borde"
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <span
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                      entrada.ubicada
                        ? "bg-asistio-suave text-asistio"
                        : "bg-arena-suave text-tinta-suave"
                    }`}
                    title={
                      entrada.ubicada
                        ? "Ya ubicada"
                        : posicion === 1
                          ? "Primero en la fila"
                          : `Lugar ${posicion}`
                    }
                  >
                    {entrada.ubicada ? "✓" : posicion}
                  </span>
                  <input
                    className={`${campoClase} min-w-0 flex-1 border-transparent ${entrada.ubicada ? "line-through" : ""}`}
                    defaultValue={entrada.nombre ?? ""}
                    placeholder="Nombre"
                    onBlur={(e) => onEditar(entrada, "nombre", e.target.value)}
                  />
                  <button
                    title={entrada.ubicada ? "Reponer en la lista de espera" : "Sentar (marcar como ubicada)"}
                    className={`shrink-0 rounded px-1 text-[10px] font-semibold ${
                      entrada.ubicada
                        ? "text-tinta-suave hover:text-tinta"
                        : "text-asistio hover:bg-asistio-suave"
                    }`}
                    onClick={() => onSentar(entrada)}
                  >
                    {entrada.ubicada ? "↺" : "Sentar"}
                  </button>
                  <button
                    title="Quitar de la lista de espera"
                    className="shrink-0 text-tinta-suave opacity-40 hover:text-ocupada hover:opacity-100"
                    onClick={() => onQuitar(entrada)}
                  >
                    ×
                  </button>
                </div>
                <div className="mt-1 flex items-center gap-1 pl-6.5 text-[11px] text-tinta-suave">
                  <input
                    className={`${campoClase} w-16 border-transparent`}
                    defaultValue={entrada.habTel ?? ""}
                    placeholder="Hab/Tel"
                    onBlur={(e) => onEditar(entrada, "habTel", e.target.value)}
                  />
                  <input
                    className={`${campoClase} w-10 border-transparent text-center`}
                    type="number"
                    min={0}
                    defaultValue={entrada.pax ?? ""}
                    placeholder="Pax"
                    onBlur={(e) => onEditarPax(entrada, e.target.value)}
                  />
                  <span>pax</span>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      <div className="flex flex-col gap-1.5 border-t border-borde pt-3">
        <input
          className={`${campoClase} border-borde`}
          placeholder="Nombre o Apellido"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
        />
        <div className="flex gap-1.5">
          <input
            className={`${campoClase} w-16 border-borde`}
            placeholder="Hab/Tel"
            value={habTel}
            onChange={(e) => setHabTel(e.target.value)}
          />
          <input
            className={`${campoClase} w-12 border-borde text-center`}
            type="number"
            min={1}
            placeholder="Pax"
            value={pax}
            onChange={(e) => setPax(e.target.value)}
          />
          <button
            disabled={enviando || (!nombre.trim() && !habTel.trim())}
            onClick={onAgregar}
            className="flex-1 rounded-lg bg-tinta px-2 py-1.5 text-xs font-medium text-white disabled:opacity-40"
          >
            + Agregar
          </button>
        </div>
      </div>
    </div>
  );
}
