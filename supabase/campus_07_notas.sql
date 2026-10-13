-- ============================================================================
-- CAMPUS VIRTUAL TESLA · FASE 2 · Script 07
-- Registro de notas por competencias (CNEB), libreta y consolidado.
--
--   grading_periods       Bimestres del año (fechas, cierre, publicación)
--   competencies          Competencias del Currículo Nacional por área
--   assignment_competencies  Tareas usadas como evidencia de una competencia
--   competency_grades     Nivel de logro (AD, A, B, C) por alumno y bimestre
--   report_card_comments  Apreciación del tutor en la libreta
--
-- Requiere los scripts 01 a 06. Se puede volver a ejecutar.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Funciones auxiliares
-- ----------------------------------------------------------------------------
create or replace function public.is_classroom_tutor(p_classroom_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.classrooms c
    where c.id = p_classroom_id and c.tutor_id = auth.uid() and public.is_teacher()
  )
$$;

-- Hijos de la cuenta actual SOLO como apoderado (excluye la cuenta del alumno).
create or replace function public.my_children_ids()
returns setof bigint
language sql
stable
security definer
set search_path = public
as $$
  select sg.student_id
  from public.student_guardians sg
  where sg.guardian_id in (select public.my_guardian_ids())
$$;

revoke all on function public.is_classroom_tutor(bigint) from public, anon;
revoke all on function public.my_children_ids() from public, anon;
grant execute on function public.is_classroom_tutor(bigint) to authenticated;
grant execute on function public.my_children_ids() to authenticated;

-- ----------------------------------------------------------------------------
-- 2) Bimestres
-- ----------------------------------------------------------------------------
create table if not exists public.grading_periods (
  id bigint generated always as identity primary key,
  academic_year_id bigint not null references public.academic_years(id) on delete cascade,
  number smallint not null check (number between 1 and 4),
  name text not null,
  starts_on date not null,
  ends_on date not null,
  -- Cerrado: los docentes ya no pueden cambiar notas.
  is_closed boolean not null default false,
  -- Publicado: las familias ven las notas y la libreta.
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (academic_year_id, number),
  check (ends_on > starts_on)
);

-- Calendario típico de un colegio peruano (se edita desde la app).
insert into public.grading_periods (academic_year_id, number, name, starts_on, ends_on)
select y.id, p.number, p.name,
       make_date(y.year, p.sm, p.sd), make_date(y.year, p.em, p.ed)
from public.academic_years y
cross join (values
  (1, 'I Bimestre',   3,  9,  5,  8),
  (2, 'II Bimestre',  5, 18,  7, 17),
  (3, 'III Bimestre', 8,  3, 10,  2),
  (4, 'IV Bimestre', 10, 12, 12, 18)
) as p(number, name, sm, sd, em, ed)
where y.is_current
on conflict (academic_year_id, number) do nothing;

-- ----------------------------------------------------------------------------
-- 3) Competencias del CNEB
-- ----------------------------------------------------------------------------
create table if not exists public.competencies (
  id bigint generated always as identity primary key,
  subject_id bigint not null references public.subjects(id) on delete cascade,
  code text not null check (char_length(code) <= 12),
  name text not null check (char_length(btrim(name)) between 3 and 300),
  sort_order smallint not null default 1,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (subject_id, code)
);

create index if not exists idx_competencies_subject on public.competencies(subject_id, sort_order);

