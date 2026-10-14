-- ============================================================================
-- CAMPUS VIRTUAL TESLA · Script 23
-- Integridad académica: evaluaciones seguras, monitoreo durante el examen,
-- detección de copia entre alumnos y análisis de originalidad de las entregas.
--
--   Evaluaciones en línea (quiz_settings, todo opcional y por evaluación):
--     pick_count     Cada alumno recibe N preguntas al azar de las que tenga
--     sequential     Una pregunta a la vez, sin volver atrás (el servidor
--                    entrega la siguiente solo al responder la actual)
--     lock_device    El intento queda ligado al dispositivo donde empezó
--     start_until    Hora límite para empezar (además de la fecha de entrega)
--     leave_action   Al salir de la app: LOG (registrar), WARN (avisar) o
--                    CLOSE (enviar sola al llegar a max_leaves salidas)
--     block_paste, watermark, fullscreen   Modo examen en la app
--     Código de acceso: tabla quiz_access (los alumnos no la pueden leer)
--
--   Respuestas correctas: por defecto se muestran después de la fecha límite
--   y nunca mientras al alumno le queden intentos.
--
--   Monitoreo: quiz_log_events guarda las salidas de la app, textos pegados,
--   pantalla completa, varias pestañas, tiempo por pregunta, etc.
--   quiz_integrity_report cruza las respuestas: errores idénticos entre
--   alumnos, desarrollos parecidos, respuestas demasiado rápidas y notas muy
--   por encima de su promedio.
--
--   Entregas: cada texto entregado guarda una huella (winnowing de 5 palabras,
--   como MOSS) y rasgos de estilo. integrity_submission_report compara con
--   todas las entregas del colegio (otras secciones y años anteriores),
--   encuentra enlaces de Drive repetidos y compara el estilo con el historial
--   del propio alumno. La app suma cómo se escribió el texto (pegado o tecleado).
--
-- Todo es gratuito (solo SQL) y no sube archivos: funciona igual en modo
-- enlaces y en modo archivos. Son señales para que el docente revise; nada se
-- sanciona solo.
--
-- Requiere los scripts 01 a 18. Se puede volver a ejecutar. Si vuelves a
-- ejecutar el 18, ejecuta otra vez este (el 18 reemplaza las funciones del examen).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Columnas y tablas
-- ----------------------------------------------------------------------------
alter table public.quiz_attempts add column if not exists device_id text;
alter table public.quiz_attempts add column if not exists current_idx integer not null default 0;
alter table public.quiz_attempts add column if not exists integrity jsonb not null default '{}'::jsonb;
alter table public.quiz_attempts add column if not exists events jsonb not null default '[]'::jsonb;
alter table public.quiz_attempts drop constraint if exists quiz_attempts_device_check;
alter table public.quiz_attempts add constraint quiz_attempts_device_check check (device_id is null or char_length(device_id) <= 64);

-- Código de acceso de la evaluación: solo lo ve y cambia el docente.
create table if not exists public.quiz_access (
  assignment_id bigint primary key references public.assignments(id) on delete cascade,
  code text not null check (code ~ '^[A-Z0-9]{4,12}$'),
  updated_at timestamptz not null default now()
);

-- Revisión del docente sobre una alerta (intento o entrega).
create table if not exists public.integrity_reviews (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('ATTEMPT', 'SUBMISSION')),
  ref_id bigint not null,
  assignment_id bigint not null references public.assignments(id) on delete cascade,
  status text not null check (status in ('REVIEWED', 'FALSE_POSITIVE', 'CONFIRMED')),
  note text check (note is null or char_length(note) <= 500),
  reviewed_by uuid references public.profiles(id) on delete set null default auth.uid(),
  updated_at timestamptz not null default now(),
  unique (kind, ref_id)
);
create index if not exists idx_integrity_reviews_assignment on public.integrity_reviews(assignment_id);

-- Huella y rasgos de cada entrega con texto. Solo se lee con las funciones
-- de abajo (sin políticas: nadie la consulta directo).
create table if not exists public.submission_integrity (
  submission_id bigint primary key references public.submissions(id) on delete cascade,
  fp integer[] not null default '{}',
  words integer not null default 0,
  features jsonb not null default '{}'::jsonb,
  writing jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
create index if not exists idx_submission_integrity_fp on public.submission_integrity using gin (fp);

alter table public.quiz_access enable row level security;
alter table public.integrity_reviews enable row level security;
alter table public.submission_integrity enable row level security;

drop policy if exists "manage" on public.quiz_access;
create policy "manage" on public.quiz_access for all to authenticated
  using (public.can_manage_assignment(assignment_id)) with check (public.can_manage_assignment(assignment_id));

drop policy if exists "view" on public.integrity_reviews;
create policy "view" on public.integrity_reviews for select to authenticated
  using (public.can_manage_assignment(assignment_id) or (select public.is_staff()));

-- Los alumnos ya no leen las respuestas, resultados ni el monitoreo de sus
-- intentos directo de la tabla (lo ven por quiz_review cuando corresponde).
revoke select on public.quiz_attempts from anon, authenticated;
grant select (id, assignment_id, student_id, attempt_no, started_at, deadline_at, finished_at,
              auto_points, manual_points, max_points, needs_review) on public.quiz_attempts to authenticated;

-- ----------------------------------------------------------------------------
-- 2) Utilidades
-- ----------------------------------------------------------------------------
-- Suma n a un contador dentro de un jsonb.
create or replace function public.campus_jinc(j jsonb, k text, n numeric)
returns jsonb
language sql
immutable
as $$
  select coalesce(j, '{}'::jsonb) || jsonb_build_object(k, coalesce((j ->> k)::numeric, 0) + coalesce(n, 0))
$$;

