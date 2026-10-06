-- =========================================================
-- MIGRACIÓN 9: ESTADOS DE ASISTENCIA + HISTORIAL
-- =========================================================
alter table public.appointments drop constraint appointments_estado_check;
alter table public.appointments
  add constraint appointments_estado_check
    check (estado in ('asignada', 'asistio', 'no_asistio', 'reprogramado')),
  add column estado_comentario text,
  add column estado_updated_at timestamptz,
  add column estado_logistics_user_id uuid references public.logistics_users(id) on delete set null;

-- Historial de cambios de estado
create table public.appointment_status_log (
  id bigint generated always as identity primary key,
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  estado_anterior text not null,
  estado_nuevo text not null,
  comentario text,
  logistics_user_id uuid references public.logistics_users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index on public.appointment_status_log (appointment_id, created_at desc);

alter table public.appointment_status_log enable row level security;
revoke insert, update, delete on public.appointment_status_log from anon, authenticated;
create policy admin_read_status_log on public.appointment_status_log
  for select to authenticated using ((select public.is_admin()));

-- Cambio de estado (solo servidor)
create or replace function public.set_appointment_status(
  p_logistics_user_id uuid,
  p_journey_id uuid,
  p_numero_documento text,
  p_estado text,
  p_comentario text
)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_doc  text := regexp_replace(coalesce(p_numero_documento, ''), '\D', '', 'g');
  v_com  text := nullif(trim(coalesce(p_comentario, '')), '');
  v_appt record;
begin
  if p_estado not in ('asistio', 'no_asistio', 'reprogramado') then
    return jsonb_build_object('ok', false, 'mensaje', 'Estado inválido.');
  end if;

  if p_estado = 'reprogramado' and (v_com is null or length(v_com) < 5) then
    return jsonb_build_object('ok', false, 'mensaje', 'Escribe el motivo de la reprogramación (mínimo 5 caracteres).');
  end if;

  if not exists (
    select 1
    from public.logistics_users lu
    join public.logistics_user_journeys luj on luj.logistics_user_id = lu.id
    join public.journeys j on j.id = luj.journey_id
    where lu.id = p_logistics_user_id and lu.activo and lu.rol = 'logistica'
      and luj.journey_id = p_journey_id and luj.activo and j.estado = 'activa'
  ) then
    return jsonb_build_object('ok', false, 'mensaje', 'Usuario no autorizado para esta jornada.');
  end if;

  select a.id, a.estado into v_appt
  from public.appointments a
  join public.people p on p.id = a.person_id
  where a.journey_id = p_journey_id and p.numero_documento = v_doc
  for update of a;

  if not found then
    return jsonb_build_object('ok', false, 'mensaje', 'No hay cita para esta cédula en la jornada.');
  end if;

  if v_appt.estado = 'asistio' then
    return jsonb_build_object('ok', false, 'mensaje', 'La persona ya asistió; el estado no se puede cambiar.');
  end if;

  if v_appt.estado = p_estado and p_estado <> 'reprogramado' then
    return jsonb_build_object('ok', false, 'mensaje', 'La cita ya está en ese estado.');
  end if;

  update public.appointments
  set estado = p_estado,
      estado_comentario = v_com,
      estado_updated_at = now(),
      estado_logistics_user_id = p_logistics_user_id
  where id = v_appt.id;

  insert into public.appointment_status_log
    (appointment_id, estado_anterior, estado_nuevo, comentario, logistics_user_id)
  values (v_appt.id, v_appt.estado, p_estado, v_com, p_logistics_user_id);

  insert into public.audit_log (actor_tipo, actor_id, accion, entidad, entidad_id, datos)
  values ('logistica', p_logistics_user_id, 'CAMBIO_ESTADO_CITA', 'appointments', v_appt.id,
          jsonb_build_object('de', v_appt.estado, 'a', p_estado, 'comentario', v_com));

  return jsonb_build_object('ok', true, 'mensaje', 'Estado actualizado.');
end $$;

revoke all on function public.set_appointment_status(uuid, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.set_appointment_status(uuid, uuid, text, text, text) to service_role;

-- appointment_json ahora incluye comentario e historial
create or replace function public.appointment_json(p_appointment_id uuid)
returns jsonb language sql stable security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'nombre_completo', p.nombre_completo,
    'numero_documento', p.numero_documento,
    'jornada', j.nombre,
    'fecha', jd.fecha,
    'hora_presentacion', to_char(ts.hora_inicio, 'HH24:MI'),
    'estado', a.estado,
    'orden_registro', a.orden_registro,
    'comentario', a.estado_comentario,
    'historial', coalesce((
      select jsonb_agg(jsonb_build_object(
               'estado', l.estado_nuevo,
               'comentario', l.comentario,
               'fecha', l.created_at,
               'logistica', lu.nombre_interno
             ) order by l.created_at desc)
      from public.appointment_status_log l
      left join public.logistics_users lu on lu.id = l.logistics_user_id
      where l.appointment_id = a.id
    ), '[]'::jsonb)
  )
  from public.appointments a
  join public.people p on p.id = a.person_id
  join public.journeys j on j.id = a.journey_id
  join public.journey_dates jd on jd.id = a.journey_date_id
  join public.time_slots ts on ts.id = a.time_slot_id
  where a.id = p_appointment_id;
$$;

-- Vista: nuevas columnas al final
create or replace view public.v_appointments
with (security_invoker = true) as
select
  a.id, a.journey_id, j.nombre as jornada, a.journey_date_id, jd.fecha,
  a.time_slot_id, ts.hora_inicio, ts.hora_fin,
  p.numero_documento, p.primer_apellido, p.segundo_apellido,
  p.primer_nombre, p.segundo_nombre, p.nombre_completo, p.telefono,
  a.estado, a.orden_registro, a.metodo_registro, a.logistics_user_id,
  lu.nombre_interno as logistica, a.created_at,
  a.estado_comentario, a.estado_updated_at
from public.appointments a
join public.journeys j        on j.id  = a.journey_id
join public.journey_dates jd  on jd.id = a.journey_date_id
join public.time_slots ts     on ts.id = a.time_slot_id
join public.people p          on p.id  = a.person_id
left join public.logistics_users lu on lu.id = a.logistics_user_id;