insert into public.competencies (subject_id, code, name, sort_order)
select sj.id, c.code, c.name, c.ord
from (values
  -- Matemática (Primaria y Secundaria)
  ('Matemática', null, 'C1', 'Resuelve problemas de cantidad', 1),
  ('Matemática', null, 'C2', 'Resuelve problemas de regularidad, equivalencia y cambio', 2),
  ('Matemática', null, 'C3', 'Resuelve problemas de forma, movimiento y localización', 3),
  ('Matemática', null, 'C4', 'Resuelve problemas de gestión de datos e incertidumbre', 4),
  -- Comunicación
  ('Comunicación', null, 'C1', 'Se comunica oralmente en su lengua materna', 1),
  ('Comunicación', null, 'C2', 'Lee diversos tipos de textos escritos en su lengua materna', 2),
  ('Comunicación', null, 'C3', 'Escribe diversos tipos de textos en su lengua materna', 3),
  -- Inglés
  ('Inglés', null, 'C1', 'Se comunica oralmente en inglés como lengua extranjera', 1),
  ('Inglés', null, 'C2', 'Lee diversos tipos de textos escritos en inglés como lengua extranjera', 2),
  ('Inglés', null, 'C3', 'Escribe diversos tipos de textos en inglés como lengua extranjera', 3),
  -- Ciencia y Tecnología
  ('Ciencia y Tecnología', null, 'C1', 'Indaga mediante métodos científicos para construir sus conocimientos', 1),
  ('Ciencia y Tecnología', null, 'C2', 'Explica el mundo físico basándose en conocimientos sobre los seres vivos, materia y energía, biodiversidad, Tierra y universo', 2),
  ('Ciencia y Tecnología', null, 'C3', 'Diseña y construye soluciones tecnológicas para resolver problemas de su entorno', 3),
  -- Arte y Cultura
  ('Arte y Cultura', null, 'C1', 'Aprecia de manera crítica manifestaciones artístico-culturales', 1),
  ('Arte y Cultura', null, 'C2', 'Crea proyectos desde los lenguajes artísticos', 2),
  -- Educación Física
  ('Educación Física', null, 'C1', 'Se desenvuelve de manera autónoma a través de su motricidad', 1),
  ('Educación Física', null, 'C2', 'Asume una vida saludable', 2),
  ('Educación Física', null, 'C3', 'Interactúa a través de sus habilidades sociomotrices', 3),
  -- Educación Religiosa
  ('Educación Religiosa', null, 'C1', 'Construye su identidad como persona humana, amada por Dios, digna, libre y trascendente', 1),
  ('Educación Religiosa', null, 'C2', 'Asume la experiencia del encuentro personal y comunitario con Dios en su proyecto de vida', 2),
  -- Personal Social (Primaria)
  ('Personal Social', 'Primaria', 'C1', 'Construye su identidad', 1),
  ('Personal Social', 'Primaria', 'C2', 'Convive y participa democráticamente en la búsqueda del bien común', 2),
  ('Personal Social', 'Primaria', 'C3', 'Construye interpretaciones históricas', 3),
  ('Personal Social', 'Primaria', 'C4', 'Gestiona responsablemente el espacio y el ambiente', 4),
  ('Personal Social', 'Primaria', 'C5', 'Gestiona responsablemente los recursos económicos', 5),
  -- DPCC (Secundaria)
  ('Desarrollo Personal, Ciudadanía y Cívica', 'Secundaria', 'C1', 'Construye su identidad', 1),
  ('Desarrollo Personal, Ciudadanía y Cívica', 'Secundaria', 'C2', 'Convive y participa democráticamente en la búsqueda del bien común', 2),
  -- Ciencias Sociales (Secundaria)
  ('Ciencias Sociales', 'Secundaria', 'C1', 'Construye interpretaciones históricas', 1),
  ('Ciencias Sociales', 'Secundaria', 'C2', 'Gestiona responsablemente el espacio y el ambiente', 2),
  ('Ciencias Sociales', 'Secundaria', 'C3', 'Gestiona responsablemente los recursos económicos', 3),
  -- Educación para el Trabajo (Secundaria)
  ('Educación para el Trabajo', 'Secundaria', 'C1', 'Gestiona proyectos de emprendimiento económico o social', 1)
) as c(subject_name, level, code, name, ord)
join public.subjects sj
  on lower(sj.name) = lower(c.subject_name)
 and (c.level is null or sj.level = c.level)
on conflict (subject_id, code) do nothing;

-- ----------------------------------------------------------------------------
-- 4) Tareas como evidencia
-- ----------------------------------------------------------------------------
create table if not exists public.assignment_competencies (
  assignment_id bigint not null references public.assignments(id) on delete cascade,
  competency_id bigint not null references public.competencies(id) on delete cascade,
  primary key (assignment_id, competency_id)
);

create index if not exists idx_assignment_competencies_comp on public.assignment_competencies(competency_id);

