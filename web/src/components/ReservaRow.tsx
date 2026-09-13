"use client";

import { useEffect, useRef, useState } from "react";
import { patchReserva, borrarReserva } from "@/lib/api";
import type { Mesa, Reserva } from "@/lib/types";
import { TOLERANCIA_MINUTOS, excedioTolerancia } from "@/lib/tolerancia";
import { useConfirm } from "./ConfirmProvider";

interface Props {
  reserva: Reserva;
  mesas: Mesa[];
  reservas: Reserva[];
  mesasWalkIn: number[];
  impar: boolean;
  // Reloj compartido de ShiftSection (se actualiza solo cada tanto): así
  // las 26 filas de un turno recalculan el aviso de tolerancia todas juntas
  // en vez de tener cada una su propio setInterval.
  ahora: Date;
}

// Selector compartido de "celdas" de la grilla: inputs/checkboxes y el
// selector de mesas (que no es un <select> nativo, por eso se suma a mano
// via la clase "selector-mesas"). El resto de los botones de una fila
// (quitar fila, checkboxes del popover de mesas) a proposito NO entran en
// este recorrido — ni el de Enter ni el de las flechas.
function elementosFocables(contenedor: ParentNode): HTMLElement[] {
  return Array.from(
    contenedor.querySelectorAll<HTMLElement>(
      "input:not(:disabled), select:not(:disabled), button.selector-mesas:not(:disabled)",
    ),
  );
}

// Enter avanza al siguiente campo de la grilla (ademas de Tab, que ya
// funciona solo con el orden nativo del navegador) — recorre los inputs
// enfocables de la MISMA tabla en el orden en que aparecen en el HTML, asi
// que tambien salta de una fila a la siguiente sin codificar a mano
// "despues de Hora viene Mesa". Mover el foco ya dispara el onBlur del
// campo que se deja, que es lo que efectivamente guarda el valor.
function enfocarSiguienteCampo(actual: HTMLElement) {
  const tabla = actual.closest("table");
  if (!tabla) return;
  const focables = elementosFocables(tabla);
  const indice = focables.indexOf(actual);
  if (indice === -1) return;
  focables[indice + 1]?.focus();
}

// ¿El cursor de texto esta en la punta que corresponde (para no robarle
// Izquierda/Derecha a alguien que todavia esta editando el texto de la
// celda)? Los inputs sin edicion de texto real (checkboxes, el boton de
// mesas, el numerico de Pax — que en Chrome/Firefox ni siquiera soporta
// selectionStart) siempre cuentan como "en la punta", asi que ahi
// Izquierda/Derecha cambian de celda directamente.
function estaElCursorEnLaPunta(el: HTMLElement, hacia: "izquierda" | "derecha"): boolean {
  if (!(el instanceof HTMLInputElement)) return true;
  const tiposConCursor = new Set(["text", "search", "tel", "url", "password"]);
  if (!tiposConCursor.has(el.type)) return true;
  const { selectionStart, selectionEnd, value } = el;
  if (selectionStart === null || selectionEnd === null) return true;
  return hacia === "izquierda"
    ? selectionStart === 0 && selectionEnd === 0
    : selectionStart === value.length && selectionEnd === value.length;
}

