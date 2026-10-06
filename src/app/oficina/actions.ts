"use server";

import { requireOficina } from "@/lib/auth/guards";
import { createAdminClient } from "@/lib/supabase/admin";
import { hhmm } from "@/lib/format";
import type { Cita } from "@/lib/types";

export type OficinaCita = Cita & { jornada_estado: string };
export type OficinaState = { citas?: OficinaCita[]; mensaje?: string; ts: number } | null;

export async function searchAllJourneys(_: OficinaState, fd: FormData): Promise<OficinaState> {
  await requireOficina();
  const doc = (fd.get("numero_documento")?.toString() ?? "").replace(/\D/g, "");

  if (!/^\d{3,15}$/.test(doc)) {
    return { mensaje: "Escribe un número de cédula válido.", ts: Date.now() };
  }

  const db = createAdminClient();
  const { data } = await db
    .from("v_appointments")
    .select("journey_id, jornada, fecha, hora_inicio, nombre_completo, numero_documento, estado, orden_registro")
    .eq("numero_documento", doc)
    .order("fecha", { ascending: false });

  if (!data?.length) {
    return { mensaje: `No hay citas registradas para la cédula ${doc}.`, ts: Date.now() };
  }

  const ids = [...new Set(data.map((r) => r.journey_id as string))];
  const { data: js } = await db.from("journeys").select("id, estado").in("id", ids);
  const estados = new Map((js ?? []).map((j) => [j.id as string, j.estado as string]));

  return {
    citas: data.map((r) => ({
      nombre_completo: r.nombre_completo,
      numero_documento: r.numero_documento,
      jornada: r.jornada,
      fecha: r.fecha,
      hora_presentacion: hhmm(r.hora_inicio),
      estado: r.estado,
      orden_registro: r.orden_registro,
      jornada_estado: estados.get(r.journey_id) ?? "",
    })),
    ts: Date.now(),
  };
}