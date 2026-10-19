"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal, preload } from "react-dom";
import { SimboloCapax, WordmarkCapax } from "@/components/MarcaCapax";
import PlanoLogin from "@/components/PlanoLogin";
import ThemeToggle from "@/components/ThemeToggle";
import { linkGoogleCalendar, linkIcs, usaCalendarioApple } from "@/lib/calendario";
import { LOGOS_CLIENTE, NOMBRE_PUBLICO, PRIVACIDAD_CLIENTE, WHATSAPP_CLIENTE } from "@/lib/marca";
import { direccionMapa, opcionesMapa, type AppMapa } from "@/lib/mapas";
import {
  ErrorReserva,
  crearReservaPublica,
  getConfigPublica,
  getDiasPublicos,
  getDisponibilidad,
  type ConfigPublica,
  type DiaPublico,
  type DisponibilidadPublica,
  type ReservaCreada,
  type SalonDisponible,
  type UbicacionPublica,
  type TurnoPublico,
} from "@/lib/reservaPublica";

// Link publico de reservas: lo usa el cliente final, sin login. Pantalla por
// pantalla: cuantos son y que dia -> salon (solo si hay mas de uno activo) ->
// horario -> datos -> pedidos y resumen -> confirmacion. Todo lo que se
// muestra como disponible sale de /api/publico (ReservaOnlineService): solo
// salones activos, horarios de la planilla y solo los que tienen lugar.

type Paso = "cuando" | "salon" | "horario" | "datos" | "detalles";

const SEM = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const MES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const DIA_LARGO = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MES_LARGO = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
// Cuantos dias se ven en la tira; el resto (hasta config.diasAdelante) se
// elige con "Otra fecha", que abre el calendario.
const DIAS_TIRA = 14;
const NOMBRE_TURNO: Record<TurnoPublico, string> = { almuerzo: "Almuerzo", merienda: "Merienda", cena: "Cena" };
const EL_TURNO: Record<TurnoPublico, string> = { almuerzo: "el almuerzo", merienda: "la merienda", cena: "la cena" };
const OCASIONES = ["Cumpleaños", "Aniversario", "Negocios", "Silla para bebé"];

// "2026-10-17" -> Date local (sin corrimiento de zona horaria).
function aFecha(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}
const fechaTxt = (iso: string) => {
  const d = aFecha(iso);
  return `${SEM[d.getDay()]} ${d.getDate()} de ${MES[d.getMonth()]}`;
};
const personasTxt = (n: number) => `${n} ${n === 1 ? "persona" : "personas"}`;
// Un salon se puede elegir si tiene horarios libres o si tiene un turno que
// hay que mostrar igual: en servicio (por orden de llegada) o cerrado para la
// web (se reserva por WhatsApp). Antes solo contaba hayLugar y, con el turno
// en servicio, no se podia pasar del paso del salon.
const entrable = (s: SalonDisponible | null | undefined) => !!s && (s.hayLugar || s.turnos.some((t) => t.enServicio || t.porWhatsApp));
const seleccionable = (d: DiaPublico) => d.estado !== "lleno" && d.estado !== "bloqueado";

// Tiempo minimo de la pantalla "Confirmando tu reserva…": si la API responde
// muy rapido, evita que aparezca y desaparezca como un parpadeo.
const ESPERA_MINIMA_MS = 700;

// Las 8 sillas del simbolo capax (mismos arcos que SimboloCapax), para el
// indicador de espera: se van "ocupando" de a una, en ronda.
const ARCOS_SILLAS = Array.from({ length: 8 }, (_, i) => {
  const r = 18.5;
  const pt = (a: number) => {
    const t = (a * Math.PI) / 180;
    return `${(24 + r * Math.sin(t)).toFixed(2)} ${(24 - r * Math.cos(t)).toFixed(2)}`;
  };
  return `M${pt(i * 45 - 12)}A${r} ${r} 0 0 1 ${pt(i * 45 + 12)}`;
});

