-- ============================================================================
-- CAMPUS VIRTUAL TESLA · FASE 1 · Script 01 de 06
-- Roles, vínculos de cuentas y funciones auxiliares de seguridad.
--
-- Ejecutar en Supabase > SQL Editor, en orden (01 → 06).
-- Todos los scripts se pueden volver a ejecutar sin romper nada.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0) Verificación previa: roles existentes en profiles
-- ----------------------------------------------------------------------------
-- Normaliza los roles a MAYÚSCULAS sin espacios (ej. ' admin ' → 'ADMIN').
update public.profiles
set role = upper(btrim(role))
where role is not null and role <> upper(btrim(role));

-- Si existe algún rol que no conocemos, detenemos el script para no dejar a
-- nadie de Tesla sin acceso. Corrige esos perfiles y vuelve a ejecutar.
do $$
declare
  v_unknown text;
begin
  select string_agg(distinct coalesce(role, '(vacío)'), ', ')
  into v_unknown
  from public.profiles
  where role is null
     or role not in ('ADMIN', 'MANAGEMENT', 'AUXILIARY', 'TEACHER', 'STUDENT', 'GUARDIAN');

  if v_unknown is not null then
    raise exception 'Hay perfiles con roles no reconocidos: %. Asigna uno de ADMIN, MANAGEMENT, AUXILIARY, TEACHER, STUDENT o GUARDIAN y vuelve a ejecutar.', v_unknown;
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 1) profiles: enlace con auth.users, rol validado y datos básicos
-- ----------------------------------------------------------------------------
alter table public.profiles
  add column if not exists dni text,
  add column if not exists phone text,
  add column if not exists is_active boolean not null default true,
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_id_auth_fkey') then
    -- NOT VALID: no revisa filas antiguas, pero sí todas las nuevas.
    alter table public.profiles
      add constraint profiles_id_auth_fkey
      foreign key (id) references auth.users(id) on delete cascade not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'profiles_role_check') then
    alter table public.profiles
      add constraint profiles_role_check
      check (role in ('ADMIN', 'MANAGEMENT', 'AUXILIARY', 'TEACHER', 'STUDENT', 'GUARDIAN'));
  end if;
end $$;

alter table public.profiles alter column role set not null;

create index if not exists idx_profiles_role on public.profiles(role);

-- ----------------------------------------------------------------------------
-- 2) Vincular alumnos y apoderados con su cuenta
-- ----------------------------------------------------------------------------
alter table public.students
  add column if not exists profile_id uuid;

alter table public.guardians
  add column if not exists profile_id uuid;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'students_profile_id_fkey') then
    alter table public.students
      add constraint students_profile_id_fkey
      foreign key (profile_id) references public.profiles(id) on delete set null;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'guardians_profile_id_fkey') then
    alter table public.guardians
      add constraint guardians_profile_id_fkey
      foreign key (profile_id) references public.profiles(id) on delete set null;
  end if;
end $$;

create unique index if not exists idx_students_profile_id_unique
  on public.students(profile_id) where profile_id is not null;
create unique index if not exists idx_guardians_profile_id_unique
  on public.guardians(profile_id) where profile_id is not null;

create index if not exists idx_student_guardians_student on public.student_guardians(student_id);
create index if not exists idx_student_guardians_guardian on public.student_guardians(guardian_id);
create unique index if not exists idx_student_guardians_pair_unique
  on public.student_guardians(student_id, guardian_id);

-- ----------------------------------------------------------------------------
-- 3) Año académico y tutor como usuario real
-- ----------------------------------------------------------------------------
create table if not exists public.academic_years (
  id bigint generated always as identity primary key,
  year integer not null unique check (year between 2000 and 2100),
  name text not null,
  starts_on date,
  ends_on date,
  is_current boolean not null default false,
  created_at timestamptz not null default now()
);

create unique index if not exists idx_academic_years_single_current
  on public.academic_years(is_current) where is_current;

insert into public.academic_years (year, name, starts_on, ends_on, is_current)
select extract(year from current_date)::int,
       'Año escolar ' || extract(year from current_date)::int,
       make_date(extract(year from current_date)::int, 3, 1),
       make_date(extract(year from current_date)::int, 12, 20),
       true
where not exists (select 1 from public.academic_years);

alter table public.classrooms
  add column if not exists tutor_id uuid,
  add column if not exists academic_year_id bigint;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'classrooms_tutor_id_fkey') then
    alter table public.classrooms
      add constraint classrooms_tutor_id_fkey
      foreign key (tutor_id) references public.profiles(id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'classrooms_academic_year_id_fkey') then
    alter table public.classrooms
      add constraint classrooms_academic_year_id_fkey
      foreign key (academic_year_id) references public.academic_years(id);
  end if;
