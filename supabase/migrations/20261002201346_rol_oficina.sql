-- =========================================================
-- MIGRACIÓN 6: ROL OFICINA (solo consulta)
-- =========================================================
alter table public.logistics_users
  add column rol text not null default 'logistica'
  check (rol in ('logistica', 'oficina'));

grant select (rol) on public.logistics_users to authenticated;

-- Oficina nunca se asigna a jornadas → nunca puede registrar citas
create or replace function public.check_luj_rol()
returns trigger language plpgsql as $$
begin
  if exists (
    select 1 from public.logistics_users
    where id = new.logistics_user_id and rol <> 'logistica'
  ) then
    raise exception 'Los usuarios de oficina no se asignan a jornadas'
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

create trigger trg_check_luj_rol
  before insert or update on public.logistics_user_journeys
  for each row execute function public.check_luj_rol();