export default function ReservarPage() {
  const [config, setConfig] = useState<ConfigPublica | null>(null);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);

  const [pax, setPax] = useState(2);
  const [dias, setDias] = useState<DiaPublico[] | null>(null);
  // Calendario de "Otra fecha": todos los dias hasta config.diasAdelante
  // (se piden recien al abrirlo) y el mes que se esta mirando ("2026-11").
  const [calAbierto, setCalAbierto] = useState(false);
  const [diasCal, setDiasCal] = useState<DiaPublico[] | null>(null);
  const [mesCal, setMesCal] = useState<string | null>(null);
  const [fecha, setFecha] = useState<string | null>(null);
  const [disp, setDisp] = useState<DisponibilidadPublica | null>(null);
  const [cargandoDisp, setCargandoDisp] = useState(false);

  const [salonId, setSalonId] = useState<number | null>(null);
  const [turno, setTurno] = useState<TurnoPublico>("cena");
  const [hora, setHora] = useState<string | null>(null);

  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  const [huesped, setHuesped] = useState(false);
  const [habitacion, setHabitacion] = useState("");
  const [ocasion, setOcasion] = useState<string | null>(null);
  const [comentarios, setComentarios] = useState("");
  const [acepta, setAcepta] = useState(false);
  const [sitio, setSitio] = useState("");

  const [paso, setPaso] = useState(0);
  const [dir, setDir] = useState(1);
  const [aviso, setAviso] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<ReservaCreada | null>(null);
  const tituloRef = useRef<HTMLHeadingElement>(null);

  // El logo chico de la barra recien aparece en el paso 2: se baja de
  // antemano para que no "salte" al cambiar de pantalla.
  preload(LOGOS_CLIENTE.barra, { as: "image" });
  preload(LOGOS_CLIENTE.barraOscuro, { as: "image" });

  useEffect(() => {
    getConfigPublica()
      .then(setConfig)
      .catch((e) => setErrorCarga(e instanceof ErrorReserva ? e.message : "No pudimos cargar las reservas."));
  }, []);

  // Dias: se recalculan al cambiar la cantidad de personas (con una pequeña
  // espera, para no pedir uno por cada toque del + / -).
  useEffect(() => {
    if (!config) return;
    let activo = true;
    const t = setTimeout(() => {
      getDiasPublicos(pax, DIAS_TIRA)
        .then((lista) => {
          if (!activo) return;
          setDias(lista);
          setFecha((actual) => {
            const sigue = lista.find((d) => d.fecha === actual);
            if (sigue && seleccionable(sigue)) return actual;
            // Elegida en el calendario, mas alla de la tira: se mantiene (al
            // continuar se vuelve a consultar la disponibilidad de ese dia).
            if (actual && lista.length && actual > lista[lista.length - 1].fecha) return actual;
            return lista.find(seleccionable)?.fecha ?? null;
          });
        })
        .catch((e) => activo && setAviso(e instanceof ErrorReserva ? e.message : "No pudimos cargar los días."));
    }, 250);
    return () => {
      activo = false;
      clearTimeout(t);
    };
  }, [config, pax]);

  const salones = useMemo(() => config?.salones ?? [], [config]);
  const pasos: Paso[] = useMemo(
    () => ["cuando", ...(salones.length > 1 ? (["salon"] as Paso[]) : []), "horario", "datos", "detalles"],
    [salones.length],
  );
  const pasoActual = pasos[Math.min(paso, pasos.length - 1)];
  const salon = salones.find((s) => s.id === salonId) ?? null;
  const dispSalon = disp?.salones.find((s) => s.salonId === salonId) ?? null;
  const confirmaSola = !!salon && salon.confirmaSola && pax < (config?.limitePaxConfirmaSola ?? 6);

  // Celular con el teclado abierto: el navegador no achica la pagina, asi que
  // la barra fija de abajo (Continuar/Reservar) quedaba detras del teclado.
  // visualViewport dice cuanto de la pantalla tapa el teclado; con eso se
  // sube la barra (--rv-teclado en globals.css). Ademas, al entrar a un campo
  // se lo lleva al centro de lo visible, para que no quede debajo de la barra.
  useEffect(() => {
    const vv = window.visualViewport;
    const raiz = document.documentElement;
    let espera: ReturnType<typeof setTimeout> | undefined;
    const actualizar = () => {
      if (!vv) return;
      const tapado = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      raiz.style.setProperty("--rv-teclado", `${Math.round(tapado)}px`);
    };
    const alEnfocar = (e: FocusEvent) => {
      const el = e.target as HTMLElement | null;
      if (!el || !el.matches("input:not([type=checkbox]), textarea")) return;
      clearTimeout(espera);
      espera = setTimeout(() => el.scrollIntoView({ block: "center", behavior: "smooth" }), 300);
    };
    actualizar();
    vv?.addEventListener("resize", actualizar);
    vv?.addEventListener("scroll", actualizar);
    document.addEventListener("focusin", alEnfocar);
    return () => {
      clearTimeout(espera);
      vv?.removeEventListener("resize", actualizar);
      vv?.removeEventListener("scroll", actualizar);
      document.removeEventListener("focusin", alEnfocar);
      raiz.style.removeProperty("--rv-teclado");
    };
  }, []);

  // Al cambiar de pantalla: arriba de todo y foco en el titulo (lectores de
  // pantalla y teclado arrancan desde el principio de la pantalla nueva).
  useEffect(() => {
    window.scrollTo({ top: 0 });
    tituloRef.current?.focus({ preventScroll: true });
  }, [paso, resultado]);

  const elegirTurnoPorDefecto = useCallback((d: DisponibilidadPublica, id: number) => {
    const s = d.salones.find((x) => x.salonId === id);
    // Hoy con un turno ya en servicio: se muestra ese primero (es lo que
    // busca quien entra a la hora de comer), con el boton al otro turno.
    const enServicio = s?.turnos.find((t) => t.enServicio);
    const conLugar = s?.turnos.find((t) => t.horarios.some((h) => h.estado !== "sin_lugar"));
    if (enServicio) setTurno(enServicio.turno);
    else if (conLugar) setTurno(conLugar.turno);
  }, []);

  async function cargarDisponibilidad(): Promise<DisponibilidadPublica | null> {
    if (!fecha) return null;
    setCargandoDisp(true);
    try {
      const d = await getDisponibilidad(fecha, pax);
      setDisp(d);
      return d;
    } catch (e) {
      setAviso(e instanceof ErrorReserva ? e.message : "No pudimos cargar los horarios.");
      return null;
    } finally {
      setCargandoDisp(false);
    }
  }

  async function seguir() {
    setAviso(null);
    if (pasoActual === "cuando") {
      const d = await cargarDisponibilidad();
      if (!d) return;
      // Salon: se mantiene el elegido si sigue con lugar; si no, el primero que tenga.
      const actual = d.salones.find((s) => s.salonId === salonId && s.hayLugar);
      const id =
        actual?.salonId ?? d.salones.find((s) => s.hayLugar)?.salonId ?? d.salones.find((s) => entrable(s))?.salonId ?? d.salones[0]?.salonId ?? null;
      setSalonId(id);
      if (id !== null) elegirTurnoPorDefecto(d, id);
      setHora(null);
    }
    if (pasoActual === "salon" && disp && salonId !== null) {
      elegirTurnoPorDefecto(disp, salonId);
    }
    setDir(1);
    setPaso((p) => p + 1);
  }

  function atras() {
    setAviso(null);
    setDir(-1);
    setPaso((p) => Math.max(0, p - 1));
  }

  async function enviar() {
    if (!fecha || salonId === null || !hora) return;
    setEnviando(true);
    setAviso(null);
    const inicio = Date.now();
    try {
      const r = await crearReservaPublica({
        fecha,
        salonId,
        turno,
        hora,
        pax,
        nombre: nombre.trim(),
        telefono: telefono.trim(),
        habitacion: huesped ? habitacion.trim() || null : null,
        ocasion,
        comentarios: comentarios.trim() || null,
        aceptaPrivacidad: acepta,
        sitio,
      });
      const falta = ESPERA_MINIMA_MS - (Date.now() - inicio);
      if (falta > 0) await new Promise((ok) => setTimeout(ok, falta));
      setResultado(r);
    } catch (e) {
      const mensaje = e instanceof ErrorReserva ? e.message : "No pudimos hacer la reserva. Intentá de nuevo.";
      if (/horario/i.test(mensaje)) {
        // Se ocupo mientras completaba los datos: volver a elegir horario.
        await cargarDisponibilidad();
        setHora(null);
        setDir(-1);
        setPaso(pasos.indexOf("horario"));
      }
      setAviso(mensaje);
    } finally {
      setEnviando(false);
    }
  }

  function reiniciar() {
    setResultado(null);
    setHora(null);
    setAcepta(false);
    setDir(-1);
    setPaso(0);
  }

  function cargarCalendario(paxCal: number) {
    if (!config) return;
    setDiasCal(null);
    getDiasPublicos(paxCal, config.diasAdelante + 1)
      .then(setDiasCal)
      .catch((e) => setAviso(e instanceof ErrorReserva ? e.message : "No pudimos cargar el calendario."));
  }

  function alternarCalendario() {
    if (calAbierto) {
      setCalAbierto(false);
      return;
    }
    setCalAbierto(true);
    setMesCal((fecha ?? config?.hoy ?? "").slice(0, 7) || null);
    if (!diasCal) cargarCalendario(pax);
  }

  function cambiarPax(nuevo: number) {
    setPax(nuevo);
    // La disponibilidad del calendario depende de los pax.
    setDiasCal(null);
    if (calAbierto) cargarCalendario(nuevo);
  }

  // "Ir"/"Siguiente" del teclado del celular.
  function alEnter(e: React.KeyboardEvent, accion: () => void) {
    if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
    e.preventDefault();
    accion();
  }
  function continuarConTeclado() {
    (document.activeElement as HTMLElement | null)?.blur();
    if (valido && !cargandoDisp && !enviando) void seguir();
  }

  // El dia elegido (de la tira o del calendario), para saber si es un dia
  // que se reserva por WhatsApp.
  const diaElegido = fecha ? (dias?.find((d) => d.fecha === fecha) ?? diasCal?.find((d) => d.fecha === fecha) ?? null) : null;

  const valido = (() => {
    if (pasoActual === "cuando") return !!fecha && diaElegido?.estado !== "bloqueado";
    if (pasoActual === "salon") return entrable(dispSalon);
    if (pasoActual === "horario") return !!hora;
    if (pasoActual === "datos")
      return nombre.trim().length >= 2 && telefono.replace(/\D/g, "").length >= 8 && (!huesped || !!habitacion.trim());
    return acepta;
  })();

  // ---------------------------------------------------------------- estados globales
  if (errorCarga) {
    return (
      <Marco>
        <div className="rv-final pend">
          <h1 ref={tituloRef} tabIndex={-1}>No pudimos cargar las reservas</h1>
          <p>{errorCarga}</p>
        </div>
      </Marco>
    );
  }
  if (!config) {
    return (
      <Marco>
        <div className="rv-cargando" role="status">Cargando…</div>
      </Marco>
    );
  }
  if (salones.length === 0) {
    return (
      <Marco>
        <div className="rv-final pend">
          <h1 ref={tituloRef} tabIndex={-1}>Sin reservas online</h1>
          <p>Por ahora no estamos tomando reservas por este medio.</p>
          {WHATSAPP_CLIENTE && (
            <a className="rv-sec" href={`https://wa.me/${WHATSAPP_CLIENTE}`} target="_blank" rel="noreferrer">
              Escribinos por WhatsApp
            </a>
          )}
        </div>
      </Marco>
    );
  }
  if (resultado) {
    return (
      <Marco ubicacion={config?.ubicacion}>
        <Confirmacion r={resultado} nombre={nombre} comentarios={comentarios} tituloRef={tituloRef} onOtra={reiniciar} ubicacion={config?.ubicacion} />
      </Marco>
    );
  }

  // ---------------------------------------------------------------- pantallas
  const contexto: string[] = [];
  if (paso > 0 && fecha) contexto.push(personasTxt(pax), fechaTxt(fecha));
  if (salon && salones.length > 1 && paso > pasos.indexOf("salon")) contexto.push(salon.nombre);
  if (hora && paso > pasos.indexOf("horario")) contexto.push(`${hora} · ${NOMBRE_TURNO[turno]}`);
  const ultimo = paso === pasos.length - 1;
  const grupo = pax >= config.limitePaxConfirmaSola;
  // Lo elegido hasta ahora, abajo junto a Continuar.
  const resumen = [personasTxt(pax), fecha ? fechaTxt(fecha) : null, hora && paso > pasos.indexOf("horario") ? hora : null].filter(Boolean).join(" · ");
  const confirmaPorWhatsApp = grupo || (!!salon && !salon.confirmaSola);

  return (
    <Marco ubicacion={config.ubicacion}>
      {paso === 0 ? (
        <header className="rv-hero">
          {/* El plano del salón (como en el login), suave de fondo. */}
          <div className="rv-hero-plano rv-plano-negro">
            <PlanoLogin animado={false} />
          </div>
          {/* Claro / oscuro: arranca como el celular y se puede cambiar. */}
          <ThemeToggle className="rv-tema rv-tema-hero" />
          <LogoPortada />
          <h1 className="rv-hero-t">Reservá tu mesa</h1>
        </header>
      ) : null}
      {paso === 0 ? (
        <header className="rv-top rv-top-pc">
          <ThemeToggle className="rv-tema" />
        </header>
      ) : (
        <header className="rv-top">
          <button type="button" className="rv-atras" onClick={atras} aria-label="Volver al paso anterior">
            <svg viewBox="0 0 24 24" width={20} height={20} fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M15 5l-7 7 7 7" />
            </svg>
          </button>
          <LogoBarra />
          <ThemeToggle className="rv-tema" />
        </header>
      )}

      <div className="rv-progreso" aria-hidden="true">
        {pasos.map((_, i) => (
          <i key={i} className={i <= paso ? "hecho" : ""} />
        ))}
      </div>

      <main key={paso} className={`rv-vista ${dir > 0 ? "rv-adelante" : "rv-atras-anim"}`}>
        <div className="rv-tit">
          <h2 ref={tituloRef} tabIndex={-1} className="rv-titulo">
            {pasoActual === "cuando" && "¿Cuántos son y qué día?"}
            {pasoActual === "salon" && "¿En qué salón?"}
            {pasoActual === "horario" && "¿A qué hora?"}
            {pasoActual === "datos" && "Tus datos"}
            {pasoActual === "detalles" && "¿Algo que debamos saber?"}
          </h2>
          <small>
            Paso {paso + 1} de {pasos.length}
          </small>
        </div>
        {contexto.length > 0 && (
          <div className="rv-contexto">
            {contexto.map((c) => (
              <span key={c}>{c}</span>
            ))}
          </div>
        )}
        {aviso && (
          <div className="rv-aviso" role="alert">
            {aviso}
          </div>
        )}

        {pasoActual === "cuando" && (
          <>
            <section className={`rv-card rv-card-fila ${grupo ? "rv-card-grupo" : ""}`}>
              <div className="rv-card-et">
                <IconoPersonas />
                <div>
                  <b>Personas</b>
                  <small>{grupo ? "Con confirmación" : `Hasta ${config.paxMaximo} por reserva`}</small>
                </div>
              </div>
              <div className="rv-contador">
                <button type="button" onClick={() => cambiarPax(Math.max(1, pax - 1))} aria-label="Una persona menos" disabled={pax <= 1}>
                  −
                </button>
                <output className="rv-v" aria-live="polite" aria-label={personasTxt(pax)}>
                  {pax}
                </output>
                <button type="button" onClick={() => cambiarPax(Math.min(config.paxMaximo, pax + 1))} aria-label="Una persona más" disabled={pax >= config.paxMaximo}>
                  +
                </button>
              </div>
              {grupo && (
                <div className="rv-grupo" role="note">
                  <span className="rv-grupo-ic">
                    <IconoWhatsApp size={18} />
                  </span>
                  <div>
                    <b>Grupo de {pax}: te confirmamos por WhatsApp</b>
                    <p>Seguí y elegí el día y el horario. Queda como solicitud hasta que te escribamos.</p>
                  </div>
                </div>
              )}
            </section>
            <section className="rv-card">
              <div className="rv-card-cab">
                <b>{MES_LARGO[aFecha(fecha ?? config.hoy).getMonth()]}</b>
                <button type="button" className="rv-ver-cal" onClick={alternarCalendario} aria-expanded={calAbierto}>
                  <IconoCalendario />
                  {calAbierto ? "Cerrar" : "Calendario"}
                </button>
              </div>
              {!dias ? (
                <div className="rv-cargando chico" role="status">Buscando días con lugar…</div>
              ) : (
                <div className="rv-dias" role="group" aria-label="Días">
                  {dias.map((d, i) => {
                    const f = aFecha(d.fecha);
                    const porWa = d.estado === "bloqueado";
                    const ok = seleccionable(d) || porWa;
                    const titulo = porWa
                      ? "Se reserva por WhatsApp"
                      : d.estado === "servicio"
                        ? "En servicio: por orden de llegada"
                        : d.estado === "lleno"
                          ? "Completo"
                          : d.estado === "pocos"
                            ? "Pocos lugares"
                            : "Hay lugar";
                    return (
                      <button
                        key={d.fecha}
                        type="button"
                        className={`rv-dia ${porWa ? "rv-wa" : d.estado}`}
                        aria-pressed={d.fecha === fecha}
                        aria-disabled={!ok}
                        aria-label={`${fechaTxt(d.fecha)}: ${titulo}`}
                        title={titulo}
                        onClick={() => {
                          if (!ok) return;
                          setFecha(d.fecha);
                          setHora(null);
                        }}
                      >
                        <span className="rv-dsem">{i === 0 && d.fecha === config.hoy ? "Hoy" : SEM[f.getDay()]}</span>
                        <span className="rv-num">{f.getDate()}</span>
                        {porWa ? <IconoWhatsApp size={12} className="rv-mini-wa" /> : <span className="rv-est" />}
                      </button>
                    );
                  })}
                  {/* Al final de la tira: cualquier otra fecha, en el calendario. */}
                  {(() => {
                    const lejos = !!fecha && !dias.some((d) => d.fecha === fecha);
                    const f = lejos && fecha ? aFecha(fecha) : null;
                    return (
                      <button
                        type="button"
                        className="rv-dia rv-otra"
                        aria-pressed={lejos}
                        aria-expanded={calAbierto}
                        aria-label={lejos && fecha ? `Otra fecha: ${fechaTxt(fecha)}` : "Elegir otra fecha en el calendario"}
                        onClick={alternarCalendario}
                      >
                        {f ? (
                          <>
                            <span className="rv-dsem">{SEM[f.getDay()]}</span>
                            <span className="rv-num">{f.getDate()}</span>
                            <span className="rv-dsem">{MES[f.getMonth()]}</span>
                          </>
                        ) : (
                          <>
                            <IconoCalendario />
                            <span className="rv-otra-t">Otra fecha</span>
                          </>
                        )}
                      </button>
                    );
                  })()}
                </div>
              )}
              {fecha && diaElegido && diaElegido.estado !== "bloqueado" && (
                <div className="rv-elegido">
                  <i className={diaElegido.estado} />
                  <span>
                    <b>{textoDiaElegido(fecha, config.hoy)}</b> · {ESTADO_ELEGIDO[diaElegido.estado] ?? "hay lugar"}
                  </span>
                </div>
              )}
              {diaElegido?.estado === "bloqueado" && fecha && (
                <AvisoWhatsApp fecha={fecha} pax={pax} motivo={diaElegido.motivo} mensaje={diaElegido.mensaje} />
              )}
              {calAbierto && (
                <Calendario
                  dias={diasCal}
                  hoy={config.hoy}
                  fecha={fecha}
                  mes={mesCal ?? config.hoy.slice(0, 7)}
                  onMes={setMesCal}
                  onElegir={(f) => {
                    setFecha(f);
                    setHora(null);
                    setCalAbierto(false);
                  }}
                />
              )}
              <div className="rv-ley">
                <span>
                  <i />
                  Hay lugar
                </span>
                <span>
                  <i className="p" />
                  Pocos lugares
                </span>
                <span>
                  <i className="n" />
                  Completo
                </span>
                <span>
                  <i className="w" />
                  Por WhatsApp
                </span>
                {dias?.some((d) => d.estado === "servicio") && (
                  <span>
                    <i className="s" />
                    En servicio
                  </span>
                )}
              </div>
            </section>
          </>
        )}

        {pasoActual === "salon" && disp && (
          <div className="rv-salones">
            {salones.map((s) => {
              const ds = disp.salones.find((x) => x.salonId === s.id);
              const libre = !!ds?.hayLugar;
              const servicio = !libre && !!ds?.turnos.some((t) => t.enServicio);
              const sola = s.confirmaSola && pax < config.limitePaxConfirmaSola;
              const turnos = ds?.turnos.filter((t) => t.horarios.some((x) => x.estado !== "sin_lugar")).map((t) => NOMBRE_TURNO[t.turno]) ?? [];
              return (
                <button
                  key={s.id}
                  type="button"
                  className="rv-salon"
                  aria-pressed={s.id === salonId}
                  disabled={!entrable(ds)}
                  onClick={() => {
                    setSalonId(s.id);
                    setHora(null);
                  }}
                >
                  <span className="rv-sn">{s.nombre}</span>
                  <span className="rv-sd">
                    {libre ? turnos.join(" · ") : servicio ? (
                      <>
                        En servicio · por orden de llegada
                        <i className="rv-vivo" aria-hidden="true" />
                      </>
                    ) : entrable(ds) ? "Se reserva por WhatsApp" : "Sin lugar este día"}
                  </span>
                  {libre && <span className={`rv-sc ${sola ? "si" : "pend"}`}>{sola ? "Confirmación inmediata" : "Te confirmamos por WhatsApp"}</span>}
                </button>
              );
            })}
          </div>
        )}

        {pasoActual === "horario" && dispSalon && (
          <>
            <div className="rv-chips">
              {dispSalon.turnos.map((t) => (
                <button
                  key={t.turno}
                  type="button"
                  className="rv-chip"
                  aria-pressed={t.turno === turno}
                  onClick={() => {
                    setTurno(t.turno);
                    setHora(null);
                  }}
                >
                  {NOMBRE_TURNO[t.turno]}
                  {t.porWhatsApp && <IconoWhatsApp size={12} className="rv-chip-wa" />}
                  {t.enServicio && <i className="rv-vivo" aria-label="en servicio" />}
                </button>
              ))}
            </div>
            {(() => {
              const t = dispSalon.turnos.find((x) => x.turno === turno) ?? dispSalon.turnos[0];
              if (!t) return null;
              if (t.porWhatsApp && fecha) {
                return <AvisoWhatsApp fecha={fecha} pax={pax} turno={t.turno} motivo={disp?.motivo} mensaje={disp?.mensaje} />;
              }
              if (t.enServicio) {
                const otro = dispSalon.turnos.find((x) => x.turno !== t.turno && !x.enServicio && x.horarios.some((h) => h.estado !== "sin_lugar"));
                return (
                  <EnServicio
                    ubicacion={config?.ubicacion}
                    turno={t.turno}
                    fin={t.finServicio}
                    otroTurno={otro?.turno ?? null}
                    onOtroTurno={() => {
                      if (!otro) return;
                      setTurno(otro.turno);
                      setHora(null);
                    }}
                    onOtroDia={() => {
                      setHora(null);
                      setPaso(0);
                    }}
                  />
                );
              }
              if (t.horarios.every((x) => x.estado === "sin_lugar")) {
                return <p className="rv-nota">{t.cerrado ? "Este turno está cerrado ese día." : "No queda lugar en este turno. Probá con otro turno u otro día."}</p>;
              }
              return (
                <div className="rv-horas" style={{ ["--n" as string]: t.horarios.length }}>
                  {t.horarios.map((x) => (
                    <button
                      key={x.hora}
                      type="button"
                      className="rv-hora"
                      aria-pressed={x.hora === hora}
                      disabled={x.estado === "sin_lugar"}
                      onClick={() => setHora(x.hora)}
                    >
                      {x.hora}
                      <small className={x.estado === "pocas" ? "pocas" : ""}>
                        {x.estado === "pocas" ? "Últimas mesas" : x.estado === "sin_lugar" ? "Sin lugar" : "Disponible"}
                      </small>
                    </button>
                  ))}
                </div>
              );
            })()}
            {salones.length === 1 && salon && <p className="rv-nota">{salon.nombre}</p>}
          </>
        )}

        {pasoActual === "datos" && (
          <>
            <div className="rv-campo">
              <label htmlFor="rv-nombre">Nombre y apellido</label>
              <input
                id="rv-nombre"
                name="name"
                autoComplete="name"
                enterKeyHint="next"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                onKeyDown={(e) => alEnter(e, () => document.getElementById("rv-tel")?.focus())}
                placeholder="Ej. Laura Gómez"
                maxLength={80}
              />
            </div>
            <div className="rv-campo">
              <label htmlFor="rv-tel">WhatsApp</label>
              <input
                id="rv-tel"
                name="tel"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                enterKeyHint={huesped ? "next" : "go"}
                value={telefono}
                onKeyDown={(e) => alEnter(e, () => (huesped ? document.getElementById("rv-hab")?.focus() : continuarConTeclado()))}
                onChange={(e) => setTelefono(e.target.value)}
                placeholder="11 5555-5555"
                maxLength={30}
                aria-describedby="rv-tel-ayuda"
              />
              <span id="rv-tel-ayuda" className="rv-ayuda">
                Lo usamos para confirmarte o avisarte cualquier cambio.
              </span>
            </div>
            <label className="rv-switch" htmlFor="rv-huesped">
              ¿Estás alojado en el hotel?
              <input id="rv-huesped" type="checkbox" checked={huesped} onChange={(e) => setHuesped(e.target.checked)} />
            </label>
            {huesped && (
              <div className="rv-campo">
                <label htmlFor="rv-hab">Número de habitación</label>
                <input
                  id="rv-hab"
                  inputMode="numeric"
                  enterKeyHint="go"
                  value={habitacion}
                  onChange={(e) => setHabitacion(e.target.value)}
                  onKeyDown={(e) => alEnter(e, continuarConTeclado)}
                  maxLength={10}
                />
              </div>
            )}
            {/* Campo trampa contra bots: oculto para personas y lectores de pantalla. */}
            <div className="rv-trampa" aria-hidden="true">
              <label htmlFor="rv-sitio">Sitio web</label>
              <input id="rv-sitio" tabIndex={-1} autoComplete="off" value={sitio} onChange={(e) => setSitio(e.target.value)} />
            </div>
          </>
        )}

        {pasoActual === "detalles" && fecha && hora && (
          <>
            <div className="rv-chips">
              {OCASIONES.map((o) => (
                <button key={o} type="button" className="rv-chip" aria-pressed={o === ocasion} onClick={() => setOcasion((x) => (x === o ? null : o))}>
                  {o}
                </button>
              ))}
            </div>
            <div className="rv-campo">
              <label htmlFor="rv-coment">
                Alergias, preferencias o pedidos <span className="rv-opc">(opcional)</span>
              </label>
              <textarea
                id="rv-coment"
                value={comentarios}
                onChange={(e) => setComentarios(e.target.value)}
                placeholder="Ej. celíaco, mesa cerca de la ventana"
                maxLength={500}
                aria-describedby="rv-nota-ubic"
              />
            </div>
            <div className="rv-nota-ubic" id="rv-nota-ubic">
              <IconoInfo />
              <span>
                Los pedidos de ubicación, como <b>mesa cerca de la ventana</b>, están <b>sujetos a disponibilidad</b>: los tenemos en cuenta, pero no podemos
                garantizarlos.
              </span>
            </div>
            <div className="rv-resumen">
              <div>
                <span>Día</span>
                <b>{fechaTxt(fecha)}</b>
              </div>
              <div>
                <span>Horario</span>
                <b>
                  {hora} · {NOMBRE_TURNO[turno]}
                </b>
              </div>
              <div>
                <span>Personas</span>
                <b>{pax}</b>
              </div>
              {salones.length > 1 && salon && (
                <div>
                  <span>Salón</span>
                  <b>{salon.nombre}</b>
                </div>
              )}
              <div>
                <span>A nombre de</span>
                <b>{nombre.trim()}</b>
              </div>
            </div>
            <label className="rv-check">
              <input type="checkbox" checked={acepta} onChange={(e) => setAcepta(e.target.checked)} />
              <span>
                Acepto que {NOMBRE_PUBLICO} use mis datos para gestionar la reserva y contactarme por WhatsApp.
                {PRIVACIDAD_CLIENTE && (
                  <>
                    {" "}
                    <a href={PRIVACIDAD_CLIENTE} target="_blank" rel="noreferrer">
                      Política de privacidad
                    </a>
                  </>
                )}
              </span>
            </label>
          </>
        )}
      </main>

      <Pie />
      {enviando && (
        <div className="rv-enviando" role="status" aria-live="polite">
          <div className="rv-env-in">
            <LoaderSillas />
            <span>{confirmaSola ? "Confirmando tu reserva…" : "Enviando tu solicitud…"}</span>
          </div>
        </div>
      )}
      <div className="rv-barra">
        <div className="rv-res">
          <b>{resumen}</b>
          {confirmaPorWhatsApp ? <span className="rv-res-wa">Te confirmamos por WhatsApp</span> : "Sujeto a disponibilidad"}
        </div>
        <button
          type="button"
          className="rv-cta"
          disabled={!valido || cargandoDisp || enviando}
          onClick={ultimo ? enviar : seguir}
        >
          {enviando ? "Enviando…" : cargandoDisp ? "Buscando…" : ultimo ? (confirmaSola ? "Reservar" : "Enviar solicitud") : "Continuar"}
        </button>
      </div>
    </Marco>
  );
}

