-- =========================================================
-- MIGRACIÓN 4: POLÍTICA PÚBLICA DE HORARIOS (Realtime)
-- =========================================================
create or replace function public.journey_is_active(p_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.journeys where id = p_id and estado = 'activa'
  );
$$;

revoke all on function public.journey_is_active(uuid) from public;
grant execute on function public.journey_is_active(uuid) to anon, authenticated;

drop policy if exists public_read_active_slots on public.time_slots;

create policy public_read_active_slots on public.time_slots
  for select to anon, authenticated
  using (public.journey_is_active(journey_id));