// Navegacion de grilla tipo Excel/Google Sheets: Arriba/Abajo van a la
// misma columna de la fila anterior/siguiente (y siempre pisan el flechin
// nativo de +/- del input numerico de Pax, que aca no tiene sentido —
// tambien lo pisamos en los bordes de la tabla aunque no haya adonde ir,
// para que nunca alcance a sumar/restar). Izquierda/Derecha van al campo
// anterior/siguiente DENTRO de la misma fila, pero solo si el cursor de
// texto ya esta en la punta correspondiente — si no, primero mueve el
// cursor dentro del texto, como es normal.
function alPresionarFlecha(e: React.KeyboardEvent<HTMLElement>) {
  const tecla = e.key;
  if (tecla !== "ArrowUp" && tecla !== "ArrowDown" && tecla !== "ArrowLeft" && tecla !== "ArrowRight") {
    return;
  }

  const actual = e.currentTarget;
  const fila = actual.closest("tr");
  if (!fila) return;

  if (tecla === "ArrowUp" || tecla === "ArrowDown") {
    e.preventDefault();
    const tabla = actual.closest("table");
    if (!tabla) return;
    const columna = elementosFocables(fila).indexOf(actual);
    if (columna === -1) return;
    const filas = Array.from(tabla.querySelectorAll<HTMLTableRowElement>("tbody tr"));
    const indiceFila = filas.indexOf(fila);
    if (indiceFila === -1) return;
    const filaDestino = filas[tecla === "ArrowUp" ? indiceFila - 1 : indiceFila + 1];
    if (!filaDestino) return;
    const camposDestino = elementosFocables(filaDestino);
    camposDestino[Math.min(columna, camposDestino.length - 1)]?.focus();
    return;
  }

  if (!estaElCursorEnLaPunta(actual, tecla === "ArrowLeft" ? "izquierda" : "derecha")) return;
  const campos = elementosFocables(fila);
  const indice = campos.indexOf(actual);
  if (indice === -1) return;
  const siguiente = campos[tecla === "ArrowLeft" ? indice - 1 : indice + 1];
  if (!siguiente) return;
  e.preventDefault();
  siguiente.focus();
}

function alPresionarTecla(e: React.KeyboardEvent<HTMLElement>) {
  if (e.key === "Enter") {
    e.preventDefault();
    enfocarSiguienteCampo(e.currentTarget);
    return;
  }
  alPresionarFlecha(e);
}