// En el celular, una sola columna. En la compu (ver .rv-lado en
// globals.css, opción C del mockup capax-reservar-paso1-grupos), a la
// izquierda va la marca del restaurante y «Cómo llegar», y el formulario a
// la derecha; la portada del paso 1 no se muestra ahí.
function Marco({ children, ubicacion }: { children: React.ReactNode; ubicacion?: UbicacionPublica | null }) {
  const direccion = direccionMapa(ubicacion);
  return (
    <div className="rv">
      <IntroCapax />
      <div className="rv-pantalla">
        <aside className="rv-lado">
          <div className="rv-hero-plano rv-plano-negro">
            <PlanoLogin animado={false} />
          </div>
          <LogoPortada />
          <h1 className="rv-lado-t">Reservá tu mesa</h1>
          <p>Elegí el día y el horario entre los que tienen lugar.</p>
          {direccion && (
            <div className="rv-lado-dir">
              <span>{direccion}</span>
              <ComoLlegar className="rv-lado-llegar" ubicacion={ubicacion} />
            </div>
          )}
        </aside>
        <div className="rv-col">{children}</div>
      </div>
    </div>
  );
}

// "Hoy, lunes 19" / "Mañana, martes 20" / "Viernes 23 de octubre".
function textoDiaElegido(fecha: string, hoy: string) {
  const d = aFecha(fecha);
  const n = Math.round((d.getTime() - aFecha(hoy).getTime()) / 86_400_000);
  if (n === 0) return `Hoy, ${DIA_LARGO[d.getDay()]} ${d.getDate()}`;
  if (n === 1) return `Mañana, ${DIA_LARGO[d.getDay()]} ${d.getDate()}`;
  const dia = DIA_LARGO[d.getDay()];
  return `${dia[0].toUpperCase()}${dia.slice(1)} ${d.getDate()} de ${MES_LARGO[d.getMonth()].toLowerCase()}`;
}

