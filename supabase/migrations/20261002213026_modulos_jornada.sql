-- =========================================================
-- MIGRACIÓN 7: MÓDULOS Y TIEMPO POR PERSONA (base Fase 2)
-- =========================================================
alter table public.journeys
  add column modulos int check (modulos > 0),
  add column minutos_por_persona int check (minutos_por_persona > 0);