-- Ajuste booleano de quiz_settings.
create or replace function public.quiz_cfg(p_cfg jsonb, p_key text, p_default boolean)
returns boolean
language sql
immutable
as $$
  select coalesce(case when p_cfg ->> p_key in ('true', 'false') then (p_cfg ->> p_key)::boolean end, p_default)
$$;

-- Huella de un texto: hashes de 5 palabras seguidas, con winnowing (ventana 4).
create or replace function public.campus_fingerprint(p text)
returns integer[]
language sql
immutable
as $$
  with w as (
    select array_agg(x order by o) a
    from regexp_split_to_table(public.campus_norm(p), '[^a-z0-9]+') with ordinality t(x, o)
    where x <> ''
  ), sh as (
    select i, hashtext(array_to_string(w.a[i:i + 4], ' ')) h
    from w, generate_series(1, greatest(coalesce(cardinality(w.a), 0) - 4, 0)) i
  ), win as (
    select i, min(h) over (order by i rows between current row and 3 following) m from sh
  )
  select coalesce(array_agg(distinct m), '{}')
  from win
  where i <= greatest((select max(i) from sh) - 3, 1)
$$;

-- Cantidad de hashes en común entre dos huellas.
create or replace function public.campus_fp_shared(a integer[], b integer[])
returns integer
language sql
immutable
as $$ select cardinality(array(select unnest(a) intersect select unnest(b))) $$;

-- Rasgos de estilo de un texto (para comparar con el historial del alumno y
-- buscar indicios de texto generado).
create or replace function public.campus_text_features(p text)
returns jsonb
language sql
immutable
as $$
  with base as (select coalesce(p, '') t),
  words as (select x from base, regexp_split_to_table(t, '[^[:alpha:]0-9áéíóúüñÁÉÍÓÚÜÑ]+') x where x <> ''),
  sent as (
    select (select count(*) from regexp_split_to_table(btrim(s), '\s+') z where z ~ '[[:alpha:]]') n
    from base, regexp_split_to_table(t, '[.!?…]+[\s"”»)]*|\n+') s
    where btrim(s) ~ '[[:alpha:]]'
  ),
  w as (
    select count(*)::numeric n,
           count(distinct lower(x))::numeric d,
           coalesce(avg(char_length(x)), 0) avg_len,
           count(*) filter (where char_length(x) >= 9)::numeric long_n,
           count(*) filter (where x ~ '[áéíóúÁÉÍÓÚ]')::numeric acc
    from words
  ),
  s as (select count(*)::numeric n, coalesce(avg(n), 0) avg_n, coalesce(stddev_pop(n), 0) sd from sent),
  c as (
    select (select count(*) from regexp_matches(t, ',', 'g'))::numeric commas,
           (select count(*) from regexp_matches(t, '[;:]', 'g'))::numeric semis,
           (select count(*) from regexp_matches(t, '—', 'g'))::numeric dashes,
           (select count(*) from regexp_matches(t, '[“”‘’«»]', 'g'))::numeric curly,
           (select count(*) from regexp_matches(t, '[\u200B\u200C\u200D\u2060\uFEFF\u00AD]', 'g'))::numeric hidden,
           (select count(*) from regexp_matches(t, '(^|\n)\s*(#{1,6}\s|[-*•]\s|\d+[.)]\s)|\*\*[^*]+\*\*', 'g'))::numeric markdown,
           (select count(*) from regexp_matches(t, '[¿¡]', 'g'))::numeric inverted,
           (select count(*) from regexp_matches(t, '[?!]', 'g'))::numeric qmarks
    from base
  )
  select jsonb_build_object(
    'words', w.n,
    'sentences', s.n,
    'avg_sentence', round(s.avg_n, 2),
    'sentence_cv', case when s.avg_n > 0 then round(s.sd / s.avg_n, 3) else 0 end,
    'avg_word', round(w.avg_len, 3),
    'long_ratio', case when w.n > 0 then round(w.long_n / w.n, 3) else 0 end,
    'ttr', case when w.n > 0 then round(w.d / w.n, 3) else 0 end,
    'accent_rate', case when w.n > 0 then round(w.acc / w.n, 3) else 0 end,
    'comma_rate', case when w.n > 0 then round(c.commas * 100 / w.n, 2) else 0 end,
    'semi_rate', case when w.n > 0 then round(c.semis * 100 / w.n, 2) else 0 end,
    'dashes', c.dashes, 'curly', c.curly, 'hidden', c.hidden, 'markdown', c.markdown,
    'inverted_ok', case when c.qmarks > 0 then round(least(c.inverted / c.qmarks, 1), 2) end
  )
  from w, s, c
$$;

-- Respuesta normalizada para comparar entre alumnos (orden y tildes no importan).
create or replace function public.campus_answer_key(p jsonb)
returns text
language sql
immutable
as $$
  select case jsonb_typeof(p)
    when 'array' then (select string_agg(public.campus_norm(x), '|' order by public.campus_norm(x)) from jsonb_array_elements_text(p) x)
    when 'string' then public.campus_norm(p #>> '{}')
    when 'object' then (select string_agg(k || '=' || v, '|' order by k) from jsonb_each_text(p) e(k, v))
    when 'null' then null
    else p::text end
$$;

-- Identificador de un enlace (archivo de Drive/Docs, o la URL sin parámetros).
create or replace function public.campus_link_key(p text)
returns text
language sql
immutable
as $$
  select coalesce(
    (regexp_match(p, '(?:/d/|[?&]id=)([A-Za-z0-9_-]{20,})'))[1],
    lower(regexp_replace(regexp_replace(p, '[?#].*$', ''), '/+$', ''))
  )
$$;

-- ----------------------------------------------------------------------------
-- 3) Huella automática de cada entrega
-- ----------------------------------------------------------------------------
create or replace function public.submission_integrity_refresh()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_features jsonb;
begin
  if tg_op = 'UPDATE' and new.content is not distinct from old.content then
    return new;
  end if;
  if coalesce(char_length(btrim(new.content)), 0) < 40 then
    update public.submission_integrity set fp = '{}', words = 0, features = '{}'::jsonb, updated_at = now()
    where submission_id = new.id;
    return new;
  end if;
  v_features := public.campus_text_features(new.content);
  insert into public.submission_integrity (submission_id, fp, words, features)
  values (new.id, public.campus_fingerprint(new.content), coalesce((v_features ->> 'words')::int, 0), v_features)
  on conflict (submission_id) do update set fp = excluded.fp, words = excluded.words, features = excluded.features, updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_submission_integrity on public.submissions;