const ESTADO_ELEGIDO: Record<string, string> = {
  ok: "hay lugar",
  pocos: "quedan pocos lugares",
  servicio: "estamos en servicio: por orden de llegada",
};

function IconoPersonas() {
  return (
    <svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6M16 4.6a3.5 3.5 0 0 1 0 6.8M21.5 20c0-2.8-1.6-4.9-4-5.7" />
    </svg>
  );
}

// Intro al entrar al link (opción B2 del mockup capax-intro-reservar): en
// negro, capax se dibuja con la animación del login mientras detrás se arma
// el plano del salón; después el fondo sube como un telón y queda la
// portada de Barrancas (también negra, con el plano suave). Una sola vez por
// visita (sessionStorage), se saltea tocando la pantalla y no aparece con
// "reducir movimiento". Mientras tanto la página carga por detrás.
const CLAVE_INTRO_RESERVAR = "capax-intro-reservar";
const DURACION_INTRO_MS = 3600;

function IntroCapax() {
  const [visible, setVisible] = useState(true);

  const terminar = useCallback(() => {
    try {
      sessionStorage.setItem(CLAVE_INTRO_RESERVAR, "1");
    } catch {
      // no pasa nada
    }
    setVisible(false);
  }, []);

  useEffect(() => {
    let vista = false;
    try {
      vista = sessionStorage.getItem(CLAVE_INTRO_RESERVAR) === "1";
    } catch {
      // sin sessionStorage: se muestra igual
    }
    const reducido = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (vista || reducido) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setVisible(false);
      return;
    }
    const t = setTimeout(terminar, DURACION_INTRO_MS);
    return () => clearTimeout(t);
  }, [terminar]);

  if (!visible) return null;
  return (
    <div
      className="rv-intro"
      aria-hidden="true"
      onPointerDown={terminar}
      // Se desmonta justo cuando el telón termina de subir (el timeout queda
      // de respaldo, por si el navegador no dispara el evento).
      onAnimationEnd={(e) => e.target === e.currentTarget && e.animationName === "rv-subir-telon" && terminar()}
    >
      <div className="rv-intro-plano rv-plano-negro">
        <PlanoLogin animado />
      </div>
      <div className="rv-intro-marca capax-intro">
        <SimboloCapax size={76} className="text-[#f2f2f2]!" />
        <WordmarkCapax size={44} className="text-white" />
      </div>
    </div>
  );
}

