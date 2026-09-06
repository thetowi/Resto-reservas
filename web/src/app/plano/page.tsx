"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ApiError, getDia, getMeta } from "@/lib/api";
import { haySesion } from "@/lib/auth";
import { todayISO } from "@/lib/date";
import { turnoPorDefecto } from "@/lib/turno";
import type { Mesa, Salon, Turno } from "@/lib/types";
import PlanoSalon from "@/components/PlanoSalon";
import SalonSelector from "@/components/SalonSelector";

// Vista de solo lectura del plano del salón, para el rol Staff ("ver el
// plano... para estudiarlo" — no puede crear/mover mesas ni carteles, eso
// es exclusivo de /admin/mesas). Un Admin también puede entrar acá si
// quiere, simplemente no es su vista por defecto (la de él es /admin/mesas).
//
// El turno que se muestra sigue la misma regla que la pantalla principal
// (ver lib/turno.ts: antes de las 16hs Almuerzo, de ahi en mas Cena), y las
// mesas se piden ya resueltas para ESE turno (vía getDia, no getMeta): así
// se refleja una división puntual por turno (ver MesasPanel.tsx) en vez de
// mostrar siempre el plano permanente/estructural.
export default function PlanoPage() {
  const router = useRouter();
  const [listo, setListo] = useState(false);
  const [turno] = useState<Turno>(turnoPorDefecto);
  const [mesas, setMesas] = useState<Mesa[]>([]);
  const [salones, setSalones] = useState<Salon[]>([]);
  const [salonId, setSalonId] = useState<number | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!haySesion()) {
      router.replace("/login");
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setListo(true);
  }, [router]);

  // Trae la lista de salones (para el selector) y fija el salón inicial al
  // primero de la lista.
  useEffect(() => {
    if (!listo) return;
    getMeta()
      .then((meta) => {
        setSalones(meta.salones);
        if (meta.salones.length > 0) setSalonId((prev) => prev ?? meta.salones[0].id);
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : "Error cargando los salones"));
  }, [listo]);

  // Mesas del turno que corresponde ahora mismo, ya resueltas para hoy (si
  // hubo una división puntual, acá vienen las mitades en vez de la mesa
  // base entera).
  useEffect(() => {
    if (!listo || salonId === null) return;
    let activo = true;
    setCargando(true);
    getDia(todayISO(), salonId)
      .then((data) => {
        if (activo) setMesas(data[turno].mesas);
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : "Error cargando las mesas"))
      .finally(() => activo && setCargando(false));
    return () => {
      activo = false;
    };
  }, [listo, salonId, turno]);

  if (!listo) return null;

  return (
    <div className="mx-auto max-w-[1700px] px-6 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <Link href="/" className="text-xs text-tinta-suave underline hover:text-tinta">
            ← Volver a reservas
          </Link>
          <h1 className="mt-1 text-lg font-bold">
            Plano del salón{" "}
            <span className="font-normal text-tinta-suave">
              — {turno === "almuerzo" ? "Almuerzo" : "Cena"}
            </span>
          </h1>
        </div>
        {salonId !== null && (
          <SalonSelector salones={salones} salonId={salonId} onCambiar={setSalonId} />
        )}
      </div>

      {error && (
        <div className="mb-4 rounded-xl bg-ocupada-suave px-4 py-2.5 text-sm text-ocupada">{error}</div>
      )}

      {cargando || salonId === null ? (
        <div className="p-10 text-center text-tinta-suave">Cargando…</div>
      ) : (
        <PlanoSalon mesas={mesas} salonId={salonId} onMoverMesa={() => {}} soloLectura />
      )}
    </div>
  );
}