end $$;

update public.classrooms
set academic_year_id = (select id from public.academic_years where is_current limit 1)
where academic_year_id is null;

create index if not exists idx_classrooms_tutor on public.classrooms(tutor_id);
create index if not exists idx_students_classroom on public.students(classroom_id);

-- ----------------------------------------------------------------------------
-- 4) Funciones auxiliares de seguridad
--    SECURITY DEFINER: leen profiles/students sin pasar por RLS, así las
--    políticas pueden usarlas sin recursión infinita.
-- ----------------------------------------------------------------------------
create or replace function public.app_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select p.role
  from public.profiles p
  where p.id = auth.uid() and p.is_active
$$;

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.app_role() in ('ADMIN', 'MANAGEMENT', 'AUXILIARY'), false)
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.app_role() in ('ADMIN', 'MANAGEMENT'), false)
$$;

create or replace function public.is_teacher()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.app_role() = 'TEACHER', false)
$$;

-- Id del alumno cuando quien consulta ES el alumno.
create or replace function public.my_self_student_id()
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select s.id
  from public.students s
  join public.profiles p on p.id = s.profile_id and p.is_active
  where s.profile_id = auth.uid()
  limit 1
$$;

-- Ids de los apoderados vinculados a la cuenta actual.
create or replace function public.my_guardian_ids()
returns setof bigint
language sql
stable
security definer
set search_path = public
as $$
  select g.id
  from public.guardians g
  join public.profiles p on p.id = g.profile_id and p.is_active
  where g.profile_id = auth.uid()
$$;

-- Alumnos que la cuenta actual puede ver como "familia": él mismo o sus hijos.
create or replace function public.my_student_ids()
returns setof bigint
language sql
stable
security definer
set search_path = public
as $$
  select public.my_self_student_id() where public.my_self_student_id() is not null
  union
  select sg.student_id
  from public.student_guardians sg
  where sg.guardian_id in (select public.my_guardian_ids())
$$;

-- Aulas de la familia (para anuncios de aula y cursos visibles).
create or replace function public.family_classroom_ids()
returns setof bigint
language sql
stable
security definer
set search_path = public
as $$
  select distinct s.classroom_id
  from public.students s
  where s.id in (select public.my_student_ids())
    and s.classroom_id is not null
$$;

-- ¿La llamada viene del SQL Editor, de pg_cron o de una Edge Function con
-- service_role? (sin JWT de usuario). Las peticiones de la app siempre traen
-- un JWT con rol 'anon' o 'authenticated', así que aquí devuelven false.
create or replace function public.is_trusted_backend()
returns boolean
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    nullif(current_setting('request.jwt.claim.role', true), '')
  ) is null
  or coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    nullif(current_setting('request.jwt.claim.role', true), '')
  ) = 'service_role'
$$;

-- Convierte texto a bigint sin lanzar error (se usa en rutas de Storage).
create or replace function public.try_bigint(p_value text)
returns bigint
language sql
immutable
as $$
  select case when p_value ~ '^[0-9]{1,18}$' then p_value::bigint else null end
$$;

-- Trigger genérico de updated_at (ya existe desde la Fase 7; se recrea igual).
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

-- Evita que alguien cambie su propio rol o el de otros sin ser administrador.
create or replace function public.protect_profile_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null
     and not public.is_admin()
     and not public.is_trusted_backend()
     and (new.role is distinct from old.role or new.is_active is distinct from old.is_active) then
    raise exception 'Solo un administrador puede cambiar roles o desactivar cuentas.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_profiles_protect_role on public.profiles;
create trigger trg_profiles_protect_role
before update on public.profiles
for each row execute function public.protect_profile_role();

-- Permisos de ejecución.
revoke all on function public.app_role() from public, anon;
revoke all on function public.is_staff() from public, anon;
revoke all on function public.is_admin() from public, anon;
revoke all on function public.is_teacher() from public, anon;
revoke all on function public.my_self_student_id() from public, anon;
revoke all on function public.my_guardian_ids() from public, anon;
revoke all on function public.my_student_ids() from public, anon;
revoke all on function public.family_classroom_ids() from public, anon;

grant execute on function public.app_role() to authenticated;
grant execute on function public.is_staff() to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_teacher() to authenticated;
grant execute on function public.my_self_student_id() to authenticated;
grant execute on function public.my_guardian_ids() to authenticated;
grant execute on function public.my_student_ids() to authenticated;
grant execute on function public.family_classroom_ids() to authenticated;
grant execute on function public.try_bigint(text) to authenticated;

-- Verificación
select role, count(*) as cuentas from public.profiles group by role order by role;
