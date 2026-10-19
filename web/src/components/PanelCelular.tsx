"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ApiError, crearReserva, patchEspera, patchReserva, toggleWalkIn, vaciarReserva } from "@/lib/api";
import { addDays, partesFecha, textoRelativo, todayISO } from "@/lib/date";
import { excedioTolerancia } from "@/lib/tolerancia";
import type { Dia, Espera, Mesa, Reserva, Salon, Turno, TurnoData } from "@/lib/types";
import { linkWhatsApp, numeroWhatsApp } from "@/lib/whatsapp";
import { EVENTO_VISTA, EVENTO_VISTA_ACTUAL } from "./BarraLateral";
import { useConfirm } from "./ConfirmProvider";
import SolicitudesTurno from "./SolicitudesTurno";

// Panel de reservas en el celular (opción A del mockup capax-panel-celular,
// con los salones en pestañas y el turno en su fila — capax-salon-turno-
// celular opción 3 y capax-turno-celular opción 6). Mismos datos y mismas
// llamadas que la versión de la compu (app/page.tsx le pasa el día, la
// espera y los conteos por salón); solo cambia la forma: reservas en
// tarjetas agrupadas por hora, la pestaña «Mesas» con las mesas grandes, las
// reservas sin mesa y la lista de espera, y todo lo que se edita en hojas
// que suben desde abajo. La barra de abajo (Reservas, Web, Mesas, Mapa, Más)
// la pone BarraLateral en pantallas chicas.

interface Props {
  fecha: string;
  onFecha: (f: string) => void;
  turno: Turno;
  onTurno: (t: Turno) => void;
  salones: Salon[];
  salonId: number;
  onSalon: (id: number) => void;
  dia: Dia;
  espera: Espera[];
  onEspera: (lista: Espera[]) => void;
  onTurnoData: (data: TurnoData) => void;
  conteos: Record<number, { almuerzo: number; cena: number; merienda: number }>;
  // El anillo rojo que gira (boton-salon-aviso, igual que en la compu): otros
  // salones con reservas en este turno, y Merienda si tiene reservas.
  salonesConAviso: Set<number>;
  turnosConAviso: Set<Turno>;
}

type Vista = "res" | "mesas";
type Hoja =
  | { tipo: "detalle"; id: number }
  | { tipo: "mesa"; id: number; volver: boolean }
  | { tipo: "nueva" }
  | { tipo: "mesaLibre"; mesaId: number }
  | null;
type Modo = { tipo: "reserva"; id: number; nombre: string } | { tipo: "espera"; id: number; nombre: string } | null;

const NOMBRE_TURNO: Record<Turno, string> = { almuerzo: "Almuerzo", merienda: "Merienda", cena: "Cena" };
const DIA_CORTO = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const MES_CORTO = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

// Una fila "vacía" de la planilla (sembrada con el horario) no es una reserva.
function tieneDatos(r: Reserva) {
  return r.mesaIds.length > 0 || r.pax !== null || !!r.nombre?.trim() || !!r.habTel?.trim() || !!r.comentarios?.trim() || r.asistio || r.retirada;
}

function fechaCorta(f: string) {
  const [y, m, d] = f.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return `${DIA_CORTO[dt.getDay()]} ${d} ${MES_CORTO[m - 1]}`;
}