function IconoWhatsApp({ size = 16, className = "" }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" className={className} aria-hidden="true">
      <path d="M12 2.2a9.7 9.7 0 0 0-8.3 14.7L2.3 21.8l5-1.3A9.7 9.7 0 1 0 12 2.2Zm0 17.7c-1.5 0-3-.4-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8 8 0 1 1 12 19.9Zm4.4-6c-.2-.1-1.4-.7-1.7-.8-.2-.1-.4-.1-.5.1l-.8.9c-.1.2-.3.2-.5.1a6.6 6.6 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.5-.4h-.5a.9.9 0 0 0-.7.3 2.8 2.8 0 0 0-.9 2.1c0 1.2.9 2.4 1 2.6.1.2 1.8 2.8 4.4 3.9 1.6.7 2.3.8 3.1.6.5-.1 1.4-.6 1.6-1.1.2-.6.2-1 .1-1.1l-.5-.3Z" />
    </svg>
  );
}

// Dia (o turno) cerrado para la web por una fecha especial: el mensaje que
// cargo el restaurante y el boton para reservar por WhatsApp, con la fecha y
// las personas ya escritas.
function AvisoWhatsApp({
  fecha,
  pax,
  turno,
  motivo,
  mensaje,
}: {
  fecha: string;
  pax: number;
  turno?: TurnoPublico;
  motivo?: string | null;
  mensaje?: string | null;
}) {
  const texto = `¡Hola! Quiero reservar para el ${fechaTxt(fecha)}${turno ? ` (${NOMBRE_TURNO[turno].toLowerCase()})` : ""}, ${personasTxt(pax)}.`;
  return (
    <div className="rv-aviso-wa" role="status">
      <div className="rv-aviso-wa-t">
        {fechaTxt(fecha)}
        {turno ? ` · ${NOMBRE_TURNO[turno]}` : ""}
        {motivo && <span>{motivo}</span>}
      </div>
      <p>{mensaje || `${turno ? "Ese turno" : "Ese día"} tomamos las reservas por WhatsApp.`}</p>
      {WHATSAPP_CLIENTE ? (
        <>
          <a href={`https://wa.me/${WHATSAPP_CLIENTE}?text=${encodeURIComponent(texto)}`} target="_blank" rel="noreferrer">
            <IconoWhatsApp size={18} />
            Reservar por WhatsApp
          </a>
          <small>El mensaje ya va con la fecha y la cantidad de personas.</small>
        </>
      ) : (
        <small>Comunicate con el restaurante para reservar.</small>
      )}
    </div>
  );
}

