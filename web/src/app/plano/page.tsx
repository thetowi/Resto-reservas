"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ApiError, getDia, getMeta, patchMesa } from "@/lib/api";
import { esAdmin, haySesion } from "@/lib/auth";
import { formatFechaLarga, todayISO } from "@/lib/date";
import { turnoPorDefecto } from "@/lib/turno";
import type { Mesa, Salon, Turno } from "@/lib/types";
import PlanoSalon from "@/components/PlanoSalon";
import SalonSelector from "@/components/SalonSelector";

function esTurnoValido(valor: string | null): valor is Turno {
  return valor === "almuerzo" || valor === "cena";
}

// Vista del plano del salón para el turno elegido. Para el rol Staff sigue
// siendo de solo lectura ("ver el plano... para estudiarlo" — no puede
// crear/mover mesas ni carteles, eso es exclusivo de /admin/mesas). Un Admin
// que entra acá, en cambio, SÍ puede arrastrar mesas para acomodarlas — esto
// es lo único que deja mover las divisiones TEMPORALES por turno (ver
// MesasController.DividirPorTurno): esas mitades no existen en
// /admin/mesas (son propias de este turno puntual, no del plano fijo del
// salón), así que esta es la única pantalla donde alguna vez se las puede
// ver Y tocar al mismo tiempo. Mover una mesa PERMANENTE desde acá también
// funciona (mismo PATCH que usa /admin/mesas) y su posición queda igual
// para todos los turnos, como siempre.
//
// Respeta la fecha, turno y salón que estaban elegidos en la pantalla
// principal al momento de tocar "Mapa del salón"/"Plano" (ver ese link en
// app/page.tsx, que arma la URL con ?fecha=&turno=&salonId=). Si no vienen
// en la URL — por ejemplo entrando directo a /plano desde un acceso
// directo — cae al mismo default de siempre: fecha de hoy, el turno según
// la hora (ver lib/turno.ts) y el primer salón de la lista.
//
// useSearchParams necesita un limite de Suspense alrededor (si no, Next
// rompe el build de produccion): por eso el export default solo arma ese
// limite, y toda la logica real vive en PlanoPageInterno.
export default function PlanoPage() {
  return (
    <Suspense fallback={null}>
      <PlanoPageInterno />
    </Suspense>
  );
}