// ---------- íconos
const ic = (d: React.ReactNode, s = 18, sw = 2) => (
  <svg viewBox="0 0 24 24" width={s} height={s} fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {d}
  </svg>
);
const IcIzq = () => ic(<path d="M15 6l-6 6 6 6" />);
const IcDer = () => ic(<path d="M9 6l6 6-6 6" />);
const IcCal = () => ic(<><rect x="3" y="5" width="18" height="16" rx="2.5" /><path d="M3 10h18M8 3v4M16 3v4" /></>);
const IcSol = () => ic(<><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>, 16);
const IcLuna = () => ic(<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />, 16);
const IcTaza = () => ic(<><path d="M4 8h12v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z" /><path d="M16 9h2a3 3 0 0 1 0 6h-2M7 3v2M11 3v2" /></>, 16);
const IcTel = () => ic(<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" />, 13);
const IcCom = () => ic(<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />, 13);
const IcReloj = () => ic(<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>, 13);
const IcOk = () => ic(<path d="M5 12.5l4.5 4.5L19 7.5" />, 18, 3);
const IcMas = () => ic(<path d="M12 5v14M5 12h14" />, 24, 2.6);
const ICONO_TURNO: Record<Turno, () => React.ReactNode> = { almuerzo: IcSol, merienda: IcTaza, cena: IcLuna };

export default function PanelCelular(props: Props) {
  const { fecha, onFecha, turno, onTurno, salones, salonId, onSalon, dia, espera, onEspera, onTurnoData, conteos, salonesConAviso, turnosConAviso } = props;
  const { confirmar } = useConfirm();
  const [vista, setVista] = useState<Vista>("res");
  const [hoja, setHoja] = useState<Hoja>(null);
  const [modo, setModo] = useState<Modo>(null);
  const [toast, setToast] = useState<{ texto: string; n: number } | null>(null);
  const [ahora, setAhora] = useState(() => new Date());
  const inputFecha = useRef<HTMLInputElement>(null);

  const salon = salones.find((s) => s.id === salonId);
  const turnos: Turno[] = salon?.permiteMerienda ? ["almuerzo", "merienda", "cena"] : ["almuerzo", "cena"];
  const data: TurnoData | null = turno === "almuerzo" ? dia.almuerzo : turno === "merienda" ? dia.merienda : dia.cena;

  const aviso = useCallback((texto: string) => setToast((t) => ({ texto, n: (t?.n ?? 0) + 1 })), []);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(id);
  }, [toast]);
  const fallo = useCallback((e: unknown, porDefecto: string) => aviso(e instanceof ApiError ? e.message : porDefecto), [aviso]);

  useEffect(() => {
    const id = setInterval(() => setAhora(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  // La barra de abajo cambia entre Reservas y Mesas (ver BarraLateral).
  useEffect(() => {
    const alPedir = (e: Event) => {
      const v = (e as CustomEvent<Vista>).detail;
      if (v === "res" || v === "mesas") setVista(v);
    };
    window.addEventListener(EVENTO_VISTA, alPedir);
    const v = new URLSearchParams(window.location.search).get("vista");
    if (v === "mesas") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setVista("mesas");
      window.history.replaceState(null, "", "/");
    }
    return () => window.removeEventListener(EVENTO_VISTA, alPedir);
  }, []);
  useEffect(() => {
    window.dispatchEvent(new CustomEvent(EVENTO_VISTA_ACTUAL, { detail: vista }));
  }, [vista]);

  // Al cambiar de día, turno o salón se cierra lo abierto.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHoja(null);
    setModo(null);
  }, [fecha, turno, salonId]);

  const reservas = useMemo(
    () =>
      (data?.reservas ?? [])
        .filter(tieneDatos)
        .sort((a, b) => (a.hora ?? "99").localeCompare(b.hora ?? "99") || a.orden - b.orden),
    [data],
  );
  const mesas = useMemo(
    () =>
      (data?.mesas ?? [])
        .filter((m) => m.capacidad > 0 && !m.reducida)
        .sort((a, b) => a.codigo.localeCompare(b.codigo, undefined, { numeric: true, sensitivity: "base" })),
    [data],
  );
  const ocupadas = useMemo(() => new Set([...(data?.mesasOcupadas ?? []), ...(data?.mesasWalkIn ?? [])]), [data]);
  const walkIns = useMemo(() => new Set(data?.mesasWalkIn ?? []), [data]);
  const sentados = useMemo(
    () => new Set(reservas.filter((r) => r.asistio && !r.retirada).flatMap((r) => r.mesaIds)),
    [reservas],
  );
  const horas = useMemo(() => [...new Set((data?.reservas ?? []).map((r) => r.hora).filter((h): h is string => !!h))].sort(), [data]);
  const activas = reservas.filter((r) => !r.retirada);
  const sinMesa = activas.filter((r) => r.mesaIds.length === 0 && (r.pax ?? 0) > 0);
  const libres = mesas.filter((m) => !ocupadas.has(m.id));
  const tarde = reservas.filter((r) => excedioTolerancia(r, ahora)).length;
  const esperando = espera.filter((e) => !e.ubicada);

  // ---------- llamadas
  async function patch(r: Reserva, payload: Parameters<typeof patchReserva>[1], ok?: string) {
    try {
      onTurnoData(await patchReserva(r.id, payload));
      if (ok) aviso(ok);
    } catch (e) {
      fallo(e, "No se pudo guardar");
    }
  }

  async function ponerMesa(r: Reserva, mesa: Mesa | null) {
    await patch(r, { mesaIds: mesa ? [mesa.id] : [] }, mesa ? `Mesa ${mesa.codigo} para ${r.nombre ?? r.habTel ?? "la reserva"}` : "Sin mesa");
  }

  async function nueva(hora: string, pax: number, nombre: string, habTel: string) {
    if (!data) return;
    try {
      let actual: TurnoData = data;
      let fila = actual.reservas.find((r) => r.hora === hora && !tieneDatos(r));
      if (!fila) {
        actual = await crearReserva(fecha, turno, salonId, hora);
        fila = actual.reservas.filter((r) => r.hora === hora && !tieneDatos(r)).at(-1);
      }
      if (!fila) throw new Error();
      onTurnoData(await patchReserva(fila.id, { pax, nombre, ...(habTel ? { habTel } : {}) }));
      setHoja(null);
      aviso(`Reserva de ${nombre} a las ${hora}`);
    } catch (e) {
      fallo(e, "No se pudo cargar la reserva");
    }
  }

  async function borrar(r: Reserva) {
    if (!(await confirmar(`¿Borrar la reserva de ${r.nombre ?? r.habTel ?? "esta fila"}?`, { textoConfirmar: "Borrar" }))) return;
    try {
      await vaciarReserva(r.id);
      // El panel recibe el turno actualizado por SignalR; mientras tanto se
      // saca de la vista.
      if (data) onTurnoData({ ...data, reservas: data.reservas.map((x) => (x.id === r.id ? { ...x, pax: null, nombre: null, habTel: null, comentarios: null, mesaIds: [], mesaCodigos: [], asistio: false, retirada: false } : x)) });
      setHoja(null);
      aviso("Reserva borrada");
    } catch (e) {
      fallo(e, "No se pudo borrar");
    }
  }

  async function walkIn(mesa: Mesa) {
    try {
      onTurnoData(await toggleWalkIn(fecha, turno, mesa.id));
      aviso(walkIns.has(mesa.id) ? `Mesa ${mesa.codigo} libre` : `Mesa ${mesa.codigo}: walk-in`);
      setHoja(null);
    } catch (e) {
      fallo(e, "No se pudo marcar la mesa");
    }
  }

  async function tocarMesa(mesa: Mesa) {
    const libre = !ocupadas.has(mesa.id);
    if (modo) {
      if (!libre) return;
      const m = modo;
      setModo(null);
      if (m.tipo === "reserva") {
        const r = reservas.find((x) => x.id === m.id);
        if (r) await ponerMesa(r, mesa);
      } else {
        try {
          onTurnoData(await toggleWalkIn(fecha, turno, mesa.id));
          onEspera(await patchEspera(m.id, { ubicada: true }));
          aviso(`${m.nombre} sentado en la mesa ${mesa.codigo}`);
        } catch (e) {
          fallo(e, "No se pudo sentar");
        }
      }
      return;
    }
    if (walkIns.has(mesa.id)) return walkIn(mesa);
    const r = reservas.find((x) => !x.retirada && x.mesaIds.includes(mesa.id));
    if (r) setHoja({ tipo: "detalle", id: r.id });
    else setHoja({ tipo: "mesaLibre", mesaId: mesa.id });
  }

  // ---------- partes
  const p = partesFecha(fecha);
  const rel = textoRelativo(fecha, todayISO());

  const cabecera = (
    <header className="pc-cab">
      <div className="pc-fecha">
        <button type="button" className="pc-ib" onClick={() => onFecha(addDays(fecha, -1))} aria-label="Día anterior">
          <IcIzq />
        </button>
        <div className="pc-ft">
          <b>{fechaCorta(fecha)}</b>
          <span>{rel ? <em className="rel">{rel}</em> : <em>Hoy</em>}</span>
        </div>
        <button type="button" className="pc-ib" onClick={() => onFecha(addDays(fecha, 1))} aria-label="Día siguiente">
          <IcDer />
        </button>
        <button type="button" className="pc-ib pc-cal" onClick={() => inputFecha.current?.showPicker?.()} aria-label={`Elegir fecha (${p.diaSemana} ${p.dia})`}>
          <IcCal />
        </button>
        <input ref={inputFecha} type="date" className="pc-oculto" value={fecha} onChange={(e) => e.target.value && onFecha(e.target.value)} tabIndex={-1} aria-hidden="true" />
      </div>
      <div className="pc-turnos" style={{ gridTemplateColumns: `repeat(${turnos.length}, 1fr)` }}>
        {turnos.map((t) => {
          const Ic = ICONO_TURNO[t];
          return (
            <button
              key={t}
              type="button"
              className={`${t === turno ? "on" : ""} ${turnosConAviso.has(t) ? "boton-salon-aviso" : ""}`}
              aria-pressed={t === turno}
              title={turnosConAviso.has(t) ? `Hay reservas en ${NOMBRE_TURNO[t]}` : undefined}
              onClick={() => onTurno(t)}
            >
              <Ic />
              {NOMBRE_TURNO[t]}
            </button>
          );
        })}
      </div>
      <div className="pc-tabs" role="tablist" aria-label="Salón">
        {salones.map((s) => {
          // El salón que se mira cuenta en vivo; los otros, con el resumen del día.
          const n = s.id === salonId ? reservas.length : (conteos[s.id]?.[turno] ?? 0);
          return (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={s.id === salonId}
              className={`${s.id === salonId ? "on" : ""} ${salonesConAviso.has(s.id) ? "boton-salon-aviso" : ""}`}
              title={salonesConAviso.has(s.id) ? `Hay reservas en ${s.nombre}` : undefined}
              onClick={() => onSalon(s.id)}
            >
              {s.nombre}
              <i>{n}</i>
            </button>
          );
        })}
      </div>
    </header>
  );

  const resumen = (
    <div className="pc-stats">
      <span>
        <b>{reservas.length}</b> {reservas.length === 1 ? "reserva" : "reservas"}
      </span>
      <span>
        <b>{activas.reduce((a, r) => a + (r.pax ?? 0), 0)}</b> pax
      </span>
      <span>
        <b>{libres.length}</b> libres
      </span>
      {sinMesa.length > 0 && (
        <span className="sm">
          <b>{sinMesa.length}</b> sin mesa
        </span>
      )}
    </div>
  );

  function tarjetas() {
    if (!data) return <div className="pc-vacio">Este salón no tiene {NOMBRE_TURNO[turno].toLowerCase()}.</div>;
    const out: React.ReactNode[] = [];
    let prev: string | null | undefined;
    for (const r of reservas) {
      if (r.hora !== prev) {
        out.push(
          <div key={`h-${r.hora}`} className="pc-hora">
            <b>{r.hora ?? "Sin hora"}</b>
            <i />
          </div>,
        );
        prev = r.hora;
      }
      const esTarde = excedioTolerancia(r, ahora);
      const clase = r.retirada ? "fue" : r.asistio ? "llego" : esTarde ? "tarde" : "";
      out.push(
        <article key={r.id} className={`pc-tj ${clase}`} onClick={() => setHoja({ tipo: "detalle", id: r.id })}>
          <div className="pc-tj-c">
            <div className="pc-tj-t">
              <b>{r.nombre?.trim() || r.habTel?.trim() || "Sin nombre"}</b>
              {r.origen === "web" && <span className="pc-tag">web</span>}
              {r.estado === "pendienteBot" && <span className="pc-tag am">a confirmar</span>}
              {r.retirada && <span className="pc-tag am">se fue</span>}
            </div>
            <div className="pc-tj-d">
              <span className="pc-pax">{r.pax ?? "—"} pax</span>
              <button
                type="button"
                className={`pc-mesa ${r.mesaIds.length ? "" : "vacia"}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setHoja({ tipo: "mesa", id: r.id, volver: false });
                }}
              >
                {r.mesaIds.length ? `Mesa ${r.mesaCodigos.join(" + ")}` : "+ Mesa"}
              </button>
              {esTarde && (
                <span className="pc-tag am">
                  <IcReloj /> tarde
                </span>
              )}
            </div>
            {r.habTel?.trim() && r.nombre?.trim() && (
              <span className="pc-dato">
                <IcTel />
                {r.habTel}
              </span>
            )}
            {r.comentarios?.trim() && (
              <span className="pc-dato com">
                <IcCom />
                {r.comentarios}
              </span>
            )}
          </div>
          <button
            type="button"
            className={`pc-chk ${r.asistio ? "on" : ""}`}
            aria-label={r.asistio ? "Desmarcar asistió" : "Marcar asistió"}
            aria-pressed={r.asistio}
            onClick={(e) => {
              e.stopPropagation();
              patch(r, { asistio: !r.asistio });
            }}
          >
            <IcOk />
          </button>
        </article>,
      );
    }
    if (reservas.length === 0) out.push(<div key="vacio" className="pc-vacio">Sin reservas para este turno.</div>);
    out.push(
      <button key="agregar" type="button" className="pc-agregar" onClick={() => setHoja({ tipo: "nueva" })}>
        + Agregar reserva
      </button>,
    );
    return out;
  }

  function vistaMesas() {
    return (
      <>
        {modo && (
          <div className="pc-modo">
            <span>
              Tocá una mesa libre para <b>{modo.nombre}</b>
            </span>
            <button type="button" onClick={() => setModo(null)}>
              Cancelar
            </button>
          </div>
        )}
        <div className="pc-sub">
          <b>Mesas · {NOMBRE_TURNO[turno]}</b>
          <span>
            {libres.length} libres de {mesas.length} · {libres.reduce((a, m) => a + m.capacidad, 0)} lugares
          </span>
        </div>
        <div className="pc-mgrid">
          {mesas.map((m) => {
            const libre = !ocupadas.has(m.id);
            const cls = walkIns.has(m.id) ? "walk" : sentados.has(m.id) ? "ok" : !libre ? "res" : "";
            return (
              <button key={m.id} type="button" className={`pc-m ${cls} ${modo && libre ? "elegible" : ""}`} disabled={!!modo && !libre} onClick={() => tocarMesa(m)}>
                {m.codigo}
                <small>{m.capacidad}p</small>
              </button>
            );
          })}
        </div>
        <div className="pc-ley">
          <span><i className="l" />Libre</span>
          <span><i className="r" />Reservada</span>
          <span><i className="o" />Sentados</span>
          <span><i className="w" />Walk-in</span>
        </div>
        {sinMesa.length > 0 && (
          <div className="pc-sinmesa">
            <b>{sinMesa.length === 1 ? "1 reserva sin mesa" : `${sinMesa.length} reservas sin mesa`}</b>
            {sinMesa.map((r) => (
              <div key={r.id} className="pc-fs">
                <span>
                  {r.hora} · {r.nombre ?? r.habTel} · {r.pax} pax
                </span>
                <button type="button" className="pc-bv" onClick={() => setModo({ tipo: "reserva", id: r.id, nombre: r.nombre ?? r.habTel ?? "la reserva" })}>
                  Asignar
                </button>
              </div>
            ))}
            <small>Tocá «Asignar» y después una mesa libre.</small>
          </div>
        )}
        <div className="pc-sub">
          <b>Lista de espera</b>
          <span>{esperando.length}</span>
        </div>
        {esperando.length === 0 ? (
          <div className="pc-vacio chico">No hay nadie esperando.</div>
        ) : (
          esperando.map((e) => (
            <div key={e.id} className="pc-espera">
              <span>
                {e.nombre || e.habTel || "Sin nombre"} · {e.pax ?? "?"} pax
              </span>
              <button type="button" className="pc-bv" onClick={() => setModo({ tipo: "espera", id: e.id, nombre: e.nombre || e.habTel || "la espera" })}>
                Sentar
              </button>
            </div>
          ))
        )}
      </>
    );
  }

  const mesaLibre = hoja?.tipo === "mesaLibre" ? (mesas.find((x) => x.id === hoja.mesaId) ?? null) : null;
  async function darMesaLibre(r: Reserva, m: Mesa) {
    await ponerMesa(r, m);
    setHoja(null);
  }

  const enHoja = hoja && (hoja.tipo === "detalle" || hoja.tipo === "mesa") ? reservas.find((r) => r.id === hoja.id) ?? null : null;

  return (
    <div className="pc">
      {cabecera}
      <div className="pc-cuerpo">
        <SolicitudesTurno fecha={fecha} turno={turno} salonId={salonId} />
        {resumen}
        {vista === "res" && tarde > 0 && (
          <div className="pc-aviso">
            <IcReloj /> {tarde === 1 ? "1 reserva pasó" : `${tarde} reservas pasaron`} los 15 min de tolerancia
          </div>
        )}
        {vista === "res" ? tarjetas() : vistaMesas()}
      </div>
      {vista === "res" && data && (
        <button type="button" className="pc-fab" onClick={() => setHoja({ tipo: "nueva" })} aria-label="Nueva reserva">
          <IcMas />
        </button>
      )}

      {hoja && (
        <>
          <div className="pc-velo" onClick={() => setHoja(null)} />
          <div className="pc-hoja" role="dialog" aria-modal="true">
            <i className="pc-asa" />
            {hoja.tipo === "detalle" && enHoja && (
              <Detalle
                key={enHoja.id}
                r={enHoja}
                horas={horas}
                salon={salon?.nombre ?? ""}
                fecha={fecha}
                onPatch={(payload) => patch(enHoja, payload)}
                onMesa={() => setHoja({ tipo: "mesa", id: enHoja.id, volver: true })}
                onBorrar={() => borrar(enHoja)}
                onListo={() => setHoja(null)}
              />
            )}
            {hoja.tipo === "mesa" && enHoja && (
              <ElegirMesa
                r={enHoja}
                mesas={mesas}
                ocupadas={ocupadas}
                onElegir={async (m) => {
                  await ponerMesa(enHoja, m);
                  setHoja(hoja.volver ? { tipo: "detalle", id: enHoja.id } : null);
                }}
                onVolver={() => setHoja(hoja.volver ? { tipo: "detalle", id: enHoja.id } : null)}
                volver={hoja.volver}
              />
            )}
            {hoja.tipo === "nueva" && (
              <Nueva horas={horas} turno={turno} fecha={fecha} salon={salon?.nombre ?? ""} onGuardar={nueva} onCancelar={() => setHoja(null)} />
            )}
            {mesaLibre && (
              <>
                <div className="pc-h-t">
                  <b>Mesa {mesaLibre.codigo}</b>
                  <span className="pc-h-x">{mesaLibre.capacidad} lugares · libre</span>
                </div>
                {sinMesa.length > 0 && (
                  <div className="pc-campo">
                    <small>Dársela a una reserva sin mesa</small>
                    <div className="pc-lista">
                      {sinMesa.map((r) => (
                        <button key={r.id} type="button" onClick={() => darMesaLibre(r, mesaLibre)}>
                          {r.hora} · {r.nombre ?? r.habTel} · {r.pax} pax
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <div className="pc-acc">
                  <button type="button" onClick={() => walkIn(mesaLibre)}>
                    Marcar walk-in
                  </button>
                  <button type="button" onClick={() => setHoja(null)}>
                    Cerrar
                  </button>
                </div>
              </>
            )}
          </div>
        </>
      )}
      {toast && (
        <div className="pc-toast" role="status">
          {toast.texto}
        </div>
      )}
    </div>
  );
}

// ---------- hojas

function Detalle({
  r,
  horas,
  salon,
  fecha,
  onPatch,
  onMesa,
  onBorrar,
  onListo,
}: {
  r: Reserva;
  horas: string[];
  salon: string;
  fecha: string;
  onPatch: (p: Parameters<typeof patchReserva>[1]) => void;
  onMesa: () => void;
  onBorrar: () => void;
  onListo: () => void;
}) {
  const [nombre, setNombre] = useState(r.nombre ?? "");
  const [habTel, setHabTel] = useState(r.habTel ?? "");
  const [com, setCom] = useState(r.comentarios ?? "");
  const numero = numeroWhatsApp(r.habTel);
  const guardar = (campo: "nombre" | "habTel" | "comentarios", valor: string, antes: string | null) => {
    if (valor.trim() !== (antes ?? "").trim()) onPatch({ [campo]: valor.trim() });
  };
  return (
    <>
      <div className="pc-h-t">
        <b>{r.nombre?.trim() || r.habTel?.trim() || "Reserva"}</b>
        {r.origen === "web" && <span className="pc-tag">web</span>}
        <span className="pc-h-x">
          {r.hora ?? "Sin hora"} · {salon}
        </span>
      </div>
      <div className="pc-campos">
        <div className="pc-campo">
          <small>Pax</small>
          <div className="pc-cont">
            <button type="button" onClick={() => onPatch({ pax: Math.max(1, (r.pax ?? 1) - 1) })} aria-label="Una persona menos">
              −
            </button>
            <b>{r.pax ?? "—"}</b>
            <button type="button" onClick={() => onPatch({ pax: Math.min(99, (r.pax ?? 0) + 1) })} aria-label="Una persona más">
              +
            </button>
          </div>
        </div>
        <div className="pc-campo">
          <small>Mesa</small>
          <button type="button" className={`pc-sel ${r.mesaIds.length ? "" : "vacia"}`} onClick={onMesa}>
            {r.mesaIds.length ? r.mesaCodigos.join(" + ") : "Elegir mesa"}
          </button>
        </div>
      </div>
      <label className="pc-campo">
        <small>Hora</small>
        <select className="pc-inp" value={r.hora ?? ""} onChange={(e) => onPatch({ hora: e.target.value })}>
          {(r.hora && !horas.includes(r.hora) ? [r.hora, ...horas] : horas).map((h) => (
            <option key={h} value={h}>
              {h}
            </option>
          ))}
        </select>
      </label>
      <label className="pc-campo">
        <small>Apellido / nombre</small>
        <input className="pc-inp" value={nombre} onChange={(e) => setNombre(e.target.value)} onBlur={() => guardar("nombre", nombre, r.nombre)} />
      </label>
      <label className="pc-campo">
        <small>Hab / Tel</small>
        <input className="pc-inp" value={habTel} onChange={(e) => setHabTel(e.target.value)} onBlur={() => guardar("habTel", habTel, r.habTel)} inputMode="tel" />
      </label>
      <label className="pc-campo">
        <small>Comentarios</small>
        <input className="pc-inp" value={com} onChange={(e) => setCom(e.target.value)} onBlur={() => guardar("comentarios", com, r.comentarios)} placeholder="—" />
      </label>
      <div className="pc-tog">
        <button type="button" className={r.asistio ? "on" : ""} onClick={() => onPatch({ asistio: !r.asistio })}>
          ✓ Asistió
        </button>
        <button type="button" className={r.retirada ? "on" : ""} onClick={() => onPatch({ retirada: !r.retirada })}>
          Se fue
        </button>
        <button type="button" className={r.pidioMesa ? "on" : ""} onClick={() => onPatch({ pidioMesa: !r.pidioMesa })}>
          Pidió mesa
        </button>
      </div>
      <div className="pc-acc">
        {numero && (
          <a className="wa" href={linkWhatsApp(numero, r.nombre, fecha, r.hora)} target="_blank" rel="noreferrer">
            WhatsApp
          </a>
        )}
        <button type="button" className="del" onClick={onBorrar}>
          Borrar
        </button>
        <button type="button" className="pri" onClick={onListo}>
          Listo
        </button>
      </div>
    </>
  );
}

function ElegirMesa({
  r,
  mesas,
  ocupadas,
  onElegir,
  onVolver,
  volver,
}: {
  r: Reserva;
  mesas: Mesa[];
  ocupadas: Set<number>;
  onElegir: (m: Mesa | null) => void;
  onVolver: () => void;
  volver: boolean;
}) {
  return (
    <>
      <div className="pc-h-t">
        <b>Mesa para {r.nombre?.trim() || r.habTel?.trim() || "la reserva"}</b>
        <span className="pc-h-x">
          {r.pax ?? "?"} pax · {r.hora} · las ocupadas no se pueden elegir
        </span>
      </div>
      <div className="pc-mgrid">
        {mesas.map((m) => {
          const mia = r.mesaIds.includes(m.id);
          const libre = !ocupadas.has(m.id) || mia;
          return (
            <button key={m.id} type="button" className={`pc-m ${mia ? "res" : ""}`} disabled={!libre} onClick={() => onElegir(m)}>
              {m.codigo}
              <small>{m.capacidad}p</small>
            </button>
          );
        })}
      </div>
      <div className="pc-acc">
        {r.mesaIds.length > 0 && (
          <button type="button" onClick={() => onElegir(null)}>
            Quitar mesa
          </button>
        )}
        <button type="button" onClick={onVolver}>
          {volver ? "Volver" : "Cancelar"}
        </button>
      </div>
    </>
  );
}

function Nueva({
  horas,
  turno,
  fecha,
  salon,
  onGuardar,
  onCancelar,
}: {
  horas: string[];
  turno: Turno;
  fecha: string;
  salon: string;
  onGuardar: (hora: string, pax: number, nombre: string, habTel: string) => Promise<void>;
  onCancelar: () => void;
}) {
  const [hora, setHora] = useState(horas[0] ?? "");
  const [pax, setPax] = useState(2);
  const [nombre, setNombre] = useState("");
  const [habTel, setHabTel] = useState("");
  const [enviando, setEnviando] = useState(false);
  return (
    <>
      <div className="pc-h-t">
        <b>Nueva reserva</b>
        <span className="pc-h-x">
          {fechaCorta(fecha)} · {NOMBRE_TURNO[turno]} · {salon}
        </span>
      </div>
      <div className="pc-campo">
        <small>Hora</small>
        <div className="pc-horas">
          {horas.map((h) => (
            <button key={h} type="button" className={h === hora ? "on" : ""} onClick={() => setHora(h)}>
              {h}
            </button>
          ))}
        </div>
      </div>
      <div className="pc-campos">
        <div className="pc-campo">
          <small>Pax</small>
          <div className="pc-cont">
            <button type="button" onClick={() => setPax((x) => Math.max(1, x - 1))} aria-label="Una persona menos">
              −
            </button>
            <b>{pax}</b>
            <button type="button" onClick={() => setPax((x) => Math.min(99, x + 1))} aria-label="Una persona más">
              +
            </button>
          </div>
        </div>
        <label className="pc-campo">
          <small>Nombre</small>
          <input className="pc-inp" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Apellido" />
        </label>
      </div>
      <label className="pc-campo">
        <small>Hab / Tel (opcional)</small>
        <input className="pc-inp" value={habTel} onChange={(e) => setHabTel(e.target.value)} inputMode="tel" />
      </label>
      <div className="pc-acc">
        <button type="button" onClick={onCancelar}>
          Cancelar
        </button>
        <button
          type="button"
          className="pri"
          disabled={enviando || !hora || !nombre.trim()}
          onClick={async () => {
            setEnviando(true);
            await onGuardar(hora, pax, nombre.trim(), habTel.trim());
            setEnviando(false);
          }}
        >
          {enviando ? "Guardando…" : "Guardar"}
        </button>
      </div>
    </>
  );
}
