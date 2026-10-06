-- =========================================================
-- MIGRACIÓN 8: MÁXIMO POR HORARIO DERIVADO DE MÓDULOS
-- =========================================================

-- Máximo permitido para un bloque. Sin módulos → máximo fijo de la jornada.
create or replace function public.slot_max_calc(
  p_modulos int, p_minutos int, p_max_fijo int, p_ini time, p_fin time
) returns int language sql immutable as $$
  select case
    when p_modulos is not null and p_minutos is not null then
      p_modulos * floor((extract(epoch from (p_fin - p_ini)) / 60) / p_minutos)::int
    else p_max_fijo
  end;
$$;

-- Validación de horarios
create or replace function public.validate_time_slot()
returns trigger language plpgsql as $$
declare
  v_j public.journeys%rowtype;
  v_max int;
begin
  select * into v_j from public.journeys where id = new.journey_id;
  v_max := public.slot_max_calc(v_j.modulos, v_j.minutos_por_persona,
                                v_j.capacidad_max_por_horario, new.hora_inicio, new.hora_fin);

  if new.capacidad > v_max then
    raise exception 'La capacidad del horario (%) supera lo que permiten los módulos (%)',
      new.capacidad, v_max using errcode = 'check_violation';
  end if;

  if tg_op = 'UPDATE' and old.ocupados > 0 and (
       new.hora_inicio <> old.hora_inicio
    or new.hora_fin <> old.hora_fin
    or new.journey_date_id <> old.journey_date_id) then
    raise exception 'No se puede modificar el horario: ya tiene citas asignadas'
      using errcode = 'check_violation';
  end if;

  if exists (
    select 1 from public.time_slots t
    where t.journey_date_id = new.journey_date_id
      and t.id <> new.id
      and new.hora_inicio < t.hora_fin
      and new.hora_fin > t.hora_inicio
  ) then
    raise exception 'El horario se cruza con otro de la misma fecha'
      using errcode = 'check_violation';
  end if;

  return new;
end $$;

-- Validación de jornada (cambios de módulos + reglas de activación)
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

  if new.estado = 'activa' and old.estado <> 'activa' then
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
        v_bad_date.fecha, v_bad_date.capacidad_total, v_bad_date.suma
        using errcode = 'check_violation';
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