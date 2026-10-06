-- =========================================================
-- MIGRACIÓN 3: ASIGNACIÓN ATÓMICA DE CITAS
-- =========================================================

-- Toda jornada nace en borrador (la activación pasa por validación)
create or replace function public.force_draft_on_insert()
returns trigger language plpgsql as $$
begin
  new.estado := 'borrador';
  return new;
end $$;

create trigger trg_force_draft
  before insert on public.journeys
  for each row execute function public.force_draft_on_insert();

-- ---------- JSON de una cita (uso interno) ----------
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
    'orden_registro', a.orden_registro
  )
  from public.appointments a
  join public.people p on p.id = a.person_id
  join public.journeys j on j.id = a.journey_id
  join public.journey_dates jd on jd.id = a.journey_date_id
  join public.time_slots ts on ts.id = a.time_slot_id
  where a.id = p_appointment_id;
$$;

-- ---------- ASIGNACIÓN ----------
create or replace function public.assign_appointment(
  p_logistics_user_id uuid,
  p_journey_id uuid,
  p_numero_documento text,
  p_primer_apellido text,
  p_segundo_apellido text,
  p_primer_nombre text,
  p_segundo_nombre text,
  p_telefono text,
  p_metodo text
)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_doc   text := regexp_replace(coalesce(p_numero_documento, ''), '\D', '', 'g');
  v_tel   text := regexp_replace(coalesce(p_telefono, ''), '\D', '', 'g');
  v_pa    text := nullif(upper(trim(coalesce(p_primer_apellido, ''))), '');
  v_sa    text := nullif(upper(trim(coalesce(p_segundo_apellido, ''))), '');
  v_pn    text := nullif(upper(trim(coalesce(p_primer_nombre, ''))), '');
  v_sn    text := nullif(upper(trim(coalesce(p_segundo_nombre, ''))), '');
  v_journey public.journeys%rowtype;
  v_person_id uuid;
  v_existing_id uuid;
  v_slot record;
  v_orden int;
  v_appt_id uuid;
begin
  -- 1. Validación de datos
  if p_metodo not in ('escaneo', 'manual')
     or v_doc !~ '^[0-9]{3,15}$'
     or v_tel !~ '^[0-9]{7,15}$'
     or v_pa is null or v_pn is null then
    return jsonb_build_object('ok', false, 'codigo', 'DATOS_INVALIDOS',
      'mensaje', 'Datos incompletos o inválidos.');
  end if;

  -- 2. Usuario activo y autorizado para la jornada
  if not exists (
    select 1
    from public.logistics_users lu
    join public.logistics_user_journeys luj on luj.logistics_user_id = lu.id
    where lu.id = p_logistics_user_id and lu.activo
      and luj.journey_id = p_journey_id and luj.activo
  ) then
    return jsonb_build_object('ok', false, 'codigo', 'NO_AUTORIZADO',
      'mensaje', 'Usuario no autorizado para esta jornada.');
  end if;

  -- 3. Lock de la jornada: serializa los registros y garantiza el orden
  select * into v_journey from public.journeys
  where id = p_journey_id for update;

  if not found or v_journey.estado <> 'activa' then
    return jsonb_build_object('ok', false, 'codigo', 'JORNADA_INACTIVA',
      'mensaje', 'La jornada no está activa.');
  end if;

  -- 4. ¿Ya tiene cita en esta jornada?
  select id into v_person_id from public.people where numero_documento = v_doc;

  if v_person_id is not null then
    select id into v_existing_id from public.appointments
    where journey_id = p_journey_id and person_id = v_person_id;

    if v_existing_id is not null then
      return jsonb_build_object('ok', false, 'codigo', 'YA_REGISTRADO',
        'mensaje', 'Esta persona ya tiene cita en esta jornada.',
        'cita', public.appointment_json(v_existing_id));
    end if;
  end if;

  -- 5. Primer horario disponible (fecha ASC, hora ASC)
  select ts.id, ts.journey_date_id into v_slot
  from public.time_slots ts
  join public.journey_dates jd on jd.id = ts.journey_date_id
  where ts.journey_id = p_journey_id
    and ts.estado = 'activo'
    and jd.estado = 'activa'
    and ts.ocupados < ts.capacidad
  order by jd.fecha, ts.hora_inicio
  limit 1
  for update of ts;

  if not found then
    return jsonb_build_object('ok', false, 'codigo', 'JORNADA_LLENA',
      'mensaje', 'No hay citas disponibles para esta jornada.');
  end if;

  -- 6. Crear la persona si no existe (se conservan los datos originales)
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

  -- 7. Reservar cupo y generar el orden
  perform set_config('app.allow_counters', 'on', true);

  update public.time_slots set ocupados = ocupados + 1 where id = v_slot.id;

  update public.journeys set ultimo_orden = ultimo_orden + 1
  where id = p_journey_id
  returning ultimo_orden into v_orden;

  perform set_config('app.allow_counters', 'off', true);

  -- 8. Crear la cita
  insert into public.appointments (journey_id, journey_date_id, time_slot_id, person_id,
                                   orden_registro, metodo_registro, logistics_user_id)
  values (p_journey_id, v_slot.journey_date_id, v_slot.id, v_person_id,
          v_orden, p_metodo, p_logistics_user_id)
  returning id into v_appt_id;

  -- 9. Auditoría
  insert into public.audit_log (actor_tipo, actor_id, accion, entidad, entidad_id, datos)
  values ('logistica', p_logistics_user_id, 'CITA_ASIGNADA', 'appointments', v_appt_id,
          jsonb_build_object('numero_documento', v_doc, 'journey_id', p_journey_id,
                             'time_slot_id', v_slot.id, 'orden', v_orden,
                             'metodo', p_metodo));

  return jsonb_build_object('ok', true, 'codigo', 'ASIGNADA',
    'mensaje', 'Cita asignada.', 'cita', public.appointment_json(v_appt_id));

exception
  when unique_violation then
    return jsonb_build_object('ok', false, 'codigo', 'YA_REGISTRADO',
      'mensaje', 'Esta persona ya tiene cita en esta jornada.');
end $$;

-- Solo el servidor (service_role) puede ejecutar estas funciones
revoke all on function public.appointment_json(uuid) from public, anon, authenticated;
revoke all on function public.assign_appointment(uuid, uuid, text, text, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.appointment_json(uuid) to service_role;
grant execute on function public.assign_appointment(uuid, uuid, text, text, text, text, text, text, text)
  to service_role;