create trigger trg_submission_integrity
  after insert or update of content on public.submissions
  for each row execute function public.submission_integrity_refresh();

-- Entregas que ya existían.
insert into public.submission_integrity (submission_id, fp, words, features)
select s.id, public.campus_fingerprint(s.content), 0, public.campus_text_features(s.content)
from public.submissions s
where char_length(btrim(coalesce(s.content, ''))) >= 40
  and not exists (select 1 from public.submission_integrity si where si.submission_id = s.id);
update public.submission_integrity set words = coalesce((features ->> 'words')::int, 0) where words = 0 and features ? 'words';

-- Cómo se escribió la entrega (lo envía la app del alumno al entregar).
-- p_metrics: { typed, pasted, pastes, max_paste, active_ms, sessions }
create or replace function public.integrity_log_writing(p_assignment_id bigint, p_metrics jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sid bigint := public.my_self_student_id();
  v_sub bigint;
  w jsonb;
  k text;
  v numeric;
begin
  if v_sid is null then
    return;
  end if;
  select id into v_sub from public.submissions where assignment_id = p_assignment_id and student_id = v_sid;
  if v_sub is null then
    return;
  end if;
  insert into public.submission_integrity (submission_id) values (v_sub) on conflict (submission_id) do nothing;
  select writing into w from public.submission_integrity where submission_id = v_sub for update;
  foreach k in array array['typed', 'pasted', 'pastes', 'active_ms', 'sessions'] loop
    v := least(greatest(coalesce(case when p_metrics ->> k ~ '^\d+(\.\d+)?$' then (p_metrics ->> k)::numeric end, 0), 0), 100000000);
    w := public.campus_jinc(w, k, v);
  end loop;
  v := least(greatest(coalesce(case when p_metrics ->> 'max_paste' ~ '^\d+$' then (p_metrics ->> 'max_paste')::numeric end, 0), 0), 100000);
  w := w || jsonb_build_object('max_paste', greatest(coalesce((w ->> 'max_paste')::numeric, 0), v), 'last_at', now());
  update public.submission_integrity set writing = w, updated_at = now() where submission_id = v_sub;
end;
$$;

-- ----------------------------------------------------------------------------
-- 4) Evaluación: vista, inicio seguro y guardado
-- ----------------------------------------------------------------------------
-- En modo "una a la vez", el alumno solo recibe las preguntas que ya le tocaron.
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
    'sequential', public.quiz_cfg(a.quiz_settings, 'sequential', false),
    'current_idx', t.current_idx,
    'total', cardinality(t.question_order),
    'leaves', coalesce((t.integrity ->> 'leaves')::int, 0),
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
      from public.quiz_questions q
      where q.id = any(t.question_order)
        and (t.finished_at is not null
             or not public.quiz_cfg(a.quiz_settings, 'sequential', false)
             or array_position(t.question_order, q.id) <= t.current_idx + 1)
    ), '[]'::jsonb)
  )
  from public.quiz_attempts t
  join public.assignments a on a.id = t.assignment_id
  where t.id = p_attempt_id
$$;

