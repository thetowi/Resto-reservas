"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ApiError,
  borrarMesa,
  crearMesa,
  dividirMesa,
  getMeta,
  patchMesa,
} from "@/lib/api";
import { esAdmin, haySesion } from "@/lib/auth";
import { crearConexion } from "@/lib/signalr";
import type { Mesa, Salon } from "@/lib/types";
import PlanoSalon from "@/components/PlanoSalon";
import SalonSelector from "@/components/SalonSelector";

export default function AdminMesasPage() {
  const router = useRouter();
  const [listo, setListo] = useState(false);
  const [todasLasMesas, setTodasLasMesas] = useState<Mesa[]>([]);
  const [salones, setSalones] = useState<Salon[]>([]);
  const [salonId, setSalonId] = useState<number | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nuevaAbierta, setNuevaAbierta] = useState(false);
  const [vista, setVista] = useState<"lista" | "plano">("lista");

  useEffect(() => {
    if (!haySesion()) {
      router.replace("/login");
      return;
    }
    // Administrar mesas (crear/dividir/mover/borrar) es exclusivo de Admin;
    // Staff tiene su propia vista de solo lectura en /plano.
    if (!esAdmin()) {
      router.replace("/plano");
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setListo(true);
  }, [router]);

  useEffect(() => {
    if (!listo) return;
    getMeta()
      .then((meta) => {
        setTodasLasMesas(meta.mesas);
        setSalones(meta.salones);
        if (meta.salones.length > 0) setSalonId((prev) => prev ?? meta.salones[0].id);
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : "Error cargando las mesas"))
      .finally(() => setCargando(false));
  }, [listo]);

  // Cualquier cambio hecho desde otra pantalla (u otra persona) se refleja
  // aca al instante, igual que en la pantalla principal de reservas.
  useEffect(() => {
    if (!listo) return;
    const conexion = crearConexion();
    conexion.on("MesasActualizado", (data: Mesa[]) => setTodasLasMesas(data));
    conexion.on("SalonesActualizados", (data: Salon[]) => setSalones(data));
    conexion.start().catch(() => {});
    return () => {
      conexion.stop();
    };
  }, [listo]);

  // Solo las mesas del salon elegido: cada salon administra su propio
  // plano/lista de mesas por separado.
  const mesas = useMemo(
    () => todasLasMesas.filter((m) => m.salonId === salonId),
    [todasLasMesas, salonId],
  );

  const bases = useMemo(
    () =>
      mesas
        .filter((m) => m.mesaPadreId === null)
        .sort((a, b) => a.orden - b.orden)
        .map((base) => ({
          base,
          divisiones: mesas
            .filter((m) => m.mesaPadreId === base.id)
            .sort((a, b) => a.orden - b.orden),
        })),
    [mesas],
  );

  // Suma TODAS las mesas del salon elegido (bases y divisiones): dividir le
  // resta la capacidad de la division a la base (ver MesasController.Dividir),
  // asi que sumar las dos por separado ya no duplica nada — omitir las
  // divisiones, como se hacia antes, dejaba el total de menos.
  const totalPax = mesas.reduce((acc, m) => acc + m.capacidad, 0);

  function manejarError(e: unknown) {
    setError(e instanceof ApiError ? e.message : "No se pudo completar la acción");
  }

  async function onGuardarCodigo(mesa: Mesa, codigo: string) {
    if (codigo.trim() === mesa.codigo) return;
    try {
      setTodasLasMesas(await patchMesa(mesa.id, { codigo: codigo.trim() }));
      setError(null);
    } catch (e) {
      manejarError(e);
    }
  }

  async function onGuardarCapacidad(mesa: Mesa, capacidad: number) {
    if (!Number.isFinite(capacidad) || capacidad <= 0 || capacidad === mesa.capacidad) return;
    try {
      setTodasLasMesas(await patchMesa(mesa.id, { capacidad }));
      setError(null);
    } catch (e) {
      manejarError(e);
    }
  }

  async function onBorrar(mesa: Mesa) {
    try {
      setTodasLasMesas(await borrarMesa(mesa.id));
      setError(null);
    } catch (e) {
      manejarError(e);
    }
  }

  async function onDividir(mesa: Mesa, codigo: string, capacidad: number) {
    try {
      setTodasLasMesas(await dividirMesa(mesa.id, codigo, capacidad));
      setError(null);
    } catch (e) {
      manejarError(e);
    }
  }

  async function onCrearMesa(codigo: string, capacidad: number) {
    if (salonId === null) return;
    try {
      setTodasLasMesas(await crearMesa(codigo, capacidad, salonId));
      setNuevaAbierta(false);
      setError(null);
    } catch (e) {
      manejarError(e);
    }
  }

  async function onMoverMesa(mesa: Mesa, posX: number, posY: number) {
    try {
      setTodasLasMesas(await patchMesa(mesa.id, { posX, posY }));
    } catch (e) {
      manejarError(e);
    }
  }

  if (!listo) return null;

  return (
    // La vista "Plano" necesita bastante mas ancho que la lista para que el
    // mapa del salon se vea grande de verdad, asi que en esa pestaña el
    // contenedor se estira mucho mas.
    <div className={`mx-auto px-6 py-8 ${vista === "plano" ? "max-w-[1700px]" : "max-w-3xl"}`}>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <Link href="/" className="text-xs text-tinta-suave underline hover:text-tinta">
            ← Volver a reservas
          </Link>
          <h1 className="mt-1 text-lg font-bold">Administrar mesas</h1>
        </div>
        <div className="flex items-center gap-3">
          {salonId !== null && (
            <SalonSelector salones={salones} salonId={salonId} onCambiar={setSalonId} />
          )}
          <Link
            href="/admin/salones"
            className="rounded-lg border border-borde px-3 py-1.5 text-sm hover:bg-arena-suave"
          >
            Administrar salones
          </Link>
          <div className="rounded-xl border border-borde bg-superficie px-4 py-2.5 text-sm">
            Capacidad de este salón: <strong className="text-tinta">{totalPax} pax</strong>
          </div>
        </div>
      </div>

      <p className="mb-4 text-sm text-tinta-suave">
        Cada mesa tiene un código y una capacidad de pax (única dentro de este salón — otro salón
        puede tener su propia mesa con el mismo código). Una mesa se puede <strong>dividir</strong> en
        dos mesas independientes y más chicas (por ejemplo &quot;50&quot; y &quot;50b&quot;), cada una con su
        propia capacidad — el total de este salón cuenta solo las mesas base, no sus divisiones,
        porque dividir no agrega asientos nuevos.
      </p>

      <div className="mb-4 inline-flex rounded-lg border border-borde bg-arena-suave/60 p-1">
        <button
          onClick={() => setVista("lista")}
          aria-pressed={vista === "lista"}
          className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
            vista === "lista" ? "bg-marca text-white" : "text-tinta-suave hover:bg-superficie"
          }`}
        >
          Lista
        </button>
        <button
          onClick={() => setVista("plano")}
          aria-pressed={vista === "plano"}
          className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
              vista === "plano" ? "bg-marca text-white" : "text-tinta-suave hover:bg-superficie"
          }`}
        >
          Plano
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-xl bg-ocupada-suave px-4 py-2.5 text-sm text-ocupada">
          {error}
        </div>
      )}

      {cargando ? (
        <div className="p-10 text-center text-tinta-suave">Cargando…</div>
      ) : vista === "plano" && salonId !== null ? (
        <PlanoSalon mesas={mesas} salonId={salonId} onMoverMesa={onMoverMesa} />
      ) : (
        <div className="rounded-2xl border border-borde bg-superficie shadow-sm">
          <div className="divide-y divide-borde">
            {bases.map(({ base, divisiones }) => (
              <MesaGrupo
                key={base.id}
                base={base}
                divisiones={divisiones}
                onGuardarCodigo={onGuardarCodigo}
                onGuardarCapacidad={onGuardarCapacidad}
                onBorrar={onBorrar}
                onDividir={onDividir}
              />
            ))}
          </div>

          <div className="border-t border-borde p-4">
            {nuevaAbierta ? (
              <FormularioMesa
                placeholder="Código (ej: 70)"
                onCancelar={() => setNuevaAbierta(false)}
                onGuardar={onCrearMesa}
              />
            ) : (
              <button
                onClick={() => setNuevaAbierta(true)}
                className="rounded-lg border border-dashed border-arena px-3.5 py-1.5 text-sm hover:bg-arena-suave"
              >
                + Nueva mesa
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

interface MesaGrupoProps {
  base: Mesa;
  divisiones: Mesa[];
  onGuardarCodigo: (mesa: Mesa, codigo: string) => void;
  onGuardarCapacidad: (mesa: Mesa, capacidad: number) => void;
  onBorrar: (mesa: Mesa) => void;
  onDividir: (mesa: Mesa, codigo: string, capacidad: number) => void;
}

function MesaGrupo({
  base,
  divisiones,
  onGuardarCodigo,
  onGuardarCapacidad,
  onBorrar,
  onDividir,
}: MesaGrupoProps) {
  const [dividiendo, setDividiendo] = useState(false);

  return (
    <div className="p-3.5">
      <MesaFila
        mesa={base}
        puedeBorrar={divisiones.length === 0}
        onGuardarCodigo={onGuardarCodigo}
        onGuardarCapacidad={onGuardarCapacidad}
        onBorrar={onBorrar}
        extra={
          !dividiendo && (
            <button
              onClick={() => setDividiendo(true)}
              disabled={base.capacidad < 2}
              title={base.capacidad < 2 ? "No quedan pax disponibles para dividir" : undefined}
              className="rounded-lg border border-borde px-2.5 py-1 text-xs hover:bg-arena-suave disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
            >
              Dividir
            </button>
          )
        }
      />

      {divisiones.map((division) => (
        <div key={division.id} className="mt-2 ml-6 border-l-2 border-borde pl-3.5">
          <MesaFila
            mesa={division}
            puedeBorrar
            onGuardarCodigo={onGuardarCodigo}
            onGuardarCapacidad={onGuardarCapacidad}
            onBorrar={onBorrar}
          />
        </div>
      ))}

      {dividiendo && (
        <div className="mt-2.5 ml-6 border-l-2 border-borde pl-3.5">
          <p className="mb-1.5 text-xs text-tinta-suave">
            La mesa {base.codigo} tiene <strong>{base.capacidad} pax</strong> disponibles para repartir — lo que
            le asignes a la división se le resta a la base.
          </p>
          <FormularioMesa
            placeholder={`Código (ej: ${base.codigo}b)`}
            capacidadMaxima={base.capacidad - 1}
            onCancelar={() => setDividiendo(false)}
            onGuardar={(codigo, capacidad) => {
              onDividir(base, codigo, capacidad);
              setDividiendo(false);
            }}
          />
        </div>
      )}
    </div>
  );
}

interface MesaFilaProps {
  mesa: Mesa;
  puedeBorrar: boolean;
  onGuardarCodigo: (mesa: Mesa, codigo: string) => void;
  onGuardarCapacidad: (mesa: Mesa, capacidad: number) => void;
  onBorrar: (mesa: Mesa) => void;
  extra?: React.ReactNode;
}

function MesaFila({ mesa, puedeBorrar, onGuardarCodigo, onGuardarCapacidad, onBorrar, extra }: MesaFilaProps) {
  const [codigo, setCodigo] = useState(mesa.codigo);
  const [capacidad, setCapacidad] = useState(String(mesa.capacidad));

  // Sincroniza el input con la mesa cuando cambia por una via externa (otra
  // persona la edito, o llego un broadcast de SignalR) — no cuando el
  // cambio lo genera el propio onBlur de este input, que ya actualiza el
  // valor via el estado local antes de que vuelva el mesa actualizado.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setCodigo(mesa.codigo), [mesa.codigo]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setCapacidad(String(mesa.capacidad)), [mesa.capacidad]);

  return (
    <div className="flex flex-wrap items-center gap-2.5">
      <input
        className="w-24 rounded-lg border border-borde px-2.5 py-1.5 text-sm font-semibold"
        value={codigo}
        onChange={(e) => setCodigo(e.target.value)}
        onBlur={() => onGuardarCodigo(mesa, codigo)}
      />
      <div className="flex items-center gap-1.5 text-sm text-tinta-suave">
        <input
          type="number"
          min={1}
          className="w-16 rounded-lg border border-borde px-2.5 py-1.5 text-sm"
          value={capacidad}
          onChange={(e) => setCapacidad(e.target.value)}
          onBlur={() => onGuardarCapacidad(mesa, Number(capacidad))}
        />
        <span>pax</span>
      </div>
      <div className="ml-auto flex items-center gap-1.5">
        {extra}
        <button
          title={puedeBorrar ? "Borrar mesa" : "Borrá primero sus divisiones"}
          disabled={!puedeBorrar}
          onClick={() => onBorrar(mesa)}
          className="rounded-lg border border-borde px-2.5 py-1 text-xs text-tinta-suave hover:bg-ocupada-suave hover:text-ocupada disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-tinta-suave"
        >
          Borrar
        </button>
      </div>
    </div>
  );
}

interface FormularioMesaProps {
  placeholder: string;
  onCancelar: () => void;
  onGuardar: (codigo: string, capacidad: number) => void;
  // Solo se pasa desde el flujo de "Dividir": limita cuanto se le puede
  // asignar a la division, porque sale de los pax que le quedan a la base.
  capacidadMaxima?: number;
}

function FormularioMesa({ placeholder, onCancelar, onGuardar, capacidadMaxima }: FormularioMesaProps) {
  const [codigo, setCodigo] = useState("");
  const [capacidad, setCapacidad] = useState("2");

  const capacidadInvalida =
    Number(capacidad) <= 0 || (capacidadMaxima !== undefined && Number(capacidad) > capacidadMaxima);

  return (
    <div className="flex flex-wrap items-center gap-2.5">
      <input
        autoFocus
        className="w-32 rounded-lg border border-borde px-2.5 py-1.5 text-sm"
        placeholder={placeholder}
        value={codigo}
        onChange={(e) => setCodigo(e.target.value)}
      />
      <div className="flex items-center gap-1.5 text-sm text-tinta-suave">
        <input
          type="number"
          min={1}
          max={capacidadMaxima}
          className="w-16 rounded-lg border border-borde px-2.5 py-1.5 text-sm"
          value={capacidad}
          onChange={(e) => setCapacidad(e.target.value)}
        />
        <span>pax</span>
      </div>
      <button
        disabled={!codigo.trim() || capacidadInvalida}
        onClick={() => onGuardar(codigo.trim(), Number(capacidad))}
        className="rounded-lg bg-tinta px-3 py-1.5 text-sm text-white disabled:opacity-40"
      >
        Guardar
      </button>
      <button onClick={onCancelar} className="text-sm text-tinta-suave underline">
        Cancelar
      </button>
    </div>
  );
}
