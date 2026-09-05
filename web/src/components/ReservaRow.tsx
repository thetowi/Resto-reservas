"use client";

import { useEffect, useRef, useState } from "react";
import { patchReserva, borrarReserva } from "@/lib/api";
import type { Mesa, Reserva } from "@/lib/types";
import { useConfirm } from "./ConfirmProvider";

interface Props {
  reserva: Reserva;
  mesas: Mesa[];
  reservas: Reserva[];
  impar: boolean;
}

// Enter avanza al siguiente campo de la grilla (ademas de Tab, que ya
// funciona solo con el orden nativo del navegador) — recorre los inputs
// enfocables de la MISMA tabla en el orden en que aparecen en el HTML, asi
// que tambien salta de una fila a la siguiente sin codificar a mano
// "despues de Hora viene Mesa". El selector de mesas (ver MesaSelector) no
// es un <select> nativo, por eso se suma explicitamente via la clase
// "selector-mesas" — el resto de sus botones (quitar fila, checkboxes del
// popover) a proposito NO entran en este recorrido. Mover el foco ya
// dispara el onBlur del campo que se deja, que es lo que efectivamente
// guarda el valor.
function enfocarSiguienteCampo(actual: HTMLElement) {
  const tabla = actual.closest("table");
  if (!tabla) return;
  const focables = Array.from(
    tabla.querySelectorAll<HTMLElement>(
      "input:not(:disabled), select:not(:disabled), button.selector-mesas:not(:disabled)",
    ),
  );
  const indice = focables.indexOf(actual);
  if (indice === -1) return;
  focables[indice + 1]?.focus();
}

function alPresionarTecla(e: React.KeyboardEvent<HTMLElement>) {
  if (e.key !== "Enter") return;
  e.preventDefault();
  enfocarSiguienteCampo(e.currentTarget);
}

