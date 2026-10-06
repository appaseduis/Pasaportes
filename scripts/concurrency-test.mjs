// Prueba de concurrencia de assign_appointment
// Uso: node --env-file=.env.local scripts/concurrency-test.mjs
import { createClient } from "@supabase/supabase-js";

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false },
});

const NAME = `PRUEBA_CONCURRENCIA_${Date.now()}`;
const CAP = 10;               // por horario → 2 fechas × 2 horarios × 10 = 40
const TOTAL_CAP = 40;
const DOC = (i) => `99${String(i).padStart(8, "0")}`; // cédulas ficticias 99xxxxxxxx

const results = [];
const check = (name, ok, detail = "") => results.push({ name, ok, detail });

async function must(promise, msg) {
  const { data, error } = await promise;
  if (error) throw new Error(`${msg}: ${error.message}`);
  return data;
}

const reg = (jid, lu, doc) =>
  db.rpc("assign_appointment", {
    p_logistics_user_id: lu, p_journey_id: jid, p_numero_documento: doc,
    p_primer_apellido: "PRUEBA", p_segundo_apellido: null,
    p_primer_nombre: "CONCURRENCIA", p_segundo_nombre: null,
    p_telefono: "3000000000", p_metodo: "manual",
  });

async function setup() {
  const j = await must(
    db.from("journeys").insert({ nombre: NAME, capacidad_total_objetivo: TOTAL_CAP }).select("id").single(),
    "crear jornada"
  );
  for (const fecha of ["2030-01-10", "2030-01-11"]) {
    const d = await must(
      db.from("journey_dates").insert({ journey_id: j.id, fecha, capacidad_total: CAP * 2 }).select("id").single(),
      "crear fecha"
    );
    await must(db.from("time_slots").insert([
      { journey_id: j.id, journey_date_id: d.id, hora_inicio: "08:00", hora_fin: "09:00", capacidad: CAP },
      { journey_id: j.id, journey_date_id: d.id, hora_inicio: "09:00", hora_fin: "10:00", capacidad: CAP },
    ]), "crear horarios");
  }
  await must(db.from("journeys").update({ estado: "activa" }).eq("id", j.id), "activar");

  const lus = [];
  for (let i = 1; i <= 3; i++) {
    const u = await must(db.from("logistics_users")
      .insert({ nombre_interno: `${NAME}_L${i}`, pin_lookup: `${NAME}_${i}`, pin_hash: "x" })
      .select("id").single(), "crear logística");
    await must(db.from("logistics_user_journeys").insert({ logistics_user_id: u.id, journey_id: j.id }), "asignar");
    lus.push(u.id);
  }
  return { jid: j.id, lus };
}

async function cleanup(jid) {
  await db.from("appointments").delete().eq("journey_id", jid);
  await db.from("journeys").delete().eq("id", jid);
  await db.from("people").delete().like("numero_documento", "99%").eq("primer_nombre", "CONCURRENCIA");
  await db.from("logistics_users").delete().like("nombre_interno", `${NAME}%`);
}

async function main() {
  console.log(`\n▶ Preparando jornada de prueba ${NAME}…`);
  const { jid, lus } = await setup();

  try {
    // ---------- CASO 9: misma cédula, 10 peticiones simultáneas ----------
    console.log("▶ Caso 9: misma cédula × 10 en paralelo…");
    const dup = await Promise.all(Array.from({ length: 10 }, (_, k) => reg(jid, lus[k % 3], DOC(1))));
    const dupOk = dup.filter((r) => r.data?.codigo === "ASIGNADA").length;
    const dupYa = dup.filter((r) => r.data?.codigo === "YA_REGISTRADO").length;
    check("Caso 9 · Una sola cita para la misma cédula", dupOk === 1 && dupYa === 9,
      `${dupOk} asignada(s), ${dupYa} ya registrado`);

    // ---------- CASO 8: 59 personas distintas en paralelo, 3 logísticas ----------
    console.log("▶ Caso 8: 59 personas distintas en paralelo (3 logísticas)…");
    const t0 = Date.now();
    const many = await Promise.all(Array.from({ length: 59 }, (_, k) => reg(jid, lus[k % 3], DOC(k + 2))));
    const ms = Date.now() - t0;
    const errors = many.filter((r) => r.error);
    const asign = many.filter((r) => r.data?.codigo === "ASIGNADA").length;
    const llena = many.filter((r) => r.data?.codigo === "JORNADA_LLENA").length;
    check("Caso 8 · Sin errores de servidor", errors.length === 0, errors[0]?.error?.message ?? `${ms} ms`);
    check("Caso 8 · Asignadas = cupos restantes (39)", asign === TOTAL_CAP - 1, `${asign} asignadas`);
    check("Caso 8 · Excedente rechazado como jornada llena (20)", llena === 20, `${llena} rechazadas`);

    // ---------- Integridad en BD ----------
    const appts = await must(db.from("appointments")
      .select("orden_registro, time_slot_id, person_id").eq("journey_id", jid), "leer citas");
    const slots = await must(db.from("time_slots")
      .select("id, capacidad, ocupados, hora_inicio, journey_dates(fecha)").eq("journey_id", jid), "leer horarios");

    check("Total de citas = capacidad (40)", appts.length === TOTAL_CAP, `${appts.length} citas`);

    const bySlot = new Map();
    appts.forEach((a) => bySlot.set(a.time_slot_id, (bySlot.get(a.time_slot_id) ?? 0) + 1));
    const overflow = slots.filter((s) => s.ocupados > s.capacidad);
    const mismatch = slots.filter((s) => s.ocupados !== (bySlot.get(s.id) ?? 0));
    check("Ningún horario con sobrecupo", overflow.length === 0);
    check("Contadores = citas reales por horario", mismatch.length === 0);

    const orders = appts.map((a) => a.orden_registro).sort((a, b) => a - b);
    const consecutive = orders.every((o, i) => o === i + 1);
    check("Orden de registro consecutivo 1…40", consecutive, `${orders[0]}…${orders.at(-1)}`);

    const slotKey = new Map(slots.map((s) => [s.id, `${s.journey_dates.fecha} ${s.hora_inicio}`]));
    const seq = [...appts].sort((a, b) => a.orden_registro - b.orden_registro).map((a) => slotKey.get(a.time_slot_id));
    const inOrder = seq.every((k, i) => i === 0 || seq[i - 1] <= k);
    check("Asignación en orden fecha → hora", inOrder);

    const persons = new Set(appts.map((a) => a.person_id));
    check("Sin personas duplicadas en la jornada", persons.size === appts.length);
  } finally {
    console.log("▶ Limpiando datos de prueba…");
    await cleanup(jid);
  }

  console.log("\n================ RESULTADOS ================");
  for (const r of results) console.log(`${r.ok ? "✅" : "❌"} ${r.name}${r.detail ? `  (${r.detail})` : ""}`);
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${failed === 0 ? "🎉 TODAS LAS PRUEBAS PASARON" : `⚠ ${failed} PRUEBA(S) FALLARON`}\n`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error("Error:", e.message);
  process.exit(1);
});