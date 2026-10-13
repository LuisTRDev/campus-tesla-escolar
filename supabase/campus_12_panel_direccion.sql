-- ============================================================================
-- CAMPUS VIRTUAL TESLA · Script 12
-- Panel de dirección: indicadores por aula, por área y por docente.
--
--   dashboard_classrooms      Asistencia, tareas, logro y lectura de comunicados por aula
--   dashboard_areas           Distribución AD/A/B/C por área (y opcionalmente por aula)
--   dashboard_teachers        Calificación a tiempo y avance del registro por docente
--   dashboard_unread_families Alumnos cuyas familias no leen los comunicados
--
-- Solo el personal (ADMIN, MANAGEMENT, AUXILIARY) puede llamarlas.
-- Calculan todo en la base: el panel carga rápido aunque el colegio sea grande.
-- Requiere los scripts 07 a 10. Se puede volver a ejecutar.
-- ============================================================================

create or replace function public.assert_staff()
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not (public.is_staff() or public.is_trusted_backend()) then
    raise exception 'Solo dirección y administración pueden ver el panel.';
  end if;
end;
$$;

-- Días de clase entre dos fechas: lunes a viernes, sin feriados del calendario
-- escolar y sin contar días futuros.
create or replace function public.school_days_between(p_from date, p_to date)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int
  from generate_series(p_from, least(p_to, (now() at time zone 'America/Lima')::date), interval '1 day') d
  where extract(isodow from d) between 1 and 5
    and not exists (
      select 1 from public.school_events e
      where e.kind = 'HOLIDAY' and e.scope = 'SCHOOL' and d::date between e.starts_on and e.ends_on
    )
$$;

