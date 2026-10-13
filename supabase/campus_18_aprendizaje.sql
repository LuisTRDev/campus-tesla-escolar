-- ============================================================================
-- CAMPUS VIRTUAL TESLA · Script 18
-- Aprendizaje: evaluaciones en línea, banco de preguntas, rúbricas, unidades,
-- foro, tareas en grupo, versiones de entregas, retroalimentación con audio e
-- imagen, comentarios guardados, publicaciones programadas, videos con
-- preguntas y duplicado de tareas y cursos.
--
-- Requiere los scripts 01 a 17. Se puede volver a ejecutar.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0) Operaciones de confianza: las funciones de este script que escriben notas
--    (evaluaciones, grupos) avisan a la regla de entregas con una marca local
--    de la transacción. La app no puede activarla: solo estas funciones.
-- ----------------------------------------------------------------------------
create or replace function public.campus_trusted_op()
returns boolean
language sql
stable
as $$ select coalesce(current_setting('campus.trusted_op', true), '') = 'on' $$;

create or replace function public.campus_set_trusted(p_on boolean)
returns void
language sql
as $$ select set_config('campus.trusted_op', case when p_on then 'on' else '' end, true) $$;

revoke all on function public.campus_set_trusted(boolean) from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 1) Unidades del curso
-- ----------------------------------------------------------------------------
create table if not exists public.course_units (
  id bigint generated always as identity primary key,
  offering_id bigint not null references public.course_offerings(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 2 and 120),
  description text check (description is null or char_length(description) <= 1000),
  position integer not null default 1,
  created_at timestamptz not null default now()
);
create index if not exists idx_course_units_offering on public.course_units(offering_id, position);

-- Materiales vistos por el alumno (avance de la unidad).
create table if not exists public.material_views (
  material_id bigint not null references public.materials(id) on delete cascade,
  student_id bigint not null references public.students(id) on delete cascade,
  first_viewed_at timestamptz not null default now(),
  primary key (material_id, student_id)
);

-- ----------------------------------------------------------------------------
-- 2) Rúbricas
--    criteria: [{ "id": "c1", "name": "...", "levels": { "AD": "...", "A": "...", "B": "...", "C": "..." } }]
-- ----------------------------------------------------------------------------
create table if not exists public.rubrics (
  id bigint generated always as identity primary key,
  owner_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 2 and 120),
  description text check (description is null or char_length(description) <= 600),
  criteria jsonb not null default '[]'::jsonb check (jsonb_typeof(criteria) = 'array' and jsonb_array_length(criteria) between 1 and 12),
  shared boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 3) Tareas: tipo (tarea o evaluación), unidad, rúbrica, grupo y programación
-- ----------------------------------------------------------------------------
alter table public.assignments add column if not exists kind text not null default 'TASK';
alter table public.assignments drop constraint if exists assignments_kind_check;
alter table public.assignments add constraint assignments_kind_check check (kind in ('TASK', 'QUIZ'));
alter table public.assignments add column if not exists unit_id bigint references public.course_units(id) on delete set null;
alter table public.assignments add column if not exists rubric_id bigint references public.rubrics(id) on delete set null;
alter table public.assignments add column if not exists is_group boolean not null default false;
-- Se publica sola en esta fecha (la tarea queda como borrador hasta entonces).
alter table public.assignments add column if not exists publish_at timestamptz;
-- Evaluaciones: { time_limit_min, max_attempts, shuffle_questions, shuffle_options, show_answers: NEVER | AFTER_SUBMIT | AFTER_DUE }
alter table public.assignments add column if not exists quiz_settings jsonb not null default '{}'::jsonb;

alter table public.materials add column if not exists unit_id bigint references public.course_units(id) on delete set null;
alter table public.materials add column if not exists publish_at timestamptz;

-- Entregas: rúbrica, audio y anotaciones del docente.
alter table public.submissions add column if not exists rubric_scores jsonb;
alter table public.submissions add column if not exists feedback_audio_path text;
-- [{ "file_index": 0, "path": "..." }] imágenes anotadas por el docente
alter table public.submissions add column if not exists feedback_annotations jsonb not null default '[]'::jsonb;

-- Historial de versiones (cada vez que el alumno vuelve a entregar).
create table if not exists public.submission_versions (
  id bigint generated always as identity primary key,
  submission_id bigint not null references public.submissions(id) on delete cascade,
  content text,
  files jsonb not null default '[]'::jsonb,
  submitted_at timestamptz,
  status text,
  score numeric(5,2),
  level text,
  feedback text,
  saved_at timestamptz not null default now()
);
create index if not exists idx_submission_versions on public.submission_versions(submission_id, saved_at desc);

-- Comentarios guardados del docente.
create table if not exists public.feedback_snippets (
  id bigint generated always as identity primary key,
  owner_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 1000),
  created_at timestamptz not null default now()
);

-- Regla de entregas: igual que antes, más las operaciones de confianza y las
-- columnas nuevas (el alumno no puede tocar la rúbrica ni la retroalimentación).
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

  -- SQL Editor, service role o funciones de confianza: no se aplica ninguna regla.
  if public.is_trusted_backend() or public.campus_trusted_op() then
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
    if v_assignment.kind = 'QUIZ' then
      raise exception 'Las evaluaciones se responden desde su pantalla.';
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
    new.rubric_scores := null;
    new.feedback_audio_path := null;
    new.feedback_annotations := '[]'::jsonb;
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
  if v_assignment.kind = 'QUIZ' then
    raise exception 'Las evaluaciones se responden desde su pantalla.';
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
  new.rubric_scores := old.rubric_scores;
  new.feedback_audio_path := old.feedback_audio_path;
  new.feedback_annotations := old.feedback_annotations;
  return new;
end;
$$;

-- Guarda la versión anterior cada vez que el alumno vuelve a entregar.
create or replace function public.save_submission_version()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.submitted_at is distinct from new.submitted_at
     and (old.content is distinct from new.content or old.files is distinct from new.files) then
    insert into public.submission_versions (submission_id, content, files, submitted_at, status, score, level, feedback)
    values (old.id, old.content, old.files, old.submitted_at, old.status, old.score, old.level, old.feedback);
  end if;
  return null;
end;
$$;

drop trigger if exists trg_submissions_versions on public.submissions;
create trigger trg_submissions_versions
after update on public.submissions
for each row execute function public.save_submission_version();

