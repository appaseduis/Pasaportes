"use client";

import { useActionState, useState } from "react";
import { loginPin, type LoginState } from "./actions";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];
const keyCls = "btn border border-black/10 bg-white py-4 text-2xl hover:bg-brand/5 active:bg-brand/10";

export default function PinForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(loginPin, null);
  const [pin, setPin] = useState("");
  const press = (d: string) => setPin((p) => (p.length < 6 ? p + d : p));

  return (
    <form action={action} className="card w-full max-w-xs space-y-4 text-center">
      <div>
        <h2 className="text-xl font-semibold text-brand">Ingreso logística</h2>
        <p className="text-sm text-black/60">Digita tu PIN de 6 dígitos</p>
      </div>

      {state?.error && <p className="alert-error">{state.error}</p>}

      <input
        name="pin"
        type="password"
        inputMode="numeric"
        autoComplete="off"
        maxLength={6}
        value={pin}
        onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
        className="input text-center font-mono text-3xl tracking-[0.5em]"
        autoFocus
        required
      />

      <div className="grid grid-cols-3 gap-2">
        {KEYS.map((d) => (
          <button type="button" key={d} onClick={() => press(d)} className={keyCls}>{d}</button>
        ))}
        <button type="button" onClick={() => setPin("")} className={`${keyCls} text-sm`}>Borrar</button>
        <button type="button" onClick={() => press("0")} className={keyCls}>0</button>
        <button type="button" onClick={() => setPin((p) => p.slice(0, -1))} className={keyCls}>⌫</button>
      </div>

      <button className="btn-primary w-full py-3 text-lg" disabled={pending || pin.length !== 6}>
        {pending ? "Verificando..." : "Ingresar"}
      </button>
    </form>
  );
}