-- Empieza (o retoma) un intento con código de acceso y dispositivo.
create or replace function public.quiz_begin(p_assignment_id bigint, p_code text default null, p_device text default null)
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
  v_pick integer;
  v_total integer;
  v_order bigint[];
  v_opts jsonb := '{}'::jsonb;
  v_code text;
  v_device text := nullif(left(regexp_replace(coalesce(p_device, ''), '[^A-Za-z0-9_-]', '', 'g'), 64), '');
  v_until timestamptz;
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
  order by attempt_no desc limit 1
  for update;
  if found then
    if t.deadline_at is not null and now() > t.deadline_at + interval '30 seconds' then
      perform public.quiz_finish(t.id, t.answers);
    else
      -- Volver a abrir el intento cuenta como una salida de la app.
      t.integrity := public.campus_jinc(t.integrity, 'resumes', 1);
      t.events := case when jsonb_array_length(t.events) < 300
        then t.events || jsonb_build_array(jsonb_build_object('t', 'RESUME', 's', now())) else t.events end;
      if v_device is not null and t.device_id is not null and v_device <> t.device_id then
        t.integrity := public.campus_jinc(t.integrity, 'devices', 1);
        t.events := case when jsonb_array_length(t.events) < 300
          then t.events || jsonb_build_array(jsonb_build_object('t', 'DEVICE', 's', now())) else t.events end;
        if public.quiz_cfg(v_cfg, 'lock_device', false) then
          update public.quiz_attempts set integrity = t.integrity, events = t.events where id = t.id;
          return jsonb_build_object('blocked', 'DEVICE',
            'message', 'Tu intento está abierto en otro dispositivo. Continúa en ese equipo o pide a tu docente que lo libere.');
        end if;
      end if;
      update public.quiz_attempts
      set integrity = t.integrity, events = t.events, device_id = coalesce(v_device, device_id)
      where id = t.id;
      return public.quiz_attempt_view(t.id);
    end if;
  end if;

  if a.due_at is not null and now() > a.due_at and not a.allow_late then
    raise exception 'La evaluación ya cerró.';
  end if;
  v_until := case when v_cfg ->> 'start_until' ~ '^\d{4}-\d{2}-\d{2}' then (v_cfg ->> 'start_until')::timestamptz end;
  if v_until is not null and now() > v_until then
    raise exception 'El horario para empezar esta evaluación ya terminó.';
  end if;
  v_max := coalesce(nullif(v_cfg ->> 'max_attempts', '')::int, 1);
  select count(*) into v_used from public.quiz_attempts where assignment_id = a.id and student_id = v_sid;
  if v_used >= v_max then
    raise exception 'Ya usaste tus % intento(s).', v_max;
  end if;
  select count(*) into v_total from public.quiz_questions where assignment_id = a.id;
  if v_total = 0 then
    raise exception 'La evaluación todavía no tiene preguntas.';
  end if;

  select code into v_code from public.quiz_access where assignment_id = a.id;
  if v_code is not null and upper(btrim(coalesce(p_code, ''))) <> v_code then
    perform pg_sleep(0.6); -- frena a quien intente adivinar el código
    if nullif(btrim(coalesce(p_code, '')), '') is null then
      raise exception 'Escribe el código de acceso que te dio tu docente.';
    end if;
    raise exception 'El código de acceso no es correcto.';
  end if;

  -- Preguntas: todas o N al azar; en orden o mezcladas.
  v_pick := case when v_cfg ->> 'pick_count' ~ '^\d+$' then (v_cfg ->> 'pick_count')::int end;
  if v_pick is null or v_pick <= 0 or v_pick >= v_total then
    v_pick := v_total;
  end if;
  select array_agg(id order by case when public.quiz_cfg(v_cfg, 'shuffle_questions', false) then random() end, position, id) into v_order
  from (select id, position from public.quiz_questions where assignment_id = a.id order by random() limit v_pick) x;

  for q in select id, type, options from public.quiz_questions where id = any(v_order) and type in ('SINGLE', 'MULTI', 'MATCH') loop
    -- Las columnas de "relacionar" siempre se mezclan (si no, la respuesta sería obvia).
    if q.type = 'MATCH' or public.quiz_cfg(v_cfg, 'shuffle_options', false) then
      v_opts := v_opts || jsonb_build_object(q.id::text, (
        select jsonb_agg(o ->> 'id' order by random())
        from jsonb_array_elements(case when q.type = 'MATCH' then q.options -> 'right' else q.options end) o));
    end if;
  end loop;

  insert into public.quiz_attempts (assignment_id, student_id, attempt_no, deadline_at, question_order, option_orders, max_points, device_id)
  values (a.id, v_sid, v_used + 1,
          case when nullif(v_cfg ->> 'time_limit_min', '')::int > 0 then now() + make_interval(mins => (v_cfg ->> 'time_limit_min')::int) end,
          v_order, v_opts, (select sum(points) from public.quiz_questions where id = any(v_order)), v_device)
  returning * into t;
  return public.quiz_attempt_view(t.id);
end;
$$;

-- La función anterior sigue existiendo (apps sin actualizar) y aplica las mismas reglas.
create or replace function public.quiz_start(p_assignment_id bigint)
returns jsonb
language sql
security definer
set search_path = public
as $$ select public.quiz_begin(p_assignment_id, null, null) $$;

-- Respuestas que se aceptan de la app: en modo "una a la vez", solo la de la
-- pregunta actual (las anteriores quedan fijas).
create or replace function public.quiz_merge_answers(t public.quiz_attempts, p_answers jsonb)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case
    when not public.quiz_cfg((select quiz_settings from public.assignments where id = t.assignment_id), 'sequential', false)
      then coalesce(p_answers, t.answers)
    else (t.answers - t.question_order[t.current_idx + 1]::text)
      || case when p_answers ? t.question_order[t.current_idx + 1]::text
           then jsonb_build_object(t.question_order[t.current_idx + 1]::text, p_answers -> t.question_order[t.current_idx + 1]::text)
           else coalesce(jsonb_build_object(t.question_order[t.current_idx + 1]::text, t.answers -> t.question_order[t.current_idx + 1]::text), '{}'::jsonb)
         end
  end
$$;