-- ----------------------------------------------------------------------------
-- 4) Tareas en grupo: una entrega y una nota para todo el equipo
-- ----------------------------------------------------------------------------
create table if not exists public.assignment_groups (
  id bigint generated always as identity primary key,
  assignment_id bigint not null references public.assignments(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  created_at timestamptz not null default now()
);

create table if not exists public.assignment_group_members (
  group_id bigint not null references public.assignment_groups(id) on delete cascade,
  assignment_id bigint not null references public.assignments(id) on delete cascade,
  student_id bigint not null references public.students(id) on delete cascade,
  primary key (group_id, student_id),
  unique (assignment_id, student_id)
);

-- Copia la entrega (o la nota) al resto del equipo.
create or replace function public.sync_group_submission()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group bigint;
  m record;
begin
  if pg_trigger_depth() > 1 then
    return null;
  end if;
  if not exists (select 1 from public.assignments where id = new.assignment_id and is_group) then
    return null;
  end if;
  select group_id into v_group from public.assignment_group_members where assignment_id = new.assignment_id and student_id = new.student_id;
  if v_group is null then
    return null;
  end if;

  perform public.campus_set_trusted(true);
  for m in
    select gm.student_id from public.assignment_group_members gm
    where gm.group_id = v_group and gm.student_id <> new.student_id
  loop
    insert into public.submissions (assignment_id, student_id, content, files, status, submitted_at, is_late,
                                    score, level, feedback, graded_by, graded_at, rubric_scores, feedback_audio_path, feedback_annotations)
    values (new.assignment_id, m.student_id, new.content, new.files, new.status, new.submitted_at, new.is_late,
            new.score, new.level, new.feedback, new.graded_by, new.graded_at, new.rubric_scores, new.feedback_audio_path, new.feedback_annotations)
    on conflict (assignment_id, student_id) do update
      set content = excluded.content, files = excluded.files, status = excluded.status, submitted_at = excluded.submitted_at,
          is_late = excluded.is_late, score = excluded.score, level = excluded.level, feedback = excluded.feedback,
          graded_by = excluded.graded_by, graded_at = excluded.graded_at, rubric_scores = excluded.rubric_scores,
          feedback_audio_path = excluded.feedback_audio_path, feedback_annotations = excluded.feedback_annotations;
  end loop;
  perform public.campus_set_trusted(false);
  return null;
end;
$$;

drop trigger if exists trg_submissions_group_sync on public.submissions;
create trigger trg_submissions_group_sync
after insert or update on public.submissions
for each row execute function public.sync_group_submission();

-- Arma los grupos de una tarea: [{ "name": "Grupo 1", "students": [1, 2, 3] }, ...]
create or replace function public.set_assignment_groups(p_assignment_id bigint, p_groups jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  g jsonb;
  v_group bigint;
  v_offering bigint;
begin
  if not public.can_manage_assignment(p_assignment_id) then
    raise exception 'Solo el docente del curso arma los grupos.';
  end if;
  select offering_id into v_offering from public.assignments where id = p_assignment_id;
  delete from public.assignment_groups where assignment_id = p_assignment_id;
  for g in select * from jsonb_array_elements(coalesce(p_groups, '[]'::jsonb)) loop
    insert into public.assignment_groups (assignment_id, name)
    values (p_assignment_id, left(coalesce(nullif(btrim(g ->> 'name'), ''), 'Grupo'), 60))
    returning id into v_group;
    insert into public.assignment_group_members (group_id, assignment_id, student_id)
    select v_group, p_assignment_id, s.id
    from jsonb_array_elements_text(coalesce(g -> 'students', '[]'::jsonb)) x
    join public.students s on s.id = x::bigint
    join public.course_offerings o on o.id = v_offering and o.classroom_id = s.classroom_id
    on conflict (assignment_id, student_id) do nothing;
  end loop;
  update public.assignments set is_group = exists (select 1 from public.assignment_groups where assignment_id = p_assignment_id)
  where id = p_assignment_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- 5) Evaluaciones en línea y banco de preguntas
--    Tipos: SINGLE (una correcta), MULTI (varias), TRUE_FALSE, MATCH (relacionar),
--           SHORT (respuesta corta), OPEN (desarrollo; la corrige el docente).
--    options: SINGLE/MULTI → [{ "id": "a", "text": "..." }]
--             MATCH → { "left": [{ "id", "text" }], "right": [{ "id", "text" }] }
--    answer:  SINGLE → "a" · MULTI → ["a","c"] · TRUE_FALSE → true · MATCH → { "l1": "r2" }
--             SHORT → ["respuesta", "otra válida"] · OPEN → null
-- ----------------------------------------------------------------------------
create table if not exists public.quiz_questions (
  id bigint generated always as identity primary key,
  assignment_id bigint not null references public.assignments(id) on delete cascade,
  position integer not null default 1,
  type text not null check (type in ('SINGLE', 'MULTI', 'TRUE_FALSE', 'MATCH', 'SHORT', 'OPEN')),
  prompt text not null check (char_length(btrim(prompt)) between 1 and 2000),
  options jsonb not null default '[]'::jsonb,
  points numeric(5,2) not null default 1 check (points > 0 and points <= 100),
  explanation text check (explanation is null or char_length(explanation) <= 1000),
  created_at timestamptz not null default now()
);
create index if not exists idx_quiz_questions on public.quiz_questions(assignment_id, position);

-- Las respuestas correctas van aparte: los alumnos nunca pueden leerlas.
create table if not exists public.quiz_answer_keys (
  question_id bigint primary key references public.quiz_questions(id) on delete cascade,
  answer jsonb
);

create table if not exists public.quiz_attempts (
  id bigint generated always as identity primary key,
  assignment_id bigint not null references public.assignments(id) on delete cascade,
  student_id bigint not null references public.students(id) on delete cascade,
  attempt_no smallint not null default 1,
  started_at timestamptz not null default now(),
  deadline_at timestamptz,
  finished_at timestamptz,
  question_order bigint[] not null default '{}',
  option_orders jsonb not null default '{}'::jsonb,
  answers jsonb not null default '{}'::jsonb,
  results jsonb not null default '{}'::jsonb,
  auto_points numeric(7,2),
  manual_points numeric(7,2),
  max_points numeric(7,2),
  needs_review boolean not null default false,
  unique (assignment_id, student_id, attempt_no)
);
create index if not exists idx_quiz_attempts_student on public.quiz_attempts(student_id, started_at desc);

create table if not exists public.question_bank (
  id bigint generated always as identity primary key,
  owner_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  subject_id bigint references public.subjects(id) on delete set null,
  grade text check (grade is null or char_length(grade) <= 20),
  level text check (level is null or level in ('Inicial', 'Primaria', 'Secundaria')),
  shared boolean not null default true,
  type text not null check (type in ('SINGLE', 'MULTI', 'TRUE_FALSE', 'MATCH', 'SHORT', 'OPEN')),
  prompt text not null check (char_length(btrim(prompt)) between 1 and 2000),
  options jsonb not null default '[]'::jsonb,
  answer jsonb,
  points numeric(5,2) not null default 1 check (points > 0 and points <= 100),
  explanation text check (explanation is null or char_length(explanation) <= 1000),
  tags text[] not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists idx_question_bank_subject on public.question_bank(subject_id, grade);

-- Texto normalizado para comparar respuestas cortas (sin tildes ni mayúsculas).
create or replace function public.campus_norm(p text)
returns text
language sql
immutable
as $$
  select regexp_replace(lower(translate(btrim(coalesce(p, '')), 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun')), '\s+', ' ', 'g')
$$;

-- Guarda una pregunta con su respuesta (crea o edita).
create or replace function public.quiz_save_question(p_assignment_id bigint, p_question jsonb)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id bigint := nullif(p_question ->> 'id', '')::bigint;
  v_type text := p_question ->> 'type';
begin
  if not public.can_manage_assignment(p_assignment_id) then
    raise exception 'Solo el docente del curso edita la evaluación.';
  end if;
  if v_type not in ('SINGLE', 'MULTI', 'TRUE_FALSE', 'MATCH', 'SHORT', 'OPEN') then
    raise exception 'Tipo de pregunta no válido.';
  end if;
  if char_length(btrim(coalesce(p_question ->> 'prompt', ''))) = 0 then
    raise exception 'Escribe la pregunta.';
  end if;
  if v_type <> 'OPEN' and (p_question -> 'answer' is null or jsonb_typeof(p_question -> 'answer') = 'null') then
    raise exception 'Marca la respuesta correcta.';
  end if;

  if v_id is null then
    insert into public.quiz_questions (assignment_id, position, type, prompt, options, points, explanation)
    values (p_assignment_id,
            coalesce((p_question ->> 'position')::int, (select coalesce(max(position), 0) + 1 from public.quiz_questions where assignment_id = p_assignment_id)),
            v_type, btrim(p_question ->> 'prompt'), coalesce(p_question -> 'options', '[]'::jsonb),
            coalesce((p_question ->> 'points')::numeric, 1), nullif(btrim(coalesce(p_question ->> 'explanation', '')), ''))
    returning id into v_id;
  else
    update public.quiz_questions
    set type = v_type, prompt = btrim(p_question ->> 'prompt'), options = coalesce(p_question -> 'options', '[]'::jsonb),
        points = coalesce((p_question ->> 'points')::numeric, points),
        position = coalesce((p_question ->> 'position')::int, position),
        explanation = nullif(btrim(coalesce(p_question ->> 'explanation', '')), '')
    where id = v_id and assignment_id = p_assignment_id;
    if not found then
      raise exception 'La pregunta no es de esta evaluación.';
    end if;
  end if;
  insert into public.quiz_answer_keys (question_id, answer) values (v_id, p_question -> 'answer')
  on conflict (question_id) do update set answer = excluded.answer;
  return v_id;
end;
$$;

-- Preguntas con respuestas (solo el docente) para el editor.
create or replace function public.quiz_editor(p_assignment_id bigint)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case when public.can_manage_assignment(p_assignment_id) then coalesce((
    select jsonb_agg(jsonb_build_object('id', q.id, 'position', q.position, 'type', q.type, 'prompt', q.prompt, 'options', q.options,
      'points', q.points, 'explanation', q.explanation, 'answer', k.answer) order by q.position, q.id)
    from public.quiz_questions q left join public.quiz_answer_keys k on k.question_id = q.id
    where q.assignment_id = p_assignment_id), '[]'::jsonb) end
$$;

-- Copia preguntas del banco a la evaluación.
create or replace function public.quiz_import_from_bank(p_assignment_id bigint, p_ids bigint[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  b record;
  v_pos integer;
  v_id bigint;
  v_count integer := 0;
begin
  if not public.can_manage_assignment(p_assignment_id) then
    raise exception 'Solo el docente del curso edita la evaluación.';
  end if;
  select coalesce(max(position), 0) into v_pos from public.quiz_questions where assignment_id = p_assignment_id;
  for b in
    select * from public.question_bank qb
    where qb.id = any(p_ids) and (qb.shared or qb.owner_id = auth.uid() or public.is_admin())
    order by array_position(p_ids, qb.id)
  loop
    v_pos := v_pos + 1;
    insert into public.quiz_questions (assignment_id, position, type, prompt, options, points, explanation)
    values (p_assignment_id, v_pos, b.type, b.prompt, b.options, b.points, b.explanation)
    returning id into v_id;
    insert into public.quiz_answer_keys (question_id, answer) values (v_id, b.answer);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- Guarda una pregunta de la evaluación en el banco.
create or replace function public.quiz_question_to_bank(p_question_id bigint, p_shared boolean default true)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  q record;
  v_id bigint;
begin
  select qq.*, k.answer, o.subject_id, c.grade, c.level as c_level
  into q
  from public.quiz_questions qq
  join public.assignments a on a.id = qq.assignment_id
  join public.course_offerings o on o.id = a.offering_id
  join public.classrooms c on c.id = o.classroom_id
  left join public.quiz_answer_keys k on k.question_id = qq.id
  where qq.id = p_question_id;
  if not found or not public.can_manage_assignment(q.assignment_id) then
    raise exception 'No puedes copiar esta pregunta.';
  end if;
  insert into public.question_bank (subject_id, grade, level, shared, type, prompt, options, answer, points, explanation)
  values (q.subject_id, q.grade::text, case when q.c_level in ('Inicial', 'Primaria', 'Secundaria') then q.c_level end,
          coalesce(p_shared, true), q.type, q.prompt, q.options, q.answer, q.points, q.explanation)
  returning id into v_id;
  return v_id;
end;
$$;

-- Calcula los puntos de una respuesta. Devuelve null si la corrige el docente.
create or replace function public.quiz_grade_answer(p_type text, p_key jsonb, p_answer jsonb, p_points numeric)
returns numeric
language plpgsql
immutable
as $$
declare
  v_total integer;
  v_ok integer;
begin
  if p_type = 'OPEN' then
    return null;
  end if;
  if p_answer is null or jsonb_typeof(p_answer) = 'null' then
    return 0;
  end if;
  case p_type
    when 'SINGLE' then
      return case when p_answer #>> '{}' = p_key #>> '{}' then p_points else 0 end;
    when 'TRUE_FALSE' then
      return case when (p_answer #>> '{}')::boolean = (p_key #>> '{}')::boolean then p_points else 0 end;
    when 'MULTI' then
      return case when (select coalesce(array_agg(x order by x), '{}') from jsonb_array_elements_text(p_answer) x)
                     = (select coalesce(array_agg(x order by x), '{}') from jsonb_array_elements_text(p_key) x)
                  then p_points else 0 end;
    when 'MATCH' then
      select count(*), count(*) filter (where p_answer ->> k.key = k.value) into v_total, v_ok
      from jsonb_each_text(p_key) k;
      return case when v_total = 0 then 0 else round(p_points * v_ok / v_total, 2) end;
    when 'SHORT' then
      return case when exists (
        select 1 from jsonb_array_elements_text(p_key) k where public.campus_norm(k) = public.campus_norm(p_answer #>> '{}')
      ) then p_points else 0 end;
    else
      return 0;
  end case;
exception when others then
  return 0;
end;
$$;

-- Nivel AD / A / B / C desde una nota sobre 20 (igual que la app).
create or replace function public.campus_level_from_20(p numeric)
returns text
language sql
immutable
as $$ select case when p >= 17.5 then 'AD' when p >= 13.5 then 'A' when p >= 10.5 then 'B' else 'C' end $$;

-- Vista de las preguntas para el alumno (sin respuestas, en su orden).
create or replace function public.quiz_attempt_view(p_attempt_id bigint)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'attempt_id', t.id, 'attempt_no', t.attempt_no, 'started_at', t.started_at, 'deadline_at', t.deadline_at,
    'finished_at', t.finished_at, 'answers', t.answers,
    'questions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', q.id, 'type', q.type, 'prompt', q.prompt, 'points', q.points,
        'options', case
          when q.type in ('SINGLE', 'MULTI') and t.option_orders ? q.id::text then (
            select jsonb_agg(o order by array_position(array(select jsonb_array_elements_text(t.option_orders -> q.id::text)), o ->> 'id'))
            from jsonb_array_elements(q.options) o)
          when q.type = 'MATCH' and t.option_orders ? q.id::text then jsonb_build_object(
            'left', q.options -> 'left',
            'right', (select jsonb_agg(o order by array_position(array(select jsonb_array_elements_text(t.option_orders -> q.id::text)), o ->> 'id'))
                      from jsonb_array_elements(q.options -> 'right') o))
          else q.options end
      ) order by array_position(t.question_order, q.id))
      from public.quiz_questions q where q.id = any(t.question_order)
    ), '[]'::jsonb)
  )
  from public.quiz_attempts t where t.id = p_attempt_id
$$;

-- Empieza (o retoma) un intento.
create or replace function public.quiz_start(p_assignment_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sid bigint := public.my_self_student_id();
  a public.assignments%rowtype;
  t public.quiz_attempts%rowtype;
  v_cfg jsonb;
  v_max integer;
  v_used integer;
  v_order bigint[];
  v_opts jsonb := '{}'::jsonb;
  q record;
begin
  if v_sid is null then
    raise exception 'Solo el alumno puede rendir la evaluación desde su cuenta.';
  end if;
  select * into a from public.assignments where id = p_assignment_id;
  if not found or a.kind <> 'QUIZ' or not public.can_view_offering(a.offering_id) then
    raise exception 'Esta evaluación no está disponible.';
  end if;
  if a.status <> 'PUBLISHED' then
    raise exception 'La evaluación no está abierta.';
  end if;
  v_cfg := coalesce(a.quiz_settings, '{}'::jsonb);

  -- Intento en curso: se retoma (si no venció el tiempo).
  select * into t from public.quiz_attempts
  where assignment_id = a.id and student_id = v_sid and finished_at is null
  order by attempt_no desc limit 1;
  if found then
    if t.deadline_at is not null and now() > t.deadline_at + interval '30 seconds' then
      perform public.quiz_finish(t.id, t.answers);
    else
      return public.quiz_attempt_view(t.id);
    end if;
  end if;

  if a.due_at is not null and now() > a.due_at and not a.allow_late then
    raise exception 'La evaluación ya cerró.';
  end if;
  v_max := coalesce(nullif(v_cfg ->> 'max_attempts', '')::int, 1);
  select count(*) into v_used from public.quiz_attempts where assignment_id = a.id and student_id = v_sid;
  if v_used >= v_max then
    raise exception 'Ya usaste tus % intento(s).', v_max;
  end if;
  if not exists (select 1 from public.quiz_questions where assignment_id = a.id) then
    raise exception 'La evaluación todavía no tiene preguntas.';
  end if;

  if coalesce((v_cfg ->> 'shuffle_questions')::boolean, false) then
    select array_agg(id order by random()) into v_order from public.quiz_questions where assignment_id = a.id;
  else
    select array_agg(id order by position, id) into v_order from public.quiz_questions where assignment_id = a.id;
  end if;
  if coalesce((v_cfg ->> 'shuffle_options')::boolean, false) then
    for q in select id, type, options from public.quiz_questions where assignment_id = a.id and type in ('SINGLE', 'MULTI', 'MATCH') loop
      v_opts := v_opts || jsonb_build_object(q.id::text, (
        select jsonb_agg(o ->> 'id' order by random())
        from jsonb_array_elements(case when q.type = 'MATCH' then q.options -> 'right' else q.options end) o));
    end loop;
  elsif exists (select 1 from public.quiz_questions where assignment_id = a.id and type = 'MATCH') then
    -- Las columnas de "relacionar" siempre se mezclan (si no, la respuesta sería obvia).
    for q in select id, options from public.quiz_questions where assignment_id = a.id and type = 'MATCH' loop
      v_opts := v_opts || jsonb_build_object(q.id::text, (select jsonb_agg(o ->> 'id' order by random()) from jsonb_array_elements(q.options -> 'right') o));
    end loop;
  end if;

  insert into public.quiz_attempts (assignment_id, student_id, attempt_no, deadline_at, question_order, option_orders, max_points)
  values (a.id, v_sid, v_used + 1,
          case when nullif(v_cfg ->> 'time_limit_min', '')::int > 0 then now() + make_interval(mins => (v_cfg ->> 'time_limit_min')::int) end,
          v_order, v_opts, (select sum(points) from public.quiz_questions where assignment_id = a.id))
  returning * into t;
  return public.quiz_attempt_view(t.id);
end;
$$;

-- Guardado automático mientras responde.
create or replace function public.quiz_save(p_attempt_id bigint, p_answers jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.quiz_attempts
  set answers = coalesce(p_answers, '{}'::jsonb)
  where id = p_attempt_id and student_id = public.my_self_student_id() and finished_at is null
    and (deadline_at is null or now() <= deadline_at + interval '30 seconds');
end;
$$;

-- Nota del alumno en la evaluación: el mejor intento terminado.
create or replace function public.quiz_sync_submission(p_assignment_id bigint, p_student_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  a public.assignments%rowtype;
  best record;
  v_pending boolean;
  v_score numeric;
  v_level text;
  v_content text;
begin
  select * into a from public.assignments where id = p_assignment_id;
  select t.*, coalesce(t.auto_points, 0) + coalesce(t.manual_points, 0) as pts into best
  from public.quiz_attempts t
  where t.assignment_id = p_assignment_id and t.student_id = p_student_id and t.finished_at is not null
  order by (not t.needs_review) desc, coalesce(t.auto_points, 0) + coalesce(t.manual_points, 0) desc, t.attempt_no desc
  limit 1;
  if not found then
    return;
  end if;
  v_pending := best.needs_review;
  if not v_pending and coalesce(best.max_points, 0) > 0 then
    v_score := round(best.pts / best.max_points * a.max_score, 2);
    v_level := public.campus_level_from_20(best.pts / best.max_points * 20);
  end if;
  v_content := 'Evaluación en línea · intento ' || best.attempt_no || ' · ' || round(best.pts, 2) || ' de ' || round(coalesce(best.max_points, 0), 2) || ' puntos'
    || case when v_pending then ' (falta revisar preguntas de desarrollo)' else '' end;

  perform public.campus_set_trusted(true);
  insert into public.submissions (assignment_id, student_id, content, status, submitted_at, is_late, score, level, graded_at)
  values (a.id, p_student_id, v_content,
          case when v_pending then 'SUBMITTED' else 'GRADED' end,
          best.finished_at, a.due_at is not null and best.finished_at > a.due_at,
          case when a.grading_type = 'SCORE' then v_score end,
          case when a.grading_type = 'LEVEL' then v_level end,
          case when v_pending then null else now() end)
  on conflict (assignment_id, student_id) do update
    set content = excluded.content, status = excluded.status, submitted_at = excluded.submitted_at, is_late = excluded.is_late,
        score = excluded.score, level = excluded.level, graded_at = excluded.graded_at;
  perform public.campus_set_trusted(false);
end;
$$;

-- Termina el intento, corrige y pasa la nota a la entrega.
create or replace function public.quiz_finish(p_attempt_id bigint, p_answers jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  t public.quiz_attempts%rowtype;
  q record;
  v_pts numeric;
  v_auto numeric := 0;
  v_review boolean := false;
  v_results jsonb := '{}'::jsonb;
  v_answers jsonb;
begin
  select * into t from public.quiz_attempts where id = p_attempt_id for update;
  if not found then
    raise exception 'El intento no existe.';
  end if;
  -- Lo cierra el alumno, o el sistema al retomar un intento vencido.
  if t.student_id is distinct from public.my_self_student_id() and not public.can_manage_assignment(t.assignment_id) then
    raise exception 'No puedes cerrar este intento.';
  end if;
  if t.finished_at is not null then
    return jsonb_build_object('attempt_id', t.id, 'already', true);
  end if;
  -- Si se pasó del tiempo, vale lo último que guardó.
  v_answers := case when t.deadline_at is not null and now() > t.deadline_at + interval '30 seconds' then t.answers else coalesce(p_answers, t.answers) end;

  for q in
    select qq.id, qq.type, qq.points, k.answer as key
    from public.quiz_questions qq left join public.quiz_answer_keys k on k.question_id = qq.id
    where qq.id = any(t.question_order)
  loop
    v_pts := public.quiz_grade_answer(q.type, q.key, v_answers -> q.id::text, q.points);
    if v_pts is null then
      v_review := true;
    else
      v_auto := v_auto + v_pts;
    end if;
    v_results := v_results || jsonb_build_object(q.id::text, v_pts);
  end loop;

  update public.quiz_attempts
  set answers = v_answers, results = v_results, auto_points = v_auto, needs_review = v_review, finished_at = now()
  where id = t.id;
  perform public.quiz_sync_submission(t.assignment_id, t.student_id);
  return jsonb_build_object('attempt_id', t.id, 'auto_points', v_auto, 'max_points', t.max_points, 'needs_review', v_review);
end;
$$;

-- El docente pone los puntos de las preguntas de desarrollo: { "questionId": puntos }
create or replace function public.quiz_grade_open(p_attempt_id bigint, p_points jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  t public.quiz_attempts%rowtype;
  v_manual numeric := 0;
  v_results jsonb;
  q record;
  v_p numeric;
begin
  select * into t from public.quiz_attempts where id = p_attempt_id for update;
  if not found or not public.can_manage_assignment(t.assignment_id) then
    raise exception 'Solo el docente del curso revisa la evaluación.';
  end if;
  v_results := t.results;
  for q in select qq.id, qq.points from public.quiz_questions qq where qq.id = any(t.question_order) and qq.type = 'OPEN' loop
    v_p := least(q.points, greatest(0, coalesce((p_points ->> q.id::text)::numeric, 0)));
    v_manual := v_manual + v_p;
    v_results := v_results || jsonb_build_object(q.id::text, v_p);
  end loop;
  update public.quiz_attempts set manual_points = v_manual, results = v_results, needs_review = false where id = t.id;
  perform public.quiz_sync_submission(t.assignment_id, t.student_id);
end;
$$;

-- Revisión de un intento: respuestas del alumno y, si corresponde, las correctas.
create or replace function public.quiz_review(p_attempt_id bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  t public.quiz_attempts%rowtype;
  a public.assignments%rowtype;
  v_manager boolean;
  v_show boolean;
begin
  select * into t from public.quiz_attempts where id = p_attempt_id;
  if not found then
    raise exception 'El intento no existe.';
  end if;
  select * into a from public.assignments where id = t.assignment_id;
  v_manager := public.can_manage_assignment(a.id) or public.is_staff();
  if not v_manager and not public.can_view_student(t.student_id) then
    raise exception 'No puedes ver este intento.';
  end if;
  if t.finished_at is null and not v_manager then
    raise exception 'El intento todavía no termina.';
  end if;
  v_show := v_manager or case coalesce(a.quiz_settings ->> 'show_answers', 'AFTER_SUBMIT')
    when 'AFTER_SUBMIT' then true
    when 'AFTER_DUE' then a.due_at is null or now() > a.due_at
    else false end;
  return public.quiz_attempt_view(t.id) || jsonb_build_object(
    'results', t.results, 'auto_points', t.auto_points, 'manual_points', t.manual_points, 'max_points', t.max_points,
    'needs_review', t.needs_review, 'show_answers', v_show,
    'keys', case when v_show then coalesce((
      select jsonb_object_agg(q.id::text, jsonb_build_object('answer', k.answer, 'explanation', q.explanation))
      from public.quiz_questions q left join public.quiz_answer_keys k on k.question_id = q.id
      where q.id = any(t.question_order)), '{}'::jsonb) end
  );
end;
$$;

-- ----------------------------------------------------------------------------
-- 6) Foro del curso
-- ----------------------------------------------------------------------------
create table if not exists public.forum_threads (
  id bigint generated always as identity primary key,
  offering_id bigint not null references public.course_offerings(id) on delete cascade,
  author_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 3 and 160),
  body text not null check (char_length(btrim(body)) between 1 and 5000),
  pinned boolean not null default false,
  locked boolean not null default false,
  hidden boolean not null default false,
  posts_count integer not null default 0,
  last_post_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists idx_forum_threads on public.forum_threads(offering_id, pinned desc, last_post_at desc);

create table if not exists public.forum_posts (
  id bigint generated always as identity primary key,
  thread_id bigint not null references public.forum_threads(id) on delete cascade,
  author_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 4000),
  is_best boolean not null default false,
  hidden boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists idx_forum_posts on public.forum_posts(thread_id, created_at);

-- ¿Puede escribir en el foro? El docente del curso y los alumnos del aula.
create or replace function public.can_post_forum(p_offering_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.can_manage_offering(p_offering_id)
    or exists (
      select 1 from public.course_offerings o join public.students s on s.classroom_id = o.classroom_id
      where o.id = p_offering_id and s.id = public.my_self_student_id()
    )
$$;

create or replace function public.forum_post_stats()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_thread public.forum_threads%rowtype;
begin
  select * into v_thread from public.forum_threads where id = new.thread_id;
  if v_thread.locked and not public.can_manage_offering(v_thread.offering_id) then
    raise exception 'Este tema está cerrado.';
  end if;
  update public.forum_threads set posts_count = posts_count + 1, last_post_at = now() where id = new.thread_id;
  return new;
end;
$$;

drop trigger if exists trg_forum_post_stats on public.forum_posts;
create trigger trg_forum_post_stats before insert on public.forum_posts
for each row execute function public.forum_post_stats();

-- Temas y respuestas con el nombre de quien escribe (los alumnos no leen perfiles ajenos).
create or replace function public.forum_threads_view(p_offering_id bigint)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case when public.can_view_offering(p_offering_id) then coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', t.id, 'title', t.title, 'body', t.body, 'pinned', t.pinned, 'locked', t.locked, 'hidden', t.hidden,
      'posts_count', t.posts_count, 'last_post_at', t.last_post_at, 'created_at', t.created_at,
      'author_id', t.author_id, 'author_name', p.full_name, 'author_role', p.role,
      'has_best', exists (select 1 from public.forum_posts fp where fp.thread_id = t.id and fp.is_best)
    ) order by t.pinned desc, t.last_post_at desc)
    from public.forum_threads t left join public.profiles p on p.id = t.author_id
    where t.offering_id = p_offering_id and (not t.hidden or public.can_manage_offering(p_offering_id))
  ), '[]'::jsonb) end
$$;

create or replace function public.forum_posts_view(p_thread_id bigint)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case when public.can_view_offering(t.offering_id) then coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', fp.id, 'body', case when fp.hidden and not public.can_manage_offering(t.offering_id) then null else fp.body end,
      'hidden', fp.hidden, 'is_best', fp.is_best, 'created_at', fp.created_at,
      'author_id', fp.author_id, 'author_name', p.full_name, 'author_role', p.role
    ) order by fp.is_best desc, fp.created_at)
    from public.forum_posts fp left join public.profiles p on p.id = fp.author_id
    where fp.thread_id = t.id
  ), '[]'::jsonb) end
  from public.forum_threads t where t.id = p_thread_id
$$;

-- Moderación: fijar, cerrar u ocultar un tema; ocultar una respuesta; elegir la mejor.
create or replace function public.forum_moderate(p_kind text, p_id bigint, p_value boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_thread public.forum_threads%rowtype;
  v_post public.forum_posts%rowtype;
begin
  if p_kind in ('PIN', 'LOCK', 'HIDE_THREAD') then
    select * into v_thread from public.forum_threads where id = p_id;
    if not public.can_manage_offering(v_thread.offering_id) then
      raise exception 'Solo el docente modera el foro.';
    end if;
    update public.forum_threads set
      pinned = case when p_kind = 'PIN' then p_value else pinned end,
      locked = case when p_kind = 'LOCK' then p_value else locked end,
      hidden = case when p_kind = 'HIDE_THREAD' then p_value else hidden end
    where id = p_id;
  elsif p_kind in ('HIDE_POST', 'BEST') then
    select * into v_post from public.forum_posts where id = p_id;
    select * into v_thread from public.forum_threads where id = v_post.thread_id;
    if p_kind = 'HIDE_POST' and not public.can_manage_offering(v_thread.offering_id) then
      raise exception 'Solo el docente modera el foro.';
    end if;
    if p_kind = 'BEST' and not (public.can_manage_offering(v_thread.offering_id) or v_thread.author_id = auth.uid()) then
      raise exception 'Solo quien preguntó o el docente eligen la mejor respuesta.';
    end if;
    if p_kind = 'BEST' then
      update public.forum_posts set is_best = false where thread_id = v_thread.id;
      update public.forum_posts set is_best = p_value where id = p_id;
    else
      update public.forum_posts set hidden = p_value where id = p_id;
    end if;
  else
    raise exception 'Acción no válida.';
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- 7) Videos con preguntas intercaladas
-- ----------------------------------------------------------------------------
create table if not exists public.material_checkpoints (
  id bigint generated always as identity primary key,
  material_id bigint not null references public.materials(id) on delete cascade,
  at_seconds integer not null check (at_seconds >= 0),
  question text not null check (char_length(btrim(question)) between 1 and 500),
  options jsonb not null default '[]'::jsonb check (jsonb_typeof(options) = 'array'),
  answer_index integer,
  created_at timestamptz not null default now()
);
create index if not exists idx_material_checkpoints on public.material_checkpoints(material_id, at_seconds);

create table if not exists public.material_checkpoint_answers (
  checkpoint_id bigint not null references public.material_checkpoints(id) on delete cascade,
  student_id bigint not null references public.students(id) on delete cascade,
  answer_index integer not null,
  correct boolean,
  answered_at timestamptz not null default now(),
  primary key (checkpoint_id, student_id)
);

create or replace function public.answer_checkpoint(p_checkpoint_id bigint, p_answer_index integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.material_checkpoints%rowtype;
  v_sid bigint := public.my_self_student_id();
  v_ok boolean;
begin
  select * into c from public.material_checkpoints where id = p_checkpoint_id;
  if not found or v_sid is null then
    return jsonb_build_object('correct', null);
  end if;
  v_ok := case when c.answer_index is null then null else c.answer_index = p_answer_index end;
  insert into public.material_checkpoint_answers (checkpoint_id, student_id, answer_index, correct)
  values (c.id, v_sid, p_answer_index, v_ok)
  on conflict (checkpoint_id, student_id) do update set answer_index = excluded.answer_index, correct = excluded.correct, answered_at = now();
  return jsonb_build_object('correct', v_ok, 'answer_index', c.answer_index);
end;
$$;

create or replace function public.mark_material_viewed(p_material_id bigint)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.material_views (material_id, student_id)
  select m.id, public.my_self_student_id() from public.materials m
  where m.id = p_material_id and public.my_self_student_id() is not null and public.can_view_offering(m.offering_id)
  on conflict do nothing
$$;

-- ----------------------------------------------------------------------------
-- 8) Publicaciones programadas
-- ----------------------------------------------------------------------------
create table if not exists public.scheduled_announcements (
  id bigint generated always as identity primary key,
  author_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  scope text not null check (scope in ('COURSE', 'CLASSROOM', 'SCHOOL')),
  offering_id bigint references public.course_offerings(id) on delete cascade,
  classroom_id bigint references public.classrooms(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 2 and 140),
  body text not null check (char_length(body) <= 5000),
  publish_at timestamptz not null,
  created_at timestamptz not null default now()
);

-- Publica lo que ya llegó a su fecha. La app la llama al abrir pantallas
-- (y se puede programar con pg_cron, ver al final).
create or replace function public.publish_due_content()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
  n integer;
  s record;
begin
  update public.assignments set status = 'PUBLISHED', publish_at = null
  where status = 'DRAFT' and publish_at is not null and publish_at <= now();
  get diagnostics n = row_count;
  v_count := v_count + n;

  update public.materials set published = true, publish_at = null
  where not published and publish_at is not null and publish_at <= now();
  get diagnostics n = row_count;
  v_count := v_count + n;

  for s in select * from public.scheduled_announcements where publish_at <= now() for update skip locked loop
    insert into public.announcements (scope, offering_id, classroom_id, author_id, title, body, published_at)
    values (s.scope, s.offering_id, s.classroom_id, s.author_id, s.title, s.body, s.publish_at);
    delete from public.scheduled_announcements where id = s.id;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- ----------------------------------------------------------------------------
-- 9) Duplicar tareas y cursos
-- ----------------------------------------------------------------------------
create or replace function public.duplicate_assignment(p_assignment_id bigint, p_target_offering_ids bigint[], p_as_draft boolean default true)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  a public.assignments%rowtype;
  v_target bigint;
  v_new bigint;
  v_count integer := 0;
  v_subject bigint;
begin
  select * into a from public.assignments where id = p_assignment_id;
  if not found or not public.can_manage_assignment(a.id) then
    raise exception 'No puedes copiar esta tarea.';
  end if;
  select subject_id into v_subject from public.course_offerings where id = a.offering_id;
  foreach v_target in array coalesce(p_target_offering_ids, '{}') loop
    if not public.can_manage_offering(v_target) then
      raise exception 'No eres docente de uno de los cursos de destino.';
    end if;
    insert into public.assignments (offering_id, author_id, title, instructions, due_at, grading_type, max_score, allow_late, status,
                                    attachment_path, attachment_name, kind, rubric_id, quiz_settings)
    values (v_target, auth.uid(), a.title, a.instructions, case when p_as_draft then null else a.due_at end, a.grading_type, a.max_score,
            a.allow_late, case when p_as_draft then 'DRAFT' else 'PUBLISHED' end, a.attachment_path, a.attachment_name, a.kind, a.rubric_id, a.quiz_settings)
    returning id into v_new;
    insert into public.quiz_questions (assignment_id, position, type, prompt, options, points, explanation)
    select v_new, q.position, q.type, q.prompt, q.options, q.points, q.explanation
    from public.quiz_questions q where q.assignment_id = a.id order by q.position, q.id;
    insert into public.quiz_answer_keys (question_id, answer)
    select nq.id, k.answer
    from public.quiz_questions oq
    join public.quiz_answer_keys k on k.question_id = oq.id
    join public.quiz_questions nq on nq.assignment_id = v_new and nq.position = oq.position and nq.prompt = oq.prompt
    where oq.assignment_id = a.id
    on conflict (question_id) do nothing;
    -- Mismas competencias si el curso de destino es de la misma área.
    if (select subject_id from public.course_offerings where id = v_target) = v_subject then
      insert into public.assignment_competencies (assignment_id, competency_id)
      select v_new, ac.competency_id from public.assignment_competencies ac where ac.assignment_id = a.id
      on conflict do nothing;
    end if;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- Copia unidades, materiales y tareas (como borrador) de un curso a otro.
create or replace function public.duplicate_offering_content(p_from_offering bigint, p_to_offering bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  u record;
  v_unit bigint;
  v_map jsonb := '{}'::jsonb;
  v_m integer;
  a record;
  v_a integer := 0;
begin
  if not public.can_manage_offering(p_from_offering) or not public.can_manage_offering(p_to_offering) then
    raise exception 'Debes ser docente de ambos cursos.';
  end if;
  if p_from_offering = p_to_offering then
    raise exception 'Elige un curso distinto.';
  end if;
  for u in select * from public.course_units where offering_id = p_from_offering order by position loop
    insert into public.course_units (offering_id, title, description, position) values (p_to_offering, u.title, u.description, u.position)
    returning id into v_unit;
    v_map := v_map || jsonb_build_object(u.id::text, v_unit);
  end loop;
  insert into public.materials (offering_id, author_id, title, description, unit, kind, url, storage_path, file_name, file_size, mime_type, published, unit_id)
  select p_to_offering, auth.uid(), m.title, m.description, m.unit, m.kind, m.url, m.storage_path, m.file_name, m.file_size, m.mime_type, false,
         (v_map ->> m.unit_id::text)::bigint
  from public.materials m where m.offering_id = p_from_offering;
  get diagnostics v_m = row_count;
  for a in select id, unit_id from public.assignments where offering_id = p_from_offering loop
    perform public.duplicate_assignment(a.id, array[p_to_offering], true);
    update public.assignments set unit_id = (v_map ->> a.unit_id::text)::bigint
    where id = (select max(id) from public.assignments where offering_id = p_to_offering);
    v_a := v_a + 1;
  end loop;
  return jsonb_build_object('units', (select count(*) from jsonb_object_keys(v_map)), 'materials', v_m, 'assignments', v_a);
end;
$$;

-- ----------------------------------------------------------------------------
-- 9b) Portada del curso (una escena animada del Perfil Tesla)
-- ----------------------------------------------------------------------------
alter table public.course_offerings add column if not exists cover text;
alter table public.course_offerings drop constraint if exists course_offerings_cover_check;
alter table public.course_offerings add constraint course_offerings_cover_check
  check (cover is null or cover ~ '^scene:[a-z0-9-]{2,30}$');

create or replace function public.set_offering_cover(p_offering_id bigint, p_cover text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.can_manage_offering(p_offering_id) then
    raise exception 'Solo el docente del curso cambia la portada.';
  end if;
  update public.course_offerings set cover = nullif(btrim(coalesce(p_cover, '')), '') where id = p_offering_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- 10) Archivos de retroalimentación (audio e imágenes anotadas)
--     Ruta: {submission_id}/{archivo}
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('campus-feedback', 'campus-feedback', false, 10485760,
        array['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "campus_feedback_read" on storage.objects;
drop policy if exists "campus_feedback_write" on storage.objects;
drop policy if exists "campus_feedback_delete" on storage.objects;
create policy "campus_feedback_read" on storage.objects for select to authenticated
  using (bucket_id = 'campus-feedback' and exists (
    select 1 from public.submissions s where s.id = public.try_bigint(split_part(name, '/', 1))
      and (s.student_id in (select public.my_student_ids()) or public.can_manage_assignment(s.assignment_id) or public.is_staff())));
create policy "campus_feedback_write" on storage.objects for insert to authenticated
  with check (bucket_id = 'campus-feedback' and exists (
    select 1 from public.submissions s where s.id = public.try_bigint(split_part(name, '/', 1)) and public.can_manage_assignment(s.assignment_id)));
create policy "campus_feedback_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'campus-feedback' and exists (
    select 1 from public.submissions s where s.id = public.try_bigint(split_part(name, '/', 1)) and public.can_manage_assignment(s.assignment_id)));

-- ----------------------------------------------------------------------------
-- 11) Seguridad (RLS)
-- ----------------------------------------------------------------------------
do $$
declare
  t text;
  pol record;
