"use client";

import { useActionState } from "react";
import { lookupByDocument, type ConsultaState } from "../registro/actions";
import CitaCard from "@/components/CitaCard";

export default function Consulta() {
  const [state, action, pending] = useActionState<ConsultaState, FormData>(lookupByDocument, null);

  return (
    <div className="card space-y-3">
      <h2 className="text-lg font-semibold text-brand">Consultar cita</h2>
      <form action={action} className="flex gap-2">
        <input
          name="numero_documento"
          inputMode="numeric"
          autoComplete="off"
          placeholder="Número de cédula"
          className="input flex-1"
          required
        />
        <button className="btn-outline" disabled={pending}>
          {pending ? "…" : "Buscar"}
        </button>
      </form>
      {state?.mensaje && <p className="alert-error">{state.mensaje}</p>}
      {state?.cita && <CitaCard cita={state.cita} />}
    </div>
  );
}