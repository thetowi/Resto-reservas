"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { login, ApiError } from "@/lib/api";
import { setSesion } from "@/lib/auth";
import { MarcaCapaxVertical } from "@/components/MarcaCapax";
import PlanoLogin from "@/components/PlanoLogin";
import { SUBTITULO_CLIENTE, marcarIntroMarcaVista } from "@/lib/marca";

// Login: plano de un salón en perspectiva de fondo (se arma junto con la
// animación del logo, ver PlanoLogin.tsx), logo grande arriba y el
// formulario en una tarjeta translúcida. El ingreso funciona igual que
// antes; se suman el botón para ver la contraseña, el aviso de mayúsculas y
// los atributos para que el navegador ofrezca guardar la contraseña.
export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [verPassword, setVerPassword] = useState(false);
  const [mayusculas, setMayusculas] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  // El logo se anima acá; se marca como visto para que la pantalla principal
  // no lo repita justo después de ingresar.
  useEffect(() => {
    marcarIntroMarcaVista();
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setCargando(true);
    try {
      const res = await login(username.trim().toLowerCase(), password);
      setSesion(res.token, res.nombre, res.rol);
      router.push(res.debeCambiarPassword ? "/cambiar-password" : "/");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo iniciar sesión");
    } finally {
      setCargando(false);
    }
  }

  // Bloq Mayús: se lee del propio evento de teclado mientras se escribe la
  // contraseña (no hay forma de saberlo antes de la primera tecla).
  function revisarMayusculas(e: React.KeyboardEvent<HTMLInputElement>) {
    setMayusculas(e.getModifierState("CapsLock"));
  }

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-fondo px-4 py-10">
      <PlanoLogin />

      <div className="relative flex w-full flex-col items-center gap-6">
        <MarcaCapaxVertical subtitulo={SUBTITULO_CLIENTE} animado />

        <form
          onSubmit={onSubmit}
          className="login-vidrio grid w-full max-w-sm gap-4 rounded-2xl border border-borde p-7 shadow-[0_18px_40px_-26px_rgba(12,38,55,0.35)]"
        >
          <div className="grid gap-1.5">
            <label htmlFor="login-usuario" className="text-xs font-medium text-tinta-suave">
              Usuario
            </label>
            <input
              id="login-usuario"
              name="username"
              autoComplete="username"
              className="h-10 w-full rounded-[10px] border border-borde bg-superficie px-3 text-sm text-tinta outline-none focus-visible:border-asistio focus-visible:ring-[3px] focus-visible:ring-asistio/20"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoFocus
              autoCapitalize="none"
              spellCheck={false}
            />
          </div>

          <div className="grid gap-1.5">
            <label htmlFor="login-password" className="text-xs font-medium text-tinta-suave">
              Contraseña
            </label>
            <div className="relative">
              <input
                id="login-password"
                name="password"
                type={verPassword ? "text" : "password"}
                autoComplete="current-password"
                className="h-10 w-full rounded-[10px] border border-borde bg-superficie pr-11 pl-3 text-sm text-tinta outline-none focus-visible:border-asistio focus-visible:ring-[3px] focus-visible:ring-asistio/20"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={revisarMayusculas}
                onKeyUp={revisarMayusculas}
                onBlur={(e) => {
                  // Al tocar el ojito se mantiene el aviso; al salir del campo, se oculta.
                  if (e.relatedTarget?.getAttribute("aria-controls") !== "login-password") setMayusculas(false);
                }}
                aria-describedby={mayusculas ? "login-mayus" : undefined}
              />
              <button
                type="button"
                onClick={() => setVerPassword((v) => !v)}
                className="absolute inset-y-0 right-0 grid w-10 place-items-center rounded-r-[10px] text-tinta-suave hover:text-tinta"
                aria-label={verPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                aria-controls="login-password"
                aria-pressed={verPassword}
              >
                {verPassword ? <IconoOjoTachado /> : <IconoOjo />}
              </button>
            </div>
            {mayusculas && (
              <div id="login-mayus" className="flex items-center gap-1.5 text-xs text-aviso">
                <svg
                  viewBox="0 0 24 24"
                  width={14}
                  height={14}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M12 4 4 12h4v8h8v-8h4Z" />
                </svg>
                Mayúsculas activadas
              </div>
            )}
          </div>

          {error && (
            <div role="alert" className="rounded-[10px] bg-ocupada-suave px-3 py-2 text-sm text-ocupada">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={cargando}
            className="h-[42px] w-full rounded-[10px] bg-marca text-sm font-semibold text-white disabled:opacity-60 [[data-theme=dark]_&]:bg-asistio [[data-theme=dark]_&]:text-[#04221c]"
          >
            {cargando ? "Ingresando…" : "Ingresar"}
          </button>
        </form>

        <div className="text-[11px] tracking-[0.14em] text-tinta-suave uppercase">capax · Reservas · Carta</div>
      </div>
    </div>
  );
}

function IconoOjo() {
  return (
    <svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function IconoOjoTachado() {
  return (
    <svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 3l18 18" />
      <path d="M10.6 5.1A10.4 10.4 0 0 1 12 5c6.5 0 10 7 10 7a17.6 17.6 0 0 1-3.2 4.2M6.6 6.6A17.4 17.4 0 0 0 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.4-1.6" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
    </svg>
  );
}
