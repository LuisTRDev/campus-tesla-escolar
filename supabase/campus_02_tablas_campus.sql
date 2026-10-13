-- ============================================================================
-- CAMPUS VIRTUAL TESLA · FASE 1 · Script 02 de 06
-- Tablas del campus: cursos, anuncios, materiales, tareas, entregas y
-- resúmenes semanales. Requiere haber ejecutado el script 01.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Áreas / cursos del catálogo
-- ----------------------------------------------------------------------------
create table if not exists public.subjects (
  id bigint generated always as identity primary key,
  name text not null check (char_length(btrim(name)) between 2 and 80),
  short_name text check (short_name is null or char_length(short_name) <= 12),
  color text not null default '#2563EB' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  level text check (level is null or level in ('Inicial', 'Primaria', 'Secundaria')),
  created_at timestamptz not null default now()
);

create unique index if not exists idx_subjects_name_level_unique
  on public.subjects (lower(btrim(name)), coalesce(level, ''));

-- ----------------------------------------------------------------------------
-- 2) Curso dictado: un área, en un aula, en un año, por un docente
-- ----------------------------------------------------------------------------
create table if not exists public.course_offerings (
  id bigint generated always as identity primary key,
  academic_year_id bigint not null references public.academic_years(id),
  classroom_id bigint not null references public.classrooms(id) on delete cascade,
  subject_id bigint not null references public.subjects(id),
  teacher_id uuid references public.profiles(id) on delete set null,
  description text check (description is null or char_length(description) <= 600),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (academic_year_id, classroom_id, subject_id)
);

create index if not exists idx_offerings_classroom on public.course_offerings(classroom_id);
create index if not exists idx_offerings_teacher on public.course_offerings(teacher_id);

-- ----------------------------------------------------------------------------
-- 3) Anuncios (de curso, de aula o de todo el colegio)
-- ----------------------------------------------------------------------------
create table if not exists public.announcements (
  id bigint generated always as identity primary key,
  scope text not null default 'COURSE' check (scope in ('COURSE', 'CLASSROOM', 'SCHOOL')),
  offering_id bigint references public.course_offerings(id) on delete cascade,
  classroom_id bigint references public.classrooms(id) on delete cascade,
  author_id uuid not null default auth.uid() references public.profiles(id),
  title text not null check (char_length(btrim(title)) between 2 and 140),
  body text not null check (char_length(body) <= 5000),
  pinned boolean not null default false,
  published_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint announcements_scope_target_check check (
    (scope = 'COURSE' and offering_id is not null and classroom_id is null)
    or (scope = 'CLASSROOM' and classroom_id is not null and offering_id is null)
    or (scope = 'SCHOOL' and offering_id is null and classroom_id is null)
  )
);

create index if not exists idx_announcements_offering on public.announcements(offering_id, published_at desc);
create index if not exists idx_announcements_classroom on public.announcements(classroom_id, published_at desc);
create index if not exists idx_announcements_scope on public.announcements(scope, published_at desc);

-- ----------------------------------------------------------------------------
-- 4) Materiales de curso (archivo, enlace o video)
-- ----------------------------------------------------------------------------
create table if not exists public.materials (
  id bigint generated always as identity primary key,
  offering_id bigint not null references public.course_offerings(id) on delete cascade,
  author_id uuid not null default auth.uid() references public.profiles(id),
  title text not null check (char_length(btrim(title)) between 2 and 140),
  description text check (description is null or char_length(description) <= 2000),
  unit text check (unit is null or char_length(unit) <= 80),
  kind text not null check (kind in ('FILE', 'LINK', 'VIDEO')),
  url text check (url is null or url ~* '^https://'),
  storage_path text,
  file_name text,
  file_size bigint check (file_size is null or file_size between 0 and 52428800),
  mime_type text,
  published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint materials_kind_payload_check check (
    (kind = 'FILE' and storage_path is not null)
    or (kind in ('LINK', 'VIDEO') and url is not null)
  )
);

create index if not exists idx_materials_offering on public.materials(offering_id, created_at desc);

