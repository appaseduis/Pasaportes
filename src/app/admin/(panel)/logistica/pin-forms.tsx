"use client";

import { useActionState, useState } from "react";
import { createLogisticsUser, resetPin, type PinState } from "./actions";

function PinBox({ state }: { state: PinState }) {
  const [hiddenPin, setHiddenPin] = useState<string | null>(null);
  if (!state) return null;
  if (state.error) return <p className="alert-error">{state.error}</p>;
  if (!state.pin || hiddenPin === state.pin) return null;

  return (
    <div className="rounded-lg border-2 border-dashed border-brand bg-brand/5 p-3 text-center">
      <p className="text-sm">PIN de <b>{state.nombre}</b></p>
      <p className="font-mono text-3xl font-bold tracking-[0.3em] text-brand">{state.pin}</p>
      <p className="text-xs text-black/60">Anótalo y entrégalo. No se volverá a mostrar.</p>
      <button type="button" onClick={() => setHiddenPin(state.pin!)}
        className="mt-2 text-xs font-medium text-brand underline">
        Ya lo anoté, ocultar
      </button>
    </div>
  );
}

export function CreateUserForm() {
  const [state, action, pending] = useActionState(createLogisticsUser, null);
  return (
    <form action={action} className="card space-y-3">
      <h2 className="font-semibold">Nuevo usuario de logística</h2>
      <div className="flex flex-wrap gap-3">
        <input name="nombre_interno" placeholder="Ej: Mesa 1 - Laura" className="input flex-1" required />
        <select name="rol" defaultValue="logistica" className="input w-auto">
          <option value="logistica">Logística (registro)</option>
          <option value="oficina">Oficina (solo consulta)</option>
        </select>
        <button className="btn-primary" disabled={pending}>
          {pending ? "Creando..." : "Crear y generar PIN"}
        </button>
      </div>
      <PinBox state={state} />
    </form>
  );
}

export function ResetPinButton({ id }: { id: string }) {
  const [state, action, pending] = useActionState(resetPin, null);
  return (
    <form
      action={action}
      className="w-full space-y-2"
      onSubmit={(e) => {
        if (!confirm("¿Generar un nuevo PIN? El anterior dejará de funcionar.")) e.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={id} />
      <button className="btn-outline px-3 py-1 text-sm" disabled={pending}>
        {pending ? "Generando..." : "Resetear PIN"}
      </button>
      <PinBox state={state} />
    </form>
  );
}