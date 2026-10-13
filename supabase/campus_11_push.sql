-- ============================================================================
-- CAMPUS VIRTUAL TESLA · FASE 2 · Script 11
-- Notificaciones push (PWA).
--
--   push_subscriptions  Dispositivos donde cada persona activó los avisos
--   push_outbox         Cola de avisos por enviar
--
-- Los avisos se encolan con triggers de la base:
--   · Tarea nueva publicada          → alumno y familia
--   · Nota publicada (tarea)         → alumno y familia
--   · Tardanza registrada en Tesla   → familia
--   · Comunicado nuevo               → familia
--   · Mensaje nuevo                  → la otra parte (respeta horario)
--   · Resumen semanal                → familia (con botón de WhatsApp)
--
-- La Edge Function "campus-push" envía la cola. Se activa sola con pg_net
-- después de cada inserción (configura la URL y el secreto al final).
--
-- Los triggers NUNCA bloquean la operación original: si algo falla al
-- encolar, se ignora (Tesla sigue registrando asistencia sin problemas).
-- Requiere los scripts 07 a 10.
-- ============================================================================

create extension if not exists pg_net;

create table if not exists public.push_subscriptions (
  id bigint generated always as identity primary key,
  profile_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  endpoint text not null unique check (endpoint ~ '^https://'),
  p256dh text not null,
  auth text not null,
  user_agent text check (user_agent is null or char_length(user_agent) <= 300),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index if not exists idx_push_subscriptions_profile on public.push_subscriptions(profile_id);

create table if not exists public.push_outbox (
  id bigint generated always as identity primary key,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('ASSIGNMENT', 'GRADE', 'LATE', 'CIRCULAR', 'MESSAGE', 'DIGEST', 'TEST')),
  title text not null,
  body text not null default '',
  url text not null default '/',
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  claimed_at timestamptz,
  attempts smallint not null default 0,
  sent_at timestamptz,
  last_error text
);

create index if not exists idx_push_outbox_pending on public.push_outbox(id) where sent_at is null;

-- Configuración privada (no expuesta por la API).
create schema if not exists campus_private;
revoke all on schema campus_private from public, anon, authenticated;

create table if not exists campus_private.settings (
  key text primary key,
  value text not null
);

-- ----------------------------------------------------------------------------
-- 1) Encolar
-- ----------------------------------------------------------------------------
-- Cuentas de la familia de un alumno (apoderados y, si se pide, el alumno).
create or replace function public.family_profile_ids(p_student_id bigint, p_include_student boolean)
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select g.profile_id
  from public.student_guardians sg
  join public.guardians g on g.id = sg.guardian_id
  join public.profiles p on p.id = g.profile_id and p.is_active
  where sg.student_id = p_student_id and g.profile_id is not null
  union
  select s.profile_id
  from public.students s
  join public.profiles p on p.id = s.profile_id and p.is_active
  where p_include_student and s.id = p_student_id and s.profile_id is not null
$$;

create or replace function public.queue_push(
  p_profiles uuid[],
  p_kind text,
  p_title text,
  p_body text,
  p_url text,
  p_data jsonb default '{}'::jsonb
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.push_outbox (profile_id, kind, title, body, url, data)
  select distinct pid, p_kind, left(p_title, 120), left(coalesce(p_body, ''), 400), p_url, coalesce(p_data, '{}'::jsonb)
  from unnest(p_profiles) as pid
  where pid is not null
    and exists (select 1 from public.push_subscriptions s where s.profile_id = pid)
$$;

revoke all on function public.family_profile_ids(bigint, boolean) from public, anon, authenticated;
revoke all on function public.queue_push(uuid[], text, text, text, text, jsonb) from public, anon, authenticated;

-- Nombre corto del alumno para los textos.
create or replace function public.student_first_name(p_student_id bigint)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(nullif(split_part(btrim(s.first_name), ' ', 1), ''), 'tu hijo')
  from public.students s where s.id = p_student_id
$$;

revoke all on function public.student_first_name(bigint) from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 2) Disparadores de cada evento
-- ----------------------------------------------------------------------------
-- Tarea nueva
create or replace function public.push_on_assignment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_subject text;
  v_classroom bigint;
  s record;
  v_due text;
begin
  if new.status <> 'PUBLISHED' or (tg_op = 'UPDATE' and old.status <> 'DRAFT') then
    return new;
  end if;
  select sj.name, o.classroom_id into v_subject, v_classroom
  from public.course_offerings o join public.subjects sj on sj.id = o.subject_id
  where o.id = new.offering_id;

  v_due := case when new.due_at is null then 'Sin fecha límite.'
                else 'Vence el ' || to_char(new.due_at at time zone 'America/Lima', 'DD/MM "a las" HH24:MI') || '.' end;

  for s in select id from public.students where classroom_id = v_classroom loop
    perform public.queue_push(
      array(select public.family_profile_ids(s.id, true)),
      'ASSIGNMENT',
      'Nueva tarea de ' || v_subject,
      new.title || '. ' || v_due,
      '/tarea/' || new.id || '?hijo=' || s.id
    );
  end loop;
  return new;