-- ----------------------------------------------------------------------------
-- 5) Tareas
-- ----------------------------------------------------------------------------
create table if not exists public.assignments (
  id bigint generated always as identity primary key,
  offering_id bigint not null references public.course_offerings(id) on delete cascade,
  author_id uuid not null default auth.uid() references public.profiles(id),
  title text not null check (char_length(btrim(title)) between 2 and 140),
  instructions text check (instructions is null or char_length(instructions) <= 8000),
  due_at timestamptz,
  grading_type text not null default 'SCORE' check (grading_type in ('SCORE', 'LEVEL')),
  max_score numeric(5,2) not null default 20 check (max_score > 0 and max_score <= 100),
  allow_late boolean not null default true,
  status text not null default 'PUBLISHED' check (status in ('DRAFT', 'PUBLISHED', 'CLOSED')),
  attachment_path text,
  attachment_name text,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_assignments_offering on public.assignments(offering_id, due_at);
create index if not exists idx_assignments_due on public.assignments(due_at) where status = 'PUBLISHED';

-- ----------------------------------------------------------------------------
-- 6) Entregas
-- ----------------------------------------------------------------------------
create table if not exists public.submissions (
  id bigint generated always as identity primary key,
  assignment_id bigint not null references public.assignments(id) on delete cascade,
  student_id bigint not null references public.students(id) on delete cascade,
  content text check (content is null or char_length(content) <= 8000),
  files jsonb not null default '[]'::jsonb check (jsonb_typeof(files) = 'array' and jsonb_array_length(files) <= 5),
  status text not null default 'SUBMITTED' check (status in ('SUBMITTED', 'RETURNED', 'GRADED')),
  submitted_at timestamptz not null default now(),
  is_late boolean not null default false,
  score numeric(5,2) check (score is null or score >= 0),
  level text check (level is null or level in ('AD', 'A', 'B', 'C')),
  feedback text check (feedback is null or char_length(feedback) <= 4000),
  graded_by uuid references public.profiles(id),
  graded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (assignment_id, student_id)
);

create index if not exists idx_submissions_student on public.submissions(student_id, submitted_at desc);
create index if not exists idx_submissions_assignment on public.submissions(assignment_id);

-- ----------------------------------------------------------------------------
-- 7) Resúmenes semanales para las familias
-- ----------------------------------------------------------------------------
create table if not exists public.weekly_digests (
  id bigint generated always as identity primary key,
  student_id bigint not null references public.students(id) on delete cascade,
  week_start date not null,
  summary jsonb not null default '{}'::jsonb,
  text_body text not null default '',
  generated_at timestamptz not null default now(),
  unique (student_id, week_start)
);

create index if not exists idx_weekly_digests_student on public.weekly_digests(student_id, week_start desc);

-- ----------------------------------------------------------------------------
-- 8) Triggers de updated_at
-- ----------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['course_offerings', 'announcements', 'materials', 'assignments', 'submissions'] loop
    execute format('drop trigger if exists trg_%1$s_updated_at on public.%1$I', t);
    execute format('create trigger trg_%1$s_updated_at before update on public.%1$I for each row execute function public.set_updated_at()', t);
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- 9) Funciones de acceso a cursos (dependen de las tablas de arriba)
-- ----------------------------------------------------------------------------
-- Aulas donde la cuenta actual enseña o es tutor.
create or replace function public.teacher_classroom_ids()
returns setof bigint
language sql
stable
security definer
set search_path = public
as $$
  select c.id from public.classrooms c where c.tutor_id = auth.uid()
  union
  select o.classroom_id from public.course_offerings o
  where o.teacher_id = auth.uid() and o.is_active
$$;

-- ¿Puede ver este curso? Personal, su docente o alumnos/familias del aula.
create or replace function public.can_view_offering(p_offering_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.course_offerings o
    where o.id = p_offering_id
      and (
        public.is_staff()
        or o.teacher_id = auth.uid()
        or (o.is_active and o.classroom_id in (select public.family_classroom_ids()))
      )
  )
$$;

-- ¿Puede editar el contenido del curso? Administración o su docente.
create or replace function public.can_manage_offering(p_offering_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.course_offerings o
    where o.id = p_offering_id
      and (public.is_admin() or (o.teacher_id = auth.uid() and public.is_teacher()))
  )
$$;

create or replace function public.can_manage_assignment(p_assignment_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.assignments a
    where a.id = p_assignment_id and public.can_manage_offering(a.offering_id)
  )
$$;

-- ¿Puede ver al alumno? Personal, su tutor/docentes o su familia.
create or replace function public.can_view_student(p_student_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_staff()
    or p_student_id in (select public.my_student_ids())
    or exists (
      select 1 from public.students s
      where s.id = p_student_id
        and s.classroom_id in (select public.teacher_classroom_ids())
    )
$$;

-- ----------------------------------------------------------------------------
-- 10) Reglas de negocio de las entregas
--     El alumno solo controla su contenido; el docente solo la calificación.
-- ----------------------------------------------------------------------------
create or replace function public.enforce_submission_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_assignment public.assignments%rowtype;
  v_is_manager boolean;
