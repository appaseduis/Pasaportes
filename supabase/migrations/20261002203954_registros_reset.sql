-- =========================================================
-- MIGRACIÓN 5: VISTA DE CITAS + REINICIO DE JORNADA
-- =========================================================

-- Vista para consultas y exportación. security_invoker: respeta RLS (solo admin).
create or replace view public.v_appointments
with (security_invoker = true) as
select
  a.id,
  a.journey_id,
  j.nombre            as jornada,
  a.journey_date_id,
  jd.fecha,
  a.time_slot_id,
  ts.hora_inicio,
  ts.hora_fin,
  p.numero_documento,
  p.primer_apellido,
  p.segundo_apellido,
  p.primer_nombre,
  p.segundo_nombre,
  p.nombre_completo,
  p.telefono,
  a.estado,
  a.orden_registro,
  a.metodo_registro,
  a.logistics_user_id,
  lu.nombre_interno   as logistica,
  a.created_at
from public.appointments a
join public.journeys j        on j.id  = a.journey_id
join public.journey_dates jd  on jd.id = a.journey_date_id
join public.time_slots ts     on ts.id = a.time_slot_id
join public.people p          on p.id  = a.person_id
left join public.logistics_users lu on lu.id = a.logistics_user_id;

revoke all on public.v_appointments from anon;
grant select on public.v_appointments to authenticated;

-- Reinicio: borra citas, deja contadores en 0 y elimina personas sin citas.
-- Conserva jornada, fechas, horarios, capacidades y usuarios de logística.
create or replace function public.reset_journey(p_journey_id uuid, p_confirmacion text)
returns int
language plpgsql security definer
set search_path = ''
as $$
declare
  v_nombre text;
  v_people uuid[];
  v_count  int;
begin
  if not public.is_admin() then
    raise exception 'No autorizado' using errcode = 'insufficient_privilege';
  end if;

  select nombre into v_nombre from public.journeys where id = p_journey_id for update;
  if not found then
    raise exception 'La jornada no existe';
  end if;

  if p_confirmacion is distinct from v_nombre then
    raise exception 'Escribe el nombre exacto de la jornada para confirmar';
  end if;

  select coalesce(array_agg(person_id), '{}') into v_people
  from public.appointments where journey_id = p_journey_id;

  delete from public.appointments where journey_id = p_journey_id;
  get diagnostics v_count = row_count;

  perform set_config('app.allow_counters', 'on', true);
  update public.time_slots set ocupados = 0 where journey_id = p_journey_id;
  update public.journeys set ultimo_orden = 0 where id = p_journey_id;
  perform set_config('app.allow_counters', 'off', true);

  delete from public.people p
  where p.id = any(v_people)
    and not exists (select 1 from public.appointments a where a.person_id = p.id);

  insert into public.audit_log (actor_tipo, actor_id, accion, entidad, entidad_id, datos)
  values ('admin', auth.uid(), 'JORNADA_REINICIADA', 'journeys', p_journey_id,
          jsonb_build_object('nombre', v_nombre, 'citas_eliminadas', v_count));

  return v_count;
end $$;

revoke all on function public.reset_journey(uuid, text) from public, anon;
grant execute on function public.reset_journey(uuid, text) to authenticated;