-- ----------------------------------------------------------------------------
-- 5) Calificaciones por competencia
-- ----------------------------------------------------------------------------
create table if not exists public.competency_grades (
  id bigint generated always as identity primary key,
  period_id bigint not null references public.grading_periods(id) on delete cascade,
  offering_id bigint not null references public.course_offerings(id) on delete cascade,
  student_id bigint not null references public.students(id) on delete cascade,
  competency_id bigint not null references public.competencies(id) on delete cascade,
  level text check (level is null or level in ('AD', 'A', 'B', 'C')),
  -- Conclusión descriptiva: obligatoria en la libreta para B y C (RVM 094-2020).
  conclusion text check (conclusion is null or char_length(conclusion) <= 1000),
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (period_id, student_id, competency_id)
);

create index if not exists idx_competency_grades_offering on public.competency_grades(offering_id, period_id);
create index if not exists idx_competency_grades_student on public.competency_grades(student_id, period_id);

-- Apreciación del tutor por alumno y bimestre.
create table if not exists public.report_card_comments (
  id bigint generated always as identity primary key,
  period_id bigint not null references public.grading_periods(id) on delete cascade,
  student_id bigint not null references public.students(id) on delete cascade,
  comment text not null default '' check (char_length(comment) <= 1500),
  author_id uuid references public.profiles(id),
  updated_at timestamptz not null default now(),
  unique (period_id, student_id)
);

do $$
declare
  t text;
begin
  foreach t in array array['grading_periods', 'competency_grades', 'report_card_comments'] loop
    execute format('drop trigger if exists trg_%1$s_updated_at on public.%1$I', t);
    execute format('create trigger trg_%1$s_updated_at before update on public.%1$I for each row execute function public.set_updated_at()', t);
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- 6) Reglas de las calificaciones
-- ----------------------------------------------------------------------------
create or replace function public.enforce_competency_grade_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_period public.grading_periods%rowtype;
  v_offering public.course_offerings%rowtype;
begin
  select * into v_period from public.grading_periods where id = new.period_id;
  select * into v_offering from public.course_offerings where id = new.offering_id;

  if v_offering.id is null then
    raise exception 'El curso no existe.';
  end if;
  if not exists (select 1 from public.competencies c where c.id = new.competency_id and c.subject_id = v_offering.subject_id) then
    raise exception 'La competencia no pertenece a este curso.';
  end if;
  if not exists (select 1 from public.students s where s.id = new.student_id and s.classroom_id = v_offering.classroom_id) then
    raise exception 'El alumno no pertenece al aula de este curso.';
  end if;

  if not public.is_trusted_backend() then
    if v_period.is_closed and not public.is_admin() then
      raise exception 'El % está cerrado. Pide a dirección que lo reabra para hacer cambios.', v_period.name;
    end if;
    new.updated_by := auth.uid();
  end if;

  new.conclusion := nullif(btrim(coalesce(new.conclusion, '')), '');
  return new;
end;
$$;

drop trigger if exists trg_competency_grades_rules on public.competency_grades;
create trigger trg_competency_grades_rules
before insert or update on public.competency_grades
for each row execute function public.enforce_competency_grade_rules();

-- Borrar una nota también respeta el cierre del bimestre.
create or replace function public.protect_closed_period_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_trusted_backend() and not public.is_admin()
     and exists (select 1 from public.grading_periods p where p.id = old.period_id and p.is_closed) then
    raise exception 'El bimestre está cerrado.';
  end if;
  return old;
end;
$$;

drop trigger if exists trg_competency_grades_delete on public.competency_grades;
create trigger trg_competency_grades_delete
before delete on public.competency_grades
for each row execute function public.protect_closed_period_delete();

-- ----------------------------------------------------------------------------
-- 7) Seguridad (RLS)
-- ----------------------------------------------------------------------------
alter table public.grading_periods enable row level security;
alter table public.competencies enable row level security;
alter table public.assignment_competencies enable row level security;
alter table public.competency_grades enable row level security;
alter table public.report_card_comments enable row level security;

do $$
declare
  t text;
  pol record;
