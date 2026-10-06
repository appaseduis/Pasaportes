"use client";

import { useActionState, useState } from "react";
import { searchAllJourneys, setStatusOficina, type OficinaState } from "./actions";
import CitaCard from "@/components/CitaCard";
import EstadoBadge from "@/components/EstadoBadge";

function Hidden({ id, doc, estado }: { id: string; doc: string; estado: string }) {
  return (
    <>
      <input type="hidden" name="appointment_id" value={id} />
      <input type="hidden" name="numero_documento" value={doc} />
      <input type="hidden" name="estado" value={estado} />
    </>
  );
}

export default function ConsultaOficina() {
  const [q, search, searching] = useActionState<OficinaState, FormData>(searchAllJourneys, null);
  const [s, setStatus, saving] = useActionState<OficinaState, FormData>(setStatusOficina, null);
  const [repro, setRepro] = useState<{ id: string; at: number } | null>(null);

  // Resultado más reciente: búsqueda o cambio de estado
  const fromStatus = !!s && (!q || s.ts > q.ts);
  const st = fromStatus ? s : q;
  const isReproOpen = (id: string) => repro?.id === id && repro.at === (s?.ts ?? 0);

  return (
    <div className="space-y-4">
      <form action={search} className="card flex gap-2">
        <input name="numero_documento" inputMode="numeric" autoComplete="off"
          placeholder="Número de cédula" className="input flex-1 text-lg" autoFocus required />
        <button className="btn-primary px-6" disabled={searching}>{searching ? "Buscando…" : "Buscar"}</button>
      </form>

      {fromStatus && s?.mensaje && <p className={s.ok ? "alert-ok" : "alert-error"}>{s.mensaje}</p>}
      {!fromStatus && q?.mensaje && <p className="alert-error">{q.mensaje}</p>}

      {st?.citas && (
        <div className="space-y-6">
          <p className="text-sm text-black/60">{st.citas.length} cita(s) encontrada(s)</p>

          {st.citas.map((c) => (
            <div key={c.id} className="space-y-2">
              <div className="flex items-center gap-2 text-xs text-black/60">
                Jornada: <EstadoBadge estado={c.jornada_estado} />
              </div>
              <CitaCard cita={c} />

              {c.estado === "preinscrita" ? (
                <p className="rounded-lg bg-brand/10 px-3 py-2 text-sm">
                  Preinscrita: aún no tiene fecha y hora asignadas.
                </p>
              ) : c.estado === "asistio" ? (
                <p className="alert-ok font-semibold">✓ La persona ya asistió. El estado es final.</p>
              ) : (
                <div className="card space-y-3">
                  <p className="font-semibold">Actualizar estado</p>
                  <div className="grid gap-2 sm:grid-cols-3">
                    <form action={setStatus}>
                      <Hidden id={c.id} doc={c.numero_documento} estado="asistio" />
                      <button className="btn w-full bg-ok py-3 text-white hover:opacity-90" disabled={saving}>
                        ✓ Asistió
                      </button>
                    </form>

                    {c.estado !== "no_asistio" && c.estado !== "reprogramado" && (
                      <form action={setStatus}>
                        <Hidden id={c.id} doc={c.numero_documento} estado="no_asistio" />
                        <button className="btn w-full bg-danger py-3 text-white hover:opacity-90" disabled={saving}>
                          ✗ No asistió
                        </button>
                      </form>
                    )}

                    <button type="button" className="btn w-full bg-warn py-3 text-ink hover:opacity-90"
                      onClick={() => setRepro(isReproOpen(c.id) ? null : { id: c.id, at: s?.ts ?? 0 })}>
                      ↻ Reprogramar
                    </button>
                  </div>

                  {isReproOpen(c.id) && (
                    <form action={setStatus} className="space-y-2">
                      <Hidden id={c.id} doc={c.numero_documento} estado="reprogramado" />
                      <textarea name="comentario" required minLength={5} rows={3}
                        className="input" placeholder="Motivo de la reprogramación…" />
                      <button className="btn-primary w-full" disabled={saving}>
                        {saving ? "Guardando…" : "Guardar reprogramación"}
                      </button>
                    </form>
                  )}
                </div>
              )}

              {!!c.historial?.length && (
                <div className="card space-y-2">
                  <p className="font-semibold">Historial</p>
                  {c.historial.map((h, i) => (
                    <div key={i} className="border-t border-black/5 pt-2 text-sm">
                      <div className="flex flex-wrap items-center gap-2">
                        <EstadoBadge estado={h.estado} />
                        <span className="text-xs text-black/50">
                          {new Date(h.fecha).toLocaleString("es-CO", {
                            timeZone: "America/Bogota", dateStyle: "short", timeStyle: "short",
                          })} · {h.logistica ?? "—"}
                        </span>
                      </div>
                      {h.comentario && <p className="mt-1 text-black/70">{h.comentario}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}