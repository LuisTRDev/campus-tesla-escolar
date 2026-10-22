-- ============================================================================
-- CAMPUS VIRTUAL TESLA · Script 25
-- Retrato Tesla: el expediente de la familia.
--
-- Una sola función de lectura, child_overview(alumno), que junta en un único
-- resumen todo lo que el campus sabe del hijo y calcula el ÍNDICE TESLA, una
-- puntuación REFERENCIAL (no oficial) de 0 a 100 que no reemplaza la libreta.
--
-- Qué entra al índice (los pesos se cambian en campus_private.settings, clave
-- 'expediente_pesos'; si falta un componente, el índice se recalcula con los
-- demás):
--   · rendimiento (45): niveles AD/A/B/C del último bimestre PUBLICADO; si aún
--     no hay bimestre publicado, el promedio de las tareas ya calificadas.
--   · tareas (20): entregadas a tiempo (completo) o tarde (60 %) frente a las
--     que ya vencieron en el año.
--   · asistencia (20): ingresos puntuales (100 %) y tardanzas (80 %) frente a
--     los días de clase; las faltas justificadas y aprobadas no cuentan.
--   · constancia (15): racha de tareas a tiempo y XP reciente del Perfil Tesla
--     (si el colegio tiene el script 15; si no, no cuenta).
--
-- Solo la familia vinculada puede llamarla (no el alumno, ni el personal). Las
-- notas de un bimestre solo aparecen cuando dirección lo publicó. No muestra
-- observaciones privadas, datos de integridad ni compara con otros alumnos.
--
-- Requiere los scripts 01 a 20 (el Perfil Tesla, 15, es opcional). No cambia
-- datos ni permisos de otras tablas. Se puede volver a ejecutar.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Pesos del índice
-- ----------------------------------------------------------------------------
insert into campus_private.settings (key, value)
values ('expediente_pesos', '{"rendimiento":45,"tareas":20,"asistencia":20,"constancia":15}')
on conflict (key) do nothing;

-- ----------------------------------------------------------------------------
-- 2) Niveles ↔ puntos (AD 100 · A 85 · B 65 · C 40)
-- ----------------------------------------------------------------------------
create or replace function public.expediente_puntos(p_level text)
returns numeric
language sql
immutable
as $$
  select case p_level when 'AD' then 100 when 'A' then 85 when 'B' then 65 when 'C' then 40 end
$$;

create or replace function public.expediente_nivel(p_points numeric)
returns text
language sql
immutable
as $$
  select case
    when p_points is null then null
    when p_points >= 92.5 then 'AD'
    when p_points >= 75 then 'A'
    when p_points >= 52.5 then 'B'
    else 'C'
  end
$$;

