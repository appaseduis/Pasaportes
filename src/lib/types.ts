export type Cita = {
  nombre_completo: string;
  numero_documento: string;
  jornada: string;
  fecha: string;
  hora_presentacion: string;
  estado: string;
  orden_registro: number;
};

export type RegistroState = {
  ok: boolean;
  codigo: string;
  mensaje: string;
  cita?: Cita;
  values?: Record<string, string>;
  ts: number;
} | null;

export type SlotView = {
  id: string;
  fecha: string;
  hora_inicio: string;
  capacidad: number;
  ocupados: number;
  estado: string;
};