export default function ReservaRow({ reserva, mesas, reservas, mesasWalkIn, impar, ahora }: Props) {
  const { confirmar } = useConfirm();
  const [local, setLocal] = useState(reserva);
  const focusedField = useRef<string | null>(null);

  // Mesas que no tiene sentido ofrecer en el selector de esta fila, porque
  // ya estan tomadas por otro lado: asignadas a OTRA reserva de este mismo
  // turno que todavia no se retiro (se excluye la propia reserva del
  // calculo, para no bloquearse a si misma las mesas que ya tiene
  // elegidas; una reserva retirada tampoco cuenta — su mesa ya esta libre,
  // ver types.ts), o marcadas como ocupadas por un walk-in (mesasWalkIn —
  // no son una reserva, pero la mesa esta igual de tomada: ver el
  // comentario de mesasWalkIn en types.ts).
  const ocupadasPorOtros = new Set([
    ...reservas.filter((r) => r.id !== reserva.id && !r.retirada).flatMap((r) => r.mesaIds),
    ...mesasWalkIn,
  ]);

  const enTolerancia = excedioTolerancia(local, ahora);

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

  // Filas intercaladas (zebra striping): --color-fila-zebra (mas marcado
  // que el gris genérico --color-arena-suave que se usa en hovers de
  // botones — ver globals.css) para que se distingan a simple vista sin
  // depender del hover. Prioridad de colores (la primera condicion que se
  // cumple gana): "Asistio" (verde lima, --color-fila-asistio) > "Retirada"
  // (atenuada) > tolerancia vencida (ambar, todavia no llego) > intercalado
  // por defecto. Asistio queda por encima de Retirada a proposito: una vez
  // que se tildo que vino, el verde queda para siempre como registro de que
  // esa reserva se cumplio, aunque despues se tilde "Se fue" — la mesa se
  // libera igual para un walk-in (ver DiaService), eso no depende del color.
  const filaClase = local.asistio
    ? "bg-fila-asistio"
    : local.retirada
      ? "opacity-60"
      : enTolerancia
        ? "bg-aviso-suave"
        : impar
          ? "bg-fila-zebra hover:bg-fila-zebra-hover"
          : "hover:bg-fila-zebra-hover";

  return (
    <tr className={filaClase}>
      <td className="w-16">
        <div className="relative">
          <input
            className="celda"
            value={local.hora ?? ""}
            onFocus={() => (focusedField.current = "hora")}
            onChange={(e) => commit("hora", e.target.value)}
            onBlur={() => onBlurTexto("hora")}
            onKeyDown={alPresionarTecla}
            placeholder="hh:mm"
          />
          {enTolerancia && (
            <button
              type="button"
              onClick={() => onCambiarMesas([])}
              title={`Pasaron ${TOLERANCIA_MINUTOS}+ minutos de la hora reservada y todavía no llegó. Cambiá el horario si se corrió, o tocá acá para liberar su mesa y ofrecérsela a otra reserva o a un walk-in.`}
              className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-aviso text-[9px] leading-none text-white shadow"
            >
              ⏰
            </button>
          )}
        </div>
      </td>
      <td className="w-24">
        <MesaSelector
          mesas={mesas}
          seleccionadas={local.mesaIds}
          bloqueada={local.pidioMesa}
          retirada={local.retirada}
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
      <td className="w-14 text-center">
        <input
          type="checkbox"
          className="h-[18px] w-[18px] cursor-pointer"
          checked={local.retirada}
          title={
            'Tildar cuando la reserva ya vino, comió y se fue: libera su mesa para un walk-in u otra reserva, sin borrar en qué mesa estuvo sentada (independiente de "Asistió")'
          }
          onKeyDown={alPresionarTecla}
          onChange={(e) => {
            commit("retirada", e.target.checked);
            enviar({ retirada: e.target.checked });
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
  // Reserva ya marcada "Se fue" (ver ReservaRow.tsx): las mesas elegidas se
  // siguen mostrando (historial de dónde estuvo sentada), pero atenuadas y
  // sin poder reasignarlas hasta destildar "Se fue" — mismo criterio que
  // "bloqueada" pero con su propio mensaje, para no confundir motivos.
  retirada: boolean;
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
function MesaSelector({ mesas, seleccionadas, bloqueada, retirada, pax, ocupadasPorOtros, onCambiar }: MesaSelectorProps) {
  const [abierto, setAbierto] = useState(false);
  const [estilo, setEstilo] = useState<React.CSSProperties | null>(null);
  const botonRef = useRef<HTMLButtonElement>(null);
  const deshabilitada = bloqueada || retirada;

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
  const titulo = retirada
    ? `${tituloBase} — reserva retirada, mesa liberada: destildá "Se fue" para poder reasignarla`
    : bloqueada
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
        disabled={deshabilitada}
        title={titulo}
        onClick={alTocarBoton}
        onKeyDown={alPresionarTecla}
        className={`selector-mesas celda flex w-full items-center justify-between gap-1 text-left disabled:cursor-not-allowed disabled:opacity-60 ${
          bloqueada ? "anillo-pedida" : ""
        } ${capacidadInsuficiente ? "text-ocupada" : ""}`}
      >
        <span className={`truncate ${retirada ? "line-through" : ""}`}>
          {codigos.length > 0 ? codigos.join(", ") : "—"}
        </span>
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
            className="fixed z-50 flex max-h-56 w-36 flex-col overflow-hidden rounded-lg border border-borde bg-superficie text-left shadow-lg"
            style={estilo ?? undefined}
          >
            {/* "Limpiar" fijo arriba de todo (fuera del área con scroll de
                abajo): si se eligieron muchas mesas y la lista quedó larga,
                sigue estando a la vista sin tener que scrollear hasta el
                final para encontrarlo. Se muestra siempre (no solo cuando
                hay algo elegido) para que no "aparezca y desaparezca" y sea
                facil de encontrar — si no hay nada elegido, queda
                deshabilitado en vez de ocultarse.
            */}
            <button
              type="button"
              disabled={seleccionadas.length === 0}
              onClick={() => onCambiar([])}
              className="block w-full shrink-0 border-b border-borde px-2 py-1.5 text-left text-xs font-medium text-tinta-suave hover:bg-arena-suave hover:text-ocupada disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-tinta-suave"
            >
              Limpiar selección
            </button>
            <div className="min-h-0 overflow-auto p-1">
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
            </div>
          </div>
        </>
      )}
    </div>
  );
}