import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export type JourneyLite = { id: string; nombre: string };

// Jornadas ACTIVAS y AUTORIZADAS para un usuario de logística.
export async function authorizedJourneys(luId: string): Promise<JourneyLite[]> {
  const { data } = await createAdminClient()
    .from("logistics_user_journeys")
    .select("journeys!inner(id, nombre, estado)")
    .eq("logistics_user_id", luId)
    .eq("activo", true)
    .eq("journeys.estado", "activa");

  return (data ?? []).map((r) => {
    const j = r.journeys as unknown as { id: string; nombre: string };
    return { id: j.id, nombre: j.nombre };
  });
}