begin
  foreach t in array array[
    'course_units', 'material_views', 'rubrics', 'submission_versions', 'feedback_snippets', 'assignment_groups',
    'assignment_group_members', 'quiz_questions', 'quiz_answer_keys', 'quiz_attempts', 'question_bank', 'forum_threads',
    'forum_posts', 'material_checkpoints', 'material_checkpoint_answers', 'scheduled_announcements'
  ] loop
    for pol in select policyname from pg_policies where schemaname = 'public' and tablename = t loop
      execute format('drop policy %I on public.%I', pol.policyname, t);
    end loop;
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

create policy "view" on public.course_units for select to authenticated using (public.can_view_offering(offering_id));
create policy "manage" on public.course_units for all to authenticated
  using (public.can_manage_offering(offering_id)) with check (public.can_manage_offering(offering_id));

create policy "view" on public.material_views for select to authenticated
  using (student_id in (select public.my_student_ids())
    or exists (select 1 from public.materials m where m.id = material_id and public.can_manage_offering(m.offering_id))
    or (select public.is_staff()));

create policy "view" on public.rubrics for select to authenticated
  using (owner_id = (select auth.uid()) or (shared and ((select public.is_teacher()) or (select public.is_staff())))
    or exists (select 1 from public.assignments a where a.rubric_id = rubrics.id and public.can_view_offering(a.offering_id)));
