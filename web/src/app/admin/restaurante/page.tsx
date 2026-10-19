"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ApiError, getDatosRestaurante, guardarDatosRestaurante } from "@/lib/api";
import { esAdmin, haySesion } from "@/lib/auth";
import { opcionesMapa } from "@/lib/mapas";
import type { DatosRestaurante } from "@/lib/types";

// Datos del restaurante (solo Admin): lo que ve el cliente en el link de
// reservas. Por ahora la ubicacion de "Cómo llegar" (el cliente elige Google
// Maps, Apple Maps o Waze). Se guarda en la base de este restaurante (ver
// DatosRestauranteController), asi cada restaurante tiene los suyos.

interface Formulario {
  direccion: string;
  googleMapsUrl: string;
  appleMapsUrl: string;
  wazeUrl: string;
}

const vacio: Formulario = { direccion: "", googleMapsUrl: "", appleMapsUrl: "", wazeUrl: "" };

function aFormulario(d: DatosRestaurante): Formulario {
  return { direccion: d.direccion ?? "", googleMapsUrl: d.googleMapsUrl ?? "", appleMapsUrl: d.appleMapsUrl ?? "", wazeUrl: d.wazeUrl ?? "" };
}

function cuando(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("es-AR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });
}

const LINKS: { clave: keyof Formulario; app: string; ayuda: string }[] = [
  { clave: "googleMapsUrl", app: "Google Maps", ayuda: "Google Maps → buscá el restaurante → Compartir → Copiar vínculo" },
  { clave: "appleMapsUrl", app: "Apple Maps", ayuda: "Mapas del iPhone o la Mac → buscá el restaurante → Compartir → Copiar" },
  { clave: "wazeUrl", app: "Waze", ayuda: "Waze → buscá el restaurante → Compartir → Copiar link" },
];

export default function DatosRestaurantePage() {
  const router = useRouter();
  const [listo, setListo] = useState(false);
  const [datos, setDatos] = useState<DatosRestaurante | null>(null);
  const [form, setForm] = useState<Formulario>(vacio);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

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

  useEffect(() => {
    if (!listo) return;
    getDatosRestaurante()
      .then((d) => {
        setDatos(d);
        setForm(aFormulario(d));
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : "No se pudieron cargar los datos"));
  }, [listo]);

  async function guardar() {
    setGuardando(true);
    setError(null);
    setAviso(null);
    try {
      const d = await guardarDatosRestaurante({
        direccion: form.direccion.trim() || null,
        googleMapsUrl: form.googleMapsUrl.trim() || null,
        appleMapsUrl: form.appleMapsUrl.trim() || null,
        wazeUrl: form.wazeUrl.trim() || null,
      });
      setDatos(d);
      setForm(aFormulario(d));
      setAviso("Guardado. El link de reservas ya lo muestra.");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo guardar");
    } finally {
      setGuardando(false);
    }
  }

  if (!listo) return null;

  const original = datos ? aFormulario(datos) : vacio;
  const cambios = (Object.keys(form) as (keyof Formulario)[]).some((k) => form[k].trim() !== original[k]);
  // Lo que va a ver el cliente con lo que esta escrito ahora (antes de guardar).
  const opciones = opcionesMapa({
    direccion: form.direccion.trim() || null,
    googleMapsUrl: form.googleMapsUrl.trim() || null,
    appleMapsUrl: form.appleMapsUrl.trim() || null,
    wazeUrl: form.wazeUrl.trim() || null,
  });
  const campo = "w-full rounded-lg border border-borde bg-superficie px-3 py-2 text-sm";
  const etiqueta = "text-[11px] font-semibold tracking-wider text-tinta-suave uppercase";

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <div className="mb-5">
        <Link href="/" className="text-xs text-tinta-suave underline hover:text-tinta">
          ← Volver a reservas
        </Link>
        <h1 className="mt-1 text-lg font-bold">Datos del restaurante</h1>
        <p className="mt-0.5 max-w-[62ch] text-sm text-tinta-suave">Lo que ve el cliente en el link de reservas. Solo el Admin puede cambiarlo.</p>
      </div>

      {error && <div className="mb-3 rounded-lg bg-ocupada-suave px-3 py-2 text-sm text-ocupada">{error}</div>}

      <section className="grid gap-5 rounded-2xl border border-borde bg-superficie p-5">
        <div>
          <h2 className="m-0 text-base font-bold">Ubicación · «Cómo llegar»</h2>
          <p className="mt-0.5 text-sm text-tinta-suave">
            Aparece en la confirmación de la reserva y cuando el turno está en servicio. El cliente elige con qué app abrirla.
          </p>
        </div>

        {!datos && !error ? (
          <div className="text-sm text-tinta-suave">Cargando…</div>
        ) : (
          <>
            <label className="grid gap-1.5">
              <span className={etiqueta}>Dirección</span>
              <input
                className={campo}
                value={form.direccion}
                maxLength={200}
                placeholder="Ej. Av. Costanera 1234, San Isidro, Buenos Aires"
                onChange={(e) => setForm({ ...form, direccion: e.target.value })}
              />
              <small className="text-xs text-tinta-suave">Con la dirección alcanza: los links de Google Maps, Apple Maps y Waze se arman solos.</small>
            </label>

            <details className="group rounded-xl border border-borde px-4 py-3" open={LINKS.some((l) => !!original[l.clave])}>
              <summary className="cursor-pointer text-sm font-semibold">Links exactos de cada app (opcional)</summary>
              <p className="mt-1 mb-3 text-xs text-tinta-suave">
                Si los cargás, se usan en vez del que se arma con la dirección. Conviene para que se abra la ficha del restaurante (con fotos y horarios) y no solo
                la calle.
              </p>
              <div className="grid gap-3">
                {LINKS.map((l) => (
                  <label key={l.clave} className="grid gap-1.5">
                    <span className={etiqueta}>{l.app}</span>
                    <input
                      className={campo}
                      type="url"
                      inputMode="url"
                      value={form[l.clave]}
                      maxLength={500}
                      placeholder="https://…"
                      onChange={(e) => setForm({ ...form, [l.clave]: e.target.value })}
                    />
                    <small className="text-xs text-tinta-suave">{l.ayuda}</small>
                  </label>
                ))}
              </div>
            </details>

            <div className="grid gap-2 rounded-xl bg-arena-suave/50 px-4 py-3">
              <span className={etiqueta}>Así lo ve el cliente</span>
              {opciones.length === 0 ? (
                <span className="text-sm text-tinta-suave">Sin dirección ni links el botón «Cómo llegar» no aparece.</span>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {opciones.map((o) => (
                    <a
                      key={o.app}
                      href={o.href}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-lg border border-borde bg-superficie px-3 py-1.5 text-sm hover:bg-arena-suave"
                      title="Abrir para probar"
                    >
                      {o.nombre} ↗
                    </a>
                  ))}
                </div>
              )}
              <small className="text-xs text-tinta-suave">Tocá cada una para probar que abra el lugar correcto.</small>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-3">
              {aviso && !cambios ? (
                <span className="mr-auto text-sm text-[#1d7a69] [[data-theme=dark]_&]:text-[#6fd3bf]">{aviso}</span>
              ) : datos?.updatedAt ? (
                <span className="mr-auto text-xs text-tinta-suave">
                  Último cambio: {cuando(datos.updatedAt)}
                  {datos.updatedBy ? ` · ${datos.updatedBy}` : ""}
                </span>
              ) : null}
              <button
                type="button"
                onClick={guardar}
                disabled={guardando || !cambios}
                className="rounded-lg bg-marca px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {guardando ? "Guardando…" : "Guardar"}
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
