import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export async function logAudit(
  actor_tipo: "admin" | "logistica" | "sistema",
  actor_id: string | null,
  accion: string,
  entidad?: string,
  entidad_id?: string | null,
  datos?: Record<string, unknown>
) {
  await createAdminClient()
    .from("audit_log")
    .insert({ actor_tipo, actor_id, accion, entidad, entidad_id, datos });
}