create policy "manage" on public.rubrics for all to authenticated
  using (owner_id = (select auth.uid()) or (select public.is_admin()))
  with check (owner_id = (select auth.uid()) or (select public.is_admin()));

create policy "view" on public.submission_versions for select to authenticated
  using (exists (select 1 from public.submissions s where s.id = submission_id
    and (s.student_id in (select public.my_student_ids()) or public.can_manage_assignment(s.assignment_id) or (select public.is_staff()))));

create policy "own" on public.feedback_snippets for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

create policy "view" on public.assignment_groups for select to authenticated
  using (exists (select 1 from public.assignments a where a.id = assignment_id and public.can_view_offering(a.offering_id)));
create policy "view" on public.assignment_group_members for select to authenticated
  using (exists (select 1 from public.assignments a where a.id = assignment_id and public.can_view_offering(a.offering_id)));

-- Las preguntas las lee el docente; el alumno solo a través de quiz_start.
create policy "manage" on public.quiz_questions for all to authenticated
  using (public.can_manage_assignment(assignment_id)) with check (public.can_manage_assignment(assignment_id));
create policy "manage" on public.quiz_answer_keys for all to authenticated
  using (exists (select 1 from public.quiz_questions q where q.id = question_id and public.can_manage_assignment(q.assignment_id)))
  with check (exists (select 1 from public.quiz_questions q where q.id = question_id and public.can_manage_assignment(q.assignment_id)));
