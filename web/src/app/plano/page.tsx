"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ApiError, getMeta } from "@/lib/api";
import { haySesion } from "@/lib/auth";
import type { Mesa, Salon } from "@/lib/types";
import PlanoSalon from "@/components/PlanoSalon";
import SalonSelector from "@/components/SalonSelector";

// Vista de solo lectura del plano del salón, para el rol Staff ("ver el
// plano... para estudiarlo" — no puede crear/mover mesas ni carteles, eso
// es exclusivo de /admin/mesas). Un Admin también puede entrar acá si
// quiere, simplemente no es su vista por defecto (la de él es /admin/mesas).
export default function PlanoPage() {
  const router = useRouter();
  const [listo, setListo] = useState(false);
  const [todasLasMesas, setTodasLasMesas] = useState<Mesa[]>([]);
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

  const mesas = useMemo(
    () => todasLasMesas.filter((m) => m.salonId === salonId),
    [todasLasMesas, salonId],
  );

  if (!listo) return null;

  return (
    <div className="mx-auto max-w-[1700px] px-6 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <Link href="/" className="text-xs text-tinta-suave underline hover:text-tinta">
            ← Volver a reservas
          </Link>
          <h1 className="mt-1 text-lg font-bold">Plano del salón</h1>
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
