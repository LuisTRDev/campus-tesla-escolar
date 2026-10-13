-- ============================================================================
-- CAMPUS VIRTUAL TESLA · FASE 1 · Script 05 de 06
-- Funciones: vincular cuentas y generar el resumen semanal de las familias.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Vincular una cuenta de Auth con su rol (y con el alumno/apoderado)
--    Úsala desde el SQL Editor o desde la app como administrador.
-- ----------------------------------------------------------------------------
create or replace function public.admin_link_account(
  p_user_id uuid,
  p_role text,
  p_full_name text,
  p_student_id bigint default null,
  p_guardian_id bigint default null,
  p_dni text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := upper(btrim(p_role));
begin
  if not (public.is_trusted_backend() or public.is_admin()) then
    raise exception 'Solo un administrador puede vincular cuentas.';
  end if;
  if v_role not in ('ADMIN', 'MANAGEMENT', 'AUXILIARY', 'TEACHER', 'STUDENT', 'GUARDIAN') then
    raise exception 'Rol no válido: %', p_role;
  end if;
  if v_role = 'STUDENT' and p_student_id is null then
    raise exception 'Para una cuenta de alumno indica p_student_id.';
  end if;
  if v_role = 'GUARDIAN' and p_guardian_id is null then
    raise exception 'Para una cuenta de apoderado indica p_guardian_id.';
  end if;

  insert into public.profiles (id, full_name, role, dni, is_active)
  values (p_user_id, btrim(p_full_name), v_role, nullif(btrim(coalesce(p_dni, '')), ''), true)
  on conflict (id) do update
  set full_name = excluded.full_name,
      role = excluded.role,
      dni = coalesce(excluded.dni, public.profiles.dni),
      is_active = true;

  -- Quita vínculos anteriores de esta cuenta y crea el nuevo.
  update public.students set profile_id = null where profile_id = p_user_id and id is distinct from p_student_id;
  update public.guardians set profile_id = null where profile_id = p_user_id and id is distinct from p_guardian_id;

  if v_role = 'STUDENT' then
    update public.students set profile_id = p_user_id where id = p_student_id;
    if not found then raise exception 'No existe el alumno %', p_student_id; end if;
  elsif v_role = 'GUARDIAN' then
    update public.guardians set profile_id = p_user_id where id = p_guardian_id;
    if not found then raise exception 'No existe el apoderado %', p_guardian_id; end if;
  end if;
end;
$$;

-- Atajo para el SQL Editor usando el correo de la cuenta.
-- Ejemplo:
--   select public.link_account_by_email('ana.torres@colegio.pe', 'TEACHER', 'Ana Torres');
create or replace function public.link_account_by_email(
  p_email text,
  p_role text,
  p_full_name text,
  p_student_id bigint default null,
  p_guardian_id bigint default null
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user_id uuid;
begin
  if not (public.is_trusted_backend() or public.is_admin()) then
    raise exception 'Solo un administrador puede vincular cuentas.';
  end if;

  select u.id into v_user_id from auth.users u where lower(u.email) = lower(btrim(p_email));
  if v_user_id is null then
    raise exception 'No hay una cuenta con el correo %. Créala en Authentication > Users.', p_email;
  end if;

  perform public.admin_link_account(v_user_id, p_role, p_full_name, p_student_id, p_guardian_id);
  return v_user_id;
end;
$$;

revoke all on function public.admin_link_account(uuid, text, text, bigint, bigint, text) from public, anon;
revoke all on function public.link_account_by_email(text, text, text, bigint, bigint) from public, anon, authenticated;
grant execute on function public.admin_link_account(uuid, text, text, bigint, bigint, text) to authenticated;

-- ----------------------------------------------------------------------------
-- 2) Resumen semanal por alumno
--    Semana = lunes a domingo, hora de Lima.
--    Se puede ejecutar a mano o programar con pg_cron (ver al final).
-- ----------------------------------------------------------------------------
create or replace function public.generate_weekly_digests(p_week_start date default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tz constant text := 'America/Lima';
  v_today date := (now() at time zone v_tz)::date;
  v_week_start date := coalesce(p_week_start, date_trunc('week', v_today)::date);
  v_week_end date := v_week_start + 6;
  v_school_days integer;
  v_count integer := 0;
  s record;
  v_on_time integer;
  v_late integer;
  v_no_record integer;
  v_notifications jsonb;
  v_due_total integer;
  v_due_done integer;
  v_missing jsonb;
  v_graded jsonb;
  v_upcoming jsonb;
  v_lines text[];
  v_item jsonb;
begin
  if not (public.is_trusted_backend() or public.is_admin()) then
    raise exception 'Solo un administrador puede generar los resúmenes.';
  end if;

  -- Días hábiles transcurridos de la semana (lunes a viernes, hasta hoy).
  select count(*) into v_school_days
  from generate_series(v_week_start, least(v_week_start + 4, v_today), interval '1 day') d
  where extract(isodow from d) between 1 and 5;

  for s in
    select st.id, st.first_name, st.last_name, st.classroom_id
    from public.students st
    where st.classroom_id is not null
  loop
    -- Asistencia
    select count(*) filter (where a.status = 'ON_TIME'),
           count(*) filter (where a.status = 'LATE')
    into v_on_time, v_late
    from public.attendance a
    where a.student_id = s.id and a.date between v_week_start and v_week_end;

    v_no_record := greatest(v_school_days - (v_on_time + v_late), 0);

    -- Notificaciones de conducta / presentación / tardanza
    select coalesce(jsonb_agg(jsonb_build_object(
             'date', n.date,
             'type', n.notification_type,
             'observation', n.observation
           ) order by n.date), '[]'::jsonb)
    into v_notifications
    from public.notifications n
    where n.student_id = s.id and not n.voided
      and n.date between v_week_start and v_week_end;

    -- Tareas que vencían esta semana
    select count(*),
           count(sb.id)
    into v_due_total, v_due_done
    from public.assignments a
    join public.course_offerings o on o.id = a.offering_id and o.is_active
    left join public.submissions sb on sb.assignment_id = a.id and sb.student_id = s.id
    where o.classroom_id = s.classroom_id
      and a.status in ('PUBLISHED', 'CLOSED')
      and (a.due_at at time zone v_tz)::date between v_week_start and v_week_end;

    select coalesce(jsonb_agg(jsonb_build_object(
             'course', sj.name,
             'title', a.title,
             'due_at', a.due_at
           ) order by a.due_at), '[]'::jsonb)
    into v_missing
    from public.assignments a
    join public.course_offerings o on o.id = a.offering_id and o.is_active
    join public.subjects sj on sj.id = o.subject_id
    where o.classroom_id = s.classroom_id
      and a.status in ('PUBLISHED', 'CLOSED')
      and a.due_at is not null
      and a.due_at < now()
      and (a.due_at at time zone v_tz)::date between v_week_start and v_week_end
      and not exists (select 1 from public.submissions sb where sb.assignment_id = a.id and sb.student_id = s.id);

    -- Calificaciones recibidas esta semana
    select coalesce(jsonb_agg(jsonb_build_object(
             'course', sj.name,
             'title', a.title,
             'score', sb.score,
             'max_score', a.max_score,
             'level', sb.level,
             'grading_type', a.grading_type
           ) order by sb.graded_at), '[]'::jsonb)
    into v_graded
    from public.submissions sb
    join public.assignments a on a.id = sb.assignment_id
    join public.course_offerings o on o.id = a.offering_id
    join public.subjects sj on sj.id = o.subject_id
    where sb.student_id = s.id
      and sb.status = 'GRADED'
      and (sb.graded_at at time zone v_tz)::date between v_week_start and v_week_end;

    -- Lo que viene la próxima semana
    select coalesce(jsonb_agg(jsonb_build_object(
             'course', sj.name,
             'title', a.title,
             'due_at', a.due_at
           ) order by a.due_at), '[]'::jsonb)
    into v_upcoming
    from public.assignments a
    join public.course_offerings o on o.id = a.offering_id and o.is_active
    join public.subjects sj on sj.id = o.subject_id
    where o.classroom_id = s.classroom_id
      and a.status = 'PUBLISHED'
      and (a.due_at at time zone v_tz)::date between v_week_end + 1 and v_week_end + 7
      and not exists (select 1 from public.submissions sb where sb.assignment_id = a.id and sb.student_id = s.id);

    -- Texto para leer o enviar por WhatsApp
    v_lines := array[
      format('Resumen de la semana del %s al %s — %s %s',
             to_char(v_week_start, 'DD/MM'), to_char(v_week_end, 'DD/MM'),
             s.first_name, s.last_name),
      format('Asistencia: %s puntual(es), %s tardanza(s)%s.',
             v_on_time, v_late,
             case when v_no_record > 0 then format(', %s día(s) sin registro de ingreso', v_no_record) else '' end)
    ];

    if v_due_total > 0 then
      v_lines := v_lines || format('Tareas de la semana: entregó %s de %s.', v_due_done, v_due_total);
    end if;

    for v_item in select * from jsonb_array_elements(v_missing) loop
      v_lines := v_lines || format('Falta entregar: %s (%s).', v_item->>'title', v_item->>'course');
    end loop;

    for v_item in select * from jsonb_array_elements(v_graded) loop
      v_lines := v_lines || format('Nota en %s, "%s": %s.',
        v_item->>'course', v_item->>'title',
        case when v_item->>'grading_type' = 'LEVEL'
             then coalesce(v_item->>'level', '-')
             else coalesce(trim_scale((v_item->>'score')::numeric)::text, '-') || '/' ||
                  trim_scale((v_item->>'max_score')::numeric)::text
        end);
    end loop;

    if jsonb_array_length(v_notifications) > 0 then
      v_lines := v_lines || format('Notificaciones del colegio esta semana: %s.', jsonb_array_length(v_notifications));
    end if;

    for v_item in select * from jsonb_array_elements(v_upcoming) loop
      v_lines := v_lines || format('Próxima semana: %s (%s), vence el %s.',
        v_item->>'title', v_item->>'course',
        to_char(((v_item->>'due_at')::timestamptz at time zone v_tz), 'DD/MM "a las" HH24:MI'));
    end loop;

    insert into public.weekly_digests (student_id, week_start, summary, text_body, generated_at)
    values (
      s.id,
      v_week_start,
      jsonb_build_object(
        'week_start', v_week_start,
        'week_end', v_week_end,
        'school_days', v_school_days,
        'attendance', jsonb_build_object('on_time', v_on_time, 'late', v_late, 'no_record', v_no_record),
        'assignments', jsonb_build_object('due', v_due_total, 'delivered', v_due_done, 'missing', v_missing),
        'graded', v_graded,
        'notifications', v_notifications,
        'upcoming', v_upcoming
      ),
      array_to_string(v_lines, E'\n'),
      now()
    )
    on conflict (student_id, week_start) do update
    set summary = excluded.summary,
        text_body = excluded.text_body,
        generated_at = excluded.generated_at;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.generate_weekly_digests(date) from public, anon;
grant execute on function public.generate_weekly_digests(date) to authenticated;

-- ----------------------------------------------------------------------------
-- 3) (Opcional) Programar el resumen cada viernes a las 5:00 p. m. de Lima
--    Activa primero la extensión: Database > Extensions > pg_cron.
--    Luego descomenta y ejecuta:
-- ----------------------------------------------------------------------------
-- select cron.schedule(
--   'campus-weekly-digest',
--   '0 22 * * 5',                       -- 22:00 UTC = 17:00 Lima
--   $$select public.generate_weekly_digests()$$
-- );

-- ----------------------------------------------------------------------------
-- 4) Revisión de funciones SECURITY DEFINER de Tesla
--    Estas funciones ignoran RLS. Si una devuelve datos del colegio, debe
--    empezar con:   if not public.is_staff() then raise exception 'No autorizado'; end if;
--    La columna "protegida" indica si ya contiene esa validación.
-- ----------------------------------------------------------------------------
select p.proname as funcion,
       pg_get_function_identity_arguments(p.oid) as argumentos,
       position('is_staff' in p.prosrc) > 0 or position('is_admin' in p.prosrc) > 0 as protegida
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.prosecdef
  and p.proname not in (
    'app_role', 'is_staff', 'is_admin', 'is_teacher', 'my_self_student_id',
    'my_guardian_ids', 'my_student_ids', 'family_classroom_ids', 'teacher_classroom_ids',
    'can_view_offering', 'can_manage_offering', 'can_manage_assignment', 'can_view_student',
    'enforce_submission_rules', 'protect_profile_role', 'admin_link_account',
    'link_account_by_email', 'generate_weekly_digests', 'is_trusted_backend'
  )
order by protegida, funcion;