create policy "view" on public.quiz_attempts for select to authenticated
  using (student_id in (select public.my_student_ids()) or public.can_manage_assignment(assignment_id) or (select public.is_staff()));

create policy "view" on public.question_bank for select to authenticated
  using (owner_id = (select auth.uid()) or (shared and ((select public.is_teacher()) or (select public.is_staff()))));
create policy "manage" on public.question_bank for all to authenticated
  using (owner_id = (select auth.uid()) or (select public.is_admin()))
  with check (owner_id = (select auth.uid()) and ((select public.is_teacher()) or (select public.is_staff())));

create policy "view" on public.forum_threads for select to authenticated using (public.can_view_offering(offering_id));
create policy "create" on public.forum_threads for insert to authenticated
  with check (author_id = (select auth.uid()) and public.can_post_forum(offering_id) and not pinned and not locked and not hidden);
create policy "edit_own" on public.forum_threads for update to authenticated
  using (author_id = (select auth.uid())) with check (author_id = (select auth.uid()));
create policy "delete" on public.forum_threads for delete to authenticated
  using (author_id = (select auth.uid()) or public.can_manage_offering(offering_id));

create policy "view" on public.forum_posts for select to authenticated
  using (exists (select 1 from public.forum_threads t where t.id = thread_id and public.can_view_offering(t.offering_id)));
