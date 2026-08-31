"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ApiError, borrarSalon, crearSalon, getSalones, patchSalon } from "@/lib/api";
import { esAdmin, haySesion } from "@/lib/auth";
import { crearConexion } from "@/lib/signalr";
import type { Salon } from "@/lib/types";

// Administración de salones (Restaurant, Bar, Aqua Bar, etc — ver
// Models/Salon.cs del lado del backend): crear, renombrar y borrar. Solo
// Admin — Staff elige entre los salones ya creados desde el selector de la
// pantalla principal, pero no puede tocar la lista en sí.
export default function AdminSalonesPage() {
  const router = useRouter();
  const [listo, setListo] = useState(false);
  const [salones, setSalones] = useState<Salon[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nuevoNombre, setNuevoNombre] = useState("");
  const [creando, setCreando] = useState(false);

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
    getSalones()
      .then(setSalones)
      .catch((e) => setError(e instanceof ApiError ? e.message : "Error cargando los salones"))
      .finally(() => setCargando(false));
  }, [listo]);

  // Cualquier cambio hecho desde otra pestaña/persona se refleja acá al
  // instante, igual que mesas/elementos de plano.
  useEffect(() => {
    if (!listo) return;
    const conexion = crearConexion();
    conexion.on("SalonesActualizados", (data: Salon[]) => setSalones(data));
    conexion.start().catch(() => {});
    return () => {
      conexion.stop();
    };
  }, [listo]);

  function manejarError(e: unknown) {
    setError(e instanceof ApiError ? e.message : "No se pudo completar la acción");
  }

  async function onCrear() {
    if (!nuevoNombre.trim()) return;
    setCreando(true);
    try {
      setSalones(await crearSalon(nuevoNombre.trim()));
      setNuevoNombre("");
      setError(null);
    } catch (e) {
      manejarError(e);
    } finally {
      setCreando(false);
    }
  }

  async function onRenombrar(salon: Salon, nombre: string) {
    if (nombre.trim() === salon.nombre || !nombre.trim()) return;
    try {
      setSalones(await patchSalon(salon.id, { nombre: nombre.trim() }));
      setError(null);
    } catch (e) {
      manejarError(e);
    }
  }

  async function onBorrar(salon: Salon) {
    if (!window.confirm(`¿Borrar el salón "${salon.nombre}"? Tiene que estar vacío (sin mesas).`)) return;
    try {
      setSalones(await borrarSalon(salon.id));
      setError(null);
    } catch (e) {
      manejarError(e);
    }
  }

  if (!listo) return null;

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <div className="mb-6">
        <Link href="/" className="text-xs text-tinta-suave underline hover:text-tinta">
          ← Volver a reservas
        </Link>
        <h1 className="mt-1 text-lg font-bold">Salones</h1>
      </div>

      <p className="mb-4 text-sm text-tinta-suave">
        Cada salón (Restaurant, Bar, Aqua Bar, etc.) tiene sus propias mesas, su propio plano y sus
        propias reservas, igual lógica que hoy pero por separado. Para borrar un salón primero hay
        que borrar (o pasar a otro salón) todas sus mesas desde{" "}
        <Link href="/admin/mesas" className="underline hover:text-tinta">
          Administrar mesas
        </Link>
        .
      </p>

      {error && (
        <div className="mb-4 rounded-xl bg-ocupada-suave px-4 py-2.5 text-sm text-ocupada">{error}</div>
      )}

      {cargando ? (
        <div className="p-10 text-center text-tinta-suave">Cargando…</div>
      ) : (
        <div className="rounded-2xl border border-borde bg-white shadow-sm">
          <div className="divide-y divide-borde">
            {salones.map((salon) => (
              <FilaSalon key={salon.id} salon={salon} onRenombrar={onRenombrar} onBorrar={onBorrar} />
            ))}
          </div>

          <div className="flex items-center gap-2.5 border-t border-borde p-3.5">
            <input
              className="w-48 rounded-lg border border-borde px-2.5 py-1.5 text-sm"
              placeholder="Nombre (ej: Bar)"
              value={nuevoNombre}
              onChange={(e) => setNuevoNombre(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && onCrear()}
            />
            <button
              disabled={creando || !nuevoNombre.trim()}
              onClick={onCrear}
              className="rounded-lg bg-tinta px-3.5 py-1.5 text-sm text-white disabled:opacity-40"
            >
              + Nuevo salón
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function FilaSalon({
  salon,
  onRenombrar,
  onBorrar,
}: {
  salon: Salon;
  onRenombrar: (salon: Salon, nombre: string) => void;
  onBorrar: (salon: Salon) => void;
}) {
  const [nombre, setNombre] = useState(salon.nombre);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setNombre(salon.nombre), [salon.nombre]);

  return (
    <div className="flex items-center gap-2.5 p-3.5">
      <input
        className="w-48 rounded-lg border border-borde px-2.5 py-1.5 text-sm font-semibold"
        value={nombre}
        onChange={(e) => setNombre(e.target.value)}
        onBlur={() => onRenombrar(salon, nombre)}
      />
      <button
        onClick={() => onBorrar(salon)}
        className="ml-auto rounded-lg border border-borde px-2.5 py-1 text-xs text-tinta-suave hover:bg-ocupada-suave hover:text-ocupada"
      >
        Borrar
      </button>
    </div>
  );
}
