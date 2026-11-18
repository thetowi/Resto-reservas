"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ApiError,
  borrarSalon,
  crearSalon,
  getHorarios,
  getMeta,
  getSalones,
  ordenarSalones,
  patchSalon,
  type CambiosSalon,
} from "@/lib/api";
import { esAdmin, haySesion } from "@/lib/auth";
import { crearConexion } from "@/lib/signalr";
import { useConfirm } from "@/components/ConfirmProvider";
import { DIAS_SEMANA, TODOS_LOS_DIAS, abreElDia, alternarDia, resumenDias } from "@/lib/diasSemana";
import type { ConfirmacionWeb, HorariosSalon, Mesa, Salon, Sector, Turno } from "@/lib/types";

// Administración de salones (Restaurant, Lobby bar, etc — ver Models/Salon.cs
// del lado del backend). Solo Admin. A la izquierda la lista (se ordena
// arrastrando: ese orden es el de las pestañas del panel y del link); a la
// derecha la ficha del salón elegido, por pestañas: datos generales, qué
// turnos y qué días abre, cómo toma reservas el link, la tolerancia de
// llegada con el resumen de mesas y sectores, y desactivar / borrar.
// Los cambios de la ficha se juntan y se guardan con «Guardar».

type Pestana = "general" | "turnos" | "link" | "servicio" | "zona";

const PESTANAS: { id: Pestana; nombre: string }[] = [
  { id: "general", nombre: "General" },
  { id: "turnos", nombre: "Turnos y días" },
  { id: "link", nombre: "Link de reservas" },
  { id: "servicio", nombre: "Servicio y mesas" },
  { id: "zona", nombre: "Desactivar / borrar" },
];

// Los mismos tonos que los sectores (ver SectoresService del backend), más
// el azul de la marca.
const COLORES = ["#13242e", "#2f6f9f", "#2f7d6d", "#8a5a2b", "#a33b5c", "#6b7a1f", "#7a4fb3", "#c26a1b"];

const NOMBRE_TURNO: Record<Turno, string> = { almuerzo: "Almuerzo", merienda: "Merienda", cena: "Cena" };

// Todos los campos de la ficha con su valor de siempre (lo que hacía la app
// antes de que fueran configurables), por si la API no los manda.
type Ficha = Required<Omit<Salon, "id" | "orden">>;

function fichaDe(s: Salon): Ficha {
  return {
    nombre: s.nombre,
    permiteMerienda: s.permiteMerienda,
    activo: s.activo,
    color: s.color ?? "",
    ofreceAlmuerzo: s.ofreceAlmuerzo ?? true,
    ofreceCena: s.ofreceCena ?? true,
    diasAlmuerzo: s.diasAlmuerzo ?? TODOS_LOS_DIAS,
    diasMerienda: s.diasMerienda ?? TODOS_LOS_DIAS,
    diasCena: s.diasCena ?? TODOS_LOS_DIAS,
    mostrarEnLink: s.mostrarEnLink ?? true,
    confirmacion: s.confirmacion ?? "nunca",
    confirmaHastaPax: s.confirmaHastaPax ?? 6,
    paxMaximoWeb: s.paxMaximoWeb ?? 20,
    anticipacionMinutos: s.anticipacionMinutos ?? 60,
    diasAdelante: s.diasAdelante ?? 60,
    toleranciaMinutos: s.toleranciaMinutos ?? 15,
  };
}

// Solo lo que cambió (lo que se manda a la API).
function diferencias(antes: Ficha, ahora: Ficha): CambiosSalon {
  const cambios: Record<string, unknown> = {};
  for (const k of Object.keys(ahora) as (keyof Ficha)[]) {
    if (ahora[k] !== antes[k]) cambios[k] = k === "nombre" ? String(ahora[k]).trim() : ahora[k];
  }
  return cambios as CambiosSalon;
}

const ofrece = (f: Ficha, t: Turno) => (t === "almuerzo" ? f.ofreceAlmuerzo : t === "merienda" ? f.permiteMerienda : f.ofreceCena);
const diasDe = (f: Ficha, t: Turno) => (t === "almuerzo" ? f.diasAlmuerzo : t === "merienda" ? f.diasMerienda : f.diasCena);

function resumenTurnos(f: Ficha): string {
  const t = (["almuerzo", "merienda", "cena"] as Turno[]).filter((x) => ofrece(f, x)).map((x) => NOMBRE_TURNO[x]);
  return t.length > 0 ? t.join(" · ") : "Sin turnos";
}

