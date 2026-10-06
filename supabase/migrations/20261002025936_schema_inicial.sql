-- =========================================================
-- MIGRACIÓN 1: ESQUEMA INICIAL - SISTEMA DE CITAS
-- =========================================================

-- ---------- Utilidad: updated_at ----------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------- JORNADAS ----------
create table public.journeys (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (length(trim(nombre)) > 0),
  estado text not null default 'borrador'
    check (estado in ('borrador','activa','inactiva')),
  capacidad_total_objetivo int not null check (capacidad_total_objetivo > 0),
  capacidad_max_por_horario int not null default 30 check (capacidad_max_por_horario > 0),
  ultimo_orden int not null default 0 check (ultimo_orden >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- FECHAS ----------
create table public.journey_dates (
  id uuid primary key default gen_random_uuid(),
  journey_id uuid not null references public.journeys(id) on delete cascade,
  fecha date not null,
  capacidad_total int not null check (capacidad_total > 0),
  estado text not null default 'activa' check (estado in ('activa','inactiva')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (journey_id, fecha),
  unique (id, journey_id)
);

-- ---------- HORARIOS ----------
create table public.time_slots (
  id uuid primary key default gen_random_uuid(),
  journey_id uuid not null,
  journey_date_id uuid not null,
  hora_inicio time not null,
  hora_fin time not null,
  capacidad int not null check (capacidad > 0),
  ocupados int not null default 0,
  estado text not null default 'activo' check (estado in ('activo','inactivo')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (journey_date_id, journey_id)
    references public.journey_dates(id, journey_id) on delete cascade,
  check (hora_fin > hora_inicio),
  check (ocupados >= 0 and ocupados <= capacidad),
  unique (journey_date_id, hora_inicio),
  unique (id, journey_date_id, journey_id)
);

-- ---------- PERSONAS ----------
create table public.people (
  id uuid primary key default gen_random_uuid(),
  numero_documento text not null unique
    check (numero_documento ~ '^[0-9]{3,15}$'),
  primer_apellido text not null check (length(trim(primer_apellido)) > 0),
  segundo_apellido text,
  primer_nombre text not null check (length(trim(primer_nombre)) > 0),
  segundo_nombre text,
  nombre_completo text generated always as (
    primer_nombre
    || coalesce(' ' || nullif(segundo_nombre, ''), '')
    || ' ' || primer_apellido
    || coalesce(' ' || nullif(segundo_apellido, ''), '')
  ) stored,
  telefono text not null check (telefono ~ '^[0-9]{7,15}$'), -- NO UNIQUE
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- USUARIOS DE LOGÍSTICA ----------
create table public.logistics_users (
  id uuid primary key default gen_random_uuid(),
  pin_lookup text not null unique,   -- HMAC(PIN, PEPPER) para búsqueda
  pin_hash text not null,            -- bcrypt
  nombre_interno text not null check (length(trim(nombre_interno)) > 0),
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.logistics_user_journeys (
  id uuid primary key default gen_random_uuid(),
  logistics_user_id uuid not null references public.logistics_users(id) on delete cascade,
  journey_id uuid not null references public.journeys(id) on delete cascade,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  unique (logistics_user_id, journey_id)
);

-- ---------- CITAS ----------
create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  journey_id uuid not null references public.journeys(id),
  journey_date_id uuid not null,
  time_slot_id uuid not null,
  person_id uuid not null references public.people(id),
  orden_registro int not null check (orden_registro > 0),
  estado text not null default 'asignada' check (estado in ('asignada')),
  metodo_registro text not null check (metodo_registro in ('escaneo','manual')),
  logistics_user_id uuid references public.logistics_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (time_slot_id, journey_date_id, journey_id)
    references public.time_slots(id, journey_date_id, journey_id),
  unique (journey_id, person_id),       -- una cita por persona por jornada
  unique (journey_id, orden_registro)
);

-- ---------- ADMINS ----------
create table public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- ---------- INTENTOS DE LOGIN ----------
create table public.login_attempts (
  id bigint generated always as identity primary key,
  ip text not null,
  exitoso boolean not null,
  logistics_user_id uuid references public.logistics_users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- ---------- AUDITORÍA ----------
create table public.audit_log (
  id bigint generated always as identity primary key,
  actor_tipo text not null check (actor_tipo in ('admin','logistica','sistema')),
  actor_id uuid,
  accion text not null,
  entidad text,
  entidad_id uuid,
  datos jsonb,
  created_at timestamptz not null default now()
);

-- ---------- ÍNDICES ----------
create index on public.journey_dates (journey_id, fecha);
create index on public.time_slots (journey_id);
create index on public.time_slots (journey_date_id, hora_inicio);
create index on public.appointments (journey_id, journey_date_id, time_slot_id);
create index on public.appointments (logistics_user_id);
create index on public.appointments (person_id);
create index on public.appointments (journey_id, created_at desc);
create index on public.logistics_user_journeys (journey_id);
create index on public.login_attempts (ip, created_at desc);
create index on public.login_attempts (created_at desc);
create index on public.audit_log (created_at desc);

-- ---------- TRIGGERS updated_at ----------
create trigger trg_journeys_upd before update on public.journeys
  for each row execute function public.set_updated_at();
create trigger trg_journey_dates_upd before update on public.journey_dates
  for each row execute function public.set_updated_at();
create trigger trg_time_slots_upd before update on public.time_slots
  for each row execute function public.set_updated_at();
create trigger trg_people_upd before update on public.people
  for each row execute function public.set_updated_at();
create trigger trg_logistics_users_upd before update on public.logistics_users
  for each row execute function public.set_updated_at();
create trigger trg_appointments_upd before update on public.appointments
  for each row execute function public.set_updated_at();

-- ---------- VALIDACIÓN: HORARIOS ----------
create or replace function public.validate_time_slot()
returns trigger language plpgsql as $$
declare v_max int;
begin
  select capacidad_max_por_horario into v_max
  from public.journeys where id = new.journey_id;

  if new.capacidad > v_max then
    raise exception 'La capacidad del horario (%) supera el máximo permitido (%)',
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

create trigger trg_validate_time_slot
  before insert or update on public.time_slots
  for each row execute function public.validate_time_slot();

-- ---------- VALIDACIÓN: FECHAS ----------
create or replace function public.validate_journey_date()
returns trigger language plpgsql as $$
begin
  if new.fecha <> old.fecha and exists (
    select 1 from public.time_slots
    where journey_date_id = old.id and ocupados > 0
  ) then
    raise exception 'No se puede cambiar la fecha: ya tiene citas asignadas'
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

create trigger trg_validate_journey_date
  before update on public.journey_dates
  for each row execute function public.validate_journey_date();

-- ---------- VALIDACIÓN: JORNADA ----------
create or replace function public.validate_journey()
returns trigger language plpgsql as $$
declare
  v_slots int;
  v_total int;
  v_bad_date record;
begin
  -- máximo por horario no puede quedar por debajo de horarios existentes
  if new.capacidad_max_por_horario <> old.capacidad_max_por_horario and exists (
    select 1 from public.time_slots
    where journey_id = new.id and capacidad > new.capacidad_max_por_horario
  ) then
    raise exception 'Hay horarios con capacidad mayor a %', new.capacidad_max_por_horario
      using errcode = 'check_violation';
  end if;

  -- reglas de activación
  if new.estado = 'activa' and old.estado <> 'activa' then
    select count(*) into v_slots
    from public.time_slots ts
    join public.journey_dates jd on jd.id = ts.journey_date_id
    where ts.journey_id = new.id and ts.estado = 'activo' and jd.estado = 'activa';

    if v_slots = 0 then
      raise exception 'La jornada no tiene horarios activos'
        using errcode = 'check_violation';
    end if;

    select jd.fecha, jd.capacidad_total, coalesce(sum(ts.capacidad), 0) as suma
    into v_bad_date
    from public.journey_dates jd
    left join public.time_slots ts
      on ts.journey_date_id = jd.id and ts.estado = 'activo'
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
    from public.journey_dates
    where journey_id = new.id and estado = 'activa';

    if v_total <> new.capacidad_total_objetivo then
      raise exception 'Las fechas suman % pero la capacidad objetivo es %',
        v_total, new.capacidad_total_objetivo using errcode = 'check_violation';
    end if;
  end if;

  return new;
end $$;

create trigger trg_validate_journey
  before update on public.journeys
  for each row execute function public.validate_journey();

-- ---------- RLS ACTIVADO (políticas en la migración 2) ----------
alter table public.journeys enable row level security;
alter table public.journey_dates enable row level security;
alter table public.time_slots enable row level security;
alter table public.people enable row level security;
alter table public.logistics_users enable row level security;
alter table public.logistics_user_journeys enable row level security;
alter table public.appointments enable row level security;
alter table public.admins enable row level security;
alter table public.login_attempts enable row level security;
alter table public.audit_log enable row level security;