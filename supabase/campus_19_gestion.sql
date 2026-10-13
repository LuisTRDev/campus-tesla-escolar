-- ============================================================================
-- CAMPUS VIRTUAL TESLA · Script 19
-- Gestión: permisos del personal (coordinación, psicología, secretaría),
-- observaciones privadas, alertas tempranas, panel de alertas del colegio,
-- citas con docentes, justificación de inasistencias, bitácora de auditoría,
-- encuestas, estadísticas de uso, registro de errores de la app, inicio de
-- un año escolar nuevo y respaldo de datos.
--
-- Requiere los scripts 01 a 18. Se puede volver a ejecutar.
-- ============================================================================

-- Avisos push nuevos (incluye los del script 20).
alter table public.push_outbox drop constraint if exists push_outbox_kind_check;
alter table public.push_outbox add constraint push_outbox_kind_check check (kind in (
  'ASSIGNMENT', 'GRADE', 'LATE', 'CIRCULAR', 'MESSAGE', 'DIGEST', 'TEST', 'TESLA',
  'FORUM', 'APPOINTMENT', 'JUSTIFICATION', 'SURVEY', 'CHANNEL', 'ANNOUNCEMENT', 'ALERT'
));

-- ----------------------------------------------------------------------------
-- 1) Permisos del personal (sin tocar los roles de Tesla)
--    COORDINADOR (de un nivel o de todo el colegio), PSICOLOGIA, SECRETARIA
-- ----------------------------------------------------------------------------
create table if not exists public.staff_permissions (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  permission text not null check (permission in ('COORDINADOR', 'PSICOLOGIA', 'SECRETARIA')),
  level text check (level is null or level in ('Inicial', 'Primaria', 'Secundaria')),
  created_at timestamptz not null default now(),
  primary key (profile_id, permission)
);