create or replace function public.quiz_save(p_attempt_id bigint, p_answers jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  t public.quiz_attempts%rowtype;
begin
  select * into t from public.quiz_attempts
  where id = p_attempt_id and student_id = public.my_self_student_id() and finished_at is null
    and (deadline_at is null or now() <= deadline_at + interval '30 seconds')
  for update;
  if not found then
    return;
  end if;
  update public.quiz_attempts set answers = public.quiz_merge_answers(t, coalesce(p_answers, '{}'::jsonb)) where id = t.id;
end;
$$;

-- Modo "una a la vez": guarda la respuesta actual y entrega la siguiente pregunta.
create or replace function public.quiz_next(p_attempt_id bigint, p_answers jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  t public.quiz_attempts%rowtype;
begin
  select * into t from public.quiz_attempts
  where id = p_attempt_id and student_id = public.my_self_student_id()
  for update;
  if not found then
    raise exception 'El intento no existe.';
  end if;
  if t.finished_at is not null then
    raise exception 'Este intento ya terminó.';
  end if;
  if t.deadline_at is not null and now() > t.deadline_at + interval '30 seconds' then
    perform public.quiz_finish(t.id, t.answers);
    raise exception 'Se acabó el tiempo. Tus respuestas se enviaron.';
  end if;
  update public.quiz_attempts
  set answers = public.quiz_merge_answers(t, coalesce(p_answers, '{}'::jsonb)),
      current_idx = least(t.current_idx + 1, greatest(cardinality(t.question_order) - 1, 0))
  where id = t.id;
  return public.quiz_attempt_view(t.id);
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
  v_answers := case when t.deadline_at is not null and now() > t.deadline_at + interval '30 seconds' then t.answers
                    else public.quiz_merge_answers(t, coalesce(p_answers, t.answers)) end;

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

-- Revisión de un intento. Las respuestas correctas (y qué preguntas acertó)
-- no se muestran al alumno mientras le queden intentos; por defecto, recién
-- después de la fecha límite.
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
  v_left boolean;
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
  v_left := (select count(*) from public.quiz_attempts x where x.assignment_id = a.id and x.student_id = t.student_id)
              < coalesce(nullif(a.quiz_settings ->> 'max_attempts', '')::int, 1)
            and (a.due_at is null or now() <= a.due_at or a.allow_late)
            and a.status = 'PUBLISHED';
  v_show := v_manager or (not v_left and case coalesce(a.quiz_settings ->> 'show_answers', 'AFTER_DUE')
    when 'AFTER_SUBMIT' then true
    when 'AFTER_DUE' then a.due_at is null or now() > a.due_at or a.status = 'CLOSED'
    else false end);
  return public.quiz_attempt_view(t.id) || jsonb_build_object(
    'results', case when v_show or public.quiz_cfg(a.quiz_settings, 'show_results', false) then t.results else '{}'::jsonb end,
    'auto_points', t.auto_points, 'manual_points', t.manual_points, 'max_points', t.max_points,
    'needs_review', t.needs_review, 'show_answers', v_show,
    'answers_later', not v_show and coalesce(a.quiz_settings ->> 'show_answers', 'AFTER_DUE') <> 'NEVER',
    'keys', case when v_show then coalesce((
      select jsonb_object_agg(q.id::text, jsonb_build_object('answer', k.answer, 'explanation', q.explanation))
      from public.quiz_questions q left join public.quiz_answer_keys k on k.question_id = q.id
      where q.id = any(t.question_order)), '{}'::jsonb) end
  );
end;
$$;

-- ----------------------------------------------------------------------------
-- 5) Monitoreo durante el examen
-- ----------------------------------------------------------------------------
-- p_events: [{ "t": "LEAVE", "v": 3200, "q": "15", "c": 1712345678901 }, …]
--   LEAVE (v = ms fuera), PASTE (v = caracteres), COPY, CONTEXT, FS_EXIT,
--   RESIZE, MULTITAB, OFFLINE, QTIME (v = ms en la pregunta q), TYPE (v = caracteres tecleados en q)
create or replace function public.quiz_log_events(p_attempt_id bigint, p_events jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  t public.quiz_attempts%rowtype;
  v_cfg jsonb;
  e jsonb;
  v_type text;
  v numeric;
  v_q text;
  v_c bigint;
  v_i jsonb;
  v_ev jsonb;
  v_leaves integer;
  v_max integer;
  v_action text;
begin
  select * into t from public.quiz_attempts where id = p_attempt_id and student_id = public.my_self_student_id() for update;
  if not found then
    raise exception 'El intento no existe.';
  end if;
  -- Tras terminar, se aceptan solo los eventos que quedaron en cola (5 minutos).
  if t.finished_at is not null and now() > t.finished_at + interval '5 minutes' then
    return jsonb_build_object('closed', true);
  end if;
  v_cfg := coalesce((select quiz_settings from public.assignments where id = t.assignment_id), '{}'::jsonb);
  v_i := t.integrity;
  v_ev := t.events;

  for e in select x from jsonb_array_elements(case when jsonb_typeof(p_events) = 'array' then p_events else '[]'::jsonb end) x limit 60 loop
    v_type := e ->> 't';
    if v_type is null or v_type not in ('LEAVE', 'PASTE', 'COPY', 'CONTEXT', 'FS_EXIT', 'RESIZE', 'MULTITAB', 'OFFLINE', 'QTIME', 'TYPE') then
      continue;
    end if;
    v := least(greatest(coalesce(case when e ->> 'v' ~ '^\d+(\.\d+)?$' then (e ->> 'v')::numeric end, 0), 0), 86400000);
    v_q := case when e ->> 'q' ~ '^\d{1,18}$' then e ->> 'q' end;
    v_c := case when e ->> 'c' ~ '^\d{12,14}$' then (e ->> 'c')::bigint end;

    case v_type
      when 'LEAVE' then v_i := public.campus_jinc(public.campus_jinc(v_i, 'leaves', 1), 'leave_ms', v);
      when 'PASTE' then v_i := public.campus_jinc(public.campus_jinc(v_i, 'pastes', 1), 'paste_chars', v);
      when 'COPY' then v_i := public.campus_jinc(v_i, 'copies', 1);
      when 'CONTEXT' then v_i := public.campus_jinc(v_i, 'context', 1);
      when 'FS_EXIT' then v_i := public.campus_jinc(v_i, 'fs_exits', 1);
      when 'RESIZE' then v_i := public.campus_jinc(v_i, 'resizes', 1);
      when 'MULTITAB' then v_i := public.campus_jinc(v_i, 'multitab', 1);
      when 'OFFLINE' then v_i := public.campus_jinc(v_i, 'offline', 1);
      when 'QTIME' then
        if v_q is not null then
          v_i := v_i || jsonb_build_object('q_ms', public.campus_jinc(v_i -> 'q_ms', v_q, v));
        end if;
      when 'TYPE' then
        if v_q is not null then
          v_i := v_i || jsonb_build_object('typed', public.campus_jinc(v_i -> 'typed', v_q, v));
        end if;
    end case;

    -- La línea de tiempo guarda los hechos llamativos (no el tiempo por pregunta).
    if v_type not in ('QTIME', 'TYPE') and jsonb_array_length(v_ev) < 300 then
      v_ev := v_ev || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object('t', v_type, 'v', nullif(v, 0), 'q', v_q, 'c', v_c, 's', now())));
    end if;
  end loop;

  update public.quiz_attempts set integrity = v_i, events = v_ev where id = t.id;

  v_leaves := coalesce((v_i ->> 'leaves')::int, 0);
  v_max := greatest(coalesce(case when v_cfg ->> 'max_leaves' ~ '^\d+$' then (v_cfg ->> 'max_leaves')::int end, 3), 1);
  v_action := coalesce(nullif(v_cfg ->> 'leave_action', ''), 'WARN');

  if t.finished_at is null and v_action = 'CLOSE' and v_leaves >= v_max then
    update public.quiz_attempts set integrity = integrity || jsonb_build_object('closed_by', 'LEAVES') where id = t.id;
    perform public.quiz_finish(t.id, t.answers);
    return jsonb_build_object('closed', true, 'leaves', v_leaves, 'max', v_max, 'action', v_action);
  end if;
  return jsonb_build_object('closed', t.finished_at is not null, 'leaves', v_leaves, 'max', v_max, 'action', v_action);
