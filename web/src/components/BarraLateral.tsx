"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { getResumenReservasWeb, salirEnServidor } from "@/lib/api";
import { cerrarSesion, esAdmin, getLlave, getNombre, haySesion } from "@/lib/auth";
import { apagarAvisosLocal, endpointLocal, sincronizarAvisos } from "@/lib/push";
import { guardarVistoWeb, leerVistoWeb, textoAvisosWeb } from "@/lib/avisosWeb";
import { NOMBRE_CLIENTE, RUBRO_CLIENTE, introMarcaVista, marcarIntroMarcaVista } from "@/lib/marca";
import type { ResumenReservasWeb } from "@/lib/types";
import { SimboloCapax, WordmarkCapax } from "./MarcaCapax";
import AvisosDispositivo from "./AvisosDispositivo";
import { IconoTema } from "./ThemeToggle";

// Barra lateral del panel (opción 3 del mockup capax-barra-lateral-logo):
// cerrada muestra solo los iconos, el circulito de capax y la burbuja de
// Reservas web; con el mouse encima se despliega (sale «capax» y los
// nombres) y con la chinche queda fija, corriendo la pantalla. En tablet se
// abre tocando el circulito. Va en el layout (ver AppConBarra) para todas
// las pantallas del equipo, no en /login ni en el link publico /reservar.
//
// Tambien maneja el contador de Reservas web (antes en app/page.tsx): lo
// pide cada 30 s, al volver a la pestaña y cuando alguien avisa con el
// evento "capax:avisos-web" (el panel lo dispara cuando llega un cambio por
// SignalR). El numero va ademas en el titulo de la pestaña.

export const EVENTO_AVISOS_WEB = "capax:avisos-web";
export const EVENTO_IMPRIMIR = "capax:imprimir";
// En el celular la barra de abajo cambia el panel entre Reservas y Mesas
// (ver PanelCelular): EVENTO_VISTA lo pide, EVENTO_VISTA_ACTUAL avisa cuál
// se está viendo para marcar el botón.
export const EVENTO_VISTA = "capax:vista-celular";
export const EVENTO_VISTA_ACTUAL = "capax:vista-celular-actual";
const CLAVE_FIJA = "capax-barra-fija";
const CLAVE_PLANO = "capax-contexto-plano";

// El panel guarda aca el /plano con su fecha, turno y salon, para que
// "Mapa del salón" abra lo mismo que se estaba viendo.
export function guardarContextoPlano(href: string) {
  try {
    sessionStorage.setItem(CLAVE_PLANO, href);
  } catch {
    // sin sessionStorage: se abre /plano con lo de hoy
  }
}

function contextoPlano() {
  try {
    return sessionStorage.getItem(CLAVE_PLANO) ?? "/plano";
  } catch {
    return "/plano";
  }
}
const STORAGE_TEMA = "barrancas-theme";

type Icono = "campana" | "reservas" | "web" | "mapa" | "reportes" | "imprimir" | "mesas" | "salones" | "fechas" | "restaurante" | "usuarios" | "chinche" | "llave" | "luna" | "sol" | "salir";

const TRAZOS: Record<Icono, React.ReactNode> = {
  campana: (
    <>
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </>
  ),
  reservas: (
    <>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  web: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
    </>
  ),
  mapa: (
    <>
      <path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z" />
      <path d="M9 4v14M15 6v14" />
    </>
  ),
  reportes: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  imprimir: (
    <>
      <path d="M6 9V3h12v6" />
      <rect x="3" y="9" width="18" height="8" rx="2" />
      <path d="M6 14h12v7H6z" />
    </>
  ),
  mesas: (
    <>
      <circle cx="12" cy="12" r="5" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
    </>
  ),
  salones: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 10h18M10 10v10" />
    </>
  ),
  fechas: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4M9 15h6" />
    </>
  ),
  restaurante: (
    <>
      <path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z" />
      <circle cx="12" cy="9.5" r="2.5" />
    </>
  ),
  usuarios: (
    <>
      <circle cx="9" cy="8" r="4" />
      <path d="M2 21c0-4 3-7 7-7s7 3 7 7M17 4a4 4 0 0 1 0 8M22 21c0-3-1.7-5.4-4-6.4" />
    </>
  ),
  chinche: (
    <>
      <path d="M9 4h6l-1 6 3 3v2H7v-2l3-3z" />
      <path d="M12 15v6" />
    </>
  ),
  llave: (
    <>
      <circle cx="8" cy="15" r="4" />
      <path d="M11 12l9-9M17 6l3 3" />
    </>
  ),
  luna: <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />,
  sol: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </>
  ),
  salir: <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />,
};