create or replace function public.has_campus_permission(p_permission text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin() or exists (select 1 from public.staff_permissions where profile_id = auth.uid() and permission = p_permission)
$$;

-- Quién puede ver alertas y observaciones de todo el colegio.
create or replace function public.is_school_watcher()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_staff() or exists (
    select 1 from public.staff_permissions where profile_id = auth.uid() and permission in ('COORDINADOR', 'PSICOLOGIA')
  )
$$;

-- ¿El docente enseña (o es tutor) en el aula del alumno?
create or replace function public.teaches_student(p_teacher uuid, p_student_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.students s
    where s.id = p_student_id and (
      exists (select 1 from public.classrooms c where c.id = s.classroom_id and c.tutor_id = p_teacher)
      or exists (select 1 from public.course_offerings o where o.classroom_id = s.classroom_id and o.teacher_id = p_teacher and o.is_active)
    )
  )
$$;

-- ----------------------------------------------------------------------------
-- 2) Observaciones privadas del personal sobre un alumno (nunca las ven las familias)
-- ----------------------------------------------------------------------------
create table if not exists public.student_observations (
  id bigint generated always as identity primary key,
  student_id bigint not null references public.students(id) on delete cascade,
  author_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  kind text not null default 'ACADEMICO' check (kind in ('ACADEMICO', 'CONDUCTA', 'SALUD', 'FAMILIA', 'PSICOLOGICA', 'LOGRO', 'OTRO')),
  body text not null check (char_length(btrim(body)) between 3 and 3000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_student_observations on public.student_observations(student_id, created_at desc);

create or replace function public.can_read_observation(p_student_id bigint, p_kind text, p_author uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_kind = 'PSICOLOGICA' then p_author = auth.uid() or public.has_campus_permission('PSICOLOGIA')
    else p_author = auth.uid() or public.is_school_watcher()
      or (public.is_teacher() and public.teaches_student(auth.uid(), p_student_id))
  end
$$;

-- ----------------------------------------------------------------------------
-- 3) Alertas tempranas (por alumno) y panel de alertas del colegio
-- ----------------------------------------------------------------------------
create or replace function public.early_alerts(p_classroom_id bigint default null, p_days integer default 30, p_min_risk integer default 4)
returns table (
  student_id bigint,
  first_name text,
  last_name text,
  classroom_id bigint,
  classroom text,
  overdue integer,
  late_days integer,
  absent_days integer,
  low_grades integer,
  risk integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_from date := (now() at time zone 'America/Lima')::date - greatest(p_days, 1);
  v_to date := (now() at time zone 'America/Lima')::date - 1;
  v_school_days integer;
begin
  if p_classroom_id is null then
    if not public.is_school_watcher() then
      raise exception 'Elige un aula.';
    end if;
  elsif not (public.is_school_watcher() or p_classroom_id in (select public.teacher_classroom_ids())) then
    raise exception 'No puedes ver esta aula.';
  end if;
  v_school_days := coalesce(public.school_days_between(v_from, v_to), 0);

  return query
  with st as (
    select s.id, s.first_name, s.last_name, s.classroom_id,
           btrim(coalesce(c.grade::text, '') || '° ' || coalesce(c.section, '') || ' · ' || coalesce(c.level, '')) as classroom
    from public.students s join public.classrooms c on c.id = s.classroom_id
    where (p_classroom_id is null or s.classroom_id = p_classroom_id)
  ),
  calc as (
    select st.*,
      (select count(*) from public.assignments a join public.course_offerings o on o.id = a.offering_id
        where o.classroom_id = st.classroom_id and o.is_active and a.status in ('PUBLISHED', 'CLOSED')
          and a.due_at >= v_from and a.due_at < now()
          and not exists (select 1 from public.submissions sb where sb.assignment_id = a.id and sb.student_id = st.id))::int as overdue,
      (select count(distinct att.date) from public.attendance att
        where att.student_id = st.id and att.status = 'LATE' and att.date between v_from and v_to)::int as late_days,
      greatest(0, v_school_days - (select count(distinct att.date) from public.attendance att
        where att.student_id = st.id and att.date between v_from and v_to and extract(isodow from att.date) between 1 and 5))::int as absent_days,
      (select count(*) from public.submissions sb join public.assignments a on a.id = sb.assignment_id
        where sb.student_id = st.id and sb.status = 'GRADED' and sb.graded_at >= v_from
          and (sb.level in ('B', 'C') or (a.grading_type = 'SCORE' and sb.score is not null and sb.score / a.max_score * 20 < 11)))::int as low_grades
    from st
  )
  select calc.id, calc.first_name, calc.last_name, calc.classroom_id, calc.classroom,
         calc.overdue, calc.late_days, calc.absent_days, calc.low_grades,
         (calc.overdue * 2 + calc.late_days + calc.absent_days * 2 + calc.low_grades * 2)::int
  from calc
  where calc.overdue * 2 + calc.late_days + calc.absent_days * 2 + calc.low_grades * 2 >= p_min_risk
  order by 10 desc, calc.last_name;
exception when undefined_table then
  -- Instalaciones sin la tabla de asistencia de Tesla.
  return;
end;
$$;

create or replace function public.school_alerts(p_days integer default 14)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_from timestamptz := now() - make_interval(days => greatest(p_days, 1));
begin
  if not public.is_school_watcher() then
    raise exception 'Solo la dirección y la coordinación ven este panel.';
  end if;
  return jsonb_build_object(
    -- Aulas con más entregas faltantes (tareas vencidas del periodo).
    'classrooms', coalesce((
      select jsonb_agg(x order by (x ->> 'missing')::int desc) from (
        select jsonb_build_object(
          'classroom_id', c.id,
          'classroom', btrim(coalesce(c.grade::text, '') || '° ' || coalesce(c.section, '') || ' · ' || coalesce(c.level, '')),
          'students', (select count(*) from public.students s where s.classroom_id = c.id),
          'assignments', count(distinct a.id),
          'missing', count(*) filter (where sb.id is null)
        ) as x
        from public.classrooms c
        join public.course_offerings o on o.classroom_id = c.id and o.is_active
        join public.assignments a on a.offering_id = o.id and a.status in ('PUBLISHED', 'CLOSED') and a.due_at >= v_from and a.due_at < now()
        join public.students s on s.classroom_id = c.id
        left join public.submissions sb on sb.assignment_id = a.id and sb.student_id = s.id
        group by c.id
        having count(*) filter (where sb.id is null) > 0
        order by count(*) filter (where sb.id is null) desc
        limit 10
      ) t
    ), '[]'::jsonb),
    -- Docentes con entregas sin calificar hace más de 7 días.
    'teachers', coalesce((
      select jsonb_agg(x order by (x ->> 'pending')::int desc) from (
        select jsonb_build_object(
          'teacher_id', p.id, 'teacher', p.full_name,
          'pending', count(*), 'oldest', min(sb.submitted_at)
        ) as x
        from public.submissions sb
        join public.assignments a on a.id = sb.assignment_id
        join public.course_offerings o on o.id = a.offering_id
        join public.profiles p on p.id = o.teacher_id
        where sb.status = 'SUBMITTED' and sb.submitted_at < now() - interval '7 days' and a.kind = 'TASK'
        group by p.id
        order by count(*) desc
        limit 10
      ) t
    ), '[]'::jsonb),
    -- Alumnos en riesgo (mismo cálculo que las alertas tempranas).
    'at_risk', coalesce((
      select jsonb_agg(to_jsonb(e) order by e.risk desc) from (select * from public.early_alerts(null, 30, 6) limit 15) e
    ), '[]'::jsonb),
    'at_risk_total', (select count(*) from public.early_alerts(null, 30, 6))
  );
end;
$$;

-- ----------------------------------------------------------------------------
-- 4) Citas con docentes
-- ----------------------------------------------------------------------------
create table if not exists public.appointment_slots (
  id bigint generated always as identity primary key,
  teacher_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  mode text not null default 'PRESENCIAL' check (mode in ('PRESENCIAL', 'VIRTUAL', 'TELEFONO')),
  location text check (location is null or char_length(location) <= 200),
  status text not null default 'OPEN' check (status in ('OPEN', 'BOOKED', 'CANCELLED', 'DONE')),
  booked_by uuid references public.profiles(id) on delete set null,
  student_id bigint references public.students(id) on delete set null,
  note text check (note is null or char_length(note) <= 500),
  booked_at timestamptz,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index if not exists idx_appointment_slots_teacher on public.appointment_slots(teacher_id, starts_at);

create or replace function public.book_appointment(p_slot_id bigint, p_student_id bigint, p_note text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.appointment_slots%rowtype;
begin
  if p_student_id not in (select public.my_student_ids()) or public.my_self_student_id() is not null then
    raise exception 'Solo la familia del alumno reserva citas.';
  end if;
  select * into s from public.appointment_slots where id = p_slot_id for update;
  if not found or s.status <> 'OPEN' or s.starts_at < now() then
    raise exception 'Este horario ya no está disponible.';
  end if;
  if not public.teaches_student(s.teacher_id, p_student_id) then
    raise exception 'El docente no enseña en el aula de tu hijo.';
  end if;
  update public.appointment_slots
  set status = 'BOOKED', booked_by = auth.uid(), student_id = p_student_id, note = nullif(btrim(coalesce(p_note, '')), ''), booked_at = now()
  where id = s.id;
  perform public.queue_push(array[s.teacher_id], 'APPOINTMENT', 'Nueva cita reservada',
    'La familia de ' || public.student_first_name(p_student_id) || ' reservó una cita el '
      || to_char(s.starts_at at time zone 'America/Lima', 'DD/MM "a las" HH24:MI') || '.', '/citas');
end;
$$;

create or replace function public.cancel_appointment(p_slot_id bigint, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.appointment_slots%rowtype;
begin
  select * into s from public.appointment_slots where id = p_slot_id for update;
  if not found then
    raise exception 'La cita no existe.';
  end if;
  if s.booked_by = auth.uid() then
    update public.appointment_slots set status = 'OPEN', booked_by = null, student_id = null, note = null, booked_at = null where id = s.id;
    perform public.queue_push(array[s.teacher_id], 'APPOINTMENT', 'Cita cancelada',
      'La familia canceló la cita del ' || to_char(s.starts_at at time zone 'America/Lima', 'DD/MM HH24:MI') || '.', '/citas');
  elsif s.teacher_id = auth.uid() or public.is_admin() then
    update public.appointment_slots set status = 'CANCELLED' where id = s.id;
    if s.booked_by is not null then
      perform public.queue_push(array[s.booked_by], 'APPOINTMENT', 'Cita cancelada por el docente',
        coalesce(nullif(btrim(coalesce(p_reason, '')), ''), 'El docente canceló la cita del ' || to_char(s.starts_at at time zone 'America/Lima', 'DD/MM HH24:MI') || '.'),
        '/citas');
    end if;
  else
    raise exception 'No puedes cancelar esta cita.';
  end if;
end;
$$;

-- Horarios disponibles de los docentes del alumno, con su nombre.
create or replace function public.appointment_options(p_student_id bigint)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case when p_student_id in (select public.my_student_ids()) then coalesce((
    select jsonb_agg(jsonb_build_object('id', s.id, 'teacher_id', s.teacher_id, 'teacher', p.full_name, 'starts_at', s.starts_at,
      'ends_at', s.ends_at, 'mode', s.mode, 'location', s.location) order by s.starts_at)
    from public.appointment_slots s join public.profiles p on p.id = s.teacher_id
    where s.status = 'OPEN' and s.starts_at > now() and public.teaches_student(s.teacher_id, p_student_id)
  ), '[]'::jsonb) end
$$;

-- Citas reservadas, para la familia o el docente, con nombres.
create or replace function public.my_appointments()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', s.id, 'teacher_id', s.teacher_id, 'teacher', t.full_name, 'starts_at', s.starts_at, 'ends_at', s.ends_at,
    'mode', s.mode, 'location', s.location, 'status', s.status, 'note', s.note, 'student_id', s.student_id,
    'student', btrim(coalesce(st.first_name, '') || ' ' || coalesce(st.last_name, '')), 'family', f.full_name,
    'mine', s.teacher_id = auth.uid()
  ) order by s.starts_at), '[]'::jsonb)
  from public.appointment_slots s
  join public.profiles t on t.id = s.teacher_id
  left join public.students st on st.id = s.student_id
  left join public.profiles f on f.id = s.booked_by
  where (s.teacher_id = auth.uid() or s.booked_by = auth.uid())
    and s.starts_at > now() - interval '30 days'
$$;

-- ----------------------------------------------------------------------------
-- 5) Justificación de inasistencias y tardanzas
-- ----------------------------------------------------------------------------
create table if not exists public.absence_justifications (
  id bigint generated always as identity primary key,
  student_id bigint not null references public.students(id) on delete cascade,
  kind text not null default 'FALTA' check (kind in ('FALTA', 'TARDANZA')),
  date_from date not null,
  date_to date not null,
  reason text not null check (char_length(btrim(reason)) between 5 and 1000),
  attachment_path text,
  attachment_name text,
  status text not null default 'PENDING' check (status in ('PENDING', 'APPROVED', 'REJECTED')),
  created_by uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  review_note text check (review_note is null or char_length(review_note) <= 500),
  check (date_to >= date_from and date_to - date_from <= 31)
);
create index if not exists idx_absence_justifications on public.absence_justifications(student_id, date_from desc);

create or replace function public.can_review_justification(p_student_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_staff() or public.has_campus_permission('SECRETARIA')
    or exists (select 1 from public.students s where s.id = p_student_id and public.is_classroom_tutor(s.classroom_id))
$$;

-- Al crearla: avisa al tutor.
create or replace function public.notify_justification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tutor uuid;
begin
  select c.tutor_id into v_tutor from public.students s join public.classrooms c on c.id = s.classroom_id where s.id = new.student_id;
  if v_tutor is not null then
    perform public.queue_push(array[v_tutor], 'JUSTIFICATION', 'Justificación por revisar',
      'La familia de ' || public.student_first_name(new.student_id) || ' justificó una ' || lower(new.kind) || '.', '/justificaciones');
  end if;
  return null;
exception when others then
  return null;
end;
$$;

drop trigger if exists trg_absence_justifications_notify on public.absence_justifications;
create trigger trg_absence_justifications_notify after insert on public.absence_justifications
for each row execute function public.notify_justification();

create or replace function public.review_justification(p_id bigint, p_approve boolean, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  j public.absence_justifications%rowtype;
begin
  select * into j from public.absence_justifications where id = p_id for update;
  if not found or not public.can_review_justification(j.student_id) then
    raise exception 'Solo el tutor, secretaría o la dirección revisan justificaciones.';
  end if;
  if j.status <> 'PENDING' then
    raise exception 'Esta justificación ya fue revisada.';
  end if;
  update public.absence_justifications
  set status = case when p_approve then 'APPROVED' else 'REJECTED' end, reviewed_by = auth.uid(), reviewed_at = now(),
      review_note = nullif(btrim(coalesce(p_note, '')), '')
  where id = p_id;
  perform public.queue_push(array[j.created_by], 'JUSTIFICATION',
    case when p_approve then 'Justificación aprobada' else 'Justificación no aprobada' end,
    'La justificación de ' || public.student_first_name(j.student_id) || ' fue ' || case when p_approve then 'aprobada.' else 'rechazada.' end
      || coalesce(' ' || nullif(btrim(coalesce(p_note, '')), ''), ''), '/justificaciones');
end;
$$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('campus-justifications', 'campus-justifications', false, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "campus_justifications_read" on storage.objects;
drop policy if exists "campus_justifications_write" on storage.objects;
create policy "campus_justifications_read" on storage.objects for select to authenticated
  using (bucket_id = 'campus-justifications' and public.can_view_student(public.try_bigint(split_part(name, '/', 1))));
create policy "campus_justifications_write" on storage.objects for insert to authenticated
  with check (bucket_id = 'campus-justifications' and public.try_bigint(split_part(name, '/', 1)) in (select public.my_student_ids()));

-- ----------------------------------------------------------------------------
-- 6) Bitácora de auditoría
-- ----------------------------------------------------------------------------
create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor uuid,
  actor_name text,
  action text not null,
  entity text not null,
  entity_id text,
  summary text not null default '',
  detail jsonb not null default '{}'::jsonb
);
create index if not exists idx_audit_log_at on public.audit_log(at desc);
create index if not exists idx_audit_log_entity on public.audit_log(entity, entity_id);

create or replace function public.audit_write(p_action text, p_entity text, p_entity_id text, p_summary text, p_detail jsonb default '{}'::jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.audit_log (actor, actor_name, action, entity, entity_id, summary, detail)
  values (auth.uid(), (select full_name from public.profiles where id = auth.uid()), p_action, p_entity, p_entity_id,
          left(coalesce(p_summary, ''), 400), coalesce(p_detail, '{}'::jsonb));
exception when others then
  raise warning '[audit_write] %', sqlerrm;
end;
$$;

-- Cambios de nota en entregas.
create or replace function public.audit_submission_grade()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or pg_trigger_depth() > 1 then
    return null;
  end if;
  -- Solo cambios de nota hechos por el personal (no el alumno reenviando su trabajo).
  if (old.score, old.level, old.status) is distinct from (new.score, new.level, new.status)
     and new.student_id is distinct from public.my_self_student_id() then
    perform public.audit_write('GRADE', 'submission', new.id::text,
      'Nota de ' || public.student_first_name(new.student_id) || ' en «' || (select title from public.assignments where id = new.assignment_id) || '»: '
        || coalesce(old.score::text, old.level, '—') || ' → ' || coalesce(new.score::text, new.level, '—') || ' (' || new.status || ')',
      jsonb_build_object('old', jsonb_build_object('score', old.score, 'level', old.level, 'status', old.status),
                         'new', jsonb_build_object('score', new.score, 'level', new.level, 'status', new.status)));
  end if;
  return null;
end;
$$;

drop trigger if exists trg_audit_submission_grade on public.submissions;
create trigger trg_audit_submission_grade after update on public.submissions
for each row execute function public.audit_submission_grade();

-- Notas por competencia (libreta).
create or replace function public.audit_competency_grade()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r record := coalesce(new, old);
begin
  if auth.uid() is null then
    return null;
  end if;
  if tg_op = 'UPDATE' and old.level is not distinct from new.level and old.conclusion is not distinct from new.conclusion then
    return null;
  end if;
  perform public.audit_write(case tg_op when 'DELETE' then 'DELETE' else 'GRADE' end, 'competency_grade', r.id::text,
    'Libreta de ' || public.student_first_name(r.student_id) || ': ' || coalesce(case when tg_op = 'INSERT' then null else old.level end, '—')
      || ' → ' || coalesce(case when tg_op = 'DELETE' then null else new.level end, '—'),
    jsonb_build_object('period_id', r.period_id, 'offering_id', r.offering_id, 'competency_id', r.competency_id));
  return null;
end;
$$;

drop trigger if exists trg_audit_competency_grade on public.competency_grades;
create trigger trg_audit_competency_grade after insert or update or delete on public.competency_grades
for each row execute function public.audit_competency_grade();

-- Borrados de contenido.
create or replace function public.audit_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null then
    perform public.audit_write('DELETE', tg_table_name, (to_jsonb(old) ->> 'id'),
      'Eliminó ' || tg_table_name || ': ' || coalesce(to_jsonb(old) ->> 'title', to_jsonb(old) ->> 'name', '#' || (to_jsonb(old) ->> 'id')),
      jsonb_build_object('row', to_jsonb(old) - 'body' - 'instructions' - 'content'));
  end if;
  return null;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array['assignments', 'materials', 'announcements', 'circulars', 'forum_threads', 'course_units'] loop
    execute format('drop trigger if exists trg_audit_delete on public.%I', t);
    execute format('create trigger trg_audit_delete after delete on public.%I for each row execute function public.audit_delete()', t);
  end loop;
end $$;

-- Claves restablecidas y cuentas activadas o desactivadas por otra persona.
create or replace function public.audit_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or auth.uid() = new.id then
    return null;
  end if;
  if old.encrypted_password is distinct from new.encrypted_password then
    perform public.audit_write('RESET_PASSWORD', 'account', new.id::text,
      'Restableció la contraseña de ' || coalesce((select full_name from public.profiles where id = new.id), new.email));
  end if;
  if old.banned_until is distinct from new.banned_until then
    perform public.audit_write('ACCOUNT_ACTIVE', 'account', new.id::text,
      case when new.banned_until is null or new.banned_until < now() then 'Activó' else 'Desactivó' end
        || ' la cuenta de ' || coalesce((select full_name from public.profiles where id = new.id), new.email));
  end if;
  return null;
exception when others then
  return null;
end;
$$;

drop trigger if exists trg_audit_auth_user on auth.users;
create trigger trg_audit_auth_user after update on auth.users
for each row execute function public.audit_auth_user();

-- Cambios de permisos del personal.
create or replace function public.audit_staff_permissions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r record := coalesce(new, old);
begin
  perform public.audit_write(case tg_op when 'DELETE' then 'REVOKE' else 'GRANT' end, 'staff_permission', r.profile_id::text,
    case tg_op when 'DELETE' then 'Quitó ' else 'Dio ' end || 'el permiso ' || r.permission || ' a '
      || coalesce((select full_name from public.profiles where id = r.profile_id), '?'));
  return null;
end;
$$;

drop trigger if exists trg_audit_staff_permissions on public.staff_permissions;
create trigger trg_audit_staff_permissions after insert or delete on public.staff_permissions
for each row execute function public.audit_staff_permissions();

-- ----------------------------------------------------------------------------
-- 7) Encuestas
-- ----------------------------------------------------------------------------
create table if not exists public.surveys (
  id bigint generated always as identity primary key,
  title text not null check (char_length(btrim(title)) between 3 and 160),
  description text check (description is null or char_length(description) <= 1000),
  audience text not null default 'FAMILIES' check (audience in ('FAMILIES', 'STUDENTS', 'TEACHERS', 'ALL')),
  classroom_id bigint references public.classrooms(id) on delete cascade,
  anonymous boolean not null default true,
  status text not null default 'DRAFT' check (status in ('DRAFT', 'OPEN', 'CLOSED')),
  closes_at timestamptz,
  created_by uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- type: SINGLE, MULTI, SCALE (1 a 5), TEXT
create table if not exists public.survey_questions (
  id bigint generated always as identity primary key,
  survey_id bigint not null references public.surveys(id) on delete cascade,
  position integer not null default 1,
  type text not null check (type in ('SINGLE', 'MULTI', 'SCALE', 'TEXT')),
  prompt text not null check (char_length(btrim(prompt)) between 1 and 500),
  options jsonb not null default '[]'::jsonb,
  required boolean not null default true
);

create table if not exists public.survey_responses (
  id bigint generated always as identity primary key,
  survey_id bigint not null references public.surveys(id) on delete cascade,
  respondent uuid not null references public.profiles(id) on delete cascade,
  answers jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (survey_id, respondent)
);

create or replace function public.survey_is_for_me(p_survey public.surveys)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case p_survey.audience
    when 'TEACHERS' then public.is_teacher()
    when 'STUDENTS' then public.my_self_student_id() is not null
      and (p_survey.classroom_id is null or exists (select 1 from public.students s where s.id = public.my_self_student_id() and s.classroom_id = p_survey.classroom_id))
    when 'FAMILIES' then public.my_self_student_id() is null and exists (select 1 from public.my_children_ids())
      and (p_survey.classroom_id is null or p_survey.classroom_id in (select public.family_classroom_ids()))
    else true
  end
$$;

create or replace function public.my_surveys()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', s.id, 'title', s.title, 'description', s.description, 'anonymous', s.anonymous, 'closes_at', s.closes_at,
    'answered', exists (select 1 from public.survey_responses r where r.survey_id = s.id and r.respondent = auth.uid()),
    'questions', (select coalesce(jsonb_agg(jsonb_build_object('id', q.id, 'type', q.type, 'prompt', q.prompt, 'options', q.options, 'required', q.required) order by q.position, q.id), '[]'::jsonb)
                  from public.survey_questions q where q.survey_id = s.id)
  ) order by s.created_at desc), '[]'::jsonb)
  from public.surveys s
  where s.status = 'OPEN' and (s.closes_at is null or s.closes_at > now()) and public.survey_is_for_me(s)
