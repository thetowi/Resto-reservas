"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { preload } from "react-dom";
import { SimboloCapax, WordmarkCapax } from "@/components/MarcaCapax";
import { LOGOS_CLIENTE, MAPS_CLIENTE, NOMBRE_PUBLICO, PRIVACIDAD_CLIENTE, WHATSAPP_CLIENTE } from "@/lib/marca";
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
const NOMBRE_TURNO: Record<TurnoPublico, string> = { almuerzo: "Almuerzo", merienda: "Merienda", cena: "Cena" };
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
      getDiasPublicos(pax)
        .then((lista) => {
          if (!activo) return;
          setDias(lista);
          setFecha((actual) => {
            const sigue = lista.find((d) => d.fecha === actual);
            if (sigue && seleccionable(sigue)) return actual;
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

  // Al cambiar de pantalla: arriba de todo y foco en el titulo (lectores de
  // pantalla y teclado arrancan desde el principio de la pantalla nueva).
  useEffect(() => {
    window.scrollTo({ top: 0 });
    tituloRef.current?.focus({ preventScroll: true });
  }, [paso, resultado]);

  const elegirTurnoPorDefecto = useCallback((d: DisponibilidadPublica, id: number) => {
    const s = d.salones.find((x) => x.salonId === id);
    const conLugar = s?.turnos.find((t) => t.horarios.some((h) => h.estado !== "sin_lugar"));
    if (conLugar) setTurno(conLugar.turno);
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
      const id = actual?.salonId ?? d.salones.find((s) => s.hayLugar)?.salonId ?? d.salones[0]?.salonId ?? null;
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

  const valido = (() => {
    if (pasoActual === "cuando") return !!fecha;
    if (pasoActual === "salon") return !!dispSalon?.hayLugar;
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
      <Marco>
        <Confirmacion r={resultado} nombre={nombre} comentarios={comentarios} tituloRef={tituloRef} onOtra={reiniciar} />
      </Marco>
    );
  }

  // ---------------------------------------------------------------- pantallas
  const contexto: string[] = [];
  if (paso > 0 && fecha) contexto.push(personasTxt(pax), fechaTxt(fecha));
  if (salon && salones.length > 1 && paso > pasos.indexOf("salon")) contexto.push(salon.nombre);
  if (hora && paso > pasos.indexOf("horario")) contexto.push(`${hora} · ${NOMBRE_TURNO[turno]}`);
  const ultimo = paso === pasos.length - 1;
  const h = config.horarios;
  const hayMerienda = salones.some((s) => s.permiteMerienda);

  return (
    <Marco>
      {paso === 0 ? (
        <header className="rv-hero">
          <LogoPortada />
          <h1 className="rv-hero-t">Reservá tu mesa</h1>
          <p>Elegí el día y el horario entre los que tienen lugar.</p>
          <div className="rv-datos">
            <span>
              Almuerzo de {h.almuerzo[0]} a {h.almuerzo.at(-1)} h
            </span>
            {hayMerienda && (
              <span>
                Merienda de {h.merienda[0]} a {h.merienda.at(-1)} h
              </span>
            )}
            <span>
              Cena de {h.cena[0]} a {h.cena.at(-1)} h
            </span>
          </div>
        </header>
      ) : (
        <header className="rv-top">
          <button type="button" className="rv-atras" onClick={atras} aria-label="Volver al paso anterior">
            <svg viewBox="0 0 24 24" width={20} height={20} fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M15 5l-7 7 7 7" />
            </svg>
          </button>
          <LogoBarra />
        </header>
      )}

      <div className="rv-progreso" aria-hidden="true">
        {pasos.map((_, i) => (
          <i key={i} className={i <= paso ? "hecho" : ""} />
        ))}
      </div>

      <main key={paso} className={`rv-vista ${dir > 0 ? "rv-adelante" : "rv-atras-anim"}`}>
        <h2 ref={tituloRef} tabIndex={-1} className="rv-titulo">
          {pasoActual === "cuando" && "¿Cuántos son y qué día?"}
          {pasoActual === "salon" && "¿En qué salón?"}
          {pasoActual === "horario" && "¿A qué hora?"}
          {pasoActual === "datos" && "Tus datos"}
          {pasoActual === "detalles" && "¿Algo que debamos saber?"}
        </h2>
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
            <section className="rv-bloque">
              <div className="rv-et">Personas</div>
              <div className="rv-contador">
                <button type="button" onClick={() => setPax((p) => Math.max(1, p - 1))} aria-label="Una persona menos" disabled={pax <= 1}>
                  −
                </button>
                <div className="rv-v" aria-live="polite">
                  {pax}
                  <small>{pax === 1 ? "persona" : "personas"}</small>
                </div>
                <button type="button" onClick={() => setPax((p) => Math.min(config.paxMaximo, p + 1))} aria-label="Una persona más" disabled={pax >= config.paxMaximo}>
                  +
                </button>
              </div>
              {pax >= config.limitePaxConfirmaSola && (
                <div className="rv-aviso">
                  Para grupos de {config.limitePaxConfirmaSola} o más tomamos la solicitud y te confirmamos por WhatsApp.
                </div>
              )}
            </section>
            <section className="rv-bloque">
              <div className="rv-et">
                Día {fecha && <span className="rv-sel">{fechaTxt(fecha)}</span>}
              </div>
              {!dias ? (
                <div className="rv-cargando chico" role="status">Buscando días con lugar…</div>
              ) : (
                <div className="rv-dias" role="group" aria-label="Días">
                  {dias.map((d, i) => {
                    const f = aFecha(d.fecha);
                    const ok = seleccionable(d);
                    const titulo =
                      d.estado === "bloqueado" ? "Sin reservas online este día" : d.estado === "lleno" ? "Completo" : d.estado === "pocos" ? "Pocos lugares" : "Hay lugar";
                    return (
                      <button
                        key={d.fecha}
                        type="button"
                        className={`rv-dia ${d.estado}`}
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
                        <span className="rv-est" />
                      </button>
                    );
                  })}
                </div>
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
                  Completo o sin reservas online
                </span>
              </div>
            </section>
          </>
        )}

        {pasoActual === "salon" && disp && (
          <div className="rv-salones">
            {salones.map((s) => {
              const ds = disp.salones.find((x) => x.salonId === s.id);
              const libre = !!ds?.hayLugar;
              const sola = s.confirmaSola && pax < config.limitePaxConfirmaSola;
              const turnos = ds?.turnos.filter((t) => t.horarios.some((x) => x.estado !== "sin_lugar")).map((t) => NOMBRE_TURNO[t.turno]) ?? [];
              return (
                <button
                  key={s.id}
                  type="button"
                  className="rv-salon"
                  aria-pressed={s.id === salonId}
                  disabled={!libre}
                  onClick={() => {
                    setSalonId(s.id);
                    setHora(null);
                  }}
                >
                  <span className="rv-sn">{s.nombre}</span>
                  <span className="rv-sd">{libre ? turnos.join(" · ") : "Sin lugar este día"}</span>
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
                </button>
              ))}
            </div>
            {(() => {
              const t = dispSalon.turnos.find((x) => x.turno === turno) ?? dispSalon.turnos[0];
              if (!t) return null;
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
              <input id="rv-nombre" name="name" autoComplete="name" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej. Laura Gómez" maxLength={80} />
            </div>
            <div className="rv-campo">
              <label htmlFor="rv-tel">WhatsApp</label>
              <input
                id="rv-tel"
                name="tel"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                value={telefono}
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
                <input id="rv-hab" inputMode="numeric" value={habitacion} onChange={(e) => setHabitacion(e.target.value)} maxLength={10} />
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
          <b>
            Paso {paso + 1} de {pasos.length}
          </b>
          Sujeto a disponibilidad
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

function Marco({ children }: { children: React.ReactNode }) {
  return (
    <div className="rv">
      <div className="rv-pantalla">{children}</div>
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

// Archivo .ics para "Agregar al calendario" (hora local del restaurante, sin
// zona: el calendario del cliente la toma como hora del lugar).
function descargarCalendario(r: ReservaCreada) {
  const [y, m, d] = r.fecha.split("-");
  const [hh, mm] = r.hora.split(":");
  const inicio = `${y}${m}${d}T${hh}${mm}00`;
  const ahora = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  const texto = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//capax//reservas//ES",
    "BEGIN:VEVENT",
    `UID:${r.codigo}@capax`,
    `DTSTAMP:${ahora}`,
    `DTSTART:${inicio}`,
    "DURATION:PT2H",
    `SUMMARY:Reserva en ${NOMBRE_PUBLICO}`,
    `DESCRIPTION:${r.pax} personas · ${r.salon} · Código ${r.codigo}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
  const url = URL.createObjectURL(new Blob([texto], { type: "text/calendar" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `reserva-${r.codigo}.ics`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// Orden de aparicion del texto de la confirmacion (ver .rv-sube en globals.css).
const sube = (k: number) => ({ ["--k" as string]: k }) as React.CSSProperties;

function Confirmacion({
  r,
  nombre,
  comentarios,
  tituloRef,
  onOtra,
}: {
  r: ReservaCreada;
  nombre: string;
  comentarios: string;
  tituloRef: React.RefObject<HTMLHeadingElement | null>;
  onOtra: () => void;
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
            <button type="button" className="rv-sec" onClick={() => descargarCalendario(r)}>
              Agregar al calendario
            </button>
          )}
          {MAPS_CLIENTE && (
            <a className="rv-sec" href={MAPS_CLIENTE} target="_blank" rel="noreferrer">
              Cómo llegar
            </a>
          )}
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
