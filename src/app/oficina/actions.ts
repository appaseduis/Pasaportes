"use server";

import { requireOficina } from "@/lib/auth/guards";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Cita } from "@/lib/types";

export type OficinaCita = Cita & { id: string; jornada_estado: string };
export type OficinaState = { citas?: OficinaCita[]; mensaje?: string; ok?: boolean; ts: number } | null;

const cleanDoc = (fd: FormData) => (fd.get("numero_documento")?.toString() ?? "").replace(/\D/g, "");

// Todas las citas de una cédula, en todas las jornadas
async function buscar(doc: string): Promise<OficinaCita[]> {
  const db = createAdminClient();
  const { data } = await db
    .from("v_appointments")
    .select("id, journey_id, fecha")
    .eq("numero_documento", doc)
    .order("fecha", { ascending: false });
  if (!data?.length) return [];

  const ids = [...new Set(data.map((r) => r.journey_id as string))];
  const { data: js } = await db.from("journeys").select("id, estado").in("id", ids);
  const estados = new Map((js ?? []).map((j) => [j.id as string, j.estado as string]));

  return Promise.all(
    data.map(async (r) => {
      const { data: c } = await db.rpc("appointment_json", { p_appointment_id: r.id });
      return { ...(c as Cita), id: r.id as string, jornada_estado: estados.get(r.journey_id as string) ?? "" };
    })
  );
}

export async function searchAllJourneys(_: OficinaState, fd: FormData): Promise<OficinaState> {
  await requireOficina();
  const doc = cleanDoc(fd);
  if (!/^\d{3,15}$/.test(doc)) return { mensaje: "Escribe un número de cédula válido.", ts: Date.now() };

  const citas = await buscar(doc);
  if (!citas.length) return { mensaje: `No hay citas registradas para la cédula ${doc}.`, ts: Date.now() };
  return { citas, ts: Date.now() };
}

export async function setStatusOficina(_: OficinaState, fd: FormData): Promise<OficinaState> {
  const { userId } = await requireOficina();
  const doc = cleanDoc(fd);

  const { data, error } = await createAdminClient().rpc("set_appointment_status_oficina", {
    p_user_id: userId,
    p_appointment_id: fd.get("appointment_id")?.toString() ?? "",
    p_estado: fd.get("estado")?.toString() ?? "",
    p_comentario: fd.get("comentario")?.toString() ?? null,
  });

  if (error) {
    console.error("set_appointment_status_oficina:", error);
    return { ok: false, mensaje: "Error del servidor. Intenta de nuevo.", citas: await buscar(doc), ts: Date.now() };
  }

  const r = data as { ok: boolean; mensaje: string };
  return { ...r, citas: await buscar(doc), ts: Date.now() };
}