$$;

create or replace function public.submit_survey(p_survey_id bigint, p_answers jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.surveys%rowtype;
  q record;
begin
  select * into s from public.surveys where id = p_survey_id;
  if not found or s.status <> 'OPEN' or (s.closes_at is not null and s.closes_at < now()) or not public.survey_is_for_me(s) then
    raise exception 'Esta encuesta no está disponible.';
  end if;
  for q in select * from public.survey_questions where survey_id = s.id and required loop
    if coalesce(btrim(p_answers ->> q.id::text), '') in ('', '[]', 'null') then
      raise exception 'Responde todas las preguntas obligatorias.';
    end if;
  end loop;
  insert into public.survey_responses (survey_id, respondent, answers) values (s.id, auth.uid(), coalesce(p_answers, '{}'::jsonb))
  on conflict (survey_id, respondent) do update set answers = excluded.answers, created_at = now();
end;
$$;

create or replace function public.survey_results(p_survey_id bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  s public.surveys%rowtype;
begin
  select * into s from public.surveys where id = p_survey_id;
  if not found or not (s.created_by = auth.uid() or public.is_staff()) then
    raise exception 'No puedes ver estos resultados.';
  end if;
  return jsonb_build_object(
    'responses', (select count(*) from public.survey_responses where survey_id = s.id),
    'questions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', q.id, 'type', q.type, 'prompt', q.prompt, 'options', q.options,
        'counts', case when q.type in ('SINGLE', 'SCALE') then (
            select coalesce(jsonb_object_agg(v, n), '{}'::jsonb) from (
              select r.answers ->> q.id::text as v, count(*) as n from public.survey_responses r
              where r.survey_id = s.id and r.answers ? q.id::text group by 1) x)
          when q.type = 'MULTI' then (
            select coalesce(jsonb_object_agg(v, n), '{}'::jsonb) from (
              select v, count(*) as n from public.survey_responses r, jsonb_array_elements_text(r.answers -> q.id::text) v
              where r.survey_id = s.id and jsonb_typeof(r.answers -> q.id::text) = 'array' group by v) x)
          end,
        'texts', case when q.type = 'TEXT' then (
            select coalesce(jsonb_agg(jsonb_build_object('text', r.answers ->> q.id::text,
              'who', case when s.anonymous then null else (select full_name from public.profiles where id = r.respondent) end)), '[]'::jsonb)
            from public.survey_responses r where r.survey_id = s.id and coalesce(r.answers ->> q.id::text, '') <> '') end
      ) order by q.position, q.id)
      from public.survey_questions q where q.survey_id = s.id
    ), '[]'::jsonb)
  );
