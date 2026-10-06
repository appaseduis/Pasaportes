-- =========================================================
-- MIGRACIÓN 12: PREINSCRIPCIÓN RECHAZA CÉDULAS USADAS EN OTRA JORNADA
-- =========================================================
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
  v_other_id uuid;
  v_other_name text;
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
    -- Ya registrada en ESTA jornada
    select id into v_existing_id from public.appointments
    where journey_id = p_journey_id and person_id = v_person_id;
    if v_existing_id is not null then
      return jsonb_build_object('ok', false, 'codigo', 'YA_REGISTRADO',
        'mensaje', 'Esta persona ya está registrada en esta jornada.',
        'cita', public.appointment_json(v_existing_id));
    end if;

    -- Preinscripción: no se permite si ya está en OTRA jornada
    if v_journey.modo = 'preinscripcion' then
      select a.id, j.nombre into v_other_id, v_other_name
      from public.appointments a
      join public.journeys j on j.id = a.journey_id
      where a.person_id = v_person_id and a.journey_id <> p_journey_id
      order by a.created_at desc
      limit 1;

      if v_other_id is not null then
        return jsonb_build_object('ok', false, 'codigo', 'CEDULA_USADA',
          'mensaje', format('Cédula ya usada: está registrada en la jornada "%s".', v_other_name),
          'cita', public.appointment_json(v_other_id));
      end if;
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