-- ============================================================================
-- CAMPUS VIRTUAL TESLA · FASE 2 · Script 10
-- Horario semanal por aula y calendario escolar.
--
--   schedule_blocks  Bloques del horario (curso o actividad: recreo, tutoría…)
--   school_events    Exámenes, feriados, actividades y reuniones
--
-- Carga los feriados nacionales del Perú del año actual y las vacaciones de
-- medio año (entre el II y el III bimestre). Requiere el script 07.
-- ============================================================================

create table if not exists public.schedule_blocks (
  id bigint generated always as identity primary key,
  classroom_id bigint not null references public.classrooms(id) on delete cascade,
  weekday smallint not null check (weekday between 1 and 6),
  starts_at time not null,
  ends_at time not null,
  offering_id bigint references public.course_offerings(id) on delete cascade,
  label text check (label is null or char_length(label) <= 60),
  created_at timestamptz not null default now(),
  check (ends_at > starts_at),
  check (offering_id is not null or label is not null)
);

create index if not exists idx_schedule_blocks_classroom on public.schedule_blocks(classroom_id, weekday, starts_at);
create index if not exists idx_schedule_blocks_offering on public.schedule_blocks(offering_id);

create table if not exists public.school_events (
  id bigint generated always as identity primary key,
  title text not null check (char_length(btrim(title)) between 2 and 140),
  description text check (description is null or char_length(description) <= 2000),
  kind text not null default 'ACTIVITY' check (kind in ('EXAM', 'HOLIDAY', 'ACTIVITY', 'MEETING', 'OTHER')),
  starts_on date not null,
  ends_on date not null,
  starts_at time,
  scope text not null default 'SCHOOL' check (scope in ('SCHOOL', 'LEVEL', 'CLASSROOM', 'COURSE')),
  level text check (level is null or level in ('Primaria', 'Secundaria')),
  classroom_id bigint references public.classrooms(id) on delete cascade,
  offering_id bigint references public.course_offerings(id) on delete cascade,
  author_id uuid default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now(),
  check (ends_on >= starts_on),
  constraint school_events_scope_target_check check (
    (scope = 'SCHOOL' and level is null and classroom_id is null and offering_id is null)
    or (scope = 'LEVEL' and level is not null and classroom_id is null and offering_id is null)
    or (scope = 'CLASSROOM' and classroom_id is not null and offering_id is null)
    or (scope = 'COURSE' and offering_id is not null)
  )
);

create index if not exists idx_school_events_dates on public.school_events(starts_on, ends_on);

-- ----------------------------------------------------------------------------
-- 1) Reglas
-- ----------------------------------------------------------------------------
-- Horario: el curso debe ser del aula y los bloques no se cruzan.
create or replace function public.check_schedule_block()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.offering_id is not null and not exists (
    select 1 from public.course_offerings o where o.id = new.offering_id and o.classroom_id = new.classroom_id
  ) then
    raise exception 'Ese curso no pertenece al aula.';
  end if;
  if exists (
    select 1 from public.schedule_blocks b
    where b.classroom_id = new.classroom_id
      and b.weekday = new.weekday
      and b.id is distinct from new.id
      and b.starts_at < new.ends_at
      and new.starts_at < b.ends_at
  ) then
    raise exception 'Ese bloque se cruza con otro del mismo día.';
  end if;
  new.label := nullif(btrim(coalesce(new.label, '')), '');
  return new;
end;
$$;

drop trigger if exists trg_schedule_blocks_check on public.schedule_blocks;
create trigger trg_schedule_blocks_check
before insert or update on public.schedule_blocks
for each row execute function public.check_schedule_block();

-- Evento de curso: guarda también el aula, para filtrarlo fácil.
create or replace function public.fill_event_classroom()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.scope = 'COURSE' then
    select o.classroom_id into new.classroom_id from public.course_offerings o where o.id = new.offering_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_school_events_fill on public.school_events;
create trigger trg_school_events_fill
before insert or update on public.school_events
for each row execute function public.fill_event_classroom();

-- ----------------------------------------------------------------------------
-- 2) Seguridad (RLS)
-- ----------------------------------------------------------------------------
alter table public.schedule_blocks enable row level security;
alter table public.school_events enable row level security;

do $$
declare
  t text;
  pol record;
begin
  foreach t in array array['schedule_blocks', 'school_events'] loop
    for pol in select policyname from pg_policies where schemaname = 'public' and tablename = t loop
      execute format('drop policy %I on public.%I', pol.policyname, t);
    end loop;
  end loop;
end $$;

create policy "view" on public.schedule_blocks for select to authenticated
  using (
    (select public.is_staff())
    or classroom_id in (select public.teacher_classroom_ids())
    or classroom_id in (select public.family_classroom_ids())
  );