end;
$$;

-- Aviso al abrir una encuesta.
create or replace function public.notify_survey_open()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'OPEN' and (tg_op = 'INSERT' or old.status <> 'OPEN') then
    perform public.queue_push(array(
      select p.id from public.profiles p
      where case new.audience
        when 'TEACHERS' then p.role = 'TEACHER'
        when 'STUDENTS' then p.role = 'STUDENT'
        when 'FAMILIES' then p.role = 'GUARDIAN'
        else p.role in ('TEACHER', 'STUDENT', 'GUARDIAN') end
    ), 'SURVEY', 'Nueva encuesta', new.title, '/encuestas');
  end if;
  return null;
exception when others then
  return null;
end;
$$;

drop trigger if exists trg_surveys_notify on public.surveys;
create trigger trg_surveys_notify after insert or update of status on public.surveys
for each row execute function public.notify_survey_open();

-- ----------------------------------------------------------------------------
-- 8) Estadísticas de uso y errores de la app
-- ----------------------------------------------------------------------------
create table if not exists public.usage_events (
  id bigint generated always as identity primary key,
  profile_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  role text,
  path text not null check (char_length(path) <= 120),
  device text check (device in ('MOBILE', 'TABLET', 'DESKTOP')),
  standalone boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists idx_usage_events_at on public.usage_events(created_at desc);

create or replace function public.fill_usage_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.profile_id := auth.uid();
  new.role := (select role from public.profiles where id = auth.uid());
  new.created_at := now();
  return new;
end;
$$;

drop trigger if exists trg_usage_events_fill on public.usage_events;
create trigger trg_usage_events_fill before insert on public.usage_events
for each row execute function public.fill_usage_role();

create or replace function public.usage_summary(p_days integer default 30)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_from timestamptz := now() - make_interval(days => least(greatest(p_days, 1), 180));
begin
  if not public.is_admin() then
    raise exception 'Solo la dirección ve las estadísticas.';
  end if;
  delete from public.usage_events where created_at < now() - interval '180 days';
  return jsonb_build_object(
    'daily', coalesce((select jsonb_agg(jsonb_build_object('day', d, 'users', u, 'views', v) order by d) from (
      select (created_at at time zone 'America/Lima')::date as d, count(distinct profile_id) as u, count(*) as v
      from public.usage_events where created_at >= v_from group by 1) x), '[]'::jsonb),
    'by_role', coalesce((select jsonb_object_agg(coalesce(role, '?'), u) from (
      select role, count(distinct profile_id) as u from public.usage_events where created_at >= v_from group by role) x), '{}'::jsonb),
    'by_device', coalesce((select jsonb_object_agg(coalesce(device, '?'), u) from (
      select device, count(distinct profile_id) as u from public.usage_events where created_at >= v_from group by device) x), '{}'::jsonb),
    'installed', (select count(distinct profile_id) from public.usage_events where created_at >= v_from and standalone),
    'paths', coalesce((select jsonb_agg(jsonb_build_object('path', path, 'views', v, 'users', u) order by v desc) from (
      select path, count(*) as v, count(distinct profile_id) as u from public.usage_events where created_at >= v_from group by path) x), '[]'::jsonb),
    'active_users', (select count(distinct profile_id) from public.usage_events where created_at >= v_from),
    'total_accounts', (select count(*) from public.profiles)
  );
end;
$$;

create table if not exists public.client_errors (
  id bigint generated always as identity primary key,
  profile_id uuid default auth.uid() references public.profiles(id) on delete set null,
  message text not null check (char_length(message) <= 500),
  stack text check (stack is null or char_length(stack) <= 4000),
  path text check (path is null or char_length(path) <= 200),
  user_agent text check (user_agent is null or char_length(user_agent) <= 300),
  app_version text check (app_version is null or char_length(app_version) <= 60),
  created_at timestamptz not null default now()
);
create index if not exists idx_client_errors_at on public.client_errors(created_at desc);

-- Máximo 30 errores por hora y por cuenta (evita llenar la tabla en un bucle).
create or replace function public.limit_client_errors()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.profile_id := auth.uid();
  new.created_at := now();
  if (select count(*) from public.client_errors where profile_id = auth.uid() and created_at > now() - interval '1 hour') >= 30 then
    return null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_client_errors_limit on public.client_errors;
create trigger trg_client_errors_limit before insert on public.client_errors
for each row execute function public.limit_client_errors();

-- ----------------------------------------------------------------------------
-- 9) Año escolar nuevo y respaldo
-- ----------------------------------------------------------------------------
-- Crea el año, lo marca como actual y (opcional) copia los cursos por aula con
-- sus docentes. Todo lo del año anterior se conserva. El paso de los alumnos
-- al grado siguiente se hace en Tesla (allí están las aulas y matrículas).
create or replace function public.campus_start_year(p_year integer, p_starts date, p_ends date, p_copy_offerings boolean default true)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old bigint;
  v_new bigint;
  v_copied integer := 0;