-- ----------------------------------------------------------------------------
-- 1) Por aula
-- ----------------------------------------------------------------------------
drop function if exists public.dashboard_classrooms(date, date, bigint);
create or replace function public.dashboard_classrooms(p_from date, p_to date, p_period_id bigint default null)
returns table (
  classroom_id bigint,
  students integer,
  school_days integer,
  on_time integer,
  late integer,
  tasks_expected integer,
  tasks_delivered integer,
  tasks_on_time integer,
  avg_score20 numeric,
  levels_total integer,
  levels_achieved integer,
  circulars_total integer,
  circulars_read integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_to date := least(p_to, (now() at time zone 'America/Lima')::date);
  v_days integer := public.school_days_between(p_from, p_to);
begin
  perform public.assert_staff();
  return query
  with st as (
    select s.classroom_id as cid, count(*)::int as n
    from public.students s where s.classroom_id is not null group by 1
  ),
  att as (
    select s.classroom_id as cid,
           count(*) filter (where a.status = 'ON_TIME')::int as ot,
           count(*) filter (where a.status = 'LATE')::int as lt
    from public.attendance a
    join public.students s on s.id = a.student_id
    where a.date between p_from and v_to
    group by 1
  ),
  asg as (
    select o.classroom_id as cid, a.id as aid, a.grading_type, a.max_score
    from public.assignments a
    join public.course_offerings o on o.id = a.offering_id and o.is_active
    where a.status in ('PUBLISHED', 'CLOSED')
      and a.due_at is not null
      and a.due_at < now()
      and (a.due_at at time zone 'America/Lima')::date between p_from and v_to
  ),
  expected as (
    select asg.cid, count(*)::int as n
    from asg join public.students s on s.classroom_id = asg.cid
    group by 1
  ),
  delivered as (
    select asg.cid,
           count(sb.id)::int as n,
           count(sb.id) filter (where not sb.is_late)::int as on_time_n,
           avg(case when sb.status = 'GRADED' and asg.grading_type = 'SCORE' and sb.score is not null
                    then sb.score / asg.max_score * 20 end) as avg20
    from asg join public.submissions sb on sb.assignment_id = asg.aid
    group by 1
  ),
  lv as (
    select o.classroom_id as cid,
           count(*)::int as total,
           count(*) filter (where g.level in ('AD', 'A'))::int as achieved
    from public.competency_grades g
    join public.course_offerings o on o.id = g.offering_id
    where p_period_id is not null and g.period_id = p_period_id and g.level is not null
    group by 1
  ),
  cr as (
    select r.classroom_id as cid, count(*)::int as total, count(r.read_at)::int as rd
    from public.circular_recipients r
    join public.circulars c on c.id = r.circular_id
    where (c.published_at at time zone 'America/Lima')::date between p_from and p_to
    group by 1
  )
  select c.id,
         coalesce(st.n, 0), v_days,
         coalesce(att.ot, 0), coalesce(att.lt, 0),
         coalesce(expected.n, 0), coalesce(delivered.n, 0), coalesce(delivered.on_time_n, 0),
         round(delivered.avg20, 1),
         coalesce(lv.total, 0), coalesce(lv.achieved, 0),
         coalesce(cr.total, 0), coalesce(cr.rd, 0)
  from public.classrooms c
  left join st on st.cid = c.id
  left join att on att.cid = c.id
  left join expected on expected.cid = c.id
  left join delivered on delivered.cid = c.id
  left join lv on lv.cid = c.id
  left join cr on cr.cid = c.id;
end;
$$;

-- ----------------------------------------------------------------------------
-- 2) Rendimiento por área (niveles de logro del bimestre)
-- ----------------------------------------------------------------------------
drop function if exists public.dashboard_areas(bigint, bigint);
create or replace function public.dashboard_areas(p_period_id bigint, p_classroom_id bigint default null)
returns table (
  subject_id bigint,
  subject_name text,
  subject_level text,
  color text,
  ad_count integer,
  a_count integer,
  b_count integer,
  c_count integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  perform public.assert_staff();
  return query
  select sj.id, sj.name, sj.level, sj.color,
         count(*) filter (where g.level = 'AD')::int,
         count(*) filter (where g.level = 'A')::int,
         count(*) filter (where g.level = 'B')::int,
         count(*) filter (where g.level = 'C')::int
  from public.competency_grades g
  join public.course_offerings o on o.id = g.offering_id
  join public.subjects sj on sj.id = o.subject_id
  where g.period_id = p_period_id
    and g.level is not null
    and (p_classroom_id is null or o.classroom_id = p_classroom_id)
  group by sj.id, sj.name, sj.level, sj.color
  order by sj.level nulls last, sj.name;
end;
$$;

-- ----------------------------------------------------------------------------
-- 3) Docentes: ¿califican a tiempo? ¿llevan el registro al día?
-- ----------------------------------------------------------------------------
drop function if exists public.dashboard_teachers(date, date, bigint, integer);
create or replace function public.dashboard_teachers(p_from date, p_to date, p_period_id bigint default null, p_late_days integer default 7)
returns table (
  teacher_id uuid,
  full_name text,
  offerings integer,
  assignments integer,
  received integer,
  graded integer,
  pending integer,
  overdue integer,
  oldest_pending timestamptz,
  avg_grading_days numeric,
  register_filled integer,
  register_total integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  perform public.assert_staff();
  return query
  with t as (
    select p.id, p.full_name from public.profiles p where p.role = 'TEACHER' and p.is_active
  ),
  o as (
    select co.id, co.teacher_id, co.classroom_id, co.subject_id
    from public.course_offerings co where co.is_active and co.teacher_id is not null
  ),
  asg as (
    select a.id, o.teacher_id
    from public.assignments a join o on o.id = a.offering_id
    where a.status <> 'DRAFT'
      and (coalesce(a.due_at, a.created_at) at time zone 'America/Lima')::date between p_from and p_to
  ),
  subs as (
    select asg.teacher_id,
           count(*)::int as received_n,
           count(*) filter (where sb.status = 'GRADED')::int as graded_n,
           avg(extract(epoch from (sb.graded_at - sb.submitted_at)) / 86400.0)
             filter (where sb.status = 'GRADED' and sb.graded_at is not null) as delay
    from asg join public.submissions sb on sb.assignment_id = asg.id
    group by 1
  ),
  pend as (
    -- Entregas esperando nota hoy (de cualquier fecha).
    select o.teacher_id,
           count(*)::int as pending_n,
           count(*) filter (where sb.submitted_at < now() - make_interval(days => p_late_days))::int as overdue_n,
           min(sb.submitted_at) as oldest
    from public.submissions sb
    join public.assignments a on a.id = sb.assignment_id
    join o on o.id = a.offering_id
    where sb.status = 'SUBMITTED'
    group by 1
  ),
  reg_total as (
    select o.teacher_id,
           sum((select count(*) from public.students s where s.classroom_id = o.classroom_id)
             * (select count(*) from public.competencies c where c.subject_id = o.subject_id and c.is_active))::int as n
    from o group by 1
  ),
  reg_filled as (
    select o.teacher_id, count(*)::int as n
    from public.competency_grades g join o on o.id = g.offering_id
    where p_period_id is not null and g.period_id = p_period_id and g.level is not null
    group by 1
  )
  select t.id, t.full_name,
         (select count(*) from o where o.teacher_id = t.id)::int,
         (select count(*) from asg where asg.teacher_id = t.id)::int,
         coalesce(subs.received_n, 0), coalesce(subs.graded_n, 0),
         coalesce(pend.pending_n, 0), coalesce(pend.overdue_n, 0), pend.oldest,
         round(subs.delay::numeric, 1),
         coalesce(reg_filled.n, 0), coalesce(reg_total.n, 0)
  from t
  left join subs on subs.teacher_id = t.id
  left join pend on pend.teacher_id = t.id
  left join reg_total on reg_total.teacher_id = t.id
  left join reg_filled on reg_filled.teacher_id = t.id
  order by coalesce(pend.overdue_n, 0) desc, t.full_name;
end;
$$;

-- ----------------------------------------------------------------------------
-- 4) Familias que no leen los comunicados
-- ----------------------------------------------------------------------------
drop function if exists public.dashboard_unread_families(date, date, integer);
create or replace function public.dashboard_unread_families(p_from date, p_to date, p_min_unread integer default 1)
returns table (
  student_id bigint,
  student_name text,
  classroom_id bigint,
  total integer,
  unread integer,
  consent_pending integer,
  family_accounts integer,
  last_unread_title text,
  last_unread_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  perform public.assert_staff();
  return query
  with r as (
    select cr.student_id as sid, cr.read_at, cr.response, c.response_type, c.title, c.published_at
    from public.circular_recipients cr
    join public.circulars c on c.id = cr.circular_id
    where (c.published_at at time zone 'America/Lima')::date between p_from and p_to
  ),
  agg as (
    select r.sid,
           count(*)::int as total_n,
           count(*) filter (where r.read_at is null)::int as unread_n,
           count(*) filter (where r.response_type = 'CONSENT' and r.response is null)::int as consent_n,
           (array_agg(r.title order by r.published_at desc) filter (where r.read_at is null))[1] as last_title,
           max(r.published_at) filter (where r.read_at is null) as last_at
    from r group by r.sid
  )
  select s.id,
         coalesce(s.last_name, '') || ', ' || coalesce(s.first_name, ''),
         s.classroom_id,
         agg.total_n, agg.unread_n, agg.consent_n,
         (select count(*) from public.student_guardians sg
            join public.guardians g on g.id = sg.guardian_id
           where sg.student_id = s.id and g.profile_id is not null)::int,
         agg.last_title, agg.last_at
  from agg
  join public.students s on s.id = agg.sid
  where agg.unread_n >= greatest(p_min_unread, 1)
  order by agg.unread_n desc, agg.consent_n desc, s.last_name, s.first_name;
end;
$$;

revoke all on function public.assert_staff() from public, anon;
revoke all on function public.school_days_between(date, date) from public, anon;
revoke all on function public.dashboard_classrooms(date, date, bigint) from public, anon;
revoke all on function public.dashboard_areas(bigint, bigint) from public, anon;
revoke all on function public.dashboard_teachers(date, date, bigint, integer) from public, anon;
revoke all on function public.dashboard_unread_families(date, date, integer) from public, anon;
grant execute on function public.assert_staff() to authenticated;
grant execute on function public.school_days_between(date, date) to authenticated;
grant execute on function public.dashboard_classrooms(date, date, bigint) to authenticated;
grant execute on function public.dashboard_areas(bigint, bigint) to authenticated;
grant execute on function public.dashboard_teachers(date, date, bigint, integer) to authenticated;
grant execute on function public.dashboard_unread_families(date, date, integer) to authenticated;

select 'Panel de dirección listo' as estado;