function IconoCalendario() {
  return (
    <svg viewBox="0 0 24 24" width={20} height={20} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3.5" y="5" width="17" height="15" rx="2.5" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
    </svg>
  );
}

// Calendario de "Otra fecha": un mes por vez (lunes primero), desde hoy hasta
// config.diasAdelante. Cada día con el mismo punto de estado que la tira; los
// pasados, los que están fuera de rango, los completos y los bloqueados no se
// pueden elegir.
function Calendario({
  dias,
  hoy,
  fecha,
  mes,
  onMes,
  onElegir,
}: {
  dias: DiaPublico[] | null;
  hoy: string;
  fecha: string | null;
  mes: string;
  onMes: (m: string) => void;
  onElegir: (f: string) => void;
}) {
  const [y, m] = mes.split("-").map(Number);
  const primero = new Date(y, m - 1, 1);
  const enMes = new Date(y, m, 0).getDate();
  const hueco = (primero.getDay() + 6) % 7;
  const porFecha = new Map((dias ?? []).map((d) => [d.fecha, d]));
  const ultimo = dias?.at(-1)?.fecha ?? hoy;
  const mesDe = (dy: number, dm: number) => {
    const d = new Date(dy, dm - 1, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  };
  const anterior = mesDe(y, m - 1);
  const siguiente = mesDe(y, m + 1);
  const hayAnterior = anterior >= hoy.slice(0, 7);
  const haySiguiente = siguiente <= ultimo.slice(0, 7);
  const ESTADO: Record<string, string> = { bloqueado: "Se reserva por WhatsApp", lleno: "Completo", pocos: "Pocos lugares", ok: "Hay lugar" };

  return (
    <div className="rv-cal" role="group" aria-label="Calendario">
      <div className="rv-cal-cab">
        <button type="button" onClick={() => onMes(anterior)} disabled={!hayAnterior} aria-label="Mes anterior">
          ‹
        </button>
        <b>
          {MES_LARGO[m - 1]} {y}
        </b>
        <button type="button" onClick={() => onMes(siguiente)} disabled={!haySiguiente} aria-label="Mes siguiente">
          ›
        </button>
      </div>
      <div className="rv-cal-sem" aria-hidden="true">
        {["L", "M", "M", "J", "V", "S", "D"].map((d, i) => (
          <span key={i}>{d}</span>
        ))}
      </div>
      {!dias ? (
        <div className="rv-cargando chico" role="status">
          Buscando días con lugar…
        </div>
      ) : (
        <div className="rv-cal-dias">
          {Array.from({ length: hueco }, (_, i) => (
            <span key={`h${i}`} />
          ))}
          {Array.from({ length: enMes }, (_, i) => {
            const iso = `${mes}-${String(i + 1).padStart(2, "0")}`;
            const d = porFecha.get(iso);
            const ok = !!d && (seleccionable(d) || d.estado === "bloqueado");
            return (
              <button
                key={iso}
                type="button"
                className={`rv-cal-dia ${d ? (d.estado === "bloqueado" ? "rv-wa" : d.estado) : "fuera"}`}
                aria-pressed={iso === fecha}
                aria-disabled={!ok}
                aria-label={`${fechaTxt(iso)}: ${d ? ESTADO[d.estado] : "No disponible"}`}
                onClick={() => ok && onElegir(iso)}
              >
                {i + 1}
                {d && <i />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Logo del restaurante (no de capax: el cliente final reserva en el
// restaurante). Si el archivo no carga, queda el nombre en texto.
function LogoPortada() {
  const [falla, setFalla] = useState(false);
  if (falla) return <div className="rv-lugar">{NOMBRE_PUBLICO}</div>;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- SVG estatico de public/, no necesita next/image
    <img className="rv-logo-portada" src={LOGOS_CLIENTE.portada} alt={NOMBRE_PUBLICO} onError={() => setFalla(true)} />
  );
}

function LogoBarra() {
  const [falla, setFalla] = useState(false);
  if (falla) return <span className="rv-lugar-c">{NOMBRE_PUBLICO}</span>;
  return (
    <span className="rv-logo-barra">
      {/* eslint-disable-next-line @next/next/no-img-element -- SVG estatico de public/ */}
      <img className="claro" src={LOGOS_CLIENTE.barra} alt={NOMBRE_PUBLICO} onError={() => setFalla(true)} />
      {/* eslint-disable-next-line @next/next/no-img-element -- SVG estatico de public/ */}
      <img className="oscuro" src={LOGOS_CLIENTE.barraOscuro} alt="" aria-hidden="true" onError={() => setFalla(true)} />
    </span>
  );
}

// "Estamos en servicio" (opción A del mockup capax-en-servicio): hoy, con el
// turno ya empezado, las mesas son por orden de llegada. La tapa del plato
// sube, se abre hacia arriba y sale vapor (ver .rv-cloche en globals.css).
function EnServicio({
  ubicacion,
  turno,
  fin,
  otroTurno,
  onOtroTurno,
  onOtroDia,
}: {
  ubicacion?: UbicacionPublica | null;
  turno: TurnoPublico;
  fin?: string | null;
  otroTurno: TurnoPublico | null;
  onOtroTurno: () => void;
  onOtroDia: () => void;
}) {
  return (
    <section className="rv-servicio" role="status">
      <svg className="rv-cloche" viewBox="0 0 160 120" aria-hidden="true">
        <g className="rv-vapor">
          <path d="M50 86 c-7 -9 7 -14 0 -24" />
          <path d="M68 84 c-7 -9 7 -14 0 -24" />
          <path d="M86 86 c-7 -9 7 -14 0 -24" />
        </g>
        <g className="rv-tapa">
          <path d="M30 92 a50 46 0 0 1 100 0 z" />
          <circle cx="80" cy="42" r="6" />
        </g>
        <rect className="rv-plato" x="18" y="92" width="124" height="7" rx="3.5" />
      </svg>
      <h2>Estamos en servicio</h2>
      <p>
        {EL_TURNO[turno].charAt(0).toUpperCase() + EL_TURNO[turno].slice(1)} ya empezó. Ahora las mesas son <b>por orden de llegada</b>: vení directo,
        te esperamos.
      </p>
      {fin && (
        <div className="rv-servicio-hora">
          <IconoReloj />
          {NOMBRE_TURNO[turno]} hasta las {fin}
        </div>
      )}
      <div className="rv-servicio-acc">
        <ComoLlegar className="rv-servicio-pri" ubicacion={ubicacion} />
        {otroTurno ? (
          <button type="button" className="rv-servicio-sec" onClick={onOtroTurno}>
            Reservar para {EL_TURNO[otroTurno]}
          </button>
        ) : (
          <button type="button" className="rv-servicio-sec" onClick={onOtroDia}>
            Elegir otro día
          </button>
        )}
      </div>
    </section>
  );
}

function IconoReloj() {
  return (
    <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

function IconoPin({ size = 17 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z" />
      <circle cx="12" cy="9.5" r="2.5" />
    </svg>
  );
}

// "Cómo llegar": si hay una sola app configurada abre directo; si hay
// varias, el cliente elige (Google Maps, Apple Maps o Waze) en una hoja que
// sube desde abajo. Sin direccion ni links, no se muestra (ver lib/mapas.ts).
const COLOR_APP: Record<AppMapa, string> = { google: "#1a73e8", apple: "#8e8e93", waze: "#33ccff" };

function ComoLlegar({ className, ubicacion }: { className: string; ubicacion?: UbicacionPublica | null }) {
  // La hoja va en un portal al contenedor .rv (fuera de tarjetas con
  // animaciones de transform, que romperian el position: fixed).
  const [abierta, setAbierta] = useState<HTMLElement | null>(null);
  const [copiada, setCopiada] = useState(false);
  const opciones = opcionesMapa(ubicacion);
  const direccion = direccionMapa(ubicacion);

  useEffect(() => {
    if (!abierta) return;
    const alTeclear = (e: KeyboardEvent) => e.key === "Escape" && setAbierta(null);
    document.addEventListener("keydown", alTeclear);
    return () => document.removeEventListener("keydown", alTeclear);
  }, [abierta]);

  if (opciones.length === 0) return null;
  if (opciones.length === 1) {
    return (
      <a className={className} href={opciones[0].href} target="_blank" rel="noreferrer">
        <IconoPin />
        Cómo llegar
      </a>
    );
  }

  async function copiar() {
    try {
      await navigator.clipboard.writeText(`${NOMBRE_PUBLICO}, ${direccion}`);
      setCopiada(true);
      setTimeout(() => setCopiada(false), 2000);
    } catch {
      // sin permiso de portapapeles: no pasa nada
    }
  }

  return (
    <>
      <button type="button" className={className} onClick={() => setAbierta(document.querySelector<HTMLElement>(".rv") ?? document.body)} aria-haspopup="dialog">
        <IconoPin />
        Cómo llegar
      </button>
      {abierta &&
        createPortal(
          <div className="rv-hoja-fondo" onClick={(e) => e.target === e.currentTarget && setAbierta(null)}>
            <div className="rv-hoja" role="dialog" aria-modal="true" aria-labelledby="rv-hoja-t">
              <i className="rv-hoja-asa" aria-hidden="true" />
              <h2 id="rv-hoja-t">Cómo llegar</h2>
              {direccion && (
                <div className="rv-hoja-dir">
                  <IconoPin size={16} />
                  <span>{direccion}</span>
                  <button type="button" onClick={copiar}>
                    {copiada ? "Copiada" : "Copiar"}
                  </button>
                </div>
              )}
              <p>Abrir con</p>
              <div className="rv-hoja-apps">
                {opciones.map((o) => (
                  <a key={o.app} href={o.href} target="_blank" rel="noreferrer" onClick={() => setAbierta(null)}>
                    <span className="rv-app-ico" style={{ background: COLOR_APP[o.app] }}>
                      <IconoPin size={18} />
                    </span>
                    {o.nombre}
                  </a>
                ))}
              </div>
              <button type="button" className="rv-hoja-cancelar" onClick={() => setAbierta(null)}>
                Cancelar
              </button>
            </div>
          </div>,
          abierta,
        )}
    </>
  );
}

function Pie() {
  return (
    <div className="rv-pie">
      Reservas con <SimboloCapax size={14} />
      <WordmarkCapax size={11} />
    </div>
  );
}

function LoaderSillas() {
  return (
    <svg className="rv-loader" viewBox="0 0 48 48" width={56} height={56} aria-hidden="true">
      <g fill="none" strokeWidth={5.2} strokeLinecap="round">
        {ARCOS_SILLAS.map((d, i) => (
          <path key={i} d={d} style={{ ["--i" as string]: i }} />
        ))}
      </g>
      <circle cx="24" cy="24" r="9.5" />
    </svg>
  );
}

function IconoInfo() {
  return (
    <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 7.5v.5" />
    </svg>
  );
}

// "Agregar al calendario": en iPhone/Mac abre el evento (.ics servido por
// /reservar/calendario) y en el resto, Google Calendar con el evento cargado.
// Ver lib/calendario.ts. Solo se muestra despues de reservar (en el cliente),
// asi que se puede mirar el navegador al renderizar.
function AgregarCalendario({ r }: { r: ReservaCreada }) {
  const evento = { codigo: r.codigo, fecha: r.fecha, hora: r.hora, pax: r.pax, salon: r.salon };
  if (usaCalendarioApple()) {
    return (
      <a className="rv-sec" href={linkIcs(evento)}>
        Agregar al calendario
      </a>
    );
  }
  return (
    <a className="rv-sec" href={linkGoogleCalendar(evento)} target="_blank" rel="noreferrer">
      Agregar al calendario
    </a>
  );
}

// Orden de aparicion del texto de la confirmacion (ver .rv-sube en globals.css).
const sube = (k: number) => ({ ["--k" as string]: k }) as React.CSSProperties;

function Confirmacion({
  r,
  nombre,
  comentarios,
  tituloRef,
  onOtra,
  ubicacion,
}: {
  r: ReservaCreada;
  nombre: string;
  comentarios: string;
  tituloRef: React.RefObject<HTMLHeadingElement | null>;
  onOtra: () => void;
  ubicacion?: UbicacionPublica | null;
}) {
  const ok = r.estado === "confirmada";
  const primerNombre = nombre.trim().split(" ")[0];
  return (
    <>
      <div className={`rv-final ${ok ? "" : "pend"}`}>
        {/* El circulo se traza, adentro se dibuja el check (o el reloj, si
            queda como solicitud) y despues sube el texto de a uno. */}
        <div className="rv-ok" aria-hidden="true">
          <svg viewBox="0 0 48 48" width={76} height={76}>
            <circle className="rv-ok-circ" cx="24" cy="24" r="21" pathLength={100} />
            <path className="rv-ok-trazo" d={ok ? "M14.5 24.5 21 31 34 17.5" : "M24 13.5V24l6.5 4"} pathLength={100} />
          </svg>
          <span className="rv-ok-pulso" />
        </div>
        <h1 ref={tituloRef} tabIndex={-1} className="rv-sube" style={sube(0)}>
          {ok ? "¡Reserva confirmada!" : "Recibimos tu solicitud"}
        </h1>
        <p className="rv-sube" style={sube(1)}>
          {ok
            ? `Te esperamos${primerNombre ? `, ${primerNombre}` : ""}. Guardá tu código; si necesitás cambiarla o cancelarla, escribinos.`
            : "Te vamos a escribir por WhatsApp para confirmarla. Todavía no está confirmada."}
        </p>
        <div className="rv-resumen rv-sube" style={sube(2)}>
          <div>
            <span>Día</span>
            <b>{fechaTxt(r.fecha)}</b>
          </div>
          <div>
            <span>Horario</span>
            <b>
              {r.hora} · {NOMBRE_TURNO[r.turno]}
            </b>
          </div>
          <div>
            <span>Personas</span>
            <b>{r.pax}</b>
          </div>
          <div>
            <span>Lugar</span>
            <b>{r.salon}</b>
          </div>
          <div>
            <span>Código</span>
            <b>{r.codigo}</b>
          </div>
        </div>
        {comentarios.trim() && (
          <div className="rv-nota-ubic conf rv-sube" style={sube(3)}>
            <IconoInfo />
            <span>Anotamos tu pedido: «{comentarios.trim()}». La ubicación de la mesa está sujeta a disponibilidad.</span>
          </div>
        )}
        <div className="rv-acciones rv-sube" style={sube(4)}>
          {ok && (
            <AgregarCalendario r={r} />
          )}
          <ComoLlegar className="rv-sec" ubicacion={ubicacion} />
          {WHATSAPP_CLIENTE && (
            <a
              className="rv-sec"
              href={`https://wa.me/${WHATSAPP_CLIENTE}?text=${encodeURIComponent(`Hola, tengo la reserva ${r.codigo}`)}`}
              target="_blank"
              rel="noreferrer"
            >
              Escribinos por WhatsApp
            </a>
          )}
        </div>
        <button type="button" className="rv-volver rv-sube" style={sube(5)} onClick={onOtra}>
          Hacer otra reserva
        </button>
      </div>
      <Pie />
    </>
  );
}
