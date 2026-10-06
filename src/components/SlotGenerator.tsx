"use client";

import { useState } from "react";

const DURACION = 60; // bloques de 1 hora (el cálculo es personas/hora)

const toMin = (h: string) => Number(h.slice(0, 2)) * 60 + Number(h.slice(3, 5));

export default function SlotGenerator({
  action,
  journeyId,
  dateId,
  modulos,
  minutos,
  max,
  capacidadFecha,
  sumaActual,
}: {
  action: (fd: FormData) => void | Promise<void>;
  journeyId: string;
  dateId: string;
  modulos: number | null;
  minutos: number | null;
  max: number;
  capacidadFecha: number;
  sumaActual: number;
}) {
  const [desde, setDesde] = useState("08:00");
  const [hasta, setHasta] = useState("12:00");

  const capacidad = modulos && minutos ? modulos * Math.floor(DURACION / minutos) : max;
  const bloques = Math.max(0, Math.floor((toMin(hasta) - toMin(desde)) / DURACION));
  const resultado = sumaActual + bloques * capacidad;
  const diff = resultado - capacidadFecha;

  return (
    <form action={action} className="grid gap-3 rounded-lg bg-brand/5 p-3 sm:grid-cols-4 sm:items-end">
      <input type="hidden" name="journey_id" value={journeyId} />
      <input type="hidden" name="journey_date_id" value={dateId} />
      <input type="hidden" name="duracion" value={DURACION} />
      <input type="hidden" name="capacidad" value={capacidad} />

      <div>
        <label className="label">Desde</label>
        <input name="desde" type="time" value={desde} onChange={(e) => setDesde(e.target.value)}
          className="input" required />
      </div>
      <div>
        <label className="label">Hasta</label>
        <input name="hasta" type="time" value={hasta} onChange={(e) => setHasta(e.target.value)}
          className="input" required />
      </div>
            <div className="text-sm">
        {bloques > 0 ? (
          <>
            <p>
              <b>{bloques}</b> horario(s) de 1 h × <b>{capacidad}</b> personas ={" "}
              <b className="text-brand">{bloques * capacidad}</b>
            </p>
            <p className={`text-xs font-semibold ${
              diff === 0 ? "text-ok" : diff > 0 ? "text-danger" : "text-ink"}`}>
              Quedaría: {resultado} / {capacidadFecha}{" "}
              {diff === 0 ? "✓ Cuadra" : diff > 0 ? `⚠ Excede por ${diff}` : `⚠ Faltan ${-diff}`}
            </p>
          </>
        ) : (
          <p className="text-danger">El rango debe cubrir al menos 1 hora.</p>
        )}
        {!(modulos && minutos) && (
          <p className="text-xs text-black/50">Sin módulos: se usa el máximo fijo ({max}).</p>
        )}
      </div>
      <button className="btn-primary" disabled={bloques === 0}>Generar horarios</button>
    </form>
  );
}