end;
$$;

-- El docente libera un intento bloqueado en otro dispositivo.
create or replace function public.quiz_release_device(p_attempt_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  t public.quiz_attempts%rowtype;
begin
  select * into t from public.quiz_attempts where id = p_attempt_id for update;
  if not found or not public.can_manage_assignment(t.assignment_id) then
    raise exception 'Solo el docente del curso puede liberar el intento.';
  end if;
  update public.quiz_attempts
  set device_id = null,
      events = case when jsonb_array_length(events) < 300 then events || jsonb_build_array(jsonb_build_object('t', 'RELEASED', 's', now())) else events end
  where id = t.id;
end;
$$;

-- Código de acceso: null lo quita.
create or replace function public.set_quiz_access_code(p_assignment_id bigint, p_code text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text := upper(regexp_replace(coalesce(p_code, ''), '\s', '', 'g'));
begin
  if not public.can_manage_assignment(p_assignment_id) then
    raise exception 'Solo el docente del curso cambia el código.';
  end if;
  if v_code = '' then
    delete from public.quiz_access where assignment_id = p_assignment_id;
    return;
  end if;
  if v_code !~ '^[A-Z0-9]{4,12}$' then
    raise exception 'El código debe tener de 4 a 12 letras o números.';
  end if;
  insert into public.quiz_access (assignment_id, code) values (p_assignment_id, v_code)
  on conflict (assignment_id) do update set code = excluded.code, updated_at = now();
end;
$$;

-- ----------------------------------------------------------------------------
-- 6) Reportes para el docente
-- ----------------------------------------------------------------------------
-- Promedio del alumno en el curso (0 a 1), sin contar esta tarea.
create or replace function public.integrity_course_average(p_student_id bigint, p_offering_id bigint, p_exclude bigint)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object('avg', round(avg(r)::numeric, 3), 'n', count(r))
  from (
    select case
      when a.grading_type = 'SCORE' and s.score is not null and a.max_score > 0 then s.score / a.max_score
      when s.level is not null then case s.level when 'AD' then 0.95 when 'A' then 0.75 when 'B' then 0.55 else 0.3 end
    end r
    from public.submissions s join public.assignments a on a.id = s.assignment_id
    where s.student_id = p_student_id and a.offering_id = p_offering_id and a.id <> p_exclude and s.status = 'GRADED'
  ) x
$$;

create or replace function public.quiz_integrity_report(p_assignment_id bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  a public.assignments%rowtype;
  v_attempts jsonb;
  v_pairs jsonb;
begin
  select * into a from public.assignments where id = p_assignment_id;
  if not found or not (public.can_manage_assignment(a.id) or public.is_staff()) then
    raise exception 'Solo el docente del curso ve este reporte.';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'attempt_id', t.id, 'student_id', t.student_id, 'attempt_no', t.attempt_no,
    'started_at', t.started_at, 'finished_at', t.finished_at, 'device_locked', t.device_id is not null,
    'integrity', t.integrity, 'events', jsonb_array_length(t.events),
    'questions', cardinality(t.question_order),
    'pct', case when t.finished_at is not null and t.max_points > 0 then round((coalesce(t.auto_points, 0) + coalesce(t.manual_points, 0)) / t.max_points, 3) end,
    'duration_s', case when t.finished_at is not null then round(extract(epoch from t.finished_at - t.started_at)) end,
    -- Preguntas acertadas en menos de 3 segundos.
    'fast_correct', (select count(*) from jsonb_each_text(t.results) r(k, v)
                     join public.quiz_questions qq on qq.id = r.k::bigint
                     where r.v ~ '^[0-9.]+$' and r.v::numeric >= qq.points and qq.type <> 'TRUE_FALSE'
                       and coalesce((t.integrity -> 'q_ms' ->> r.k)::numeric, 999999) < 3000),
    'course', public.integrity_course_average(t.student_id, a.offering_id, a.id),
    'review', (select jsonb_build_object('status', r.status, 'note', r.note) from public.integrity_reviews r where r.kind = 'ATTEMPT' and r.ref_id = t.id)
  ) order by t.student_id, t.attempt_no), '[]'::jsonb)
  into v_attempts
  from public.quiz_attempts t where t.assignment_id = a.id;

  -- Pares de alumnos con las mismas respuestas incorrectas o desarrollos parecidos
  -- (se compara el último intento terminado de cada uno).
  with last as (
    select distinct on (student_id) * from public.quiz_attempts
    where assignment_id = a.id and finished_at is not null
    order by student_id, attempt_no desc
  ), qa as (
    select l.id attempt_id, l.student_id, l.finished_at, qq.id qid, qq.type, qq.points,
           public.campus_answer_key(l.answers -> qq.id::text) ans,
           case when (l.results ->> qq.id::text) ~ '^[0-9.]+$' then (l.results ->> qq.id::text)::numeric end pts,
           case when qq.type = 'OPEN' then public.campus_fingerprint(l.answers ->> qq.id::text) end fp
    from last l join public.quiz_questions qq on qq.id = any(l.question_order)
  ), wrong as (
    select student_id, count(*) filter (where type not in ('OPEN') and ans is not null and ans <> '' and pts is not null and pts < points) n
    from qa group by student_id
  ), pairs as (
    select x.student_id a_id, y.student_id b_id, x.attempt_id a_att, y.attempt_id b_att,
           count(*) filter (where x.type <> 'OPEN' and x.ans = y.ans and x.ans <> '' and x.pts is not null and x.pts < x.points) shared_wrong,
           count(*) filter (where x.type <> 'OPEN' and x.ans is not null and x.ans = y.ans) same,
           count(*) filter (where x.type <> 'OPEN' and x.ans is not null and y.ans is not null) both_answered,
           count(*) filter (where x.type = 'OPEN' and cardinality(x.fp) >= 4 and cardinality(y.fp) >= 4
                              and public.campus_fp_shared(x.fp, y.fp)::numeric / least(cardinality(x.fp), cardinality(y.fp)) >= 0.5) open_similar,
           abs(extract(epoch from max(x.finished_at) - max(y.finished_at))) finish_gap_s
    from qa x join qa y on y.qid = x.qid and y.student_id > x.student_id
    group by x.student_id, y.student_id, x.attempt_id, y.attempt_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'a', p.a_id, 'b', p.b_id, 'a_attempt', p.a_att, 'b_attempt', p.b_att,
    'shared_wrong', p.shared_wrong, 'wrong_a', wa.n, 'wrong_b', wb.n,
    'same', p.same, 'both_answered', p.both_answered, 'open_similar', p.open_similar, 'finish_gap_s', round(p.finish_gap_s)
  ) order by p.shared_wrong desc, p.open_similar desc), '[]'::jsonb)
  into v_pairs
  from pairs p join wrong wa on wa.student_id = p.a_id join wrong wb on wb.student_id = p.b_id
  where p.shared_wrong >= 2 or p.open_similar >= 1;

  return jsonb_build_object('attempts', v_attempts, 'pairs', v_pairs);
