-- =========================================================
-- MIGRACIÓN 11: MODO PREINSCRIPCIÓN
-- =========================================================
alter table public.journeys
  add column modo text not null default 'agenda'
  check (modo in ('agenda', 'preinscripcion'));

-- Citas sin fecha/hora mientras están preinscritas
alter table public.appointments
  alter column journey_date_id drop not null,
  alter column time_slot_id drop not null;

alter table public.appointments
  add constraint appointments_slot_pair check ((time_slot_id is null) = (journey_date_id is null));

alter table public.appointments drop constraint appointments_estado_check;
alter table public.appointments add constraint appointments_estado_check
  check (estado in ('preinscrita', 'asignada', 'asistio', 'no_asistio', 'reprogramado'));

-- No se marca asistencia sin horario
create or replace function public.check_estado_con_horario()
returns trigger language plpgsql as $$
begin
  if new.time_slot_id is null and new.estado in ('asistio', 'no_asistio', 'reprogramado') then
    raise exception 'La cita aún no tiene fecha y hora asignadas' using errcode = 'check_violation';
  end if;
  return new;
end $$;

create trigger trg_check_estado_horario
  before update on public.appointments
  for each row execute function public.check_estado_con_horario();

-- Validación de jornada (con modo)
create or replace function public.validate_journey()
returns trigger language plpgsql as $$
declare
  v_slots int;
  v_total int;
  v_bad_date record;
begin
  if (new.modulos, new.minutos_por_persona, new.capacidad_max_por_horario)
     is distinct from (old.modulos, old.minutos_por_persona, old.capacidad_max_por_horario)
  and exists (
    select 1 from public.time_slots ts
    where ts.journey_id = new.id
      and ts.capacidad > public.slot_max_calc(new.modulos, new.minutos_por_persona,
                                              new.capacidad_max_por_horario, ts.hora_inicio, ts.hora_fin)
  ) then
    raise exception 'Hay horarios con más capacidad de la que permiten los módulos. Ajústalos primero.'
      using errcode = 'check_violation';
  end if;

  if new.modo = 'agenda' and old.modo = 'preinscripcion' and exists (
    select 1 from public.appointments where journey_id = new.id and time_slot_id is null
  ) then
    raise exception 'Hay preinscritos sin horario. Usa "Asignar horarios a preinscritos" primero.'
      using errcode = 'check_violation';
  end if;

  -- Reglas de activación solo para modo agenda
  if new.estado = 'activa' and old.estado <> 'activa' and new.modo = 'agenda' then
    select count(*) into v_slots
    from public.time_slots ts
    join public.journey_dates jd on jd.id = ts.journey_date_id
    where ts.journey_id = new.id and ts.estado = 'activo' and jd.estado = 'activa';

    if v_slots = 0 then
      raise exception 'La jornada no tiene horarios activos' using errcode = 'check_violation';
    end if;

    select jd.fecha, jd.capacidad_total, coalesce(sum(ts.capacidad), 0) as suma
    into v_bad_date
    from public.journey_dates jd
    left join public.time_slots ts on ts.journey_date_id = jd.id and ts.estado = 'activo'
    where jd.journey_id = new.id and jd.estado = 'activa'
    group by jd.id, jd.fecha, jd.capacidad_total
    having coalesce(sum(ts.capacidad), 0) <> jd.capacidad_total
    limit 1;

    if found then
      raise exception 'La fecha % tiene capacidad % pero sus horarios suman %',
        v_bad_date.fecha, v_bad_date.capacidad_total, v_bad_date.suma using errcode = 'check_violation';
    end if;

    select coalesce(sum(capacidad_total), 0) into v_total
    from public.journey_dates where journey_id = new.id and estado = 'activa';

    if v_total <> new.capacidad_total_objetivo then
      raise exception 'Las fechas suman % pero la capacidad objetivo es %',
        v_total, new.capacidad_total_objetivo using errcode = 'check_violation';
    end if;
  end if;

  return new;
end $$;

