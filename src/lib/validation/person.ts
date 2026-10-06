import { z } from "zod";

const digits = (s: unknown) => String(s ?? "").replace(/\D/g, "");
const txt = (s: unknown) => String(s ?? "").trim().replace(/\s+/g, " ").toUpperCase();

export const PERSON_FIELDS = [
  "numero_documento",
  "primer_apellido",
  "segundo_apellido",
  "primer_nombre",
  "segundo_nombre",
  "telefono",
  "metodo_registro",
] as const;

export const personSchema = z.object({
  numero_documento: z.preprocess(digits, z.string().regex(/^\d{3,15}$/, "Cédula inválida (solo números).")),
  primer_apellido: z.preprocess(txt, z.string().min(1, "El primer apellido es obligatorio.").max(60)),
  segundo_apellido: z.preprocess(txt, z.string().max(60)),
  primer_nombre: z.preprocess(txt, z.string().min(1, "El primer nombre es obligatorio.").max(60)),
  segundo_nombre: z.preprocess(txt, z.string().max(60)),
  telefono: z.preprocess(digits, z.string().regex(/^\d{7,15}$/, "Teléfono inválido (7 a 15 dígitos).")),
  metodo_registro: z.enum(["manual", "escaneo"]),
});