end;
$$;

-- Línea de tiempo de un intento.
create or replace function public.quiz_integrity_events(p_attempt_id bigint)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object('events', t.events, 'integrity', t.integrity, 'started_at', t.started_at, 'finished_at', t.finished_at)
  from public.quiz_attempts t
  where t.id = p_attempt_id and (public.can_manage_assignment(t.assignment_id) or public.is_staff())
$$;

-- Originalidad de las entregas de una tarea.
create or replace function public.integrity_submission_report(p_assignment_id bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  a public.assignments%rowtype;
  v_ifp integer[];
  v_out jsonb;
begin
  select * into a from public.assignments where id = p_assignment_id;
  if not found or not (public.can_manage_assignment(a.id) or public.is_staff()) then
    raise exception 'Solo el docente del curso ve este reporte.';
  end if;
  -- Lo que viene de las indicaciones no cuenta como copia.
  v_ifp := public.campus_fingerprint(coalesce(a.instructions, '') || ' ' || a.title);

  with mine as (
    select s.id, s.student_id, s.files, s.submitted_at,
           array(select unnest(coalesce(si.fp, '{}')) except select unnest(v_ifp)) fp,
           coalesce(si.words, 0) words, coalesce(si.features, '{}'::jsonb) features, coalesce(si.writing, '{}'::jsonb) writing,
           (select m.group_id from public.assignment_group_members m where m.assignment_id = a.id and m.student_id = s.student_id) group_id
    from public.submissions s left join public.submission_integrity si on si.submission_id = s.id
    where s.assignment_id = a.id
  ), matches as (
    select m.id, c.submission_id other_id, os.student_id other_student, os.assignment_id other_assignment,
           public.campus_fp_shared(m.fp, c.fp) shared, least(cardinality(m.fp), cardinality(c.fp)) base
    from mine m
    join public.submission_integrity c on c.fp && m.fp and c.submission_id <> m.id
    join public.submissions os on os.id = c.submission_id
    where cardinality(m.fp) >= 6 and os.student_id <> m.student_id
      and not (os.assignment_id = a.id and m.group_id is not null
               and m.group_id = (select g.group_id from public.assignment_group_members g where g.assignment_id = a.id and g.student_id = os.student_id))
  ), ranked as (
    select *, row_number() over (partition by id order by shared::numeric / greatest(base, 1) desc, shared desc) rn
    from matches where shared >= 4
  ), links as (
    select m.id, public.campus_link_key(f ->> 'path') k
    from mine m, jsonb_array_elements(m.files) f
    where f ->> 'path' like 'https://%'
  ), dup_links as (
    select l.id, os.id other_id, os.student_id other_student, os.assignment_id other_assignment
    from links l
    join public.submissions os on os.id <> l.id and os.submitted_at > now() - interval '400 days'
    join lateral jsonb_array_elements(os.files) f2 on f2 ->> 'path' like 'https://%' and public.campus_link_key(f2 ->> 'path') = l.k
    where os.student_id <> (select student_id from mine where id = l.id)
      and not (os.assignment_id = a.id and (select group_id from mine where id = l.id) is not null
               and (select group_id from mine where id = l.id) = (select g.group_id from public.assignment_group_members g where g.assignment_id = a.id and g.student_id = os.student_id))
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'submission_id', m.id, 'student_id', m.student_id, 'words', m.words, 'features', m.features, 'writing', m.writing,
    'fp_size', cardinality(m.fp),
    'baseline', (
      select coalesce(jsonb_object_agg(b.k, b.v), '{}'::jsonb)
      from (
        select e.key k, round(avg(e.value::text::numeric), 3) v
        from (
          select si.submission_id, si.features from public.submission_integrity si join public.submissions hs on hs.id = si.submission_id
          where hs.student_id = m.student_id and hs.id <> m.id and si.words >= 40
          order by hs.submitted_at desc limit 15
        ) h, jsonb_each(h.features) e
        where jsonb_typeof(e.value) = 'number'
        group by e.key
      ) b
    ),
    'history_n', (select count(*) from public.submission_integrity si join public.submissions hs on hs.id = si.submission_id
                  where hs.student_id = m.student_id and hs.id <> m.id and si.words >= 40),
    'matches', coalesce((
      select jsonb_agg(jsonb_build_object(
        'submission_id', r.other_id, 'student_id', r.other_student,
        'student_name', (select btrim(coalesce(st.first_name, '') || ' ' || coalesce(st.last_name, '')) from public.students st where st.id = r.other_student),
        'assignment_id', r.other_assignment, 'same_assignment', r.other_assignment = a.id,
        'assignment_title', (select oa.title from public.assignments oa where oa.id = r.other_assignment),
        'year', (select y.year from public.assignments oa join public.course_offerings o on o.id = oa.offering_id
                 join public.academic_years y on y.id = o.academic_year_id where oa.id = r.other_assignment),
        'shared', r.shared, 'ratio', round(r.shared::numeric / greatest(r.base, 1), 3)
      ) order by r.rn)
      from ranked r where r.id = m.id and r.rn <= 3), '[]'::jsonb),
    'dup_links', coalesce((
      select jsonb_agg(distinct jsonb_build_object(
        'submission_id', d.other_id, 'student_id', d.other_student,
        'student_name', (select btrim(coalesce(st.first_name, '') || ' ' || coalesce(st.last_name, '')) from public.students st where st.id = d.other_student),
        'same_assignment', d.other_assignment = a.id,
        'assignment_title', (select oa.title from public.assignments oa where oa.id = d.other_assignment)))
      from dup_links d where d.id = m.id), '[]'::jsonb),
    'review', (select jsonb_build_object('status', r.status, 'note', r.note) from public.integrity_reviews r where r.kind = 'SUBMISSION' and r.ref_id = m.id)
  )), '[]'::jsonb)
  into v_out
  from mine m;

  return v_out;
