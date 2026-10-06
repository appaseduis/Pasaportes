import ExcelJS from "exceljs";
import { requireAdmin } from "@/lib/auth/guards";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COLS = [
  { header: "Número de cédula", key: "numero_documento", width: 16 },
  { header: "Primer apellido", key: "primer_apellido", width: 18 },
  { header: "Segundo apellido", key: "segundo_apellido", width: 18 },
  { header: "Primer nombre", key: "primer_nombre", width: 18 },
  { header: "Segundo nombre", key: "segundo_nombre", width: 18 },
  { header: "Nombre completo", key: "nombre_completo", width: 34 },
  { header: "Teléfono", key: "telefono", width: 14 },
  { header: "Jornada", key: "jornada", width: 24 },
  { header: "Fecha", key: "fecha", width: 12 },
  { header: "Hora de presentación", key: "hora_presentacion", width: 12 },
  { header: "Hora fin del bloque", key: "hora_fin", width: 12 },
  { header: "Estado", key: "estado", width: 12 },
  { header: "Orden de registro", key: "orden_registro", width: 10 },
  { header: "Método de registro", key: "metodo_registro", width: 12 },
  { header: "Usuario de logística", key: "logistica", width: 22 },
  { header: "Fecha/hora de registro", key: "fecha_registro", width: 20 },
] as const;

type ViewRow = Record<string, string | number | null>;

const slug = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

const dmy = (f: string) => `${f.slice(8, 10)}-${f.slice(5, 7)}-${f.slice(0, 4)}`;
const hhmm = (t: string | null) => (t ?? "").slice(0, 5);

export async function GET(req: Request) {
  const { supabase, user } = await requireAdmin();
  const sp = new URL(req.url).searchParams;

  const j = sp.get("j");
  if (!j) return new Response("Falta la jornada.", { status: 400 });

  const { data: journey } = await supabase.from("journeys").select("nombre").eq("id", j).maybeSingle();
  if (!journey) return new Response("Jornada no encontrada.", { status: 404 });

  const f = sp.get("f"), h = sp.get("h"), e = sp.get("e"), m = sp.get("m"), l = sp.get("l");
  const format = sp.get("format") === "csv" ? "csv" : "xlsx";

  // Lectura paginada (PostgREST devuelve máx. 1000 filas por petición)
  const rows: ViewRow[] = [];
  for (let from = 0; ; from += 1000) {
    let q = supabase.from("v_appointments").select("*").eq("journey_id", j);
    if (f) q = q.eq("fecha", f);
    if (h) q = q.eq("hora_inicio", h);
    if (e) q = q.eq("estado", e);
    if (m) q = q.eq("metodo_registro", m);
    if (l) q = q.eq("logistics_user_id", l);

    const { data, error } = await q.order("orden_registro").range(from, from + 999);
    if (error) return new Response(error.message, { status: 500 });
    rows.push(...(data as ViewRow[]));
    if (data.length < 1000) break;
  }

  const out = rows.map((r) => ({
    numero_documento: r.numero_documento,
    primer_apellido: r.primer_apellido,
    segundo_apellido: r.segundo_apellido ?? "",
    primer_nombre: r.primer_nombre,
    segundo_nombre: r.segundo_nombre ?? "",
    nombre_completo: r.nombre_completo,
    telefono: r.telefono,
    jornada: r.jornada,
    fecha: dmy(String(r.fecha)),
    hora_presentacion: hhmm(r.hora_inicio as string),
    hora_fin: hhmm(r.hora_fin as string),
    estado: r.estado,
    orden_registro: r.orden_registro,
    metodo_registro: r.metodo_registro,
    logistica: r.logistica ?? "",
    fecha_registro: new Date(String(r.created_at)).toLocaleString("es-CO", {
      timeZone: "America/Bogota", dateStyle: "short", timeStyle: "short",
    }),
  }));

  const name = [slug(journey.nombre), f ? dmy(f) : "", h ? hhmm(h).replace(":", "-") : ""]
    .filter(Boolean).join("_");

  await logAudit("admin", user.id, "EXPORTACION", "journeys", j, {
    formato: format, filtros: { f, h, e, m, l }, filas: out.length,
  });

  if (format === "csv") {
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines = [
      COLS.map((c) => esc(c.header)).join(";"),
      ...out.map((r) => COLS.map((c) => esc(r[c.key])).join(";")),
    ];
    return new Response("\uFEFF" + lines.join("\r\n"), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${name}.csv"`,
      },
    });
  }

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Citas");
  ws.columns = COLS.map((c) => ({ ...c }));
  ws.addRows(out);

  ws.getColumn("numero_documento").numFmt = "@";
  ws.getColumn("telefono").numFmt = "@";

  const header = ws.getRow(1);
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1641B6" } };
  ws.views = [{ state: "frozen", ySplit: 1 }];
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: COLS.length } };

  const buf = await wb.xlsx.writeBuffer();
  return new Response(buf as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${name}.xlsx"`,
    },
  });
}