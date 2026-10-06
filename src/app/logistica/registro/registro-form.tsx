"use client";

import { useActionState, useState } from "react";
import { registerPerson } from "./actions";
import CitaCard from "@/components/CitaCard";
import ReaderInput from "@/components/scanner/ReaderInput";
import { parseBarcode } from "@/lib/barcode/parsers";
import type { ScanResult } from "@/lib/barcode/types";
import type { RegistroState } from "@/lib/types";

type FieldProps = {
  name: string;
  label: string;
  required?: boolean;
  numeric?: boolean;
  autoFocus?: boolean;
  defaultValue?: string;
};

function Field({ name, label, required, numeric, autoFocus, defaultValue }: FieldProps) {
  return (
    <div>
      <label className="label" htmlFor={name}>
        {label} {required && <span className="text-danger">*</span>}
      </label>
      <input
        id={name}
        name={name}
        className={`input text-lg ${numeric ? "" : "uppercase"}`}
        inputMode={numeric ? "numeric" : "text"}
        autoComplete="off"
        required={required}
        autoFocus={autoFocus}
        defaultValue={defaultValue}
      />
    </div>
  );
}

function Result({ state }: { state: NonNullable<RegistroState> }) {
  if (state.ok && state.cita) {
    return (
      <div className="space-y-2">
        <p className="alert-ok font-semibold">✓ {state.mensaje}</p>
        <CitaCard cita={state.cita} />
      </div>
    );
  }
  if (state.codigo === "YA_REGISTRADO") {
    return (
      <div className="space-y-2">
        <p className="rounded-lg border border-warn bg-warn/20 px-3 py-2 text-sm font-semibold">⚠ {state.mensaje}</p>
        {state.cita && <CitaCard cita={state.cita} tone="warn" />}
      </div>
    );
  }
  return <p className="alert-error font-semibold">{state.mensaje}</p>;
}

type Prefill = { values: Record<string, string>; parser: string };

export default function RegistroForm() {
  const [state, action, pending] = useActionState<RegistroState, FormData>(registerPerson, null);
  const [reading, setReading] = useState(false);
  const [prefill, setPrefill] = useState<Prefill | null>(null);
  const [seq, setSeq] = useState(0);
  const [scanMsg, setScanMsg] = useState<string | null>(null);
  const [lastRaw, setLastRaw] = useState<string | null>(null);

  const v = prefill?.values ?? state?.values ?? {};

  function handleScan(r: ScanResult) {
    setReading(false);
    setLastRaw(r.raw);

    // Ignora teclas residuales de la pistola durante 1 s
    const swallow = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener("keydown", swallow, true);
    window.setTimeout(() => window.removeEventListener("keydown", swallow, true), 1000);

    const parsed = parseBarcode(r.raw);
        if (!parsed) {
      // Muchos caracteres no imprimibles/raros → QR cifrado (cédula digital)
      const raros = (r.raw.match(/[^\x20-\x7E|\tÑñÁÉÍÓÚáéíóú]/g) ?? []).length;
      setScanMsg(
        raros > 10
          ? "Cédula digital detectada: su código está cifrado. Ingresa los datos manualmente."
          : "Lectura incompleta o con errores. Vuelve a escanear sin mover la cédula."
      );
      setPrefill(null);
      setSeq((s) => s + 1);
      return;
    }
    setScanMsg(null);
    setPrefill({
      values: { ...parsed.data, telefono: "", metodo_registro: "escaneo" } as Record<string, string>,
      parser: parsed.parser,
    });
    setSeq((s) => s + 1);
  }

  return (
    <div className="space-y-4">
      {state && !prefill && <Result state={state} />}

      <div className="card space-y-3">
          <div className="flex items-start gap-3 rounded-lg border-2 border-danger bg-danger/10 p-3">
          <span className="text-2xl leading-none">⚠️</span>
          <div className="text-sm">
            <p className="font-bold text-danger">Escanear SOLO la cédula amarilla (con hologramas)</p>
            <p className="text-black/70">
              <b>NO</b> escanear la <b>cédula digital</b> ni el QR del celular: su código está cifrado y
              genera teclas aleatorias en el computador. Para cédula digital usa el <b>registro manual</b>.
            </p>
          </div>
        </div>

        {!reading ? (
          <button type="button" className="btn-primary w-full py-3 text-lg" onClick={() => setReading(true)}>
            ⌨ Escanear cédula amarilla con lector
          </button>
        ) : (
          <ReaderInput onResult={handleScan} onClose={() => setReading(false)} />
        )}

        {scanMsg && <p className="alert-error">{scanMsg}</p>}

                {prefill && (
          <div className="rounded-lg border border-warn bg-warn/20 px-3 py-2 text-sm">
            {prefill.values.primer_apellido ? (
              <p><b>Datos leídos del documento.</b> Verifícalos y completa el <b>teléfono</b>.</p>
            ) : (
              <>
                <p><b>Cédula leída.</b> Los nombres llegaron unidos; escríbelos separados:</p>
                {prefill.values.nombres_crudos && (
                  <p className="mt-1 font-mono text-base font-bold tracking-wide">
                    {prefill.values.nombres_crudos}
                  </p>
                )}
              </>
            )}
            <span className="text-xs text-black/50">({prefill.parser})</span>
          </div>
        )}
      </div>

      <form
        key={`${state?.ts ?? 0}-${seq}`}
        action={action}
        onSubmit={() => setPrefill(null)}
        className="card grid gap-3 sm:grid-cols-2"
      >
        <div className="flex items-center justify-between sm:col-span-2">
          <h2 className="text-lg font-semibold text-brand">Datos de la persona</h2>
          {prefill && (
            <button type="button" className="text-sm text-danger hover:underline"
              onClick={() => { setPrefill(null); setSeq((s) => s + 1); }}>
              Limpiar
            </button>
          )}
        </div>
        <input type="hidden" name="metodo_registro" defaultValue={v.metodo_registro || "manual"} />

        <div className="sm:col-span-2">
          <Field name="numero_documento" label="Número de cédula" required numeric
            autoFocus={!prefill && !reading} defaultValue={v.numero_documento} />
        </div>
        <Field name="primer_apellido" label="Primer apellido" required
          autoFocus={!!prefill && !prefill.values.primer_apellido} defaultValue={v.primer_apellido} />
        <Field name="segundo_apellido" label="Segundo apellido" defaultValue={v.segundo_apellido} />
        <Field name="primer_nombre" label="Primer nombre" required defaultValue={v.primer_nombre} />
        <Field name="segundo_nombre" label="Segundo nombre" defaultValue={v.segundo_nombre} />
        <div className="sm:col-span-2">
          <Field name="telefono" label="Teléfono" required numeric
            autoFocus={!!prefill && !!prefill.values.primer_apellido} defaultValue={v.telefono} />
        </div>

        <button className="btn-primary py-3 text-lg sm:col-span-2" disabled={pending}>
          {pending ? "Asignando cita..." : "Registrar y asignar cita"}
        </button>
        <p className="text-center text-xs text-black/50 sm:col-span-2">
          La fecha y hora las asigna el sistema automáticamente.
        </p>
      </form>
    </div>
  );
}