end;
$$;

-- Dos entregas lado a lado. La otra solo se muestra completa si quien pregunta
-- también puede ver a ese alumno; si no, solo se informa la coincidencia.
create or replace function public.integrity_compare(p_submission_id bigint, p_other_id bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  s public.submissions%rowtype;
  o public.submissions%rowtype;
begin
  select * into s from public.submissions where id = p_submission_id;
  select * into o from public.submissions where id = p_other_id;
  if s.id is null or o.id is null or not (public.can_manage_assignment(s.assignment_id) or public.is_staff()) then
    raise exception 'No puedes comparar estas entregas.';
  end if;
  return jsonb_build_object(
    'a', s.content,
    'b', case when public.can_manage_assignment(o.assignment_id) or public.is_staff() or public.can_view_student(o.student_id) then o.content end,
    'instructions', (select instructions from public.assignments where id = s.assignment_id)
  );
end;
$$;

create or replace function public.set_integrity_review(p_kind text, p_ref_id bigint, p_status text, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_assignment bigint;
begin
  if p_kind = 'ATTEMPT' then
    select assignment_id into v_assignment from public.quiz_attempts where id = p_ref_id;
  elsif p_kind = 'SUBMISSION' then
    select assignment_id into v_assignment from public.submissions where id = p_ref_id;
  end if;
  if v_assignment is null or not public.can_manage_assignment(v_assignment) then
    raise exception 'Solo el docente del curso marca la revisión.';
  end if;
  if p_status is null then
    delete from public.integrity_reviews where kind = p_kind and ref_id = p_ref_id;
    return;
  end if;
  insert into public.integrity_reviews (kind, ref_id, assignment_id, status, note)
  values (p_kind, p_ref_id, v_assignment, p_status, nullif(left(btrim(coalesce(p_note, '')), 500), ''))
  on conflict (kind, ref_id) do update
    set status = excluded.status, note = excluded.note, reviewed_by = auth.uid(), updated_at = now();
end;
$$;

-- ----------------------------------------------------------------------------
-- 7) Permisos
-- ----------------------------------------------------------------------------
do $$
declare
  f text;
begin
  -- Internas.
  foreach f in array array[
    'quiz_attempt_view(bigint)', 'quiz_merge_answers(public.quiz_attempts, jsonb)', 'submission_integrity_refresh()',
    'integrity_course_average(bigint, bigint, bigint)'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
  end loop;
  foreach f in array array[
    'campus_jinc(jsonb, text, numeric)', 'quiz_cfg(jsonb, text, boolean)', 'campus_fingerprint(text)', 'campus_fp_shared(integer[], integer[])',
    'campus_text_features(text)', 'campus_answer_key(jsonb)', 'campus_link_key(text)',
    'quiz_begin(bigint, text, text)', 'quiz_start(bigint)', 'quiz_save(bigint, jsonb)', 'quiz_next(bigint, jsonb)', 'quiz_finish(bigint, jsonb)',
    'quiz_review(bigint)', 'quiz_log_events(bigint, jsonb)', 'quiz_release_device(bigint)', 'set_quiz_access_code(bigint, text)',
    'quiz_integrity_report(bigint)', 'quiz_integrity_events(bigint)', 'integrity_submission_report(bigint)',
    'integrity_compare(bigint, bigint)', 'set_integrity_review(text, bigint, text, text)', 'integrity_log_writing(bigint, jsonb)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

select 'Integridad académica lista' as estado;
