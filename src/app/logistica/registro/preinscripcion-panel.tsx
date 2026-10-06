"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Panel de cupos en modo preinscripción. Se actualiza cada 15 s.
export default function PreinscripcionPanel({ inscritos, capacidad }: { inscritos: number; capacidad: number }) {
  const router = useRouter();

  useEffect(() => {
    const t = setInterval(() => router.refresh(), 15000);
    return () => clearInterval(t);
  }, [router]);

  const libres = Math.max(0, capacidad - inscritos);
  const pct = capacidad ? Math.round((inscritos / capacidad) * 100) : 0;

  return (
    <aside className="card space-y-4">
      <h2 className="text-lg font-semibold text-brand">Preinscripción</h2>
      <div className={`rounded-lg p-3 text-white ${libres ? "bg-brand" : "bg-danger"}`}>
        <p className="text-xs opacity-80">{libres ? "Cupos disponibles" : "Estado"}</p>
        <p className="text-3xl font-bold">{libres ? libres : "Cupos agotados"}</p>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-black/10">
        <div className={`h-full ${libres ? "bg-brand" : "bg-danger"}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="flex justify-between text-sm">
        <span>Preinscritos: <b>{inscritos} / {capacidad}</b></span>
        <span>{pct}%</span>
      </div>
      <p className="text-xs text-black/50">La fecha y la hora se asignarán después, por orden de inscripción.</p>
    </aside>
  );
}