"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { HubConnectionState, type HubConnection } from "@microsoft/signalr";
import { getDia, getEspera, getMeta, ApiError } from "@/lib/api";
import { cerrarSesion, esAdmin, getNombre, haySesion } from "@/lib/auth";
import { addDays, formatFechaLarga, todayISO } from "@/lib/date";
import { crearConexion } from "@/lib/signalr";
import type { Dia, Espera, Mesa, Meta, Salon, Turno, TurnoData } from "@/lib/types";
import DateNav from "@/components/DateNav";
import ReporteImpresion from "@/components/ReporteImpresion";
import SalonSelector from "@/components/SalonSelector";
import ShiftSection from "@/components/ShiftSection";
import ThemeToggle from "@/components/ThemeToggle";
import TurnoToggle from "@/components/TurnoToggle";

// Antes de las 18hs mostramos Almuerzo por defecto, de ahi en mas Cena. Es
// solo un valor inicial: el usuario lo puede cambiar libremente con el
// selector, y siempre queda uno de los dos elegido.
function turnoPorDefecto(): Turno {
  return new Date().getHours() < 18 ? "almuerzo" : "cena";
}

export default function HomePage() {
  const router = useRouter();
  const [listo, setListo] = useState(false);
  const [fecha, setFecha] = useState(todayISO());
  const [turno, setTurno] = useState<Turno>(turnoPorDefecto);
  const [meta, setMeta] = useState<Meta | null>(null);
  // Salon elegido en pantalla (Restaurant, Bar, Aqua Bar, etc): arranca en
  // null hasta que "meta" carga, y ahi se fija al primero de la lista (por
  // Orden) — el usuario lo puede cambiar libremente con el selector.
  const [salonId, setSalonId] = useState<number | null>(null);
  const [dia, setDia] = useState<Dia | null>(null);
  const [espera, setEspera] = useState<Espera[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nombre, setNombre] = useState<string | null>(null);
  const [admin, setAdmin] = useState(false);
  // Datos para la vista de impresion (ver ReporteImpresion.tsx): a
  // diferencia de "espera" (que solo trae el turno seleccionado en
  // pantalla), la impresion necesita los dos turnos juntos, asi que se
  // piden aparte al apretar "Imprimir" en vez de mantenerlos siempre en
  // memoria.
  const [esperaImpresion, setEsperaImpresion] = useState<{ almuerzo: Espera[]; cena: Espera[] } | null>(
    null,
  );
  const [imprimiendo, setImprimiendo] = useState(false);

  const fechaRef = useRef(fecha);
  const turnoRef = useRef(turno);
  const salonIdRef = useRef(salonId);
  const conexionRef = useRef<HubConnection | null>(null);

  useEffect(() => {
    fechaRef.current = fecha;
  }, [fecha]);

  useEffect(() => {
    turnoRef.current = turno;
  }, [turno]);

  useEffect(() => {
    salonIdRef.current = salonId;
  }, [salonId]);

  // Gate de sesion: solo se puede evaluar del lado del cliente (localStorage),
  // asi que necesariamente corre en un efecto post-montaje y actualiza estado
  // una unica vez. Es el patron estandar para paginas protegidas en el App
  // Router cuando la sesion vive en localStorage y no en una cookie legible
  // por el servidor.
  useEffect(() => {
    if (!haySesion()) {
      router.replace("/login");
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNombre(getNombre());
    setAdmin(esAdmin());
    setListo(true);
  }, [router]);

  // Cargar mesas/salones una sola vez
  useEffect(() => {
    if (!listo) return;
    getMeta()
      .then(setMeta)
      .catch((e) => setError(e instanceof ApiError ? e.message : "Error cargando datos"));
  }, [listo]);

  // Apenas llega "meta" por primera vez, fija el salon elegido al primero de
  // la lista (por Orden) — no se vuelve a tocar despues, para no pisarle la
  // eleccion al usuario cuando "meta" se actualiza por otros motivos
  // (ej. alguien creo una mesa nueva).
  useEffect(() => {
    if (meta && salonId === null && meta.salones.length > 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSalonId(meta.salones[0].id);
    }
  }, [meta, salonId]);

  const suscribirA = useCallback(async (f: string, s: number) => {
    const conexion = conexionRef.current;
    if (!conexion || conexion.state !== HubConnectionState.Connected) return;
    await conexion.invoke("Suscribirse", f, "almuerzo", s);
    await conexion.invoke("Suscribirse", f, "cena", s);
  }, []);

  const desuscribirDe = useCallback(async (f: string, s: number) => {
    const conexion = conexionRef.current;
    if (!conexion || conexion.state !== HubConnectionState.Connected) return;
    await conexion.invoke("Desuscribirse", f, "almuerzo", s).catch(() => {});
    await conexion.invoke("Desuscribirse", f, "cena", s).catch(() => {});
  }, []);

  // Conexion SignalR: se arma una vez, se re-suscribe cuando cambia la fecha
  // o el salon.
  useEffect(() => {
    if (!listo) return;
    const conexion = crearConexion();
    conexionRef.current = conexion;

    conexion.on("TurnoActualizado", (data: TurnoData) => {
      if (data.fecha !== fechaRef.current || data.salonId !== salonIdRef.current) return;
      setDia((prev) => (prev ? { ...prev, [data.turno]: data } : prev));
    });

    // Las mesas son globales (no dependen de fecha/turno/salon): cualquier
    // cambio hecho desde /admin/mesas, por cualquier persona conectada, se
    // refleja aca al instante sin recargar. El frontend filtra por salon
    // elegido donde haga falta.
    conexion.on("MesasActualizado", (mesas: Mesa[]) => {
      setMeta((prev) => (prev ? { ...prev, mesas } : prev));
    });

    conexion.on("SalonesActualizados", (salones: Salon[]) => {
      setMeta((prev) => (prev ? { ...prev, salones } : prev));
    });

    // La lista de espera viaja en el mismo grupo fecha:turno:salon que las
    // reservas (ver suscribirA: nos suscribimos a almuerzo y cena de la
    // fecha+salon elegidos), asi que filtramos por turno y salon ademas de
    // fecha antes de aplicar la actualizacion.
    conexion.on(
      "EsperaActualizada",
      (data: { fecha: string; turno: Turno; salonId: number; lista: Espera[] }) => {
        if (
          data.fecha !== fechaRef.current ||
          data.turno !== turnoRef.current ||
          data.salonId !== salonIdRef.current
        ) {
          return;
        }
        setEspera(data.lista);
      },
    );

    // Ojo con el orden acá: start() es async, así que en el momento en que
    // se monta este efecto la conexión todavía NO está conectada. El efecto
    // de "cargar el día" (más abajo) también intenta suscribirse cuando
    // cambia la fecha, pero si corre antes de que esta promesa resuelva, se
    // encuentra la conexión sin conectar y se rinde sin reintentar — eso
    // hacía que el panel de mesas (que depende 100% del broadcast, a
    // diferencia de las filas de reserva que tienen su propio estado local)
    // se quedara pintado con el color viejo hasta recargar la página. Por
    // eso acá, apenas termina de conectar, nos suscribimos nosotros mismos
    // a la fecha/salon actual (vía las refs, no el closure de "fecha").
    conexion
      .start()
      .then(() => {
        if (salonIdRef.current !== null) suscribirA(fechaRef.current, salonIdRef.current);
      })
      .catch(() => {
        // si falla la conexion en tiempo real, la app sigue funcionando
        // igual con fetch normal, solo sin actualizaciones en vivo
      });

    // Si se corta y vuelve la conexion (wifi, servidor reiniciado, etc.),
    // SignalR reconecta solo (withAutomaticReconnect), pero los grupos hay
    // que volver a pedirlos a mano: el servidor no se acuerda a que grupos
    // estaba un ConnectionId que ya no existe.
    conexion.onreconnected(() => {
      if (salonIdRef.current !== null) suscribirA(fechaRef.current, salonIdRef.current);
    });

    return () => {
      conexion.stop();
    };
  }, [listo, suscribirA]);

  // Cargar el dia + (re)suscribirse cuando cambia la fecha o el salon. El
  // fetch depende de "fecha"/"salonId" (estado de React), asi que tiene que
  // vivir en un efecto; el setCargando(true) inicial es necesario para
  // mostrar el loader mientras el fetch esta en vuelo.
  useEffect(() => {
    if (!listo || salonId === null) return;
    let activo = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCargando(true);

    getDia(fecha, salonId)
      .then((data) => {
        if (activo) setDia(data);
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : "Error cargando el día"))
      .finally(() => activo && setCargando(false));

    suscribirA(fecha, salonId);

    return () => {
      activo = false;
      desuscribirDe(fecha, salonId);
    };
  }, [listo, fecha, salonId, suscribirA, desuscribirDe]);

  // La lista de espera es propia de fecha+turno+salon (a diferencia de
  // "dia", que ya trae los dos turnos juntos), asi que se recarga cuando
  // cambia cualquiera de los tres.
  useEffect(() => {
    if (!listo || salonId === null) return;
    let activo = true;
    getEspera(fecha, turno, salonId)
      .then((lista) => {
        if (activo) setEspera(lista);
      })
      .catch(() => {
        // si falla, la pantalla sigue funcionando igual sin lista de espera
      });
    return () => {
      activo = false;
    };
  }, [listo, fecha, turno, salonId]);

  function salir() {
    cerrarSesion();
    router.push("/login");
  }

  // "Impresion del dia": trae los dos turnos completos (independiente de
  // cual este seleccionado en pantalla) antes de disparar window.print(),
  // para que ReporteImpresion tenga todo listo cuando el navegador arma el
  // documento. El requestAnimationFrame le da un tick al DOM para que el
  // bloque "print:block" recien montado (con los datos ya en estado) se
  // termine de renderizar antes de imprimir.
  async function imprimir() {
    if (salonId === null) return;
    setImprimiendo(true);
    try {
      const [datosAlmuerzo, datosCena] = await Promise.all([
        getEspera(fecha, "almuerzo", salonId),
        getEspera(fecha, "cena", salonId),
      ]);
      setEsperaImpresion({ almuerzo: datosAlmuerzo, cena: datosCena });
      requestAnimationFrame(() => window.print());
    } catch {
      setError("No se pudo preparar la impresión del día");
    } finally {
      setImprimiendo(false);
    }
  }

  if (!listo) return null;

  // Mesas del salon elegido nada mas: se usa como fallback para el reporte
  // impreso (que necesita los dos turnos juntos y no tiene sentido pedirle
  // que resuelva divisiones puntuales). La grilla de reservas y el panel de
  // "Mesas disponibles" usan, en cambio, la lista propia de cada turno
  // (dia.almuerzo.mesas / dia.cena.mesas), que ya viene resuelta por el
  // backend con las mitades temporales si hubo una division por turno.
  const mesasDelSalon = meta?.mesas.filter((m) => m.salonId === salonId) ?? [];
  const salonActual = meta?.salones.find((s) => s.id === salonId) ?? null;

  return (
    <div>
      {/* Toda la UI interactiva se oculta al imprimir: lo unico que debe
          quedar en el papel es ReporteImpresion (mas abajo, "hidden
          print:block"). */}
      <div className="print:hidden">
      <header className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-6 border-b border-borde bg-superficie px-7 py-4.5">
        <div className="flex items-center gap-3">
          <div className="flex h-10.5 w-10.5 items-center justify-center rounded-[10px] bg-tinta text-lg font-bold text-arena">
            B
          </div>
          <div>
            <div className="text-sm font-bold tracking-wide">BARRANCAS</div>
            <div className="text-xs text-tinta-suave">Restaurant · Reservas</div>
          </div>
        </div>
        <DateNav
          fecha={fecha}
          titulo={formatFechaLarga(fecha)}
          esHoy={fecha === todayISO()}
          onPrev={() => setFecha((f) => addDays(f, -1))}
          onNext={() => setFecha((f) => addDays(f, 1))}
          onHoy={() => setFecha(todayISO())}
          onFecha={setFecha}
        />
        {meta && salonId !== null && (
          <SalonSelector salones={meta.salones} salonId={salonId} onCambiar={setSalonId} />
        )}
        <TurnoToggle turno={turno} onCambiar={setTurno} />
        <div className="flex items-center gap-3 text-sm text-tinta-suave">
          {nombre && <span>Hola, {nombre}</span>}
          {admin ? (
            <>
              <Link
                href="/admin/mesas"
                className="rounded-lg border border-borde px-3 py-1.5 hover:bg-arena-suave"
              >
                Mesas
              </Link>
              <Link
                href="/plano"
                className="rounded-lg border border-borde px-3 py-1.5 hover:bg-arena-suave"
              >
                Mapa del salón
              </Link>
              <Link
                href="/admin/salones"
                className="rounded-lg border border-borde px-3 py-1.5 hover:bg-arena-suave"
              >
                Salones
              </Link>
              <Link
                href="/admin/usuarios"
                className="rounded-lg border border-borde px-3 py-1.5 hover:bg-arena-suave"
              >
                Usuarios
              </Link>
              <Link
                href="/reportes"
                className="rounded-lg border border-borde px-3 py-1.5 hover:bg-arena-suave"
              >
                Reportes
              </Link>
            </>
          ) : (
            // El Staff solo puede "ver el plano... para estudiarlo": nada de
            // crear/mover mesas, eso es exclusivo de /admin/mesas.
            <Link href="/plano" className="rounded-lg border border-borde px-3 py-1.5 hover:bg-arena-suave">
              Plano
            </Link>
          )}
                    <button
            onClick={imprimir}
            disabled={imprimiendo}
            className="rounded-lg border border-borde px-3 py-1.5 hover:bg-arena-suave disabled:opacity-50"
          >
            {imprimiendo ? "Preparando…" : "Imprimir"}
          </button>
          <button onClick={salir} className="rounded-lg border border-borde px-3 py-1.5 hover:bg-arena-suave">
            Salir
          </button>
        </div>
      </header>

      <ThemeToggle />

      {error && (
        <div className="mx-7 mt-4 rounded-xl bg-ocupada-suave px-4 py-2.5 text-sm text-ocupada">
          {error}
        </div>
      )}

      {!meta || salonId === null || cargando || !dia ? (
        <div className="p-16 text-center text-tinta-suave">Cargando…</div>
      ) : (
        <main className="flex flex-col gap-7 px-7 py-6 pb-16">
          {turno === "almuerzo" ? (
            <ShiftSection
              titulo="Almuerzo"
              fecha={fecha}
              turno="almuerzo"
              salonId={salonId}
              salones={meta.salones}
              data={dia.almuerzo}
              mesas={dia.almuerzo.mesas}
              espera={espera}
              admin={admin}
              onEsperaActualizada={setEspera}
            />
          ) : (
            <ShiftSection
              titulo="Cena"
              fecha={fecha}
              turno="cena"
              salonId={salonId}
              salones={meta.salones}
              data={dia.cena}
              mesas={dia.cena.mesas}
              espera={espera}
              admin={admin}
              onEsperaActualizada={setEspera}
            />
          )}
        </main>
      )}
      </div>

      {dia && meta && esperaImpresion && (
        <ReporteImpresion
          fecha={fecha}
          salonNombre={salonActual?.nombre ?? null}
          mesas={mesasDelSalon}
          almuerzo={dia.almuerzo}
          cena={dia.cena}
          esperaAlmuerzo={esperaImpresion.almuerzo}
          esperaCena={esperaImpresion.cena}
        />
      )}
    </div>
  );
}