begin
  select * into v_assignment from public.assignments where id = new.assignment_id;
  if not found then
    raise exception 'La tarea no existe.';
  end if;

  -- SQL Editor / service role: no se aplica ninguna regla.
  if public.is_trusted_backend() then
    return new;
  end if;

  v_is_manager := public.can_manage_offering(v_assignment.offering_id);

  if tg_op = 'INSERT' then
    if v_is_manager then
      raise exception 'Las entregas las crea el alumno.';
    end if;
    if new.student_id is distinct from public.my_self_student_id() then
      raise exception 'Solo puedes entregar tus propias tareas.';
    end if;
    if v_assignment.status <> 'PUBLISHED' then
      raise exception 'Esta tarea no está recibiendo entregas.';
    end if;
    new.is_late := v_assignment.due_at is not null and now() > v_assignment.due_at;
    if new.is_late and not v_assignment.allow_late then
      raise exception 'La fecha límite ya pasó y esta tarea no acepta entregas tardías.';
    end if;
    new.status := 'SUBMITTED';
    new.submitted_at := now();
    new.score := null;
    new.level := null;
    new.feedback := null;
    new.graded_by := null;
    new.graded_at := null;
    return new;
  end if;

  -- UPDATE
  new.assignment_id := old.assignment_id;
  new.student_id := old.student_id;

  if v_is_manager then
    -- El docente califica o devuelve; no toca el trabajo del alumno.
    new.content := old.content;
    new.files := old.files;
    new.submitted_at := old.submitted_at;
    new.is_late := old.is_late;
    if new.status not in ('GRADED', 'RETURNED') then
      new.status := old.status;
    end if;
    if v_assignment.grading_type = 'SCORE' then
      new.level := null;
      if new.score is not null and new.score > v_assignment.max_score then
        raise exception 'La nota no puede ser mayor que %.', v_assignment.max_score;
      end if;
    else
      new.score := null;
    end if;
    if new.status = 'GRADED' then
      new.graded_by := auth.uid();
      new.graded_at := now();
    end if;
    return new;
  end if;

  -- Alumno reenviando su trabajo.
  if old.student_id is distinct from public.my_self_student_id() then
    raise exception 'Solo puedes modificar tus propias entregas.';
  end if;
  if old.status = 'GRADED' then
    raise exception 'Esta entrega ya fue calificada. Pide a tu docente que te la devuelva para corregirla.';
  end if;
  if v_assignment.status <> 'PUBLISHED' then
    raise exception 'Esta tarea ya no está recibiendo entregas.';
  end if;
  new.is_late := v_assignment.due_at is not null and now() > v_assignment.due_at;
  if new.is_late and not v_assignment.allow_late then
    raise exception 'La fecha límite ya pasó y esta tarea no acepta entregas tardías.';
  end if;
  new.status := 'SUBMITTED';
  new.submitted_at := now();
  new.score := old.score;
  new.level := old.level;
  new.feedback := old.feedback;
  new.graded_by := old.graded_by;
  new.graded_at := old.graded_at;
  return new;
end;
$$;

drop trigger if exists trg_submissions_rules on public.submissions;
create trigger trg_submissions_rules
before insert or update on public.submissions
for each row execute function public.enforce_submission_rules();

-- published_at automático al publicar una tarea.
create or replace function public.set_assignment_published_at()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'PUBLISHED' and new.published_at is null then
    new.published_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_assignments_published_at on public.assignments;
create trigger trg_assignments_published_at
before insert or update on public.assignments
for each row execute function public.set_assignment_published_at();

-- Permisos de ejecución.
revoke all on function public.teacher_classroom_ids() from public, anon;
revoke all on function public.can_view_offering(bigint) from public, anon;
revoke all on function public.can_manage_offering(bigint) from public, anon;
revoke all on function public.can_manage_assignment(bigint) from public, anon;
revoke all on function public.can_view_student(bigint) from public, anon;
grant execute on function public.teacher_classroom_ids() to authenticated;
grant execute on function public.can_view_offering(bigint) to authenticated;
grant execute on function public.can_manage_offering(bigint) to authenticated;
grant execute on function public.can_manage_assignment(bigint) to authenticated;
grant execute on function public.can_view_student(bigint) to authenticated;

-- ----------------------------------------------------------------------------
-- 11) Directorio público mínimo (solo nombre y rol de docentes/personal)
--     Permite a alumnos y familias ver "Prof. Ana Torres" sin exponer
--     DNI, teléfono u otros datos del perfil.
-- ----------------------------------------------------------------------------
create or replace view public.campus_people as
select p.id, p.full_name, p.role
from public.profiles p
where p.role in ('ADMIN', 'MANAGEMENT', 'AUXILIARY', 'TEACHER')
  and p.is_active;

revoke all on public.campus_people from anon;
grant select on public.campus_people to authenticated;

-- ----------------------------------------------------------------------------
-- 12) Realtime para las tablas nuevas
-- ----------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['announcements', 'materials', 'assignments', 'submissions'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

select 'Tablas del campus listas' as estado;
