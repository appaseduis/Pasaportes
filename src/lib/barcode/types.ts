export type DocField =
  | "numero_documento"
  | "primer_apellido"
  | "segundo_apellido"
  | "primer_nombre"
  | "segundo_nombre"
  | "nombres_crudos"; // guía visual cuando los nombres llegan pegados

export type ParsedDocument = Partial<Record<DocField, string>>;

export interface BarcodeParser {
  name: string;
  parse(raw: string): ParsedDocument | null;
}

export type ScanResult = {
  raw: string;
  format: string;
  source: "camara" | "lector";
};