-- ============================================================================
-- CAMPUS VIRTUAL TESLA · Script 24
-- Panel anti-trampa: indicadores de los sistemas de integridad académica
-- (script 23) para dirección y docentes.
--
-- Una sola función de lectura, integrity_overview(dias), que resume:
--   · evaluaciones en línea y qué protecciones tienen activadas,
--   · lo que detectó el monitoreo durante los exámenes (salidas, pegados,
--     copias, pantalla completa, otra pestaña, otro dispositivo, envíos solos),
--   · las entregas de texto analizadas (huella, cómo se escribieron),
--   · las alertas que los docentes ya revisaron.
-- Dirección (ADMIN, MANAGEMENT) ve todo el colegio; cada docente, solo sus
-- evaluaciones y tareas. No cambia datos ni permisos.
--
-- Requiere el script 23. Se puede volver a ejecutar.
-- ============================================================================

create or replace function public.integrity_overview(p_days integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_admin boolean := public.is_admin();
  v_since timestamptz := now() - make_interval(days => least(greatest(coalesce(p_days, 30), 1), 365));
  v_out jsonb;
begin
  if not v_admin and not public.is_teacher() then
    raise exception 'Solo dirección y docentes pueden ver el panel anti-trampa.';
  end if;

  with scope as (
    select a.id, a.kind, coalesce(a.quiz_settings, '{}'::jsonb) cfg
    from public.assignments a
    where v_admin or public.can_manage_assignment(a.id)
  ),
  quizzes as (select * from scope where kind = 'QUIZ'),
  att as (
    select t.integrity i, t.events ev, t.finished_at
    from public.quiz_attempts t
    join quizzes q on q.id = t.assignment_id
    where t.started_at >= v_since
  ),
  subs as (
    select si.words, si.writing w
    from public.submission_integrity si
    join public.submissions s on s.id = si.submission_id
    join scope sc on sc.id = s.assignment_id
    where si.updated_at >= v_since
  ),
  rev as (
    select r.status
    from public.integrity_reviews r
    join scope sc on sc.id = r.assignment_id
    where r.updated_at >= v_since
  )
  select jsonb_build_object(
    'scope', case when v_admin then 'SCHOOL' else 'MINE' end,
    'since', v_since,
    'quizzes', (
      select jsonb_build_object(
        'total', count(*),
        'free', count(*) filter (where cfg ->> 'integrity_level' = 'FREE'),
        'standard', count(*) filter (where coalesce(cfg ->> 'integrity_level', 'STANDARD') = 'STANDARD'),
        'strict', count(*) filter (where cfg ->> 'integrity_level' = 'STRICT'),
        'custom', count(*) filter (where cfg ->> 'integrity_level' = 'CUSTOM'),
        'with_code', count(*) filter (where exists (select 1 from public.quiz_access qa where qa.assignment_id = quizzes.id)),
        'lock_device', count(*) filter (where public.quiz_cfg(cfg, 'lock_device', false)),
        'sequential', count(*) filter (where public.quiz_cfg(cfg, 'sequential', false)),
        'block_paste', count(*) filter (where public.quiz_cfg(cfg, 'block_paste', false)),
        'fullscreen', count(*) filter (where public.quiz_cfg(cfg, 'fullscreen', false)),
        'watermark', count(*) filter (where public.quiz_cfg(cfg, 'watermark', false)),
        'shuffle', count(*) filter (where public.quiz_cfg(cfg, 'shuffle_questions', false) or public.quiz_cfg(cfg, 'shuffle_options', false)),
        'pick', count(*) filter (where cfg ->> 'pick_count' ~ '^[1-9]\d*$'),
        'time_limit', count(*) filter (where cfg ->> 'time_limit_min' ~ '^[1-9]\d*$' or nullif(cfg ->> 'start_until', '') is not null),
        'close_on_leave', count(*) filter (where cfg ->> 'leave_action' = 'CLOSE'),
        'hidden_answers', count(*) filter (where coalesce(cfg ->> 'show_answers', 'AFTER_SUBMIT') <> 'AFTER_SUBMIT')
      ) from quizzes
    ),
    'attempts', (
      select jsonb_build_object(
        'total', count(*),
        'finished', count(*) filter (where finished_at is not null),
        'with_events', count(*) filter (where jsonb_array_length(coalesce(ev, '[]'::jsonb)) > 0),
        'events', coalesce(sum(jsonb_array_length(coalesce(ev, '[]'::jsonb))), 0),
        'leaves', coalesce(sum(coalesce((i ->> 'leaves')::numeric, 0)), 0),
        'leave_ms', coalesce(sum(coalesce((i ->> 'leave_ms')::numeric, 0)), 0),
        'pastes', coalesce(sum(coalesce((i ->> 'pastes')::numeric, 0)), 0),
        'copies', coalesce(sum(coalesce((i ->> 'copies')::numeric, 0) + coalesce((i ->> 'context')::numeric, 0)), 0),
        'fs_exits', coalesce(sum(coalesce((i ->> 'fs_exits')::numeric, 0)), 0),
        'resizes', coalesce(sum(coalesce((i ->> 'resizes')::numeric, 0)), 0),
        'multitab', coalesce(sum(coalesce((i ->> 'multitab')::numeric, 0)), 0),
        'devices', coalesce(sum(coalesce((i ->> 'devices')::numeric, 0)), 0),
        'resumes', coalesce(sum(coalesce((i ->> 'resumes')::numeric, 0)), 0),
        'offline', coalesce(sum(coalesce((i ->> 'offline')::numeric, 0)), 0),
        'auto_closed', count(*) filter (where i ->> 'closed_by' = 'LEAVES'),
        'last_event', (select max((e ->> 's')::timestamptz) from att, jsonb_array_elements(coalesce(att.ev, '[]'::jsonb)) e)
      ) from att
    ),
    'submissions', (
      select jsonb_build_object(
        'analyzed', count(*),
        'with_text', count(*) filter (where words >= 40),
        'writing_logged', count(*) filter (where coalesce((w ->> 'typed')::numeric, 0) + coalesce((w ->> 'pasted')::numeric, 0) > 0),
        'mostly_pasted', count(*) filter (
          where words >= 40
            and coalesce((w ->> 'typed')::numeric, 0) + coalesce((w ->> 'pasted')::numeric, 0) > 0
            and coalesce((w ->> 'pasted')::numeric, 0) / (coalesce((w ->> 'typed')::numeric, 0) + coalesce((w ->> 'pasted')::numeric, 0)) >= 0.7
        )
      ) from subs
    ),
    'reviews', (
      select jsonb_build_object(
        'reviewed', count(*) filter (where status = 'REVIEWED'),
        'false_positive', count(*) filter (where status = 'FALSE_POSITIVE'),
        'confirmed', count(*) filter (where status = 'CONFIRMED')
      ) from rev
    )
  ) into v_out;

  return v_out;
end;
$$;

revoke all on function public.integrity_overview(integer) from public, anon;
grant execute on function public.integrity_overview(integer) to authenticated;