begin
  foreach t in array array['grading_periods', 'competencies', 'assignment_competencies', 'competency_grades', 'report_card_comments'] loop
    for pol in select policyname from pg_policies where schemaname = 'public' and tablename = t loop
      execute format('drop policy %I on public.%I', pol.policyname, t);
    end loop;
  end loop;
end $$;

create policy "authenticated_read" on public.grading_periods for select to authenticated using (true);
create policy "admin_write" on public.grading_periods for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create policy "authenticated_read" on public.competencies for select to authenticated using (true);
create policy "admin_write" on public.competencies for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create policy "view" on public.assignment_competencies for select to authenticated
  using (exists (select 1 from public.assignments a where a.id = assignment_id and public.can_view_offering(a.offering_id)));
create policy "manage" on public.assignment_competencies for all to authenticated
  using (public.can_manage_assignment(assignment_id))
  with check (public.can_manage_assignment(assignment_id));

-- Notas: personal, docente del curso, tutor del aula; familia solo si el bimestre está publicado.
create policy "view" on public.competency_grades for select to authenticated
  using (
    (select public.is_staff())
    or public.can_manage_offering(offering_id)
    or exists (select 1 from public.course_offerings o where o.id = offering_id and public.is_classroom_tutor(o.classroom_id))
    or (
      student_id in (select public.my_student_ids())
      and exists (select 1 from public.grading_periods p where p.id = period_id and p.is_published)
    )
  );
create policy "manage" on public.competency_grades for all to authenticated
  using (public.can_manage_offering(offering_id))
  with check (public.can_manage_offering(offering_id));

create policy "view" on public.report_card_comments for select to authenticated
  using (
    (select public.is_staff())
    or exists (select 1 from public.students s where s.id = student_id and public.is_classroom_tutor(s.classroom_id))
    or (
      student_id in (select public.my_student_ids())
      and exists (select 1 from public.grading_periods p where p.id = period_id and p.is_published)
    )
  );
create policy "tutor_write" on public.report_card_comments for all to authenticated
  using (
    (select public.is_admin())
    or exists (select 1 from public.students s where s.id = student_id and public.is_classroom_tutor(s.classroom_id))
  )
  with check (
    (select public.is_admin())
    or exists (select 1 from public.students s where s.id = student_id and public.is_classroom_tutor(s.classroom_id))
  );

-- El tutor necesita ver todos los cursos de su aula (para el consolidado).
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
        or public.is_classroom_tutor(o.classroom_id)
        or (o.is_active and o.classroom_id in (select public.family_classroom_ids()))
      )
  )
$$;

-- ----------------------------------------------------------------------------
-- 8) Resumen de asistencia por bimestre (para la libreta)
--    Tesla registra solo ingresos: los días hábiles sin registro se cuentan
--    como "sin registro", no como faltas.
-- ----------------------------------------------------------------------------
create or replace function public.period_attendance(p_period_id bigint, p_classroom_id bigint)
returns table (student_id bigint, on_time integer, late integer, school_days integer)
language sql
stable
security definer
set search_path = public
as $$
  with p as (
    select starts_on, least(ends_on, (now() at time zone 'America/Lima')::date) as until
    from public.grading_periods where id = p_period_id
  ),
  days as (
    select count(*)::int as n
    from p, generate_series(p.starts_on, p.until, interval '1 day') d
    where extract(isodow from d) between 1 and 5
  )
  select s.id,
         count(a.*) filter (where a.status = 'ON_TIME')::int,
         count(a.*) filter (where a.status = 'LATE')::int,
         (select n from days)
  from public.students s
  cross join p
  left join public.attendance a on a.student_id = s.id and a.date between p.starts_on and p.until
  where s.classroom_id = p_classroom_id
    and public.can_view_student(s.id)
  group by s.id
$$;

revoke all on function public.period_attendance(bigint, bigint) from public, anon;
grant execute on function public.period_attendance(bigint, bigint) to authenticated;

select sj.level, sj.name as area, count(c.id) as competencias
from public.subjects sj
left join public.competencies c on c.subject_id = sj.id
group by sj.level, sj.name
order by sj.level, sj.name;