function Ico({ n, size = 21 }: { n: Icono; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {TRAZOS[n]}
    </svg>
  );
}

interface Item {
  icono: Icono;
  texto: string;
  href?: string;
  accion?: () => void;
  // Para un Link cuyo destino se decide al tocarlo (Mapa del salón).
  alTocar?: (e: React.MouseEvent<HTMLAnchorElement>) => void;
  activo?: boolean;
  burbuja?: number;
  titulo?: string;
}

function leerFija() {
  try {
    return localStorage.getItem(CLAVE_FIJA) === "1";
  } catch {
    return false;
  }
}

export default function BarraLateral() {
  const router = useRouter();
  const pathname = usePathname();
  const raiz = useRef<HTMLElement>(null);
  const [admin, setAdmin] = useState(false);
  const [nombre, setNombre] = useState<string | null>(null);
  const [fija, setFija] = useState(false);
  const [tocada, setTocada] = useState(false);
  const [menuUsuario, setMenuUsuario] = useState(false);
  const [tema, setTema] = useState<"light" | "dark">("light");
  const [animar, setAnimar] = useState(false);
  const [avisos, setAvisos] = useState<ResumenReservasWeb | null>(null);
  const [vistaCel, setVistaCel] = useState<"res" | "mesas">("res");
  const [mas, setMas] = useState(false);

  // Datos que solo existen en el navegador (sesion, preferencia de la
  // chinche, tema): se leen una vez al montar.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAdmin(esAdmin());
    setNombre(getNombre());
    setFija(leerFija());
    setTema(document.documentElement.dataset.theme === "dark" ? "dark" : "light");
    setAnimar(!introMarcaVista());
    marcarIntroMarcaVista();
    // Si este navegador tiene los avisos prendidos, se le recuerda al
    // servidor de quién es (por si entró otra persona).
    sincronizarAvisos();
  }, []);

  // La pantalla se corre para dejarle lugar a la barra (ver .con-barra en
  // globals.css): 68 px cerrada, 236 px si esta fija.
  useEffect(() => {
    const html = document.documentElement;
    html.classList.add("con-barra");
    html.classList.toggle("barra-fija", fija);
    return () => html.classList.remove("con-barra", "barra-fija");
  }, [fija]);

  // Al cambiar de pantalla se cierra lo que se abrio tocando.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTocada(false);
    setMenuUsuario(false);
    setMas(false);
  }, [pathname]);

  useEffect(() => {
    const alCambiar = (e: Event) => setVistaCel((e as CustomEvent<"res" | "mesas">).detail === "mesas" ? "mesas" : "res");
    window.addEventListener(EVENTO_VISTA_ACTUAL, alCambiar);
    return () => window.removeEventListener(EVENTO_VISTA_ACTUAL, alCambiar);
  }, []);

  // Tocar afuera cierra la barra abierta a mano (tablet) y el menu del usuario.
  useEffect(() => {
    if (!tocada && !menuUsuario) return;
    const afuera = (e: PointerEvent) => {
      if (raiz.current && !raiz.current.contains(e.target as Node)) {
        setTocada(false);
        setMenuUsuario(false);
      }
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setTocada(false);
        setMenuUsuario(false);
      }
    };
    document.addEventListener("pointerdown", afuera);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", afuera);
      document.removeEventListener("keydown", esc);
    };
  }, [tocada, menuUsuario]);

  // ---- contador de Reservas web
  const cargarAvisos = useCallback(() => {
    if (!haySesion()) return;
    getResumenReservasWeb(leerVistoWeb())
      .then((r) => {
        // Primera vez en este navegador: arranca desde la ultima que hay.
        if (!leerVistoWeb()) guardarVistoWeb(r.ultimaCreadaEn);
        setAvisos(r);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    cargarAvisos();
    const intervalo = setInterval(cargarAvisos, 30_000);
    const alVolver = () => document.visibilityState === "visible" && cargarAvisos();
    document.addEventListener("visibilitychange", alVolver);
    window.addEventListener(EVENTO_AVISOS_WEB, cargarAvisos);
    return () => {
      clearInterval(intervalo);
      document.removeEventListener("visibilitychange", alVolver);
      window.removeEventListener(EVENTO_AVISOS_WEB, cargarAvisos);
    };
  }, [cargarAvisos]);

  // Al entrar a /reservas-web esa pagina marca las vistas: se vuelve a pedir.
  useEffect(() => {
    cargarAvisos();
  }, [pathname, cargarAvisos]);

  const n = avisos?.avisos ?? 0;
  useEffect(() => {
    const base = document.title.replace(/^\(\d+\) /, "");
    document.title = n > 0 ? `(${n}) ${base}` : base;
  }, [n, pathname]);

  function alternarFija() {
    const nueva = !fija;
    setFija(nueva);
    try {
      localStorage.setItem(CLAVE_FIJA, nueva ? "1" : "0");
    } catch {
      // sin almacenamiento: queda asi hasta recargar
    }
  }

  function alternarTema() {
    const nuevo = tema === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = nuevo;
    try {
      localStorage.setItem(STORAGE_TEMA, nuevo);
    } catch {
      // sin almacenamiento: vale para esta visita
    }
    setTema(nuevo);
  }

  // «Salir» cierra también la sesión recordada de este dispositivo y le
  // saca los avisos (ver api/Controllers/AuthController.cs → salir).
  async function salir() {
    const llave = getLlave();
    const endpoint = await endpointLocal();
    await salirEnServidor(llave, endpoint);
    await apagarAvisosLocal();
    cerrarSesion();
    router.push("/login");
  }

  const enPanel = pathname === "/";
  const detalleAvisos = avisos ? textoAvisosWeb(avisos.nuevas, avisos.aConfirmar) : "";
  const hoy: Item[] = [
    { icono: "reservas", texto: "Reservas", href: "/", activo: enPanel },
    {
      icono: "web",
      texto: "Reservas web",
      href: "/reservas-web",
      activo: pathname.startsWith("/reservas-web"),
      burbuja: n,
      titulo: n > 0 ? `Reservas web: ${detalleAvisos}` : undefined,
    },
    {
      icono: "mapa",
      texto: "Mapa del salón",
      href: "/plano",
      activo: pathname.startsWith("/plano"),
      alTocar: (e) => {
        e.preventDefault();
        router.push(contextoPlano());
      },
    },
  ];
  const informes: Item[] = [];
  if (admin) informes.push({ icono: "reportes", texto: "Reportes", href: "/reportes", activo: pathname.startsWith("/reportes") });
  // Imprimir el dia es del panel (usa la fecha y el salon elegidos).
  if (enPanel) informes.push({ icono: "imprimir", texto: "Imprimir el día", accion: () => window.dispatchEvent(new Event(EVENTO_IMPRIMIR)) });
  const configuracion: Item[] = admin
    ? (
        [
          { icono: "mesas", texto: "Mesas", href: "/admin/mesas" },
          { icono: "salones", texto: "Salones", href: "/admin/salones" },
          { icono: "fechas", texto: "Fechas web", href: "/admin/fechas-web", titulo: "Días en que el link no toma reservas" },
          { icono: "restaurante", texto: "Restaurante", href: "/admin/restaurante", titulo: "Ubicación y Cómo llegar del link" },
          { icono: "usuarios", texto: "Usuarios", href: "/admin/usuarios" },
        ] satisfies Item[]
      ).map((it) => ({ ...it, activo: pathname.startsWith(it.href) }))
    : [];
  const grupos = [
    { titulo: "Hoy", items: hoy },
    { titulo: "Informes", items: informes },
    { titulo: "Configuración", items: configuracion },
  ].filter((g) => g.items.length > 0);

  const clase = ["barra-lateral", fija ? "fija" : "", tocada ? "abierta" : ""].join(" ").trim();

  // Celular: Reservas y Mesas son dos vistas del mismo panel.
  function irAVista(v: "res" | "mesas") {
    if (enPanel) window.dispatchEvent(new CustomEvent(EVENTO_VISTA, { detail: v }));
    else router.push(v === "mesas" ? "/?vista=mesas" : "/");
  }
  const enMas = [...informes, ...configuracion].some((it) => it.activo) || pathname.startsWith("/cambiar-password") || pathname.startsWith("/dispositivos");

  return (
    <>
    {/* Celular (≤767 px): la barra lateral se esconde y queda esta barra
        abajo (mockup capax-panel-celular-final). «Más» abre el resto. */}
    <nav className="barra-celular" aria-label="Menú">
      <button type="button" className={enPanel && vistaCel === "res" ? "activo" : ""} onClick={() => irAVista("res")}>
        <Ico n="reservas" size={22} />
        Reservas
      </button>
      <Link href="/reservas-web" className={pathname.startsWith("/reservas-web") ? "activo" : ""} title={n > 0 ? `Reservas web: ${detalleAvisos}` : undefined}>
        <Ico n="web" size={22} />
        Web
        {n > 0 && <i className="bc-burbuja">{n > 99 ? "99+" : n}</i>}
      </Link>
      <button type="button" className={enPanel && vistaCel === "mesas" ? "activo" : ""} onClick={() => irAVista("mesas")}>
        <Ico n="mesas" size={22} />
        Mesas
      </button>
      <Link
        href="/plano"
        className={pathname.startsWith("/plano") ? "activo" : ""}
        onClick={(e) => {
          e.preventDefault();
          router.push(contextoPlano());
        }}
      >
        <Ico n="mapa" size={22} />
        Mapa
      </Link>
      <button type="button" className={mas || enMas ? "activo" : ""} onClick={() => setMas((m) => !m)} aria-expanded={mas}>
        <svg viewBox="0 0 24 24" width={22} height={22} fill="currentColor" aria-hidden="true">
          <circle cx="5" cy="12" r="2" />
          <circle cx="12" cy="12" r="2" />
          <circle cx="19" cy="12" r="2" />
        </svg>
        Más
      </button>
    </nav>
    {mas && (
      <>
        <div className="bc-velo" onClick={() => setMas(false)} />
        <div className="bc-hoja" role="dialog" aria-modal="true" aria-label="Más opciones">
          <i className="bc-asa" />
          <div className="bc-yo">
            <span className="bl-avatar">{(nombre ?? "?").trim().charAt(0).toUpperCase()}</span>
            <span>
              <b>{nombre ?? "Usuario"}</b>
              <small>{admin ? "Admin" : "Equipo"}</small>
            </span>
          </div>
          <AvisosDispositivo />
          <Link href="/dispositivos" className={pathname.startsWith("/dispositivos") ? "activo" : ""}>
            <Ico n="campana" size={20} />
            Mis dispositivos
          </Link>
          {[...informes.filter((it) => it.icono !== "imprimir"), ...configuracion].map((it) => (
            <Link key={it.texto} href={it.href!} className={it.activo ? "activo" : ""}>
              <Ico n={it.icono} size={20} />
              {it.texto}
            </Link>
          ))}
          <button type="button" onClick={alternarTema}>
            <IconoTema oscuro={tema === "dark"} />
            {tema === "dark" ? "Modo claro" : "Modo oscuro"}
          </button>
          <Link href="/cambiar-password">
            <Ico n="llave" size={20} />
            Cambiar contraseña
          </Link>
          <button type="button" className="bl-salir" onClick={salir}>
            <Ico n="salir" size={20} />
            Salir
          </button>
        </div>
      </>
    )}
    <nav ref={raiz} className={clase} aria-label="Menú principal">
      <div className="bl-logo">
        <button
          type="button"
          className={`bl-simbolo ${animar ? "capax-intro" : ""}`}
          // Desde cualquier pantalla, el logo lleva a Reservas. Ya en
          // Reservas, abre y cierra la barra (en la tablet, sin mouse, es la
          // forma de verla abierta).
          onClick={() => {
            if (enPanel) {
              setTocada((t) => !t);
            } else {
              setTocada(false);
              router.push("/");
            }
          }}
          aria-expanded={enPanel ? tocada || fija : undefined}
          aria-label={enPanel ? (tocada ? "Cerrar el menú" : "Abrir el menú") : "Ir a Reservas"}
          title={enPanel ? undefined : "Ir a Reservas"}
        >
          <SimboloCapax size={38} className="text-[#f2f2f2]!" />
        </button>
        <span className="bl-marca">
          <span className="text-[#f2f2f2]">
            <WordmarkCapax size={20} />
          </span>
          <small>
            {NOMBRE_CLIENTE} · {RUBRO_CLIENTE}
          </small>
        </span>
        <button
          type="button"
          className="bl-chinche"
          onClick={alternarFija}
          aria-pressed={fija}
          title={fija ? "Dejar que se esconda" : "Dejarla fija abierta"}
          aria-label={fija ? "Dejar que se esconda" : "Dejarla fija abierta"}
        >
          <Ico n="chinche" size={16} />
        </button>
      </div>

      <div className="bl-grupos">
        {grupos.map((g) => (
          <div key={g.titulo} className="bl-grupo">
            <b className="bl-titulo">{g.titulo}</b>
            {g.items.map((it) => {
              const contenido = (
                <>
                  <Ico n={it.icono} />
                  <span className="bl-texto">{it.texto}</span>
                  {!!it.burbuja && it.burbuja > 0 && (
                    <i className="bl-burbuja" aria-label={`${it.burbuja} para ver`}>
                      {it.burbuja > 99 ? "99+" : it.burbuja}
                    </i>
                  )}
                </>
              );
              return it.href ? (
                <Link
                  key={it.texto}
                  href={it.href}
                  className={`bl-item ${it.activo ? "activo" : ""}`}
                  aria-current={it.activo ? "page" : undefined}
                  data-nombre={it.texto}
                  title={it.titulo}
                  onClick={it.alTocar}
                >
                  {contenido}
                </Link>
              ) : (
                <button key={it.texto} type="button" className="bl-item" data-nombre={it.texto} title={it.titulo} onClick={it.accion}>
                  {contenido}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      <div className="bl-yo">
        {menuUsuario && (
          <div className="bl-menu-usuario" role="menu">
            <Link href="/dispositivos" role="menuitem">
              <Ico n="campana" size={17} />
              Avisos y dispositivos
            </Link>
            <Link href="/cambiar-password" role="menuitem">
              <Ico n="llave" size={17} />
              Cambiar contraseña
            </Link>
            <button type="button" role="menuitem" className="bl-salir" onClick={salir}>
              <Ico n="salir" size={17} />
              Salir
            </button>
          </div>
        )}
        {/* A la vista (antes estaba adentro del menú del usuario). */}
        <button
          type="button"
          className="bl-item bl-tema"
          onClick={alternarTema}
          data-nombre={tema === "dark" ? "Modo claro" : "Modo oscuro"}
          aria-label={tema === "dark" ? "Pasar a modo claro" : "Pasar a modo oscuro"}
        >
          {/* El sol que pierde los rayos y se recorta en luna (el mismo del
              link de reservas, ver ThemeToggle). */}
          <IconoTema oscuro={tema === "dark"} />
          <span className="bl-texto">{tema === "dark" ? "Modo claro" : "Modo oscuro"}</span>
        </button>
        <button type="button" className="bl-usuario" onClick={() => setMenuUsuario((m) => !m)} aria-expanded={menuUsuario} aria-haspopup="menu">
          <span className="bl-avatar">{(nombre ?? "?").trim().charAt(0).toUpperCase()}</span>
          <span className="bl-texto">
            {nombre ?? "Usuario"}
            <small>{admin ? "Admin" : "Equipo"}</small>
          </span>
        </button>
      </div>
    </nav>
    </>
  );
}