begin
  perform public.assert_admin();
  if p_year is null or p_year < 2000 or p_year > 2100 then
    raise exception 'Año no válido.';
  end if;
  if p_ends <= p_starts then
    raise exception 'La fecha de fin debe ser posterior al inicio.';
  end if;
  select id into v_old from public.academic_years where is_current;
  if exists (select 1 from public.academic_years where year = p_year) then
    raise exception 'El año % ya existe.', p_year;
  end if;
  update public.academic_years set is_current = false where is_current;
  insert into public.academic_years (year, name, starts_on, ends_on, is_current)
  values (p_year, 'Año escolar ' || p_year, p_starts, p_ends, true)
  returning id into v_new;
  if p_copy_offerings and v_old is not null then
    insert into public.course_offerings (academic_year_id, classroom_id, subject_id, teacher_id, description, is_active)
    select v_new, o.classroom_id, o.subject_id, o.teacher_id, o.description, true
    from public.course_offerings o where o.academic_year_id = v_old and o.is_active
    on conflict (academic_year_id, classroom_id, subject_id) do nothing;
    get diagnostics v_copied = row_count;
    update public.course_offerings set is_active = false where academic_year_id = v_old;
  end if;
  perform public.audit_write('START_YEAR', 'academic_year', v_new::text, 'Inició el año escolar ' || p_year);
  return jsonb_build_object('year_id', v_new, 'offerings', v_copied);