create policy "admin_write" on public.schedule_blocks for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create policy "view" on public.school_events for select to authenticated
  using (
    scope in ('SCHOOL', 'LEVEL')
    or (select public.is_staff())
    or (scope = 'CLASSROOM' and (
      classroom_id in (select public.teacher_classroom_ids())
      or classroom_id in (select public.family_classroom_ids())
    ))
    or (scope = 'COURSE' and public.can_view_offering(offering_id))
  );

create policy "create" on public.school_events for insert to authenticated
  with check (
    (select public.is_admin())
    or (scope = 'CLASSROOM' and public.is_classroom_tutor(classroom_id))
    or (scope = 'COURSE' and public.can_manage_offering(offering_id))
  );

create policy "edit" on public.school_events for update to authenticated
  using (author_id = (select auth.uid()) or (select public.is_admin()))
  with check (
    (select public.is_admin())
    or (scope = 'CLASSROOM' and public.is_classroom_tutor(classroom_id))
    or (scope = 'COURSE' and public.can_manage_offering(offering_id))
  );

create policy "delete" on public.school_events for delete to authenticated
  using (author_id = (select auth.uid()) or (select public.is_admin()));

-- ----------------------------------------------------------------------------
-- 3) Feriados nacionales del Perú y vacaciones de medio año
-- ----------------------------------------------------------------------------
create or replace function public.easter_sunday(p_year integer)
returns date
language plpgsql
immutable
as $$
declare
  a int := p_year % 19;
  b int := p_year / 100;
  c int := p_year % 100;
  d int := b / 4;
  e int := b % 4;
  f int := (b + 8) / 25;
  g int := (b - f + 1) / 3;
  h int := (19 * a + b - d - g + 15) % 30;
  i int := c / 4;
  k int := c % 4;
  l int := (32 + 2 * e + 2 * i - h - k) % 7;
  m int := (a + 11 * h + 22 * l) / 451;
begin
  return make_date(p_year, (h + l - 7 * m + 114) / 31, ((h + l - 7 * m + 114) % 31) + 1);
end;
$$;

do $$
declare
  y int := (select year from public.academic_years where is_current limit 1);
  v_easter date;
  v_b2 date;
  v_b3 date;
begin
  if y is null then
    return;
  end if;
  v_easter := public.easter_sunday(y);

  insert into public.school_events (title, kind, starts_on, ends_on, scope, author_id)
  select x.title, 'HOLIDAY', x.d, x.d, 'SCHOOL', null
  from (values
    ('Año Nuevo', make_date(y, 1, 1)),
    ('Jueves Santo', v_easter - 3),
    ('Viernes Santo', v_easter - 2),
    ('Día del Trabajo', make_date(y, 5, 1)),
    ('Batalla de Arica y Día de la Bandera', make_date(y, 6, 7)),
    ('San Pedro y San Pablo', make_date(y, 6, 29)),
    ('Día de la Fuerza Aérea del Perú', make_date(y, 7, 23)),
    ('Fiestas Patrias', make_date(y, 7, 28)),
    ('Fiestas Patrias', make_date(y, 7, 29)),
    ('Batalla de Junín', make_date(y, 8, 6)),
    ('Santa Rosa de Lima', make_date(y, 8, 30)),
    ('Combate de Angamos', make_date(y, 10, 8)),
    ('Todos los Santos', make_date(y, 11, 1)),
    ('Inmaculada Concepción', make_date(y, 12, 8)),
    ('Batalla de Ayacucho', make_date(y, 12, 9)),
    ('Navidad', make_date(y, 12, 25))
  ) as x(title, d)
  where not exists (
    select 1 from public.school_events e
    where e.scope = 'SCHOOL' and e.title = x.title and e.starts_on = x.d
  );

  select gp.ends_on into v_b2 from public.grading_periods gp
  join public.academic_years ay on ay.id = gp.academic_year_id and ay.is_current
  where gp.number = 2;
  select gp.starts_on into v_b3 from public.grading_periods gp
  join public.academic_years ay on ay.id = gp.academic_year_id and ay.is_current
  where gp.number = 3;

  if v_b2 is not null and v_b3 is not null and v_b3 - v_b2 > 1
     and not exists (select 1 from public.school_events where title = 'Vacaciones de medio año' and starts_on = v_b2 + 1) then
    insert into public.school_events (title, kind, starts_on, ends_on, scope, author_id)
    values ('Vacaciones de medio año', 'HOLIDAY', v_b2 + 1, v_b3 - 1, 'SCHOOL', null);
  end if;
end $$;

select kind, count(*) from public.school_events group by kind;
