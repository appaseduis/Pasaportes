-- =========================================================
-- MIGRACIÓN 2: RLS, PROTECCIÓN DE CONTADORES Y REALTIME
-- =========================================================

-- ---------- Helper: ¿es admin? ----------
create or replace function public.is_admin()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- ---------- Protección de contadores ----------
-- ocupados y ultimo_orden solo pueden cambiar dentro de las RPC,
-- que activan la bandera app.allow_counters en su transacción.
create or replace function public.protect_counters()
returns trigger language plpgsql as $$
declare v_allowed boolean :=
  coalesce(current_setting('app.allow_counters', true), '') = 'on';
begin
  if tg_table_name = 'time_slots' then
    if tg_op = 'INSERT' then
      new.ocupados := 0;
    elsif new.ocupados <> old.ocupados and not v_allowed then
      raise exception 'El contador de ocupación no puede modificarse directamente'
        using errcode = 'insufficient_privilege';
    end if;
  elsif tg_table_name = 'journeys' then
    if tg_op = 'INSERT' then
      new.ultimo_orden := 0;
    elsif new.ultimo_orden <> old.ultimo_orden and not v_allowed then
      raise exception 'El orden de registro no puede modificarse directamente'
        using errcode = 'insufficient_privilege';
    end if;
  end if;
  return new;
end $$;

create trigger trg_protect_counters
  before insert or update on public.time_slots
  for each row execute function public.protect_counters();

create trigger trg_protect_counters
  before insert or update on public.journeys
  for each row execute function public.protect_counters();

-- ---------- Privilegios base ----------
-- Escrituras de personas, citas y logística: solo vía servidor/RPC
revoke insert, update, delete on public.people from anon, authenticated;
revoke insert, update, delete on public.appointments from anon, authenticated;
revoke insert, update, delete on public.audit_log from anon, authenticated;
revoke all on public.login_attempts from anon, authenticated;

-- logistics_users: nunca exponer pin_hash ni pin_lookup
revoke all on public.logistics_users from anon, authenticated;
grant select (id, nombre_interno, activo, created_at, updated_at)
  on public.logistics_users to authenticated;

-- ---------- POLÍTICAS ADMIN ----------
create policy admin_all_journeys on public.journeys
  for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create policy admin_all_journey_dates on public.journey_dates
  for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create policy admin_all_time_slots on public.time_slots
  for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create policy admin_all_luj on public.logistics_user_journeys
  for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create policy admin_read_logistics_users on public.logistics_users
  for select to authenticated using ((select public.is_admin()));

create policy admin_read_people on public.people
  for select to authenticated using ((select public.is_admin()));

create policy admin_read_appointments on public.appointments
  for select to authenticated using ((select public.is_admin()));

create policy admin_read_audit on public.audit_log
  for select to authenticated using ((select public.is_admin()));

create policy self_read_admins on public.admins
  for select to authenticated using (user_id = (select auth.uid()));

-- ---------- POLÍTICA PÚBLICA (Realtime de logística) ----------
-- Solo horarios y contadores (sin datos personales) de jornadas activas
create policy public_read_active_slots on public.time_slots
  for select to anon, authenticated
  using (
    exists (
      select 1 from public.journeys j
      where j.id = time_slots.journey_id and j.estado = 'activa'
    )
  );

-- ---------- REALTIME ----------
alter publication supabase_realtime add table public.time_slots;
alter publication supabase_realtime add table public.appointments;