end;
$$;

-- Exporta los datos del campus de un año (JSON) para guardarlos fuera.
create or replace function public.admin_export_year(p_year_id bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.assert_admin();
  return jsonb_build_object(
    'exported_at', now(),
    'year', (select to_jsonb(y) from public.academic_years y where y.id = p_year_id),
    'periods', (select coalesce(jsonb_agg(to_jsonb(p)), '[]') from public.grading_periods p where p.academic_year_id = p_year_id),
    'subjects', (select coalesce(jsonb_agg(to_jsonb(s)), '[]') from public.subjects s),
    'offerings', (select coalesce(jsonb_agg(to_jsonb(o)), '[]') from public.course_offerings o where o.academic_year_id = p_year_id),
    'units', (select coalesce(jsonb_agg(to_jsonb(u)), '[]') from public.course_units u join public.course_offerings o on o.id = u.offering_id where o.academic_year_id = p_year_id),
    'materials', (select coalesce(jsonb_agg(to_jsonb(m)), '[]') from public.materials m join public.course_offerings o on o.id = m.offering_id where o.academic_year_id = p_year_id),
    'assignments', (select coalesce(jsonb_agg(to_jsonb(a)), '[]') from public.assignments a join public.course_offerings o on o.id = a.offering_id where o.academic_year_id = p_year_id),
    'submissions', (select coalesce(jsonb_agg(to_jsonb(sb)), '[]') from public.submissions sb join public.assignments a on a.id = sb.assignment_id
                    join public.course_offerings o on o.id = a.offering_id where o.academic_year_id = p_year_id),
    'competency_grades', (select coalesce(jsonb_agg(to_jsonb(g)), '[]') from public.competency_grades g join public.grading_periods p on p.id = g.period_id where p.academic_year_id = p_year_id),
    'report_card_comments', (select coalesce(jsonb_agg(to_jsonb(c)), '[]') from public.report_card_comments c join public.grading_periods p on p.id = c.period_id where p.academic_year_id = p_year_id),
    'announcements', (select coalesce(jsonb_agg(to_jsonb(an)), '[]') from public.announcements an
                      where an.published_at between coalesce((select starts_on from public.academic_years where id = p_year_id), '-infinity'::date)
                                            and coalesce((select ends_on from public.academic_years where id = p_year_id), 'infinity'::date) + 1),
    'circulars', (select coalesce(jsonb_agg(to_jsonb(c)), '[]') from public.circulars c
                  where c.published_at between coalesce((select starts_on from public.academic_years where id = p_year_id), '-infinity'::date)
                                          and coalesce((select ends_on from public.academic_years where id = p_year_id), 'infinity'::date) + 1),
    'observations', (select coalesce(jsonb_agg(to_jsonb(ob)), '[]') from public.student_observations ob where ob.kind <> 'PSICOLOGICA')
  );
end;
$$;

-- ----------------------------------------------------------------------------
-- 10) Seguridad (RLS)
-- ----------------------------------------------------------------------------
do $$
declare
  t text;
  pol record;
