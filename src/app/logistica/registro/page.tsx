import { requireLogistics } from "@/lib/auth/guards";
import { createAdminClient } from "@/lib/supabase/admin";
import LogisticsHeader from "@/components/LogisticsHeader";
import RegistroForm from "./registro-form";
import Availability from "./availability";
import type { SlotView } from "@/lib/types";

type Row = {
  id: string; hora_inicio: string; capacidad: number; ocupados: number; estado: string;
  journey_dates: { fecha: string };
};

export default async function RegistroPage() {
  const ctx = await requireLogistics();

  const { data } = await createAdminClient()
    .from("time_slots")
    .select("id, hora_inicio, capacidad, ocupados, estado, journey_dates!inner(fecha, estado)")
    .eq("journey_id", ctx.journeyId)
    .eq("journey_dates.estado", "activa");

  const slots: SlotView[] = ((data ?? []) as unknown as Row[])
    .map((r) => ({
      id: r.id, fecha: r.journey_dates.fecha, hora_inicio: r.hora_inicio,
      capacidad: r.capacidad, ocupados: r.ocupados, estado: r.estado,
    }))
    .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.hora_inicio.localeCompare(b.hora_inicio));

  // La key remonta el panel cuando el servidor trae datos nuevos
  const version = slots.map((s) => s.ocupados).join("-");

  return (
    <main className="min-h-screen">
      <LogisticsHeader journeyNombre={ctx.journeyNombre} nombreInterno={ctx.nombreInterno} />
      <div className="mx-auto grid max-w-6xl gap-4 p-4 lg:grid-cols-[1fr_380px] lg:items-start">
        <RegistroForm />
                  <div className="lg:sticky lg:top-4">
          <Availability key={version} journeyId={ctx.journeyId} initial={slots} />
        </div>
        </div>
    </main>
  );
}