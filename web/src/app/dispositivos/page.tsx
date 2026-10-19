"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getDispositivos, quitarDispositivo } from "@/lib/api";
import { getLlave, getNombre, haySesion } from "@/lib/auth";
import AvisosDispositivo from "@/components/AvisosDispositivo";
import ListaDispositivos from "@/components/ListaDispositivos";

// «Avisos y dispositivos» (mockup capax-avisos-y-recordarme): prender los
// avisos de reservas web en este dispositivo y ver / cerrar los otros donde
// la sesión quedó abierta con «Recordarme».
export default function DispositivosPage() {
  const router = useRouter();
  const [listo, setListo] = useState(false);
  const [recordado, setRecordado] = useState(false);
  const [nombre, setNombre] = useState<string | null>(null);

  useEffect(() => {
    if (!haySesion()) {
      router.replace("/login");
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRecordado(!!getLlave());
    setNombre(getNombre());
    setListo(true);
  }, [router]);

  if (!listo) return null;

  return (
    <div className="mx-auto grid max-w-xl gap-6 px-4 py-8 sm:px-6">
      <div>
        <Link href="/" className="text-xs text-tinta-suave underline hover:text-tinta">
          ← Volver a reservas
        </Link>
        <h1 className="mt-1 text-lg font-bold">Avisos y dispositivos</h1>
        <p className="mt-1 text-sm text-tinta-suave">{nombre ? `${nombre} · ` : ""}dónde te llegan los avisos y dónde tenés la sesión abierta.</p>
      </div>

      <section className="grid gap-2">
        <h2 className="text-[11px] font-bold tracking-[0.12em] text-tinta-suave uppercase">Este dispositivo</h2>
        <AvisosDispositivo />
        {!recordado && (
          <p className="text-xs text-tinta-suave">
            Entraste sin «Recordarme»: la sesión acá se cierra a las 12 horas. Para que no se cierre, salí y volvé a entrar tildándolo.
          </p>
        )}
      </section>

      <section className="grid gap-2">
        <h2 className="text-[11px] font-bold tracking-[0.12em] text-tinta-suave uppercase">Mis dispositivos</h2>
        <ListaDispositivos cargar={getDispositivos} quitar={(d) => quitarDispositivo(d.tipo, d.id)} />
        <p className="text-xs text-tinta-suave">
          Una sesión recordada se cierra sola si el dispositivo no se usa en 90 días, al cambiar la contraseña o al tocar «Salir».
        </p>
      </section>
    </div>
  );
}