begin
  foreach t in array array[
    'staff_permissions', 'student_observations', 'appointment_slots', 'absence_justifications', 'audit_log',
    'surveys', 'survey_questions', 'survey_responses', 'usage_events', 'client_errors'
  ] loop
    for pol in select policyname from pg_policies where schemaname = 'public' and tablename = t loop
      execute format('drop policy %I on public.%I', pol.policyname, t);
    end loop;
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

create policy "view" on public.staff_permissions for select to authenticated
  using (profile_id = (select auth.uid()) or (select public.is_admin()));
create policy "admin_write" on public.staff_permissions for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create policy "view" on public.student_observations for select to authenticated
  using (public.can_read_observation(student_id, kind, author_id));
create policy "create" on public.student_observations for insert to authenticated
  with check (author_id = (select auth.uid()) and (
    (select public.is_school_watcher()) or ((select public.is_teacher()) and public.teaches_student((select auth.uid()), student_id)))
    and (kind <> 'PSICOLOGICA' or (select public.has_campus_permission('PSICOLOGIA'))));
create policy "edit_own" on public.student_observations for update to authenticated
  using (author_id = (select auth.uid())) with check (author_id = (select auth.uid()));
create policy "delete" on public.student_observations for delete to authenticated
  using (author_id = (select auth.uid()) or (select public.is_admin()));