-- Asignación: agenda (horario) o preinscripción (solo cupo)
create or replace function public.assign_appointment(
  p_logistics_user_id uuid, p_journey_id uuid, p_numero_documento text,
  p_primer_apellido text, p_segundo_apellido text, p_primer_nombre text,
  p_segundo_nombre text, p_telefono text, p_metodo text
)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_doc text := regexp_replace(coalesce(p_numero_documento, ''), '\D', '', 'g');
  v_tel text := regexp_replace(coalesce(p_telefono, ''), '\D', '', 'g');
  v_pa  text := nullif(upper(trim(coalesce(p_primer_apellido, ''))), '');
  v_sa  text := nullif(upper(trim(coalesce(p_segundo_apellido, ''))), '');
  v_pn  text := nullif(upper(trim(coalesce(p_primer_nombre, ''))), '');
  v_sn  text := nullif(upper(trim(coalesce(p_segundo_nombre, ''))), '');
  v_journey public.journeys%rowtype;
  v_person_id uuid;
  v_existing_id uuid;
  v_slot_id uuid;
  v_date_id uuid;
  v_orden int;
  v_appt_id uuid;
begin
  if p_metodo not in ('escaneo', 'manual')
     or v_doc !~ '^[0-9]{3,15}$' or v_tel !~ '^[0-9]{7,15}$'
     or v_pa is null or v_pn is null then
    return jsonb_build_object('ok', false, 'codigo', 'DATOS_INVALIDOS', 'mensaje', 'Datos incompletos o inválidos.');
  end if;

  if not exists (
    select 1 from public.logistics_users lu
    join public.logistics_user_journeys luj on luj.logistics_user_id = lu.id
    where lu.id = p_logistics_user_id and lu.activo
      and luj.journey_id = p_journey_id and luj.activo
  ) then
    return jsonb_build_object('ok', false, 'codigo', 'NO_AUTORIZADO', 'mensaje', 'Usuario no autorizado para esta jornada.');
  end if;

  select * into v_journey from public.journeys where id = p_journey_id for update;
  if not found or v_journey.estado <> 'activa' then
    return jsonb_build_object('ok', false, 'codigo', 'JORNADA_INACTIVA', 'mensaje', 'La jornada no está activa.');
  end if;

  select id into v_person_id from public.people where numero_documento = v_doc;
  if v_person_id is not null then
    select id into v_existing_id from public.appointments
    where journey_id = p_journey_id and person_id = v_person_id;
    if v_existing_id is not null then
      return jsonb_build_object('ok', false, 'codigo', 'YA_REGISTRADO',
        'mensaje', 'Esta persona ya está registrada en esta jornada.',
        'cita', public.appointment_json(v_existing_id));
    end if;
  end if;

  if v_journey.modo = 'preinscripcion' then
    if (select count(*) from public.appointments where journey_id = p_journey_id)
       >= v_journey.capacidad_total_objetivo then
      return jsonb_build_object('ok', false, 'codigo', 'JORNADA_LLENA', 'mensaje', 'No hay cupos disponibles para esta jornada.');
    end if;
  else
    select ts.id, ts.journey_date_id into v_slot_id, v_date_id
    from public.time_slots ts
    join public.journey_dates jd on jd.id = ts.journey_date_id
    where ts.journey_id = p_journey_id and ts.estado = 'activo'
      and jd.estado = 'activa' and ts.ocupados < ts.capacidad
    order by jd.fecha, ts.hora_inicio
    limit 1
    for update of ts;

    if v_slot_id is null then
      return jsonb_build_object('ok', false, 'codigo', 'JORNADA_LLENA', 'mensaje', 'No hay citas disponibles para esta jornada.');
    end if;
  end if;

  if v_person_id is null then
    insert into public.people (numero_documento, primer_apellido, segundo_apellido,
                               primer_nombre, segundo_nombre, telefono)
    values (v_doc, v_pa, v_sa, v_pn, v_sn, v_tel)
    on conflict (numero_documento) do nothing
    returning id into v_person_id;
    if v_person_id is null then
      select id into v_person_id from public.people where numero_documento = v_doc;
    end if;
  end if;

  perform set_config('app.allow_counters', 'on', true);
  if v_slot_id is not null then
    update public.time_slots set ocupados = ocupados + 1 where id = v_slot_id;
  end if;
  update public.journeys set ultimo_orden = ultimo_orden + 1
  where id = p_journey_id returning ultimo_orden into v_orden;
  perform set_config('app.allow_counters', 'off', true);

  insert into public.appointments (journey_id, journey_date_id, time_slot_id, person_id,
                                   orden_registro, estado, metodo_registro, logistics_user_id)
  values (p_journey_id, v_date_id, v_slot_id, v_person_id, v_orden,
          case when v_slot_id is null then 'preinscrita' else 'asignada' end,
          p_metodo, p_logistics_user_id)
  returning id into v_appt_id;

  insert into public.audit_log (actor_tipo, actor_id, accion, entidad, entidad_id, datos)
  values ('logistica', p_logistics_user_id,
          case when v_slot_id is null then 'PREINSCRIPCION' else 'CITA_ASIGNADA' end,
          'appointments', v_appt_id,
          jsonb_build_object('numero_documento', v_doc, 'journey_id', p_journey_id,
                             'time_slot_id', v_slot_id, 'orden', v_orden, 'metodo', p_metodo));

  return jsonb_build_object('ok', true, 'codigo', 'ASIGNADA',
    'mensaje', case when v_slot_id is null
                    then 'Preinscripción registrada. La fecha y hora se informarán después.'
                    else 'Cita asignada correctamente.' end,
    'cita', public.appointment_json(v_appt_id));