-- ----------------------------------------------------------------------------
-- 3) El expediente (expediente_compute calcula; child_overview revisa permisos)
-- ----------------------------------------------------------------------------
create or replace function public.expediente_compute(p_student_id bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_today date := (now() at time zone 'America/Lima')::date;
  v_end date;
  v_from date;
  st record;
  v_year_id bigint;
  v_year integer;
  v_weights jsonb;
  v_periods jsonb;
  v_areas jsonb;
  v_period_scores jsonb;
  v_cur_pts numeric;
  v_prev_pts numeric;
  v_graded_avg numeric;
  v_school_days integer := 0;
  v_ontime integer := 0;
  v_late integer := 0;
  v_justified integer := 0;
  v_absent integer := 0;
  v_att_days jsonb;
  v_holidays jsonb;
  v_expected integer := 0;
  v_t_ontime integer := 0;
  v_t_late integer := 0;
  v_t_missing integer := 0;
  v_pending jsonb;
  v_overdue jsonb;
  v_streak integer;
  v_xp integer;
  v_xp30 integer;
  v_level integer;
  v_achievements integer;
  v_recent_ach jsonb;
  v_tesla jsonb := null;
  v_circ jsonb;
  v_circ_unread integer;
  v_circ_answer integer;
  v_appts jsonb;
  v_just_pending integer;
  v_events jsonb;
  v_signals jsonb;
  v_parts jsonb := '[]'::jsonb;
  v_part jsonb;
  v_total_w numeric := 0;
  v_sum numeric := 0;
  v_value integer;
  v_rend numeric;
  v_rend_detail text;
  v_task_score numeric;
  v_att_score numeric;
  v_const_score numeric;
  v_w numeric;
begin
  if p_student_id is null then
    raise exception 'El alumno no existe.';
  end if;

  select s.id, s.first_name, s.last_name, s.classroom_id, c.grade, c.section, c.level, c.tutor_id,
         (select p.full_name from public.profiles p where p.id = c.tutor_id) as tutor_name
    into st
  from public.students s
  left join public.classrooms c on c.id = s.classroom_id
  where s.id = p_student_id;
  if not found then
    raise exception 'El alumno no existe.';
  end if;

  -- Pesos (con respaldo si el ajuste está mal escrito).
  begin
    select value::jsonb into v_weights from campus_private.settings where key = 'expediente_pesos';
  exception when others then
    v_weights := null;
  end;
  v_weights := coalesce(v_weights, '{"rendimiento":45,"tareas":20,"asistencia":20,"constancia":15}'::jsonb);

  -- Año y bimestres.
  select y.id, y.year into v_year_id, v_year
  from public.academic_years y where y.is_current limit 1;

  select min(gp.starts_on) into v_from from public.grading_periods gp where gp.academic_year_id = v_year_id;
  v_from := least(coalesce(v_from, date_trunc('year', v_today)::date), v_today);

  select coalesce(jsonb_agg(jsonb_build_object(
           'number', gp.number, 'name', gp.name, 'starts_on', gp.starts_on, 'ends_on', gp.ends_on,
           'is_published', gp.is_published, 'is_current', v_today between gp.starts_on and gp.ends_on
         ) order by gp.number), '[]'::jsonb)
    into v_periods
  from public.grading_periods gp where gp.academic_year_id = v_year_id;

  -- ------------------------------------------------------------------------
  -- Notas: solo bimestres publicados
  -- ------------------------------------------------------------------------
  with g as (
    select gp.number as pn, sj.id as sid, sj.name, sj.short_name, sj.color,
           avg(public.expediente_puntos(cg.level)) as pts
    from public.competency_grades cg
    join public.grading_periods gp on gp.id = cg.period_id and gp.is_published and gp.academic_year_id = v_year_id
    join public.course_offerings o on o.id = cg.offering_id
    join public.subjects sj on sj.id = o.subject_id
    where cg.student_id = p_student_id and cg.level is not null
    group by gp.number, sj.id, sj.name, sj.short_name, sj.color
  )
  select coalesce(jsonb_agg(a order by a ->> 'name'), '[]'::jsonb) into v_areas
  from (
    select jsonb_build_object(
      'subject_id', g.sid, 'name', g.name, 'short_name', g.short_name, 'color', g.color,
      'periods', jsonb_agg(jsonb_build_object('number', g.pn, 'points', round(g.pts, 1), 'level', public.expediente_nivel(g.pts)) order by g.pn)
    ) as a
    from g group by g.sid, g.name, g.short_name, g.color
  ) q;

  with g as (
    select gp.number as pn, sj.id as sid,
           avg(public.expediente_puntos(cg.level)) as pts
    from public.competency_grades cg
    join public.grading_periods gp on gp.id = cg.period_id and gp.is_published and gp.academic_year_id = v_year_id
    join public.course_offerings o on o.id = cg.offering_id
    join public.subjects sj on sj.id = o.subject_id
    where cg.student_id = p_student_id and cg.level is not null
    group by gp.number, sj.id
  ),
  per as (
    select pn, avg(pts) as pts from g group by pn
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'number', per.pn, 'points', round(per.pts, 1), 'level', public.expediente_nivel(per.pts)
         ) order by per.pn), '[]'::jsonb),
         (select pts from per order by pn desc limit 1),
         (select pts from per order by pn desc offset 1 limit 1)
    into v_period_scores, v_cur_pts, v_prev_pts
  from per;

  -- Promedio de las tareas ya calificadas del año (respaldo mientras no hay bimestre publicado).
  select avg(case
           when sb.level is not null then public.expediente_puntos(sb.level)
           when sb.score is not null then least(100, greatest(0, sb.score / nullif(a.max_score, 0) * 100))
         end)
    into v_graded_avg
  from public.submissions sb
  join public.assignments a on a.id = sb.assignment_id
  where sb.student_id = p_student_id and sb.status = 'GRADED' and sb.graded_at >= v_from::timestamptz;

  -- ------------------------------------------------------------------------
  -- Asistencia (datos de Tesla)
  -- ------------------------------------------------------------------------
  begin
    v_end := case when exists (select 1 from public.attendance a where a.student_id = p_student_id and a.date = v_today)
                  then v_today else v_today - 1 end;
    if v_end >= v_from then
      v_school_days := coalesce(public.school_days_between(v_from, v_end), 0);
      select count(*) filter (where a.status = 'ON_TIME'), count(*) filter (where a.status = 'LATE')
        into v_ontime, v_late
      from public.attendance a
      where a.student_id = p_student_id and a.date between v_from and v_end
        and extract(isodow from a.date) between 1 and 5;

      select count(*) into v_justified
      from generate_series(v_from, v_end, interval '1 day') d
      where extract(isodow from d) between 1 and 5
        and public.school_days_between(d::date, d::date) = 1
        and exists (select 1 from public.absence_justifications j
                    where j.student_id = p_student_id and j.status = 'APPROVED' and j.kind = 'FALTA'
                      and d::date between j.date_from and j.date_to)
        and not exists (select 1 from public.attendance a where a.student_id = p_student_id and a.date = d::date);
    end if;

    select coalesce(jsonb_agg(jsonb_build_object('d', a.date, 's', a.status) order by a.date), '[]'::jsonb)
      into v_att_days
    from public.attendance a
    where a.student_id = p_student_id and a.date between v_from and v_today;

    select coalesce(jsonb_agg(distinct d::date order by d::date), '[]'::jsonb) into v_holidays
    from public.school_events e,
         generate_series(greatest(e.starts_on, v_from), least(e.ends_on, v_today), interval '1 day') d
    where e.kind = 'HOLIDAY' and e.scope = 'SCHOOL';
  exception when undefined_table then
    v_att_days := '[]'::jsonb;
    v_holidays := '[]'::jsonb;
    v_school_days := 0;
  end;
  v_absent := greatest(0, v_school_days - v_ontime - v_late - v_justified);

  -- ------------------------------------------------------------------------
  -- Tareas del año
  -- ------------------------------------------------------------------------
  with a as (
    select asg.id, asg.title, asg.due_at, sj.name as course, o.id as offering_id,
           sb.id as sid, sb.is_late, sb.status
    from public.course_offerings o
    join public.subjects sj on sj.id = o.subject_id
    join public.assignments asg on asg.offering_id = o.id
      and asg.status in ('PUBLISHED', 'CLOSED')
      and asg.due_at is not null
      and (asg.published_at is null or asg.published_at <= now())
    left join public.submissions sb on sb.assignment_id = asg.id and sb.student_id = p_student_id
    where o.classroom_id = st.classroom_id and o.is_active
      and asg.due_at >= v_from::timestamptz
  )
  select count(*) filter (where a.due_at < now() or a.sid is not null),
         count(*) filter (where a.sid is not null and not a.is_late),
         count(*) filter (where a.sid is not null and a.is_late),
         count(*) filter (where a.sid is null and a.due_at < now()),
         coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'title', x.title, 'course', x.course, 'offering_id', x.offering_id, 'due_at', x.due_at) order by x.due_at)
                   from (select * from a where a.sid is null and a.due_at >= now() order by a.due_at limit 5) x), '[]'::jsonb),
         coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'title', x.title, 'course', x.course, 'offering_id', x.offering_id, 'due_at', x.due_at) order by x.due_at desc)
                   from (select * from a where a.sid is null and a.due_at < now() order by a.due_at desc limit 5) x), '[]'::jsonb)
    into v_expected, v_t_ontime, v_t_late, v_t_missing, v_pending, v_overdue
  from a;

  -- ------------------------------------------------------------------------
  -- Perfil Tesla (opcional: script 15)
  -- ------------------------------------------------------------------------
  begin
    select coalesce(w.xp, 0) into v_xp from (select 1) one left join public.student_wallets w on w.student_id = p_student_id;
    v_level := public.tesla_level(v_xp);
    v_streak := public.tesla_current_streak(p_student_id);
    select coalesce(sum(l.xp), 0) into v_xp30
    from public.point_ledger l
    where l.student_id = p_student_id and l.created_at >= now() - interval '30 days'
      and l.source in ('RULE', 'RECOGNITION', 'ACHIEVEMENT', 'GOAL');
    select count(*) into v_achievements from public.student_achievements sa where sa.student_id = p_student_id;
    select coalesce(jsonb_agg(jsonb_build_object('name', x.name, 'icon', x.icon, 'rarity', x.rarity, 'earned_at', x.earned_at) order by x.earned_at desc), '[]'::jsonb)
      into v_recent_ach
    from (
      select ac.name, ac.icon, ac.rarity, sa.earned_at
      from public.student_achievements sa join public.achievements ac on ac.id = sa.achievement_id
      where sa.student_id = p_student_id and not coalesce(ac.is_secret, false)
      order by sa.earned_at desc limit 4
    ) x;
    v_tesla := jsonb_build_object(
      'xp', v_xp, 'level', v_level, 'streak', v_streak, 'xp30', v_xp30, 'achievements', v_achievements,
      'recent', v_recent_ach,
      'star', public.tesla_pin_name(public.tesla_pin_tier(v_level)),
      'next_level_xp', public.tesla_level_xp(v_level + 1), 'level_xp', public.tesla_level_xp(v_level)
    );
  exception when undefined_table or undefined_function or undefined_column then
    v_tesla := null;
  end;

  -- ------------------------------------------------------------------------
  -- Lo que espera a la familia
  -- ------------------------------------------------------------------------
  select count(*) filter (where r.read_at is null),
         count(*) filter (where c.response_type = 'CONSENT' and r.response is null),
         coalesce(jsonb_agg(jsonb_build_object(
           'id', c.id, 'title', c.title, 'published_at', c.published_at,
           'read', r.read_at is not null, 'needs_answer', c.response_type = 'CONSENT' and r.response is null
         ) order by c.published_at desc) filter (where r.read_at is null or (c.response_type = 'CONSENT' and r.response is null)), '[]'::jsonb)
    into v_circ_unread, v_circ_answer, v_circ
  from public.circular_recipients r
  join public.circulars c on c.id = r.circular_id
  where r.student_id = p_student_id and c.published_at >= v_from::timestamptz;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', s.id, 'starts_at', s.starts_at, 'mode', s.mode, 'location', s.location,
           'teacher', (select p.full_name from public.profiles p where p.id = s.teacher_id)
         ) order by s.starts_at), '[]'::jsonb)
    into v_appts
  from (select * from public.appointment_slots
        where student_id = p_student_id and status = 'BOOKED' and starts_at >= now()
        order by starts_at limit 3) s;

  select count(*) into v_just_pending
  from public.absence_justifications j where j.student_id = p_student_id and j.status = 'PENDING';

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', e.id, 'title', e.title, 'kind', e.kind, 'starts_on', e.starts_on, 'ends_on', e.ends_on
         ) order by e.starts_on), '[]'::jsonb)
    into v_events
  from (
    select * from public.school_events e
    where e.ends_on >= v_today and e.starts_on <= v_today + 21 and e.kind <> 'HOLIDAY'
      and (e.scope = 'SCHOOL'
           or (e.scope = 'LEVEL' and e.level = st.level)
           or (e.scope = 'CLASSROOM' and e.classroom_id = st.classroom_id)
           or (e.scope = 'COURSE' and e.offering_id in (select o.id from public.course_offerings o where o.classroom_id = st.classroom_id)))
    order by e.starts_on limit 6
  ) e;

  -- Avisos amables de las dos últimas semanas.
  v_signals := jsonb_build_object(
    'missing_14d', (select count(*) from public.course_offerings o
                    join public.assignments asg on asg.offering_id = o.id and asg.status in ('PUBLISHED', 'CLOSED')
                    where o.classroom_id = st.classroom_id and o.is_active
                      and asg.due_at >= now() - interval '14 days' and asg.due_at < now()
                      and not exists (select 1 from public.submissions sb where sb.assignment_id = asg.id and sb.student_id = p_student_id)),
    'late_14d', (select count(*) from public.attendance a
                 where a.student_id = p_student_id and a.status = 'LATE' and a.date >= v_today - 14),
    'low_30d', (select count(*) from public.submissions sb join public.assignments a on a.id = sb.assignment_id
                where sb.student_id = p_student_id and sb.status = 'GRADED' and sb.graded_at >= now() - interval '30 days'
                  and (sb.level in ('B', 'C') or (a.grading_type = 'SCORE' and sb.score is not null and sb.score / nullif(a.max_score, 0) * 20 < 11)))
  );

  -- ------------------------------------------------------------------------
  -- Índice Tesla
  -- ------------------------------------------------------------------------
  if v_cur_pts is not null then
    v_rend := v_cur_pts;
    v_rend_detail := 'Niveles del último bimestre publicado';
  elsif v_graded_avg is not null then
    v_rend := v_graded_avg;
    v_rend_detail := 'Promedio de tus tareas calificadas (aún no hay bimestre publicado)';
  end if;
  if v_rend is not null then
    v_parts := v_parts || jsonb_build_object('key', 'rendimiento', 'label', 'Rendimiento', 'value', round(v_rend),
      'weight', coalesce((v_weights ->> 'rendimiento')::numeric, 45), 'detail', v_rend_detail);
  end if;

  if v_expected > 0 then
    v_task_score := least(100, (v_t_ontime + 0.6 * v_t_late) / v_expected * 100);
    v_parts := v_parts || jsonb_build_object('key', 'tareas', 'label', 'Tareas', 'value', round(v_task_score),
      'weight', coalesce((v_weights ->> 'tareas')::numeric, 20),
      'detail', v_t_ontime || ' a tiempo, ' || v_t_late || ' tarde y ' || v_t_missing || ' sin entregar de ' || v_expected);
  end if;

  if v_school_days - v_justified > 0 then
    v_att_score := least(100, (v_ontime + 0.8 * v_late) / (v_school_days - v_justified) * 100);
    v_parts := v_parts || jsonb_build_object('key', 'asistencia', 'label', 'Asistencia', 'value', round(v_att_score),
      'weight', coalesce((v_weights ->> 'asistencia')::numeric, 20),
      'detail', v_ontime || ' puntuales y ' || v_late || ' tardanzas en ' || v_school_days || ' días de clase');
  end if;

  if v_tesla is not null then
    v_const_score := least(100, 0.6 * least(100, v_streak * 10) + 0.4 * least(100, v_xp30 / 1.5));
    v_parts := v_parts || jsonb_build_object('key', 'constancia', 'label', 'Constancia', 'value', round(v_const_score),
      'weight', coalesce((v_weights ->> 'constancia')::numeric, 15),
      'detail', 'Racha de ' || v_streak || ' tareas a tiempo y ' || v_xp30 || ' XP en 30 días');
  end if;

  for v_part in select * from jsonb_array_elements(v_parts) loop
    v_w := greatest((v_part ->> 'weight')::numeric, 0);
    v_total_w := v_total_w + v_w;
    v_sum := v_sum + (v_part ->> 'value')::numeric * v_w;
  end loop;
  v_value := case when v_total_w > 0 then round(v_sum / v_total_w)::int else null end;

  return jsonb_build_object(
    'generated_at', now(),
    'student', jsonb_build_object(
      'id', st.id, 'first_name', st.first_name, 'last_name', st.last_name,
      'classroom', btrim(coalesce(st.grade::text, '') || '° ' || coalesce(st.section, '') || ' · ' || coalesce(st.level, '')),
      'level', st.level, 'tutor', st.tutor_name
    ),
    'year', v_year,
    'periods', v_periods,
    'score', jsonb_build_object('value', v_value, 'parts', v_parts),
    'grades', jsonb_build_object(
      'areas', v_areas, 'periods', v_period_scores,
      'current', round(v_cur_pts, 1), 'previous', round(v_prev_pts, 1),
      'graded_avg', round(v_graded_avg, 1)
    ),
    'attendance', jsonb_build_object(
      'from', v_from, 'to', v_end, 'school_days', v_school_days, 'on_time', v_ontime, 'late', v_late,
      'justified', v_justified, 'absent', v_absent, 'days', v_att_days, 'holidays', v_holidays
    ),
    'tasks', jsonb_build_object(
      'expected', v_expected, 'on_time', v_t_ontime, 'late', v_t_late, 'missing', v_t_missing,
      'pending', v_pending, 'overdue', v_overdue
    ),
    'tesla', v_tesla,
    'family', jsonb_build_object(
      'circulars_unread', coalesce(v_circ_unread, 0), 'circulars_to_answer', coalesce(v_circ_answer, 0), 'circulars', v_circ,
      'appointments', v_appts, 'justifications_pending', v_just_pending, 'events', v_events
    ),
    'signals', v_signals
  );
end;
$$;

-- Quien llama (la familia) solo puede pedir a sus propios hijos.
create or replace function public.child_overview(p_student_id bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_student_id is null or p_student_id not in (select public.my_children_ids()) then
    raise exception 'Solo la familia del alumno puede ver su expediente.';
  end if;
  return public.expediente_compute(p_student_id);
end;
$$;

revoke all on function public.expediente_compute(bigint) from public, anon, authenticated;
revoke all on function public.expediente_puntos(text) from public, anon;
revoke all on function public.expediente_nivel(numeric) from public, anon;
revoke all on function public.child_overview(bigint) from public, anon;
grant execute on function public.expediente_puntos(text) to authenticated;
grant execute on function public.expediente_nivel(numeric) to authenticated;
grant execute on function public.child_overview(bigint) to authenticated;

select 'Retrato Tesla listo' as estado;