create policy "view" on public.appointment_slots for select to authenticated
  using (teacher_id = (select auth.uid()) or booked_by = (select auth.uid()) or (select public.is_staff()));
create policy "teacher_manage" on public.appointment_slots for insert to authenticated
  with check (teacher_id = (select auth.uid()) and ((select public.is_teacher()) or (select public.is_staff())) and status = 'OPEN' and booked_by is null);
create policy "teacher_update" on public.appointment_slots for update to authenticated
  using (teacher_id = (select auth.uid())) with check (teacher_id = (select auth.uid()));
create policy "teacher_delete" on public.appointment_slots for delete to authenticated
  using (teacher_id = (select auth.uid()) and status = 'OPEN');

create policy "view" on public.absence_justifications for select to authenticated
  using (public.can_view_student(student_id) or public.can_review_justification(student_id));
create policy "family_create" on public.absence_justifications for insert to authenticated
  with check (created_by = (select auth.uid()) and status = 'PENDING' and reviewed_by is null
    and student_id in (select public.my_student_ids()) and (select public.my_self_student_id()) is null);
create policy "family_delete_pending" on public.absence_justifications for delete to authenticated
  using (created_by = (select auth.uid()) and status = 'PENDING');

create policy "admin_read" on public.audit_log for select to authenticated using ((select public.is_admin()));

create policy "view" on public.surveys for select to authenticated
  using (created_by = (select auth.uid()) or (select public.is_staff()));
create policy "staff_write" on public.surveys for all to authenticated
  using (created_by = (select auth.uid()) or (select public.is_admin()))
  with check (created_by = (select auth.uid()) and ((select public.is_staff()) or (select public.is_teacher())));
create policy "view" on public.survey_questions for select to authenticated
  using (exists (select 1 from public.surveys s where s.id = survey_id and (s.created_by = (select auth.uid()) or (select public.is_staff()))));
create policy "write" on public.survey_questions for all to authenticated
  using (exists (select 1 from public.surveys s where s.id = survey_id and (s.created_by = (select auth.uid()) or (select public.is_admin()))))
  with check (exists (select 1 from public.surveys s where s.id = survey_id and (s.created_by = (select auth.uid()) or (select public.is_admin()))));
create policy "own" on public.survey_responses for select to authenticated using (respondent = (select auth.uid()));

create policy "own_insert" on public.usage_events for insert to authenticated with check (true);
create policy "own_insert" on public.client_errors for insert to authenticated with check (true);
create policy "admin_read" on public.client_errors for select to authenticated using ((select public.is_admin()));
create policy "admin_delete" on public.client_errors for delete to authenticated using ((select public.is_admin()));

do $$
declare
  f text;
begin
  foreach f in array array[
    'audit_write(text, text, text, text, jsonb)', 'audit_submission_grade()', 'audit_competency_grade()', 'audit_delete()',
    'audit_auth_user()', 'audit_staff_permissions()', 'notify_justification()', 'notify_survey_open()',
    'fill_usage_role()', 'limit_client_errors()'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
  end loop;
  foreach f in array array[
    'has_campus_permission(text)', 'is_school_watcher()', 'teaches_student(uuid, bigint)', 'can_read_observation(bigint, text, uuid)',
    'early_alerts(bigint, integer, integer)', 'school_alerts(integer)', 'book_appointment(bigint, bigint, text)',
    'cancel_appointment(bigint, text)', 'appointment_options(bigint)', 'my_appointments()', 'can_review_justification(bigint)',
    'review_justification(bigint, boolean, text)', 'survey_is_for_me(public.surveys)', 'my_surveys()', 'submit_survey(bigint, jsonb)',
    'survey_results(bigint)', 'usage_summary(integer)', 'campus_start_year(integer, date, date, boolean)', 'admin_export_year(bigint)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

select 'Gestión lista' as estado;