export default function ReservaRow({ reserva, mesas, reservas, impar }: Props) {
  const { confirmar } = useConfirm();
  const [local, setLocal] = useState(reserva);
  const focusedField = useRef<string | null>(null);

  // Mesas ya asignadas a OTRA reserva de este mismo turno: no tiene sentido
  // ofrecerlas como opcion en el selector de esta fila, porque una mesa no
  // puede estar en dos reservas a la vez. Se excluye la propia reserva del
  // calculo (comparando por Id), para no bloquearse a si misma las mesas
  // que ya tiene elegidas.
  const ocupadasPorOtros = new Set(
    reservas.filter((r) => r.id !== reserva.id).flatMap((r) => r.mesaIds),
  );

  useEffect(() => {
    setLocal((prev) => {
      const next: Reserva = { ...reserva };
      const campo = focusedField.current;
      if (campo) {
        (next as unknown as Record<string, unknown>)[campo] =
          (prev as unknown as Record<string, unknown>)[campo];
      }
      return next;
    });
  }, [reserva]);

  function commit<K extends keyof Reserva>(campo: K, valor: Reserva[K]) {
    setLocal((prev) => ({ ...prev, [campo]: valor }));
  }

  function enviar(payload: Record<string, unknown>) {
    patchReserva(reserva.id, payload).catch(() => {});
  }

  function onBlurTexto(campo: "hora" | "nombre" | "habTel" | "comentarios") {
    focusedField.current = null;
    if (local[campo] === reserva[campo]) return;
    enviar({ [campo]: local[campo] });
  }

  function onCambiarMesas(ids: number[]) {
    commit("mesaIds", ids);
    enviar({ mesaIds: ids });
  }

  // Filas intercaladas (zebra striping): un tinte muy sutil en las filas
  // impares para que se distingan a simple vista sin depender del hover.
  // "Asistio" (verde) siempre tiene prioridad sobre el intercalado.
  const filaClase = local.asistio
    ? "bg-asistio-suave"
    : impar
      ? "bg-arena-suave/30 hover:bg-arena-suave/60"
      : "hover:bg-arena-suave/60";

  return (
    <tr className={filaClase}>
      <td className="w-16">
        <input
          className="celda"
          value={local.hora ?? ""}
          onFocus={() => (focusedField.current = "hora")}
          onChange={(e) => commit("hora", e.target.value)}
          onBlur={() => onBlurTexto("hora")}
          onKeyDown={alPresionarTecla}
          placeholder="hh:mm"
        />
      </td>
      <td className="w-24">
        <MesaSelector
          mesas={mesas}
          seleccionadas={local.mesaIds}
          bloqueada={local.pidioMesa}
          pax={local.pax}
          ocupadasPorOtros={ocupadasPorOtros}
          onCambiar={onCambiarMesas}
        />
      </td>
      <td className="w-14 text-center">
        <input
          type="checkbox"
          className="h-[18px] w-[18px] cursor-pointer"
          checked={local.pidioMesa}
          title="Tildar si la mesa fue pedida puntualmente (por llamada o el huésped la solicitó): bloquea el selector de Mesa"
          onKeyDown={alPresionarTecla}
          onChange={(e) => {
            commit("pidioMesa", e.target.checked);
            enviar({ pidioMesa: e.target.checked });
          }}
        />
      </td>
      <td className="w-14">
        <input
          className="celda text-center"
          type="number"
          min={0}
          placeholder="Ej: 4"
          value={local.pax ?? ""}
          onFocus={() => (focusedField.current = "pax")}
          onChange={(e) => commit("pax", e.target.value === "" ? null : Number(e.target.value))}
          onKeyDown={alPresionarTecla}
          onBlur={() => {
            focusedField.current = null;
            if (local.pax === reserva.pax) return;
            enviar({ pax: local.pax });
          }}
        />
      </td>
      <td>
        <input
          className="celda"
          value={local.nombre ?? ""}
          onFocus={() => (focusedField.current = "nombre")}
          onChange={(e) => commit("nombre", e.target.value)}
          onBlur={() => onBlurTexto("nombre")}
          onKeyDown={alPresionarTecla}
          placeholder="Apellido / Nombre"
        />
      </td>
      <td className="w-24">
        <input
          className="celda"
          value={local.habTel ?? ""}
          onFocus={() => (focusedField.current = "habTel")}
          onChange={(e) => commit("habTel", e.target.value)}
          onBlur={() => onBlurTexto("habTel")}
          onKeyDown={alPresionarTecla}
          placeholder="Hab / Tel"
        />
      </td>
      <td>
        <input
          className="celda"
          value={local.comentarios ?? ""}
          onFocus={() => (focusedField.current = "comentarios")}
          onChange={(e) => commit("comentarios", e.target.value)}
          onBlur={() => onBlurTexto("comentarios")}
          onKeyDown={alPresionarTecla}
          placeholder="Comentarios"
        />
      </td>
      <td className="text-center">
        <input
          type="checkbox"
          className="h-[18px] w-[18px] cursor-pointer"
          checked={local.asistio}
          onKeyDown={alPresionarTecla}
          onChange={(e) => {
            commit("asistio", e.target.checked);
            enviar({ asistio: e.target.checked });
          }}
        />
      </td>
      <td className="w-6 text-center">
        <button
          title="Quitar fila"
          className="text-tinta-suave opacity-40 hover:text-ocupada hover:opacity-100"
          onClick={async () => {
            if (!(await confirmar("¿Seguro que querés quitar esta fila?"))) return;
            borrarReserva(reserva.id).catch(() => {});
          }}
        >
          ×
        </button>
      </td>
    </tr>
  );
}

interface MesaSelectorProps {
  mesas: Mesa[];
  seleccionadas: number[];
  bloqueada: boolean;
  pax: number | null;
  ocupadasPorOtros: Set<number>;
  onCambiar: (ids: number[]) => void;
}