create policy "create" on public.forum_posts for insert to authenticated
  with check (author_id = (select auth.uid()) and not is_best and not hidden
    and exists (select 1 from public.forum_threads t where t.id = thread_id and public.can_post_forum(t.offering_id)));
create policy "delete" on public.forum_posts for delete to authenticated
  using (author_id = (select auth.uid())
    or exists (select 1 from public.forum_threads t where t.id = thread_id and public.can_manage_offering(t.offering_id)));

create policy "view" on public.material_checkpoints for select to authenticated
  using (exists (select 1 from public.materials m where m.id = material_id and public.can_view_offering(m.offering_id)));
create policy "manage" on public.material_checkpoints for all to authenticated
  using (exists (select 1 from public.materials m where m.id = material_id and public.can_manage_offering(m.offering_id)))
  with check (exists (select 1 from public.materials m where m.id = material_id and public.can_manage_offering(m.offering_id)));
create policy "view" on public.material_checkpoint_answers for select to authenticated
  using (student_id in (select public.my_student_ids())
    or exists (select 1 from public.material_checkpoints c join public.materials m on m.id = c.material_id
               where c.id = checkpoint_id and public.can_manage_offering(m.offering_id)));

create policy "own" on public.scheduled_announcements for all to authenticated
  using (author_id = (select auth.uid()) or (select public.is_admin()))
  with check (author_id = (select auth.uid()) and (
    (scope = 'COURSE' and public.can_manage_offering(offering_id))
    or (scope = 'CLASSROOM' and (public.is_classroom_tutor(classroom_id) or (select public.is_staff())))
    or (scope = 'SCHOOL' and (select public.is_staff()))));

