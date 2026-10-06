"use server";

import { revalidatePath } from "next/cache";
import { requireLogistics } from "@/lib/auth/guards";
import { createAdminClient } from "@/lib/supabase/admin";
import { personSchema, PERSON_FIELDS } from "@/lib/validation/person";
import type { Cita, RegistroState } from "@/lib/types";

export async function registerPerson(_: RegistroState, fd: FormData): Promise<RegistroState> {
  // Usuario y jornada salen de la sesión verificada en BD, nunca del formulario
  const ctx = await requireLogistics();

  const raw = Object.fromEntries(PERSON_FIELDS.map((k) => [k, fd.get(k)?.toString() ?? ""]));
  const p = personSchema.safeParse(raw);

  if (!p.success) {
    return {
      ok: false,
      codigo: "DATOS_INVALIDOS",
      mensaje: p.error.issues[0]?.message ?? "Datos inválidos.",
      values: raw,
      ts: Date.now(),
    };
  }

  const d = p.data;
  const { data, error } = await createAdminClient().rpc("assign_appointment", {
    p_logistics_user_id: ctx.userId,
    p_journey_id: ctx.journeyId,
    p_numero_documento: d.numero_documento,
    p_primer_apellido: d.primer_apellido,
    p_segundo_apellido: d.segundo_apellido || null,
    p_primer_nombre: d.primer_nombre,
    p_segundo_nombre: d.segundo_nombre || null,
    p_telefono: d.telefono,
    p_metodo: d.metodo_registro,
  });

  if (error) {
    console.error("assign_appointment:", error);
    return { ok: false, codigo: "ERROR", mensaje: "Error del servidor. Intenta de nuevo.", values: raw, ts: Date.now() };
  }

  const r = data as { ok: boolean; codigo: string; mensaje: string; cita?: Cita };
  revalidatePath("/logistica/registro");

  return {
    ...r,
    // Conserva lo digitado solo cuando hay que corregir algo
    values: r.ok || r.codigo === "YA_REGISTRADO" ? undefined : raw,
    ts: Date.now(),
  };
}


// ---------- Consulta por cédula (solo jornada de la sesión) ----------
export type ConsultaState = { cita?: Cita; mensaje?: string; ts: number } | null;
export type StatusState = { ok: boolean; mensaje: string; cita?: Cita; ts: number } | null;

async function citaPorCedula(journeyId: string, doc: string): Promise<Cita | null> {
  const db = createAdminClient();
  const { data: person } = await db.from("people").select("id").eq("numero_documento", doc).maybeSingle();
  if (!person) return null;
  const { data: appt } = await db.from("appointments").select("id")
    .eq("journey_id", journeyId).eq("person_id", person.id).maybeSingle();
  if (!appt) return null;
  const { data: cita } = await db.rpc("appointment_json", { p_appointment_id: appt.id });
  return (cita as Cita) ?? null;
}

export async function lookupByDocument(_: ConsultaState, fd: FormData): Promise<ConsultaState> {
  const ctx = await requireLogistics();
  const doc = (fd.get("numero_documento")?.toString() ?? "").replace(/\D/g, "");
  if (!/^\d{3,15}$/.test(doc)) return { mensaje: "Escribe un número de cédula válido.", ts: Date.now() };

  const cita = await citaPorCedula(ctx.journeyId, doc);
  if (!cita) return { mensaje: `No hay cita para la cédula ${doc} en esta jornada.`, ts: Date.now() };
  return { cita, ts: Date.now() };
}

export async function setAppointmentStatus(_: StatusState, fd: FormData): Promise<StatusState> {
  const ctx = await requireLogistics();
  const doc = (fd.get("numero_documento")?.toString() ?? "").replace(/\D/g, "");

  const { data, error } = await createAdminClient().rpc("set_appointment_status", {
    p_logistics_user_id: ctx.userId,
    p_journey_id: ctx.journeyId,
    p_numero_documento: doc,
    p_estado: fd.get("estado")?.toString() ?? "",
    p_comentario: fd.get("comentario")?.toString() ?? null,
  });

  if (error) {
    console.error("set_appointment_status:", error);
    return { ok: false, mensaje: "Error del servidor. Intenta de nuevo.", ts: Date.now() };
  }

  const r = data as { ok: boolean; mensaje: string };
  const cita = (await citaPorCedula(ctx.journeyId, doc)) ?? undefined;
  revalidatePath("/logistica/consulta");
  return { ...r, cita, ts: Date.now() };
}