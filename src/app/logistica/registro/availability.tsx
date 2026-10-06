"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatFecha, hhmm } from "@/lib/format";
import type { SlotView } from "@/lib/types";

export default function Availability({ journeyId, initial }: { journeyId: string; initial: SlotView[] }) {
  const [slots, setSlots] = useState(initial);
  const [live, setLive] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`slots:${journeyId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "time_slots", filter: `journey_id=eq.${journeyId}` },
        (payload) => {
          const n = payload.new as SlotView;
          setSlots((prev) =>
            prev.map((s) =>
              s.id === n.id ? { ...s, ocupados: n.ocupados, capacidad: n.capacidad, estado: n.estado } : s
            )
          );
        }
      )
      .subscribe((status) => setLive(status === "SUBSCRIBED"));

    return () => {
      supabase.removeChannel(channel);
    };
  }, [journeyId]);

  const active = slots.filter((s) => s.estado === "activo");
  const next = active.find((s) => s.ocupados < s.capacidad);
  const totalCap = active.reduce((a, s) => a + s.capacidad, 0);
  const totalOcc = active.reduce((a, s) => a + s.ocupados, 0);

  const groups = new Map<string, SlotView[]>();
  for (const s of active) groups.set(s.fecha, [...(groups.get(s.fecha) ?? []), s]);

  return (
    <aside className="card space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-brand">Disponibilidad</h2>
        <span className={`flex items-center gap-1.5 text-xs ${live ? "text-ok" : "text-black/40"}`}>
          <span className={`h-2 w-2 rounded-full ${live ? "animate-pulse bg-ok" : "bg-black/30"}`} />
          {live ? "En vivo" : "Conectando…"}
        </span>
      </div>

      {next ? (
        <div className="rounded-lg bg-brand p-3 text-white">
          <p className="text-xs opacity-80">Próxima asignación</p>
          <p className="text-2xl font-bold">{hhmm(next.hora_inicio)}</p>
          <p className="text-sm capitalize opacity-90">
            {formatFecha(next.fecha, { weekday: "short", day: "2-digit", month: "short" })} ·{" "}
            {next.capacidad - next.ocupados} cupos
          </p>
        </div>
      ) : (
        <div className="rounded-lg bg-danger p-3 text-center font-semibold text-white">
          No hay citas disponibles
        </div>
      )}

      {[...groups.entries()].map(([fecha, list]) => (
        <div key={fecha} className="space-y-1.5">
          <p className="text-sm font-semibold capitalize">
            {formatFecha(fecha, { weekday: "long", day: "2-digit", month: "long" })}
          </p>
          {list.map((s) => {
            const full = s.ocupados >= s.capacidad;
            const pct = Math.round((s.ocupados / s.capacidad) * 100);
            return (
              <div key={s.id} className="flex items-center gap-2 text-sm">
                <span className="w-12 font-mono">{hhmm(s.hora_inicio)}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-black/10">
                  <div className={`h-full ${full ? "bg-danger" : "bg-brand"}`} style={{ width: `${pct}%` }} />
                </div>
                <span className="w-14 text-right tabular-nums">{s.ocupados}/{s.capacidad}</span>
                <span className={`w-20 text-right text-xs font-semibold ${full ? "text-danger" : "text-ok"}`}>
                  {full ? "COMPLETA" : `${s.capacidad - s.ocupados} libres`}
                </span>
              </div>
            );
          })}
        </div>
      ))}

      <div className="flex justify-between border-t border-black/10 pt-3 text-sm">
        <span>Total: <b>{totalOcc} / {totalCap}</b></span>
        <span>Disponibles: <b className="text-ok">{totalCap - totalOcc}</b></span>
      </div>
    </aside>
  );
}