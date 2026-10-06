"use client";

import { useActionState } from "react";
import { searchAllJourneys, type OficinaState } from "./actions";
import CitaCard from "@/components/CitaCard";
import EstadoBadge from "@/components/EstadoBadge";

export default function ConsultaOficina() {
  const [state, action, pending] = useActionState<OficinaState, FormData>(searchAllJourneys, null);

  return (
    <div className="space-y-4">
      <form action={action} className="card flex gap-2">
        <input
          name="numero_documento"
          inputMode="numeric"
          autoComplete="off"
          placeholder="Número de cédula"
          className="input flex-1 text-lg"
          autoFocus
          required
        />
        <button className="btn-primary px-6" disabled={pending}>
          {pending ? "Buscando…" : "Buscar"}
        </button>
      </form>

      {state?.mensaje && <p className="alert-error">{state.mensaje}</p>}

      {state?.citas && (
        <div className="space-y-3">
          <p className="text-sm text-black/60">{state.citas.length} cita(s) encontrada(s)</p>
          {state.citas.map((c, i) => (
            <div key={i} className="space-y-1">
              <div className="flex items-center gap-2 text-xs text-black/60">
                Jornada: <EstadoBadge estado={c.jornada_estado} />
              </div>
              <CitaCard cita={c} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}