exception when others then
  raise warning '[push_on_assignment] %', sqlerrm;
  return new;
end;
$$;

drop trigger if exists trg_assignments_push on public.assignments;
create trigger trg_assignments_push
after insert or update of status on public.assignments
for each row execute function public.push_on_assignment();

-- Nota publicada
create or replace function public.push_on_grade()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  a record;
  v_grade text;
begin
  if new.status <> 'GRADED' or old.status = 'GRADED' then
    return new;
  end if;
  select asg.title, asg.grading_type, asg.max_score, sj.name as subject
  into a
  from public.assignments asg
  join public.course_offerings o on o.id = asg.offering_id
  join public.subjects sj on sj.id = o.subject_id
  where asg.id = new.assignment_id;

  v_grade := case when a.grading_type = 'LEVEL' then coalesce(new.level, '-')
                  else coalesce(trim_scale(new.score)::text, '-') || '/' || trim_scale(a.max_score)::text end;

  perform public.queue_push(
    array(select public.family_profile_ids(new.student_id, true)),
    'GRADE',
    'Nota publicada en ' || a.subject,
    a.title || ': ' || v_grade || case when new.feedback is not null then '. Tiene un comentario del docente.' else '.' end,
    '/tarea/' || new.assignment_id || '?hijo=' || new.student_id
  );
  return new;
exception when others then
  raise warning '[push_on_grade] %', sqlerrm;
  return new;
end;
$$;

drop trigger if exists trg_submissions_push on public.submissions;
create trigger trg_submissions_push
after update of status on public.submissions
for each row execute function public.push_on_grade();

-- Tardanza registrada en Tesla (solo la del día).
create or replace function public.push_on_late()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is distinct from 'LATE'
     or (tg_op = 'UPDATE' and old.status is not distinct from 'LATE')
     or new.date <> (now() at time zone 'America/Lima')::date then
    return new;
  end if;
  perform public.queue_push(
    array(select public.family_profile_ids(new.student_id, false)),
    'LATE',
    'Tardanza registrada',
    public.student_first_name(new.student_id) || ' ingresó tarde hoy'
      || coalesce(' a las ' || left(new.entry_time::text, 5), '') || '.',
    '/?hijo=' || new.student_id
  );
  return new;
exception when others then
  raise warning '[push_on_late] %', sqlerrm;
  return new;
end;
$$;

drop trigger if exists trg_attendance_push on public.attendance;
create trigger trg_attendance_push
after insert or update of status on public.attendance
for each row execute function public.push_on_late();

-- Comunicado nuevo (el nombre "zz" hace que corra después de crear destinatarios).
create or replace function public.push_on_circular()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  for r in select student_id from public.circular_recipients where circular_id = new.id loop
    perform public.queue_push(
      array(select public.family_profile_ids(r.student_id, false)),
      'CIRCULAR',
      case when new.response_type = 'CONSENT' then 'Comunicado: requiere tu respuesta' else 'Nuevo comunicado del colegio' end,
      new.title,
      '/comunicados/' || new.id
    );
  end loop;
  return new;
exception when others then
  raise warning '[push_on_circular] %', sqlerrm;
  return new;
end;
$$;

drop trigger if exists trg_circulars_zz_push on public.circulars;
create trigger trg_circulars_zz_push
after insert on public.circulars
for each row execute function public.push_on_circular();

-- Mensaje nuevo
create or replace function public.push_on_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conv public.conversations%rowtype;
  v_targets uuid[];
begin
  if not new.notify then
    return new;
  end if;
  select * into v_conv from public.conversations where id = new.conversation_id;
  if new.sender_id = v_conv.staff_id then
    v_targets := array(select public.family_profile_ids(v_conv.student_id, false));
  else
    v_targets := array[v_conv.staff_id];
  end if;
  v_targets := array_remove(v_targets, new.sender_id);

  perform public.queue_push(
    v_targets,
    'MESSAGE',
    coalesce(new.sender_name, 'Mensaje nuevo') || ' · ' || public.student_first_name(v_conv.student_id),
    left(new.body, 160),
    '/mensajes/' || new.conversation_id
  );
  return new;
exception when others then
  raise warning '[push_on_message] %', sqlerrm;
  return new;
end;
$$;

drop trigger if exists trg_messages_push on public.messages;
create trigger trg_messages_push
after insert on public.messages
for each row execute function public.push_on_message();

