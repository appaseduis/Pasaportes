import type { BarcodeParser } from "./types";

const cleanName = (s = "") =>
  s.toUpperCase().replace(/[^A-ZÑ ]/g, " ").replace(/\s+/g, " ").trim();

const normDoc = (d: string) => String(Number(d.replace(/\D/g, "")));

function validDate(yyyymmdd: string): boolean {
  if (!/^\d{8}$/.test(yyyymmdd)) return false;
  const y = +yyyymmdd.slice(0, 4), m = +yyyymmdd.slice(4, 6), d = +yyyymmdd.slice(6, 8);
  const dt = new Date(y, m - 1, d);
  return y >= 1900 && y <= new Date().getFullYear() &&
    dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

// Cédula amarilla leída con pistola (Tab → "|" entre campos; vacío = "||").
// cédula | apellido1 | apellido2 | nombre1 | nombre2 | 0M/0F | AAAAMMDD | RH
// Se valida la estructura completa para descartar lecturas con teclas perdidas.
export const cedulaPistolaParser: BarcodeParser = {
  name: "cedula-pistola",
  parse(raw) {
    const parts = raw.toUpperCase().replace(/[\t\r\n]/g, "|").split("|").map((p) => p.trim());
    const i = parts.findIndex((p) => /^\d{6,10}$/.test(p));
    if (i < 0 || parts.length < i + 8) return null;

    const [doc, pa, sa, pn, sn, sexo, fecha, rh] = parts.slice(i, i + 8);

    const ok =
      /^0[MF]$/.test(sexo) &&
      validDate(fecha) &&
      /^(O|A|B|AB)[+-]$/.test(rh) &&
      /^[A-ZÑ ]+$/.test(pa) &&
      /^[A-ZÑ ]+$/.test(pn) &&
      /^[A-ZÑ ]*$/.test(sa) &&
      /^[A-ZÑ ]*$/.test(sn);

    if (!ok) return null;

    return {
      numero_documento: normDoc(doc),
      primer_apellido: cleanName(pa),
      segundo_apellido: cleanName(sa),
      primer_nombre: cleanName(pn),
      segundo_nombre: cleanName(sn),
    };
  },
};

const PARSERS: BarcodeParser[] = [cedulaPistolaParser];

export function parseBarcode(raw: string) {
  for (const p of PARSERS) {
    const data = p.parse(raw);
    if (data?.numero_documento && /^\d{3,15}$/.test(data.numero_documento)) {
      return { data, parser: p.name };
    }
  }
  return null;
}