// Selector de mesas de una reserva: antes era un <select> de una sola
// opcion, ahora una reserva puede ocupar varias mesas (grupos grandes), asi
// que el trigger muestra los codigos elegidos como chips ("11, 12") y abre
// un popover con un checkbox por mesa. Si la capacidad sumada de lo elegido
// no alcanza para los pax cargados, se ve un aviso (⚠, en rojo) sin
// bloquear la carga — es solo una ayuda visual para el mozo/host.
function MesaSelector({ mesas, seleccionadas, bloqueada, pax, ocupadasPorOtros, onCambiar }: MesaSelectorProps) {
  const [abierto, setAbierto] = useState(false);
  const [estilo, setEstilo] = useState<React.CSSProperties | null>(null);
  const botonRef = useRef<HTMLButtonElement>(null);

  // Dos filtros sobre las opciones a mostrar:
  // 1) Una base ya dividida al toque (ver MesasPanel.tsx) queda en 0 pax
  //    propios: no tiene sentido ofrecerla, toda su capacidad pasó a sus
  //    dos mitades. Mismo filtro que usaba el <select> anterior.
  // 2) Una mesa ya asignada a OTRA reserva de este turno tampoco se
  //    ofrece: evita elegir por error una mesa que ya está ocupada por
  //    otro grupo. La propia mesa de ESTA fila nunca cae acá (ver cómo se
  //    calcula ocupadasPorOtros en ReservaRow), así que se sigue viendo.
  const mesasUsables = mesas.filter(
    (m) => !(m.mesaPadreId === null && m.capacidad === 0) && !ocupadasPorOtros.has(m.id),
  );
  const seleccionadasSet = new Set(seleccionadas);
  const elegidas = mesasUsables.filter((m) => seleccionadasSet.has(m.id));
  const codigos = elegidas.map((m) => m.codigo);
  const capacidadTotal = elegidas.reduce((acc, m) => acc + m.capacidad, 0);
  const capacidadInsuficiente = pax !== null && elegidas.length > 0 && capacidadTotal < pax;

  const tituloBase = codigos.length > 0 ? `Mesas: ${codigos.join(", ")}` : "Elegir mesa(s)";
  const titulo = bloqueada
    ? "Mesa bloqueada: destildá \"Pidió mesa\" para poder cambiarla"
    : capacidadInsuficiente
      ? `${tituloBase} — capacidad ${capacidadTotal}p, no alcanza para ${pax} pax`
      : tituloBase;

  function toggle(id: number) {
    const nuevas = seleccionadasSet.has(id)
      ? seleccionadas.filter((x) => x !== id)
      : [...seleccionadas, id];
    onCambiar(nuevas);
  }

  // Al abrir, medimos dónde está el botón en la pantalla (no en la tabla) y
  // decidimos si el popover entra hacia abajo o si conviene abrirlo hacia
  // arriba — así una fila cerca del borde inferior (típicamente la última)
  // no queda con las opciones recortadas/invisibles. position:fixed hace
  // que el popover no dependa del contenedor con scroll de la tabla.
  function alTocarBoton() {
    if (abierto) {
      setAbierto(false);
      return;
    }
    const rect = botonRef.current?.getBoundingClientRect();
    if (rect) {
      const ALTO_ESTIMADO = 230; // ~ max-h-56 (224px) + margen
      const espacioAbajo = window.innerHeight - rect.bottom;
      const hayEspacioAbajo = espacioAbajo >= ALTO_ESTIMADO || espacioAbajo >= rect.top;
      setEstilo(
        hayEspacioAbajo
          ? { top: rect.bottom + 4, left: rect.left }
          : { bottom: window.innerHeight - rect.top + 4, left: rect.left },
      );
    }
    setAbierto(true);
  }

  return (
    <div className="relative">
      <button
        ref={botonRef}
        type="button"
        disabled={bloqueada}
        title={titulo}
        onClick={alTocarBoton}
        onKeyDown={alPresionarTecla}
        className={`selector-mesas celda flex w-full items-center justify-between gap-1 text-left disabled:cursor-not-allowed disabled:opacity-60 ${
          bloqueada ? "anillo-pedida" : ""
        } ${capacidadInsuficiente ? "text-ocupada" : ""}`}
      >
        <span className="truncate">{codigos.length > 0 ? codigos.join(", ") : "—"}</span>
        {capacidadInsuficiente && <span aria-hidden="true">⚠</span>}
      </button>

      {abierto && (
        <>
          {/* Backdrop invisible: cerrar el popover tocando afuera. */}
          <button
            type="button"
            aria-label="Cerrar"
            className="fixed inset-0 z-40 cursor-default"
            onClick={() => setAbierto(false)}
          />
          <div
            className="fixed z-50 max-h-56 w-36 overflow-auto rounded-lg border border-borde bg-superficie p-1 text-left shadow-lg"
            style={estilo ?? undefined}
          >
            {mesasUsables.map((m) => (
              <label
                key={m.id}
                className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-arena-suave"
              >
                <input
                  type="checkbox"
                  className="h-4 w-4 cursor-pointer"
                  checked={seleccionadasSet.has(m.id)}
                  onChange={() => toggle(m.id)}
                />
                {m.codigo}
              </label>
            ))}
            {seleccionadas.length > 0 && (
              <button
                type="button"
                onClick={() => onCambiar([])}
                className="mt-0.5 block w-full rounded-md px-2 py-1 text-left text-xs text-tinta-suave hover:bg-arena-suave hover:text-ocupada"
              >
                Limpiar
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}