-- ----------------------------------------------------------------------------
-- 12) Permisos de las funciones
-- ----------------------------------------------------------------------------
do $$
declare
  f text;
begin
  foreach f in array array[
    'quiz_grade_answer(text, jsonb, jsonb, numeric)', 'quiz_sync_submission(bigint, bigint)', 'quiz_attempt_view(bigint)',
    'save_submission_version()', 'sync_group_submission()', 'forum_post_stats()'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
  end loop;
  foreach f in array array[
    'campus_trusted_op()', 'campus_norm(text)', 'campus_level_from_20(numeric)',
    'set_assignment_groups(bigint, jsonb)', 'quiz_save_question(bigint, jsonb)', 'quiz_editor(bigint)',
    'quiz_import_from_bank(bigint, bigint[])', 'quiz_question_to_bank(bigint, boolean)', 'quiz_start(bigint)',
    'quiz_save(bigint, jsonb)', 'quiz_finish(bigint, jsonb)', 'quiz_grade_open(bigint, jsonb)', 'quiz_review(bigint)',
    'can_post_forum(bigint)', 'forum_threads_view(bigint)', 'forum_posts_view(bigint)', 'forum_moderate(text, bigint, boolean)',
    'answer_checkpoint(bigint, integer)', 'mark_material_viewed(bigint)', 'publish_due_content()',
    'duplicate_assignment(bigint, bigint[], boolean)', 'duplicate_offering_content(bigint, bigint)', 'set_offering_cover(bigint, text)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- (Opcional) Publicar lo programado cada 5 minutos con pg_cron:
-- select cron.schedule('campus-publish-due', '*/5 * * * *', $$select public.publish_due_content()$$);

select 'Aprendizaje listo' as estado;
