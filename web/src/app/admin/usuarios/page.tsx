"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ApiError, crearUsuario, getUsuarios, patchUsuario } from "@/lib/api";
import { esAdmin, haySesion } from "@/lib/auth";
import type { Rol, UsuarioCuenta } from "@/lib/types";

export default function AdminUsuariosPage() {
  const router = useRouter();
  const [listo, setListo] = useState(false);

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

  if (!listo) return null;

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <div className="mb-6">
        <Link href="/" className="text-xs text-tinta-suave underline hover:text-tinta">
          ← Volver a reservas
        </Link>
        <h1 className="mt-1 text-lg font-bold">Cuentas</h1>
      </div>

      <p className="mb-4 text-sm text-tinta-suave">
        Las cuentas son con las que se entra a la app (usuario/contraseña + rol Admin o Staff).
      </p>

      <PanelCuentas />
    </div>
  );
}

function PanelCuentas() {
  const [cuentas, setCuentas] = useState<UsuarioCuenta[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nuevaAbierta, setNuevaAbierta] = useState(false);

  useEffect(() => {
    getUsuarios()
      .then(setCuentas)
      .catch((e) => setError(e instanceof ApiError ? e.message : "Error cargando las cuentas"))
      .finally(() => setCargando(false));
  }, []);

  function manejarError(e: unknown) {
    setError(e instanceof ApiError ? e.message : "No se pudo completar la acción");
  }

  async function onCrear(nombre: string, username: string, password: string, rol: Rol) {
    try {
      setCuentas(await crearUsuario(nombre, username, password, rol));
      setNuevaAbierta(false);
      setError(null);
    } catch (e) {
      manejarError(e);
    }
  }

  async function onCambiarRol(cuenta: UsuarioCuenta, rol: Rol) {
    try {
      setCuentas(await patchUsuario(cuenta.id, { rol }));
      setError(null);
    } catch (e) {
      manejarError(e);
    }
  }

  async function onToggleActivo(cuenta: UsuarioCuenta) {
    try {
      setCuentas(await patchUsuario(cuenta.id, { activo: !cuenta.activo }));
      setError(null);
    } catch (e) {
      manejarError(e);
    }
  }

  async function onResetearPassword(cuenta: UsuarioCuenta) {
    const nueva = window.prompt(`Nueva contraseña para ${cuenta.nombre} (${cuenta.username}):`);
    if (!nueva) return;
    try {
      setCuentas(await patchUsuario(cuenta.id, { password: nueva }));
      setError(null);
    } catch (e) {
      manejarError(e);
    }
  }

  if (cargando) return <div className="p-10 text-center text-tinta-suave">Cargando…</div>;

  return (
    <div className="rounded-2xl border border-borde bg-white shadow-sm">
      {error && (
        <div className="m-3.5 rounded-lg bg-ocupada-suave px-3 py-2 text-sm text-ocupada">{error}</div>
      )}
      <div className="divide-y divide-borde">
        {cuentas.map((cuenta) => (
          <div key={cuenta.id} className="flex flex-wrap items-center gap-2.5 p-3.5">
            <div className="min-w-[140px]">
              <div className="text-sm font-semibold">{cuenta.nombre}</div>
              <div className="text-xs text-tinta-suave">@{cuenta.username}</div>
            </div>
            <select
              className="rounded-lg border border-borde px-2.5 py-1.5 text-sm"
              value={cuenta.rol}
              onChange={(e) => onCambiarRol(cuenta, e.target.value as Rol)}
            >
              <option value="admin">Admin</option>
              <option value="staff">Staff</option>
            </select>
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                cuenta.activo ? "bg-asistio-suave text-asistio" : "bg-ocupada-suave text-ocupada"
              }`}
            >
              {cuenta.activo ? "Activa" : "Desactivada"}
            </span>
            <div className="ml-auto flex items-center gap-1.5">
              <button
                onClick={() => onResetearPassword(cuenta)}
                className="rounded-lg border border-borde px-2.5 py-1 text-xs hover:bg-arena-suave"
              >
                Resetear contraseña
              </button>
              <button
                onClick={() => onToggleActivo(cuenta)}
                className="rounded-lg border border-borde px-2.5 py-1 text-xs text-tinta-suave hover:bg-ocupada-suave hover:text-ocupada"
              >
                {cuenta.activo ? "Desactivar" : "Reactivar"}
              </button>
            </div>
          </div>
        ))}
      </div>
      <div className="border-t border-borde p-3.5">
        {nuevaAbierta ? (
          <FormularioCuenta onCancelar={() => setNuevaAbierta(false)} onGuardar={onCrear} />
        ) : (
          <button
            onClick={() => setNuevaAbierta(true)}
            className="rounded-lg border border-dashed border-arena px-3.5 py-1.5 text-sm hover:bg-arena-suave"
          >
            + Nueva cuenta
          </button>
        )}
      </div>
    </div>
  );
}

function FormularioCuenta({
  onCancelar,
  onGuardar,
}: {
  onCancelar: () => void;
  onGuardar: (nombre: string, username: string, password: string, rol: Rol) => void;
}) {
  const [nombre, setNombre] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [rol, setRol] = useState<Rol>("staff");

  return (
    <div className="flex flex-wrap items-center gap-2.5">
      <input
        autoFocus
        className="w-36 rounded-lg border border-borde px-2.5 py-1.5 text-sm"
        placeholder="Nombre"
        value={nombre}
        onChange={(e) => setNombre(e.target.value)}
      />
      <input
        className="w-28 rounded-lg border border-borde px-2.5 py-1.5 text-sm"
        placeholder="usuario"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        autoCapitalize="none"
      />
      <input
        className="w-32 rounded-lg border border-borde px-2.5 py-1.5 text-sm"
        placeholder="contraseña inicial"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <select
        className="rounded-lg border border-borde px-2.5 py-1.5 text-sm"
        value={rol}
        onChange={(e) => setRol(e.target.value as Rol)}
      >
        <option value="staff">Staff</option>
        <option value="admin">Admin</option>
      </select>
      <button
        disabled={!nombre.trim() || !username.trim() || password.length < 4}
        onClick={() => onGuardar(nombre.trim(), username.trim(), password, rol)}
        className="rounded-lg bg-tinta px-3 py-1.5 text-sm text-white disabled:opacity-40"
      >
        Guardar
      </button>
      <button onClick={onCancelar} className="text-sm text-tinta-suave underline">
        Cancelar
      </button>
    </div>
  );
}
