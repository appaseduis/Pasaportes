"use client";

import { useState } from "react";

export default function CapacityCalculator({
  modulos,
  minutos,
  max,
}: {
  modulos: number | null;
  minutos: number | null;
  max: number;
}) {
  const [m, setM] = useState(modulos?.toString() ?? "");
  const [t, setT] = useState(minutos?.toString() ?? "");

  const nm = Number(m);
  const nt = Number(t);
  const porModulo = nt > 0 ? Math.floor(60 / nt) : 0;
  const porHora = nm > 0 ? nm * porModulo : 0;

  return (
    <div className="grid gap-3 rounded-lg bg-brand/5 p-3 sm:col-span-4 sm:grid-cols-4 sm:items-end">
      <div>
        <label className="label">Número de módulos</label>
        <input name="modulos" type="number" min={1} value={m}
          onChange={(e) => setM(e.target.value)} className="input" />
      </div>
      <div>
        <label className="label">Minutos por persona</label>
        <input name="minutos_por_persona" type="number" min={1} value={t}
          onChange={(e) => setT(e.target.value)} className="input" />
      </div>
      <div className="rounded-lg bg-white p-3 sm:col-span-2">
        {porHora > 0 ? (
          <>
            <p className="text-xs text-black/60">
              {porModulo} persona(s) por módulo por hora × {nm} módulo(s)
            </p>
            <p className="text-2xl font-bold text-brand">{porHora} personas / hora</p>
                   <p className="text-xs text-black/50">Este es el máximo para un horario de 60 min.</p>
          </>
        ) : (
                    <p className="text-sm text-black/50">
            Sin módulos configurados: máximo {max} personas por horario.
          </p>
        )}
      </div>
    </div>
  );
}