exception
  when unique_violation then
    return jsonb_build_object('ok', false, 'codigo', 'YA_REGISTRADO', 'mensaje', 'Esta persona ya está registrada en esta jornada.');
end $$;

-- JSON de cita: fecha/hora pueden ser nulas
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
               'estado', l.estado_nuevo, 'comentario', l.comentario,
               'fecha', l.created_at, 'logistica', lu.nombre_interno
             ) order by l.created_at desc)
      from public.appointment_status_log l
      left join public.logistics_users lu on lu.id = l.logistics_user_id
      where l.appointment_id = a.id
    ), '[]'::jsonb)
  )
  from public.appointments a
  join public.people p on p.id = a.person_id
  join public.journeys j on j.id = a.journey_id
  left join public.journey_dates jd on jd.id = a.journey_date_id
  left join public.time_slots ts on ts.id = a.time_slot_id
  where a.id = p_appointment_id;
$$;

-- Vista con fecha/hora opcionales
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
join public.journeys j on j.id = a.journey_id
join public.people p   on p.id = a.person_id
left join public.journey_dates jd on jd.id = a.journey_date_id
left join public.time_slots ts    on ts.id = a.time_slot_id
left join public.logistics_users lu on lu.id = a.logistics_user_id;

-- Asignación masiva de horarios a preinscritos (por orden de inscripción)
create or replace function public.assign_pending_slots(p_journey_id uuid)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_appt record;
  v_slot_id uuid;
  v_date_id uuid;
  v_done int := 0;
  v_left int;
begin
  if not public.is_admin() then
    raise exception 'No autorizado' using errcode = 'insufficient_privilege';
  end if;

  perform 1 from public.journeys where id = p_journey_id for update;
  if not found then
    raise exception 'La jornada no existe';
  end if;

  perform set_config('app.allow_counters', 'on', true);

  for v_appt in
    select id from public.appointments
    where journey_id = p_journey_id and time_slot_id is null
    order by orden_registro
  loop
    select ts.id, ts.journey_date_id into v_slot_id, v_date_id
    from public.time_slots ts
    join public.journey_dates jd on jd.id = ts.journey_date_id
    where ts.journey_id = p_journey_id and ts.estado = 'activo'
      and jd.estado = 'activa' and ts.ocupados < ts.capacidad
    order by jd.fecha, ts.hora_inicio
    limit 1
    for update of ts;

    exit when not found;

    update public.time_slots set ocupados = ocupados + 1 where id = v_slot_id;
    update public.appointments
      set time_slot_id = v_slot_id, journey_date_id = v_date_id, estado = 'asignada'
      where id = v_appt.id;
    v_done := v_done + 1;
  end loop;

  perform set_config('app.allow_counters', 'off', true);

  select count(*) into v_left
  from public.appointments where journey_id = p_journey_id and time_slot_id is null;

  if v_left = 0 then
    update public.journeys set modo = 'agenda' where id = p_journey_id;
  end if;

  insert into public.audit_log (actor_tipo, actor_id, accion, entidad, entidad_id, datos)
  values ('admin', auth.uid(), 'HORARIOS_ASIGNADOS_PREINSCRITOS', 'journeys', p_journey_id,
          jsonb_build_object('asignadas', v_done, 'pendientes', v_left));

  return jsonb_build_object('asignadas', v_done, 'pendientes', v_left);
end $$;

revoke all on function public.assign_pending_slots(uuid) from public, anon;
grant execute on function public.assign_pending_slots(uuid) to authenticated;