function horasTxt(minutos: number): string {
  if (minutos < 60) return `${minutos} min`;
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

export default function AdminSalonesPage() {
  const router = useRouter();
  const { confirmar } = useConfirm();
  const [listo, setListo] = useState(false);
  const [salones, setSalones] = useState<Salon[]>([]);
  const [mesas, setMesas] = useState<Mesa[]>([]);
  const [sectores, setSectores] = useState<Sector[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [elegidoId, setElegidoId] = useState<number | null>(null);
  const [pestana, setPestana] = useState<Pestana>("general");
  const [borrador, setBorrador] = useState<Ficha | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [horarios, setHorarios] = useState<HorariosSalon | null>(null);

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
    Promise.all([getSalones(), getMeta()])
      .then(([lista, meta]) => {
        setSalones(lista);
        setMesas(meta.mesas);
        setSectores(meta.sectores ?? []);
        setElegidoId((id) => id ?? [...lista].sort((a, b) => a.orden - b.orden)[0]?.id ?? null);
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : "Error cargando los salones"))
      .finally(() => setCargando(false));
  }, [listo]);

  // Cambios hechos desde otra pestaña u otra persona.
  useEffect(() => {
    if (!listo) return;
    const conexion = crearConexion();
    conexion.on("SalonesActualizados", (data: Salon[]) => setSalones(data));
    conexion.on("MesasActualizado", (data: Mesa[]) => setMesas(data));
    conexion.on("SectoresActualizados", (data: { salonId: number; sectores: Sector[] }) =>
      setSectores((prev) => [...prev.filter((s) => s.salonId !== data.salonId), ...data.sectores]),
    );
    conexion.start().catch(() => {});
    return () => {
      conexion.stop();
    };
  }, [listo]);

  const ordenados = useMemo(() => [...salones].sort((a, b) => a.orden - b.orden || a.id - b.id), [salones]);
  const elegido = salones.find((s) => s.id === elegidoId) ?? null;
  const original = useMemo(() => (elegido ? fichaDe(elegido) : null), [elegido]);
  const ficha = borrador ?? original;
  const cambios = original && borrador ? diferencias(original, borrador) : {};
  const hayCambios = Object.keys(cambios).length > 0;

  // Horarios del salón elegido, para el resumen de «Turnos y días».
  useEffect(() => {
    if (!listo || elegidoId === null) return;
    let vigente = true;
    getHorarios(elegidoId)
      .then((h) => vigente && setHorarios(h))
      .catch(() => vigente && setHorarios(null));
    return () => {
      vigente = false;
    };
  }, [listo, elegidoId]);

  function manejarError(e: unknown) {
    setError(e instanceof ApiError ? e.message : "No se pudo completar la acción");
  }

  function avisar(texto: string) {
    setAviso(texto);
    setTimeout(() => setAviso((a) => (a === texto ? null : a)), 2500);
  }

  function cambiar(parcial: Partial<Ficha>) {
    if (!ficha) return;
    setBorrador({ ...ficha, ...parcial });
  }

  async function elegir(id: number) {
    if (id === elegidoId) return;
    if (hayCambios && !(await confirmar(`Hay cambios sin guardar en ${elegido?.nombre}. ¿Descartarlos?`, { textoConfirmar: "Descartar", textoCancelar: "Seguir editando" }))) {
      return;
    }
    setBorrador(null);
    setHorarios(null);
    setElegidoId(id);
  }

  async function guardar() {
    if (!elegido || !hayCambios) return;
    if (cambios.nombre !== undefined && !cambios.nombre) {
      setError("El salón necesita un nombre.");
      return;
    }
    setGuardando(true);
    try {
      setSalones(await patchSalon(elegido.id, cambios));
      setBorrador(null);
      setError(null);
      avisar(`Guardado: ${borrador?.nombre.trim() || elegido.nombre}`);
    } catch (e) {
      manejarError(e);
    } finally {
      setGuardando(false);
    }
  }

  // Activar / desactivar se aplica al toque (no espera a «Guardar»).
  async function alternarActivo() {
    if (!elegido) return;
    const activo = !elegido.activo;
    if (!activo && !(await confirmar(`¿Desactivar ${elegido.nombre}? Deja de aparecer en el panel y en el link. No se borra nada y se puede volver a activar.`, { textoConfirmar: "Desactivar" }))) {
      return;
    }
    try {
      setSalones(await patchSalon(elegido.id, { activo }));
      if (borrador) setBorrador({ ...borrador, activo });
      setError(null);
      avisar(activo ? `${elegido.nombre} está activo` : `${elegido.nombre} quedó inactivo`);
    } catch (e) {
      manejarError(e);
    }
  }

  async function borrar() {
    if (!elegido) return;
    if (!(await confirmar(`¿Borrar ${elegido.nombre}? No se puede deshacer.`, { textoConfirmar: "Borrar" }))) return;
    try {
      const lista = await borrarSalon(elegido.id);
      setSalones(lista);
      setBorrador(null);
      setElegidoId([...lista].sort((a, b) => a.orden - b.orden)[0]?.id ?? null);
      setError(null);
    } catch (e) {
      manejarError(e);
    }
  }

  async function crear(nombre: string) {
    try {
      const lista = await crearSalon(nombre);
      setSalones(lista);
      const nuevo = lista.find((s) => s.nombre === nombre && !salones.some((v) => v.id === s.id));
      if (nuevo) {
        setBorrador(null);
        setElegidoId(nuevo.id);
        setPestana("general");
      }
      setError(null);
      return true;
    } catch (e) {
      manejarError(e);
      return false;
    }
  }

  async function reordenar(ids: number[]) {
    // Se ve enseguida; si falla, vuelve lo que diga la API.
    setSalones((prev) => prev.map((s) => ({ ...s, orden: ids.indexOf(s.id) })));
    try {
      setSalones(await ordenarSalones(ids));
      setError(null);
    } catch (e) {
      manejarError(e);
      getSalones().then(setSalones).catch(() => {});
    }
  }

  if (!listo) return null;

  const mesasDelSalon = mesas.filter((m) => m.salonId === elegidoId && !m.esTemporal && m.mesaPadreId === null);
  const sectoresDelSalon = sectores.filter((s) => s.salonId === elegidoId).sort((a, b) => a.orden - b.orden);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <div className="mb-5">
        <Link href="/" className="text-xs text-tinta-suave underline hover:text-tinta">
          ← Volver a reservas
        </Link>
        <h1 className="mt-1 text-lg font-bold">Salones</h1>
        <p className="mt-1 max-w-[80ch] text-sm text-tinta-suave">
          Todo lo de cada salón en un solo lugar: qué turnos y qué días abre, cómo toma reservas el link y la tolerancia de
          llegada. El orden de la lista es el de las pestañas del panel y del link.
        </p>
      </div>

      {error && (
        <div role="alert" className="mb-4 rounded-xl bg-ocupada-suave px-4 py-2.5 text-sm text-ocupada">
          {error}
        </div>
      )}

      {cargando ? (
        <div className="p-10 text-center text-tinta-suave">Cargando…</div>
      ) : (
        <div className="grid items-start gap-4 lg:grid-cols-[290px_minmax(0,1fr)]">
          <ListaSalones salones={ordenados} elegidoId={elegidoId} onElegir={elegir} onReordenar={reordenar} onCrear={crear} />

          {elegido && ficha && original ? (
            <div className="grid min-w-0 gap-3.5">
              <Cabecera ficha={ficha} mesas={mesasDelSalon} />

              <div role="tablist" aria-label="Secciones del salón" className="flex flex-wrap gap-1 rounded-2xl border border-borde bg-superficie p-1">
                {PESTANAS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    role="tab"
                    aria-selected={pestana === p.id}
                    onClick={() => setPestana(p.id)}
                    className={`rounded-xl px-3.5 py-2 text-[13.5px] font-semibold transition-colors ${
                      pestana === p.id ? "bg-marca text-white" : "text-tinta-suave hover:bg-arena-suave hover:text-tinta"
                    }`}
                  >
                    {p.nombre}
                  </button>
                ))}
              </div>

              {pestana === "general" && <SeccionGeneral ficha={ficha} onCambiar={cambiar} onAlternarActivo={alternarActivo} />}
              {pestana === "turnos" && <SeccionTurnos ficha={ficha} horarios={horarios} salonId={elegido.id} onCambiar={cambiar} />}
              {pestana === "link" && <SeccionLink ficha={ficha} elegidoId={elegido.id} salones={ordenados} onCambiar={cambiar} />}
              {pestana === "servicio" && (
                <SeccionServicio ficha={ficha} salonId={elegido.id} mesas={mesasDelSalon} sectores={sectoresDelSalon} onCambiar={cambiar} />
              )}
              {pestana === "zona" && (
                <SeccionZona ficha={original} mesas={mesasDelSalon.length} onAlternarActivo={alternarActivo} onBorrar={borrar} />
              )}

              {hayCambios && (
                <div className="sticky bottom-3 z-10 flex flex-wrap items-center justify-between gap-2.5 rounded-2xl bg-marca py-2.5 pr-3 pl-4 text-white shadow-[0_18px_40px_-16px_rgba(12,38,55,0.6)]">
                  <span className="text-[13.5px]">Cambios sin guardar en {original.nombre}</span>
                  <span className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => setBorrador(null)}
                      className="rounded-lg border border-white/30 px-3 py-1.5 text-[13px] font-bold hover:bg-white/10"
                    >
                      Descartar
                    </button>
                    <button
                      type="button"
                      onClick={guardar}
                      disabled={guardando}
                      className="rounded-lg bg-asistio px-3.5 py-1.5 text-[13px] font-bold text-[#04221c] disabled:opacity-60"
                    >
                      {guardando ? "Guardando…" : "Guardar"}
                    </button>
                  </span>
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-2xl border border-borde bg-superficie p-10 text-center text-sm text-tinta-suave">
              Creá el primer salón con «+ Nuevo».
            </div>
          )}
        </div>
      )}

      {aviso && (
        <div role="status" className="fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-xl bg-tinta px-4 py-2.5 text-sm text-fondo shadow-lg">
          {aviso}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- lista

function ListaSalones({
  salones,
  elegidoId,
  onElegir,
  onReordenar,
  onCrear,
}: {
  salones: Salon[];
  elegidoId: number | null;
  onElegir: (id: number) => void;
  onReordenar: (ids: number[]) => void;
  onCrear: (nombre: string) => Promise<boolean>;
}) {
  const [nuevo, setNuevo] = useState("");
  const [creando, setCreando] = useState(false);
  // Arrastrando: cuál se mueve y sobre cuál está.
  const [moviendo, setMoviendo] = useState<number | null>(null);
  const [sobre, setSobre] = useState<number | null>(null);

  function mover(id: number, destino: number) {
    const ids = salones.map((s) => s.id);
    const desde = ids.indexOf(id);
    if (desde < 0 || destino < 0 || destino >= ids.length || desde === destino) return;
    ids.splice(desde, 1);
    ids.splice(destino, 0, id);
    onReordenar(ids);
  }

  async function crear() {
    const nombre = nuevo.trim();
    if (!nombre) return;
    setCreando(true);
    if (await onCrear(nombre)) setNuevo("");
    setCreando(false);
  }

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-1 rounded-2xl border border-borde bg-superficie p-2.5">
      <div className="flex flex-wrap items-center justify-between gap-1 px-2 pt-1.5 pb-2">
        <span className="text-[11px] font-bold tracking-[0.08em] text-tinta-suave uppercase">Salones</span>
        <span className="text-[11px] text-tinta-suave">Arrastrá para ordenar</span>
      </div>
      {salones.map((s, i) => {
        const f = fichaDe(s);
        const sel = s.id === elegidoId;
        return (
          <div
            key={s.id}
            draggable
            onDragStart={(e) => {
              setMoviendo(s.id);
              e.dataTransfer.effectAllowed = "move";
              e.dataTransfer.setData("text/plain", String(s.id));
            }}
            onDragOver={(e) => {
              if (moviendo === null) return;
              e.preventDefault();
              setSobre(s.id);
            }}
            onDragLeave={() => setSobre((x) => (x === s.id ? null : x))}
            onDrop={(e) => {
              e.preventDefault();
              if (moviendo !== null) mover(moviendo, i);
              setMoviendo(null);
              setSobre(null);
            }}
            onDragEnd={() => {
              setMoviendo(null);
              setSobre(null);
            }}
            className={`grid grid-cols-[auto_minmax(0,1fr)] items-center rounded-xl transition-colors ${
              sel ? "bg-marca text-white" : "hover:bg-arena-suave"
            } ${moviendo === s.id ? "opacity-50" : ""} ${sobre === s.id && moviendo !== s.id ? "ring-2 ring-asistio" : ""}`}
          >
            <button
              type="button"
              aria-label={`Mover ${s.nombre} (flechas arriba y abajo)`}
              title="Arrastrá para ordenar (o usá las flechas)"
              onKeyDown={(e) => {
                if (e.key === "ArrowUp") {
                  e.preventDefault();
                  mover(s.id, i - 1);
                } else if (e.key === "ArrowDown") {
                  e.preventDefault();
                  mover(s.id, i + 1);
                }
              }}
              className={`cursor-grab self-stretch rounded-l-xl pr-1 pl-2.5 text-[15px] tracking-[-2px] active:cursor-grabbing ${
                sel ? "text-white/45" : "text-tinta-suave/70"
              }`}
            >
              ⋮⋮
            </button>
            <button type="button" onClick={() => onElegir(s.id)} aria-current={sel} className="flex min-w-0 items-center gap-2.5 py-2.5 pr-2.5 pl-1.5 text-left">
              <span
                aria-hidden
                className={`h-3 w-3 shrink-0 rounded-full ${f.color ? "ring-1 ring-tinta/20" : "border border-dashed border-current opacity-50"}`}
                style={f.color ? { background: f.color, boxShadow: sel ? "0 0 0 2px #fff" : undefined } : undefined}
              />
              <span className="min-w-0">
                <b className={`block truncate text-[14.5px] ${s.activo ? "" : "opacity-60"}`}>
                  {s.nombre}
                  {!s.activo && (
                    <span className={`ml-1.5 rounded-full px-1.5 py-px align-[1px] text-[10.5px] font-extrabold ${sel ? "bg-white/15" : "bg-arena-suave text-tinta-suave"}`}>
                      Inactivo
                    </span>
                  )}
                </b>
                <small className={`mt-0.5 block truncate text-xs ${sel ? "text-white/70" : "text-tinta-suave"}`}>
                  {resumenTurnos(f)}
                  {f.mostrarEnLink && s.activo ? " · en el link" : ""}
                </small>
              </span>
            </button>
          </div>
        );
      })}
      <div className="mt-1 flex gap-1.5 border-t border-borde px-1.5 pt-2.5 pb-1">
        <input
          id="nuevo-salon"
          aria-label="Nombre del salón nuevo"
          className="min-w-0 flex-1 rounded-lg border border-borde bg-superficie px-2.5 py-1.5 text-[13.5px]"
          placeholder="Nombre (ej: Bar)"
          value={nuevo}
          maxLength={40}
          onChange={(e) => setNuevo(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && crear()}
        />
        <button
          type="button"
          disabled={creando || !nuevo.trim()}
          onClick={crear}
          className="rounded-lg bg-marca px-3 py-1.5 text-[13px] font-bold text-white disabled:opacity-40"
        >
          + Nuevo
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- piezas

function Cabecera({ ficha, mesas }: { ficha: Ficha; mesas: Mesa[] }) {
  const pax = mesas.reduce((t, m) => t + m.capacidad, 0);
  const enLink = ficha.activo && ficha.mostrarEnLink;
  return (
    <div className="rounded-2xl border border-borde bg-superficie px-4.5 py-4">
      <h2 className="flex items-center gap-2.5 text-xl font-bold">
        <span
          aria-hidden
          className={`h-3.5 w-3.5 shrink-0 rounded-full ${ficha.color ? "ring-1 ring-tinta/20" : "border border-dashed border-tinta-suave"}`}
          style={ficha.color ? { background: ficha.color } : undefined}
        />
        <span className="min-w-0 truncate">{ficha.nombre.trim() || "Sin nombre"}</span>
      </h2>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        <Pastilla tono={ficha.activo ? "ok" : "mal"}>{ficha.activo ? "Activo" : "Inactivo"}</Pastilla>
        <Pastilla>{resumenTurnos(ficha)}</Pastilla>
        {ficha.activo && (
          <Pastilla>{mesas.length > 0 ? `${mesas.length} ${mesas.length === 1 ? "mesa" : "mesas"} · ${pax} pax` : "Sin mesas"}</Pastilla>
        )}
        <Pastilla tono={enLink ? "ok" : undefined}>{enLink ? "En el link" : "No está en el link"}</Pastilla>
      </div>
    </div>
  );
}

function Pastilla({ children, tono }: { children: React.ReactNode; tono?: "ok" | "mal" }) {
  const color = tono === "ok" ? "bg-asistio-suave text-[#1d7a69]" : tono === "mal" ? "bg-ocupada-suave text-ocupada" : "bg-arena-suave text-tinta";
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${color}`}>{children}</span>;
}

function Seccion({ titulo, sub, children, peligro }: { titulo: string; sub?: string; children: React.ReactNode; peligro?: boolean }) {
  return (
    <section
      className={`grid gap-4 rounded-2xl border p-4.5 ${peligro ? "border-ocupada/30 bg-ocupada-suave/30" : "border-borde bg-superficie"}`}
    >
      <div>
        <h3 className="text-[15.5px] font-bold">{titulo}</h3>
        {sub && <p className="mt-1 text-[13px] leading-snug text-tinta-suave">{sub}</p>}
      </div>
      {children}
    </section>
  );
}

function Fila({ titulo, ayuda, children, htmlFor }: { titulo: string; ayuda?: string; children: React.ReactNode; htmlFor?: string }) {
  return (
    <div className="grid items-start gap-1.5 border-t border-borde/60 pt-3.5 first-of-type:border-t-0 first-of-type:pt-0 sm:grid-cols-[210px_minmax(0,1fr)] sm:gap-3.5">
      <div>
        {htmlFor ? (
          <label htmlFor={htmlFor} className="block text-[13.5px] font-bold">
            {titulo}
          </label>
        ) : (
          <b className="block text-[13.5px]">{titulo}</b>
        )}
        {ayuda && <small className="mt-0.5 block text-xs leading-snug text-tinta-suave">{ayuda}</small>}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function Interruptor({ id, activo, onCambiar, children }: { id: string; activo: boolean; onCambiar: (v: boolean) => void; children: React.ReactNode }) {
  return (
    <label htmlFor={id} className="relative inline-flex cursor-pointer items-center gap-2.5 text-[13.5px]">
      <input id={id} type="checkbox" className="peer absolute opacity-0" checked={activo} onChange={(e) => onCambiar(e.target.checked)} />
      <i
        aria-hidden
        className="relative h-[22px] w-[38px] shrink-0 rounded-full bg-borde transition-colors peer-checked:bg-asistio peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-asistio after:absolute after:top-[3px] after:left-[3px] after:h-4 after:w-4 after:rounded-full after:bg-white after:transition-[left] peer-checked:after:left-[19px]"
      />
      {children}
    </label>
  );
}

// Número con − / + (y se puede escribir).
function Numero({
  id,
  valor,
  min,
  max,
  paso = 1,
  sufijo,
  onCambiar,
}: {
  id: string;
  valor: number;
  min: number;
  max: number;
  paso?: number;
  sufijo: string;
  onCambiar: (v: number) => void;
}) {
  const fijar = (v: number) => onCambiar(Math.min(max, Math.max(min, Math.round(v))));
  return (
    <span className="inline-flex flex-wrap items-center gap-2 text-[13.5px]">
      <button
        type="button"
        aria-label="Menos"
        disabled={valor <= min}
        onClick={() => fijar(valor - paso)}
        className="h-[30px] w-[30px] rounded-lg border border-borde bg-superficie font-extrabold disabled:opacity-40"
      >
        −
      </button>
      <input
        id={id}
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        step={paso}
        value={valor}
        onChange={(e) => e.target.value !== "" && fijar(Number(e.target.value))}
        className="w-16 rounded-lg border border-borde bg-superficie px-1 py-1 text-center font-extrabold tabular-nums"
      />
      <button
        type="button"
        aria-label="Más"
        disabled={valor >= max}
        onClick={() => fijar(valor + paso)}
        className="h-[30px] w-[30px] rounded-lg border border-borde bg-superficie font-extrabold disabled:opacity-40"
      >
        +
      </button>
      <span className="text-tinta-suave">{sufijo}</span>
    </span>
  );
}

const enlace = "text-[12.5px] font-semibold text-tinta underline decoration-borde underline-offset-2 hover:decoration-tinta";

// ---------------------------------------------------------------- secciones

function SeccionGeneral({ ficha, onCambiar, onAlternarActivo }: { ficha: Ficha; onCambiar: (p: Partial<Ficha>) => void; onAlternarActivo: () => void }) {
  return (
    <Seccion titulo="General">
      <Fila titulo="Nombre" ayuda="Cómo se ve en el panel y en el link." htmlFor="salon-nombre">
        <input
          id="salon-nombre"
          className="w-full max-w-sm rounded-lg border border-borde bg-superficie px-3 py-2 text-sm"
          value={ficha.nombre}
          maxLength={40}
          onChange={(e) => onCambiar({ nombre: e.target.value })}
        />
      </Fila>
      <Fila titulo="Color" ayuda="Identifica al salón en las pestañas del panel y del celular.">
        <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Color del salón">
          {COLORES.map((c) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={ficha.color === c}
              aria-label={`Color ${c}`}
              onClick={() => onCambiar({ color: c })}
              className="h-[26px] w-[26px] rounded-full"
              style={{ background: c, boxShadow: ficha.color === c ? "0 0 0 2px var(--color-superficie), 0 0 0 4px var(--color-tinta)" : undefined }}
            />
          ))}
          <button
            type="button"
            role="radio"
            aria-checked={ficha.color === ""}
            onClick={() => onCambiar({ color: "" })}
            className={`rounded-full border px-2.5 py-1 text-xs ${ficha.color === "" ? "border-tinta font-bold" : "border-borde text-tinta-suave"}`}
          >
            Sin color
          </button>
        </div>
      </Fila>
      <Fila titulo="Estado" ayuda="Inactivo: no aparece en el panel ni en el link, pero no se pierde nada. Se aplica al toque.">
        <Interruptor id="salon-activo" activo={ficha.activo} onCambiar={onAlternarActivo}>
          {ficha.activo ? "Activo" : "Inactivo"}
        </Interruptor>
      </Fila>
    </Seccion>
  );
}

function SeccionTurnos({
  ficha,
  horarios,
  salonId,
  onCambiar,
}: {
  ficha: Ficha;
  horarios: HorariosSalon | null;
  salonId: number;
  onCambiar: (p: Partial<Ficha>) => void;
}) {
  function setOfrece(t: Turno, v: boolean) {
    onCambiar(t === "almuerzo" ? { ofreceAlmuerzo: v } : t === "merienda" ? { permiteMerienda: v } : { ofreceCena: v });
  }
  function setDias(t: Turno, v: number) {
    onCambiar(t === "almuerzo" ? { diasAlmuerzo: v } : t === "merienda" ? { diasMerienda: v } : { diasCena: v });
  }
  const ninguno = !ficha.ofreceAlmuerzo && !ficha.permiteMerienda && !ficha.ofreceCena;

  return (
    <Seccion
      titulo="Turnos y días"
      sub="Qué turnos ofrece y qué días de la semana abre cada uno. Los días cerrados no se ofrecen en el link ni abren planilla; un día puntual se puede abrir igual desde el candado del turno."
    >
      <div className="grid gap-2">
        {(["almuerzo", "merienda", "cena"] as Turno[]).map((t) => {
          const on = ofrece(ficha, t);
          const dias = diasDe(ficha, t);
          const franjas = horarios?.turnos.find((h) => h.turno === t)?.horarios ?? [];
          const filas = franjas.reduce((n, f) => n + f.filas, 0);
          return (
            <div
              key={t}
              className={`grid items-center gap-3 rounded-xl border border-borde/70 px-3 py-2.5 sm:grid-cols-[140px_minmax(0,1fr)_auto] ${on ? "" : "bg-arena-suave/50"}`}
            >
              <Interruptor id={`turno-${t}`} activo={on} onCambiar={(v) => setOfrece(t, v)}>
                <b>{NOMBRE_TURNO[t]}</b>
              </Interruptor>
              <div className={`flex flex-wrap items-center gap-1 ${on ? "" : "pointer-events-none opacity-40"}`} role="group" aria-label={`Días de ${NOMBRE_TURNO[t]}`}>
                {DIAS_SEMANA.map((d, i) => {
                  const abre = abreElDia(dias, i);
                  return (
                    <button
                      key={d.corto}
                      type="button"
                      aria-pressed={abre}
                      aria-label={d.largo}
                      title={d.largo}
                      tabIndex={on ? 0 : -1}
                      onClick={() => setDias(t, alternarDia(dias, i))}
                      className={`h-[30px] w-8 rounded-lg border text-[12.5px] font-bold ${
                        abre ? "border-marca bg-marca text-white" : "border-borde bg-superficie text-tinta-suave"
                      }`}
                    >
                      {d.corto}
                    </button>
                  );
                })}
                {on && dias === 0 && <span className="ml-1 text-xs font-semibold text-aviso">No abre ningún día</span>}
                {on && dias !== 0 && dias !== TODOS_LOS_DIAS && <span className="ml-1 text-xs text-tinta-suave">{resumenDias(dias)}</span>}
              </div>
              <Link href={`/admin/horarios?salon=${salonId}`} className={`${enlace} whitespace-nowrap ${on ? "" : "pointer-events-none opacity-40"}`} tabIndex={on ? 0 : -1}>
                {franjas.length > 0 ? `${franjas.length} horarios · ${filas} filas` : "Horarios"} →
              </Link>
            </div>
          );
        })}
      </div>
      {ninguno && <p className="text-xs font-semibold text-aviso">Sin ningún turno, el salón no abre nunca.</p>}
    </Seccion>
  );
}

function SeccionLink({
  ficha,
  elegidoId,
  salones,
  onCambiar,
}: {
  ficha: Ficha;
  elegidoId: number;
  salones: Salon[];
  onCambiar: (p: Partial<Ficha>) => void;
}) {
  const textoConfirmacion: Record<ConfirmacionWeb, string> = {
    siempre: "Toda reserva se confirma sola si hay lugar.",
    hastaPax: `Se confirma sola hasta ${ficha.confirmaHastaPax - 1} ${ficha.confirmaHastaPax - 1 === 1 ? "persona" : "personas"}; desde ${ficha.confirmaHastaPax}, queda a confirmar por el equipo.`,
    nunca: "Todas quedan como solicitud: el equipo las aprueba en Reservas web.",
  };
  // Lo que ve el cliente al elegir salón, con este salón como está en la ficha.
  const enElLink = salones
    .map((s) => (s.id === elegidoId ? { ...s, ...ficha } : { ...s, ...fichaDe(s) }))
    .filter((s) => s.activo && s.mostrarEnLink);

  return (
    <Seccion titulo="Reservas por el link">
      <Fila titulo="Mostrar en el link" ayuda="Apagado: el salón no aparece para los clientes (el equipo sigue cargando reservas).">
        <Interruptor id="salon-link" activo={ficha.mostrarEnLink} onCambiar={(v) => onCambiar({ mostrarEnLink: v })}>
          {ficha.mostrarEnLink ? "Se muestra" : "No se muestra"}
        </Interruptor>
        {!ficha.activo && ficha.mostrarEnLink && <p className="mt-1.5 text-xs text-tinta-suave">Mientras esté inactivo no aparece igual.</p>}
      </Fila>
      {ficha.mostrarEnLink && (
        <>
          <Fila titulo="Confirmación" ayuda="Si la reserva queda confirmada al instante o como solicitud.">
            <div className="inline-flex flex-wrap gap-0.5 rounded-xl bg-arena-suave p-[3px]" role="radiogroup" aria-label="Confirmación">
              {(
                [
                  ["siempre", "Siempre sola"],
                  ["hastaPax", "Sola hasta…"],
                  ["nunca", "Siempre a confirmar"],
                ] as [ConfirmacionWeb, string][]
              ).map(([v, t]) => (
                <button
                  key={v}
                  type="button"
                  role="radio"
                  aria-checked={ficha.confirmacion === v}
                  onClick={() => onCambiar({ confirmacion: v })}
                  className={`rounded-lg px-3 py-1.5 text-[13px] font-semibold ${
                    ficha.confirmacion === v ? "bg-superficie text-tinta shadow-sm" : "text-tinta-suave hover:text-tinta"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
            {ficha.confirmacion === "hastaPax" && (
              <div className="mt-2.5">
                <Numero
                  id="salon-confirma-hasta"
                  valor={ficha.confirmaHastaPax}
                  min={2}
                  max={100}
                  sufijo="personas o más: a confirmar"
                  onCambiar={(v) => onCambiar({ confirmaHastaPax: v })}
                />
              </div>
            )}
            <p className="mt-1.5 text-[12.5px] leading-snug text-tinta-suave">{textoConfirmacion[ficha.confirmacion]}</p>
          </Fila>
          <Fila titulo="Máximo por reserva" ayuda="Más personas que esto: el link le pide que escriba por WhatsApp." htmlFor="salon-max">
            <Numero id="salon-max" valor={ficha.paxMaximoWeb} min={1} max={100} sufijo="personas" onCambiar={(v) => onCambiar({ paxMaximoWeb: v })} />
          </Fila>
          <Fila titulo="Anticipación mínima" ayuda="No se puede reservar para dentro de menos de este tiempo." htmlFor="salon-antic">
            <Numero
              id="salon-antic"
              valor={ficha.anticipacionMinutos}
              min={0}
              max={2880}
              paso={15}
              sufijo={ficha.anticipacionMinutos >= 60 ? `minutos (${horasTxt(ficha.anticipacionMinutos)})` : "minutos"}
              onCambiar={(v) => onCambiar({ anticipacionMinutos: v })}
            />
          </Fila>
          <Fila titulo="Días hacia adelante" ayuda="Hasta cuándo se puede reservar." htmlFor="salon-adelante">
            <Numero id="salon-adelante" valor={ficha.diasAdelante} min={1} max={365} paso={15} sufijo="días" onCambiar={(v) => onCambiar({ diasAdelante: v })} />
          </Fila>
        </>
      )}
      <Fila titulo="Así lo ve el cliente" ayuda="Al elegir salón en el link (en este orden).">
        <div className="grid gap-2 rounded-xl border border-dashed border-borde bg-fondo/60 p-3">
          {enElLink.length === 0 ? (
            <small className="text-tinta-suave">Ningún salón se muestra en el link.</small>
          ) : (
            enElLink.map((s) => (
              <div
                key={s.id}
                className={`flex items-center gap-2.5 rounded-xl border bg-superficie px-3 py-2.5 ${s.id === elegidoId ? "border-tinta" : "border-borde"}`}
              >
                {s.color && <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-tinta/20" style={{ background: s.color }} />}
                <b className="text-sm">{s.nombre.trim() || "Sin nombre"}</b>
              </div>
            ))
          )}
        </div>
      </Fila>
    </Seccion>
  );
}

function SeccionServicio({
  ficha,
  salonId,
  mesas,
  sectores,
  onCambiar,
}: {
  ficha: Ficha;
  salonId: number;
  mesas: Mesa[];
  sectores: Sector[];
  onCambiar: (p: Partial<Ficha>) => void;
}) {
  const pax = mesas.reduce((t, m) => t + m.capacidad, 0);
  return (
    <Seccion titulo="Servicio">
      <Fila
        titulo="Tolerancia de llegada"
        ayuda="Pasado este tiempo de la hora reservada, la fila se marca «todavía no llegó» y se ofrece liberar la mesa. 0 = sin aviso."
        htmlFor="salon-tolerancia"
      >
        <Numero id="salon-tolerancia" valor={ficha.toleranciaMinutos} min={0} max={180} paso={5} sufijo="minutos" onCambiar={(v) => onCambiar({ toleranciaMinutos: v })} />
      </Fila>
      <Fila titulo="Mesas y sectores" ayuda="Se editan en Administrar mesas.">
        {ficha.activo ? (
          <div className="grid gap-2.5 sm:grid-cols-2">
            <div className="grid gap-1 rounded-xl border border-borde/70 p-3">
              <b className="text-2xl tabular-nums">{mesas.length}</b>
              <small className="text-[12.5px] text-tinta-suave">
                {mesas.length === 1 ? "mesa" : "mesas"} · {pax} pax
              </small>
              <Link href={`/admin/mesas?salon=${salonId}`} className={`${enlace} mt-1`}>
                Administrar mesas →
              </Link>
            </div>
            <div className="grid content-start gap-1 rounded-xl border border-borde/70 p-3">
              <b className="text-2xl tabular-nums">{sectores.length || "—"}</b>
              <small className="text-[12.5px] text-tinta-suave">{sectores.length ? (sectores.length === 1 ? "sector" : "sectores") : "sin sectores"}</small>
              {sectores.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {sectores.map((s) => (
                    <span key={s.id} className="inline-flex items-center gap-1.5 rounded-full bg-arena-suave px-2.5 py-0.5 text-xs font-semibold">
                      <i aria-hidden className="h-2 w-2 rounded-full" style={{ background: s.color }} />
                      {s.nombre}
                    </span>
                  ))}
                </div>
              )}
              <Link href={`/admin/mesas?salon=${salonId}&vista=sectores`} className={`${enlace} mt-1`}>
                {sectores.length ? "Editar sectores" : "Armar sectores"} →
              </Link>
            </div>
          </div>
        ) : (
          <p className="text-[13px] text-tinta-suave">Activá el salón para ver y editar sus mesas.</p>
        )}
      </Fila>
    </Seccion>
  );
}

function SeccionZona({
  ficha,
  mesas,
  onAlternarActivo,
  onBorrar,
}: {
  ficha: Ficha;
  mesas: number;
  onAlternarActivo: () => void;
  onBorrar: () => void;
}) {
  const boton = "rounded-lg border px-3.5 py-2 text-[13.5px] font-bold";
  return (
    <Seccion titulo="Zona delicada" peligro>
      <Fila
        titulo={ficha.activo ? "Desactivar" : "Activar"}
        ayuda={ficha.activo ? "Deja de aparecer en el panel y en el link. No se borra nada y se puede volver a activar." : "Vuelve a aparecer en el panel y en el link."}
      >
        <button
          type="button"
          onClick={onAlternarActivo}
          className={`${boton} ${ficha.activo ? "border-ocupada/40 bg-superficie text-ocupada hover:bg-ocupada-suave" : "border-borde bg-superficie hover:bg-arena-suave"}`}
        >
          {ficha.activo ? "Desactivar salón" : "Activar salón"}
        </button>
      </Fila>
      <Fila titulo="Borrar" ayuda="Solo si no tiene mesas, reservas, lista de espera ni cierres de turno. Si tiene historial, conviene desactivarlo.">
        <button type="button" onClick={onBorrar} className={`${boton} border-ocupada/40 bg-superficie text-ocupada hover:bg-ocupada-suave`}>
          Borrar salón
        </button>
        {mesas > 0 && (
          <p className="mt-1.5 text-[12.5px] text-tinta-suave">
            Tiene {mesas} {mesas === 1 ? "mesa" : "mesas"}: pasalas a otro salón o borralas en{" "}
            <Link href="/admin/mesas" className="underline">
              Administrar mesas
            </Link>{" "}
            antes de borrarlo.
          </p>
        )}
      </Fila>
    </Seccion>
  );
}
