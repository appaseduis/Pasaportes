"use client";

import { useActionState, useState } from "react";
import {
  lookupByDocument, setAppointmentStatus,
  type ConsultaState, type StatusState,
} from "../registro/actions";
import CitaCard from "@/components/CitaCard";
import EstadoBadge from "@/components/EstadoBadge";

function Hidden({ doc, estado }: { doc: string; estado: string }) {
  return (
    <>
      <input type="hidden" name="numero_documento" value={doc} />
      <input type="hidden" name="estado" value={estado} />
    </>
  );
}

export default function Consulta() {
  const [q, lookup, searching] = useActionState<ConsultaState, FormData>(lookupByDocument, null);
  const [s, setStatus, saving] = useActionState<StatusState, FormData>(setAppointmentStatus, null);
  const [reproOpenedAt, setReproOpenedAt] = useState<number | null>(null);

  // Muestra el resultado más reciente (búsqueda o cambio de estado)
  const fromStatus = !!s && (!q || s.ts > q.ts);
  const cita = fromStatus ? s?.cita : q?.cita;
  const showRepro = reproOpenedAt !== null && reproOpenedAt === (s?.ts ?? 0);

  return (
    <div className="space-y-4">
      <div className="card space-y-3">
        <h2 className="text-lg font-semibold text-brand">Consultar cita</h2>
        <form action={lookup} className="flex gap-2">
          <input name="numero_documento" inputMode="numeric" autoComplete="off"
            placeholder="Número de cédula" className="input flex-1 text-lg" autoFocus required />
          <button className="btn-primary px-6" disabled={searching}>{searching ? "…" : "Buscar"}</button>
        </form>
        {!fromStatus && q?.mensaje && <p className="alert-error">{q.mensaje}</p>}
        {fromStatus && s && <p className={s.ok ? "alert-ok" : "alert-error"}>{s.mensaje}</p>}
      </div>

      {cita && (
        <>
          <CitaCard cita={cita} />

        {cita.estado === "preinscrita" ? (
            <p className="rounded-lg bg-brand/10 px-3 py-2 text-sm">
              Preinscrita: aún no tiene fecha y hora. Los estados se habilitan cuando se asignen horarios.
            </p>
          ) : cita.estado === "asistio" ? (
            <p className="alert-ok font-semibold">✓ La persona ya asistió. El estado es final.</p>
          ) : (
            <div className="card space-y-3">
              <p className="font-semibold">Actualizar estado</p>
              <div className="grid gap-2 sm:grid-cols-3">
                <form action={setStatus}>
                  <Hidden doc={cita.numero_documento} estado="asistio" />
                  <button className="btn w-full bg-ok py-3 text-white hover:opacity-90" disabled={saving}>
                    ✓ Asistió
                  </button>
                </form>

                {cita.estado !== "no_asistio" && cita.estado !== "reprogramado" && (
                  <form action={setStatus}>
                    <Hidden doc={cita.numero_documento} estado="no_asistio" />
                    <button className="btn w-full bg-danger py-3 text-white hover:opacity-90" disabled={saving}>
                      ✗ No asistió
                    </button>
                  </form>
                )}

                <button type="button" className="btn w-full bg-warn py-3 text-ink hover:opacity-90"
                  onClick={() => setReproOpenedAt(showRepro ? null : (s?.ts ?? 0))}>
                  ↻ Reprogramar
                </button>
              </div>

              {showRepro && (
                <form action={setStatus} className="space-y-2">
                  <Hidden doc={cita.numero_documento} estado="reprogramado" />
                  <textarea name="comentario" required minLength={5} rows={3}
                    className="input" placeholder="Motivo de la reprogramación…" />
                  <button className="btn-primary w-full" disabled={saving}>
                    {saving ? "Guardando…" : "Guardar reprogramación"}
                  </button>
                </form>
              )}
            </div>
          )}

          {!!cita.historial?.length && (
            <div className="card space-y-2">
              <p className="font-semibold">Historial</p>
              {cita.historial.map((h, i) => (
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
        </>
      )}
    </div>
  );
}