function PlanoPageInterno() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const fechaParam = searchParams.get("fecha");
  const turnoParam = searchParams.get("turno");
  const salonIdParam = searchParams.get("salonId");

  // fecha/turno NO van en useState: son puro derivado de la URL, se
  // recalculan en cada render. Guardarlos en useState (como estaba antes)
  // los "congelaba" en su valor inicial — /plano es siempre la misma ruta,
  // asi que al volver a entrar desde la hoja con otro turno, Next reusa la
  // MISMA instancia del componente en vez de remontarla, y un useState con
  // inicializador lazy solo corre una vez, en el primer montaje. Por eso
  // quedaba pegado en el primer turno que se haya visto en la sesión.
  const fecha = fechaParam || todayISO();
  const turno: Turno = esTurnoValido(turnoParam) ? turnoParam : turnoPorDefecto();

  const [listo, setListo] = useState(false);
  const [mesas, setMesas] = useState<Mesa[]>([]);
  const [salones, setSalones] = useState<Salon[]>([]);
  const [salonId, setSalonId] = useState<number | null>(() =>
    salonIdParam && !Number.isNaN(Number(salonIdParam)) ? Number(salonIdParam) : null,
  );
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

  // salonId sí necesita quedar en useState (el usuario lo puede cambiar a
  // mano con el selector, sin eso se perdería su elección en cada render),
  // pero por la misma razón que fecha/turno hay que releerlo de la URL cada
  // vez que ese parámetro cambia — si no, sufre el mismo "congelamiento" al
  // reentrar a /plano con otro salón desde la hoja.
  useEffect(() => {
    setSalonId(salonIdParam && !Number.isNaN(Number(salonIdParam)) ? Number(salonIdParam) : null);
  }, [salonIdParam]);

  // Trae la lista de salones (para el selector). Si vino un salonId por URL
  // y existe entre los salones reales, lo respeta tal cual; si no vino
  // ninguno (o el que vino ya no existe), cae al primero de la lista — mismo
  // default que antes.
  useEffect(() => {
    if (!listo) return;
    getMeta()
      .then((meta) => {
        setSalones(meta.salones);
        setSalonId((prev) => {
          if (prev !== null && meta.salones.some((s) => s.id === prev)) return prev;
          return meta.salones[0]?.id ?? null;
        });
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : "Error cargando los salones"));
  }, [listo]);

  // Mesas del turno y fecha elegidos, ya resueltas (si hubo una división
  // puntual, acá vienen las mitades en vez de la mesa base entera).
  useEffect(() => {
    if (!listo || salonId === null) return;
    let activo = true;
    setCargando(true);
    getDia(fecha, salonId)
      .then((data) => {
        if (activo) setMesas(data[turno].mesas);
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : "Error cargando las mesas"))
      .finally(() => activo && setCargando(false));
    return () => {
      activo = false;
    };
  }, [listo, salonId, turno, fecha]);

  // Solo se llama cuando puedeEditar es true (soloLectura=false en
  // PlanoSalon, ver mas abajo), pero igual queda gateado por el rol tambien
  // del lado del backend (MesasController.Actualizar es [Authorize(Roles =
  // "Admin")]) — asi que aunque alguien manipulara el cliente, un Staff
  // nunca podria mover una mesa de verdad.
  //
  // No usamos la respuesta del PATCH para actualizar el estado (a diferencia
  // de /admin/mesas): esa respuesta es la lista de mesas PERMANENTES de todo
  // el salon (ver MesasController.BroadcastMesasAsync), que no incluye las
  // divisiones temporales por turno — si la usaramos tal cual, esas mitades
  // desaparecerian del plano apenas se arrastra CUALQUIER mesa. En cambio
  // actualizamos solo la mesa movida, a mano, con la posicion que ya
  // sabemos que se guardo.
  async function onMoverMesa(mesa: Mesa, posX: number, posY: number) {
    try {
      await patchMesa(mesa.id, { posX, posY });
      setMesas((prev) => prev.map((m) => (m.id === mesa.id ? { ...m, posX, posY } : m)));
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo mover la mesa");
    }
  }

  // Mismo criterio que onMoverMesa: se actualiza a mano en vez de usar la
  // respuesta del PATCH, para no perder del estado las divisiones
  // temporales por turno (ver comentario de onMoverMesa).
  async function onCambiarForma(mesa: Mesa, forma: "redonda" | "cuadrada") {
    try {
      await patchMesa(mesa.id, { forma });
      setMesas((prev) => prev.map((m) => (m.id === mesa.id ? { ...m, forma } : m)));
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo cambiar la forma de la mesa");
    }
  }

  // Mismo criterio que onCambiarForma.
  async function onFijar(mesa: Mesa, fijada: boolean) {
    try {
      await patchMesa(mesa.id, { fijada });
      setMesas((prev) => prev.map((m) => (m.id === mesa.id ? { ...m, fijada } : m)));
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo fijar/desfijar la mesa");
    }
  }

  const puedeEditar = esAdmin();

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
              — {formatFechaLarga(fecha)} · {turno === "almuerzo" ? "Almuerzo" : "Cena"}
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
        // PlanoSalon guarda fecha/turno en su propio estado interno (tiene
        // su propio selector, más abajo — se puede seguir navegando una vez
        // adentro). Le pasamos una key atada a fecha+turno+salonId para que
        // se remonte de cero cada vez que se vuelve a entrar desde la hoja
        // con otra selección — si no, al ser siempre la misma ruta /plano,
        // quedaría pegado al primer fecha/turno que haya visto (mismo
        // problema que tenía esta página antes de este arreglo).
        <PlanoSalon
          key={`${fecha}-${turno}-${salonId}`}
          mesas={mesas}
          salonId={salonId}
          onMoverMesa={onMoverMesa}
          onCambiarForma={onCambiarForma}
          onFijar={onFijar}
          soloLectura={!puedeEditar}
          fechaInicial={fecha}
          turnoInicial={turno}
        />
      )}
    </div>
  );
}
