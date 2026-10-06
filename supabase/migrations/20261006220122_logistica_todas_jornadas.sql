-- =========================================================
-- MIGRACIÓN 13: LOGÍSTICA CON ACCESO A TODAS LAS JORNADAS
-- =========================================================

-- 1) Completar accesos existentes
insert into public.logistics_user_journeys (logistics_user_id, journey_id, activo)
select lu.id, j.id, true
from public.logistics_users lu
cross join public.journeys j
where lu.rol = 'logistica'
on conflict (logistics_user_id, journey_id) do update set activo = true;

-- 2) Jornada nueva → acceso para todos los de logística
create or replace function public.auto_access_new_journey()
returns trigger language plpgsql security definer
set search_path = ''
as $$
begin
  insert into public.logistics_user_journeys (logistics_user_id, journey_id)
  select id, new.id from public.logistics_users where rol = 'logistica'
  on conflict (logistics_user_id, journey_id) do nothing;
  return new;
end $$;

create trigger trg_auto_access_new_journey
  after insert on public.journeys
  for each row execute function public.auto_access_new_journey();

-- 3) Usuario de logística nuevo → acceso a todas las jornadas
create or replace function public.auto_access_new_user()
returns trigger language plpgsql security definer
set search_path = ''
as $$
begin
  if new.rol = 'logistica' then
    insert into public.logistics_user_journeys (logistics_user_id, journey_id)
    select new.id, id from public.journeys
    on conflict (logistics_user_id, journey_id) do nothing;
  end if;
  return new;
end $$;

create trigger trg_auto_access_new_user
  after insert on public.logistics_users
  for each row execute function public.auto_access_new_user();