-- Resumen semanal (no se repite si se regenera el mismo día).
create or replace function public.push_on_digest()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and (
       old.text_body = new.text_body
       or old.generated_at > now() - interval '12 hours'
     ) then
    return new;
  end if;
  perform public.queue_push(
    array(select public.family_profile_ids(new.student_id, false)),
    'DIGEST',
    'Resumen de la semana de ' || public.student_first_name(new.student_id),
    coalesce(split_part(new.text_body, E'\n', 2), ''),
    '/?hijo=' || new.student_id || '&resumen=1',
    jsonb_build_object('share_text', left(new.text_body, 1500))
  );
  return new;
exception when others then
  raise warning '[push_on_digest] %', sqlerrm;
  return new;
end;
$$;

drop trigger if exists trg_weekly_digests_push on public.weekly_digests;
create trigger trg_weekly_digests_push
after insert or update on public.weekly_digests
for each row execute function public.push_on_digest();

-- ----------------------------------------------------------------------------
-- 3) Envío: pg_net llama a la Edge Function al encolar
-- ----------------------------------------------------------------------------
create or replace function public.dispatch_push()
returns trigger
language plpgsql
security definer
set search_path = public, campus_private
as $$
declare
  v_url text := (select value from campus_private.settings where key = 'push_function_url');
  v_secret text := (select value from campus_private.settings where key = 'push_secret');
begin
  if v_url is not null and v_secret is not null then
    perform net.http_post(
      url := v_url,
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-campus-secret', v_secret),
      body := '{}'::jsonb
    );
  end if;
  return null;
exception when others then
  raise warning '[dispatch_push] %', sqlerrm;
  return null;
end;
$$;

drop trigger if exists trg_push_outbox_dispatch on public.push_outbox;
create trigger trg_push_outbox_dispatch
after insert on public.push_outbox
for each statement execute function public.dispatch_push();

-- La Edge Function toma lotes sin duplicar envíos.
create or replace function public.claim_push_batch(p_limit integer default 300)
returns setof public.push_outbox
language sql
security definer
set search_path = public
as $$
  update public.push_outbox
  set attempts = attempts + 1, claimed_at = now()
  where id in (
    select id from public.push_outbox
    where sent_at is null
      and attempts < 3
      and (claimed_at is null or claimed_at < now() - interval '2 minutes')
      and created_at > now() - interval '2 days'
    order by id
    limit p_limit
    for update skip locked
  )
  returning *
$$;

revoke all on function public.claim_push_batch(integer) from public, anon, authenticated;
grant execute on function public.claim_push_batch(integer) to service_role;

-- Aviso de prueba desde la app (solo para uno mismo).
create or replace function public.send_test_push()
returns void
language sql
security definer
set search_path = public
as $$
  select public.queue_push(array[auth.uid()], 'TEST', 'Campus Tesla', 'Las notificaciones están activas en este dispositivo.', '/')
$$;

revoke all on function public.send_test_push() from public, anon;
grant execute on function public.send_test_push() to authenticated;

-- ----------------------------------------------------------------------------
-- 4) Seguridad (RLS)
-- ----------------------------------------------------------------------------
alter table public.push_subscriptions enable row level security;
alter table public.push_outbox enable row level security;

drop policy if exists "own" on public.push_subscriptions;
create policy "own" on public.push_subscriptions for all to authenticated
  using (profile_id = (select auth.uid())) with check (profile_id = (select auth.uid()));
-- push_outbox: sin políticas (solo la Edge Function con service_role).

-- ----------------------------------------------------------------------------
-- 5) CONFIGURACIÓN: cambia los valores y ejecuta este bloque
--    · La URL es la de tu proyecto (Edge Functions > campus-push).
--    · El secreto debe ser IGUAL al PUSH_WEBHOOK_SECRET de la función.
-- ----------------------------------------------------------------------------
-- insert into campus_private.settings (key, value) values
--   ('push_function_url', 'https://TU-PROYECTO.supabase.co/functions/v1/campus-push'),
--   ('push_secret', 'UN-SECRETO-LARGO-Y-ALEATORIO')
-- on conflict (key) do update set value = excluded.value;

-- (Opcional) Reintento cada 5 minutos por si alguna llamada se perdió:
-- select cron.schedule('campus-push-retry', '*/5 * * * *', $$
--   select net.http_post(
--     url := (select value from campus_private.settings where key = 'push_function_url'),
--     headers := jsonb_build_object('Content-Type', 'application/json',
--                'x-campus-secret', (select value from campus_private.settings where key = 'push_secret')),
--     body := '{}'::jsonb)
--   where exists (select 1 from public.push_outbox where sent_at is null and attempts < 3)
-- $$);

select 'Push listo. Falta configurar campus_private.settings (bloque 5).' as estado;
