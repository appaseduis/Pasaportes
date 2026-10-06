-- =========================================================
-- MIGRACIÓN 10: CAMBIO DE ESTADO DESDE OFICINA (cualquier jornada)
-- =========================================================
create or replace function public.set_appointment_status_oficina(
  p_user_id uuid,
  p_appointment_id uuid,
  p_estado text,
  p_comentario text
)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_com    text := nullif(trim(coalesce(p_comentario, '')), '');
  v_estado text;
begin
  if p_estado not in ('asistio', 'no_asistio', 'reprogramado') then
    return jsonb_build_object('ok', false, 'mensaje', 'Estado inválido.');
  end if;

  if p_estado = 'reprogramado' and (v_com is null or length(v_com) < 5) then
    return jsonb_build_object('ok', false, 'mensaje', 'Escribe el motivo de la reprogramación (mínimo 5 caracteres).');
  end if;

  if not exists (
    select 1 from public.logistics_users
    where id = p_user_id and activo and rol = 'oficina'
  ) then
    return jsonb_build_object('ok', false, 'mensaje', 'Usuario no autorizado.');
  end if;

  select estado into v_estado from public.appointments where id = p_appointment_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'mensaje', 'La cita no existe.');
  end if;

  if v_estado = 'asistio' then
    return jsonb_build_object('ok', false, 'mensaje', 'La persona ya asistió; el estado no se puede cambiar.');
  end if;

  if v_estado = p_estado and p_estado <> 'reprogramado' then
    return jsonb_build_object('ok', false, 'mensaje', 'La cita ya está en ese estado.');
  end if;

  update public.appointments
  set estado = p_estado,
      estado_comentario = v_com,
      estado_updated_at = now(),
      estado_logistics_user_id = p_user_id
  where id = p_appointment_id;

  insert into public.appointment_status_log
    (appointment_id, estado_anterior, estado_nuevo, comentario, logistics_user_id)
  values (p_appointment_id, v_estado, p_estado, v_com, p_user_id);

  insert into public.audit_log (actor_tipo, actor_id, accion, entidad, entidad_id, datos)
  values ('logistica', p_user_id, 'CAMBIO_ESTADO_CITA', 'appointments', p_appointment_id,
          jsonb_build_object('de', v_estado, 'a', p_estado, 'comentario', v_com, 'rol', 'oficina'));

  return jsonb_build_object('ok', true, 'mensaje', 'Estado actualizado.');
end $$;

revoke all on function public.set_appointment_status_oficina(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.set_appointment_status_oficina(uuid, uuid, text, text) to service_role;