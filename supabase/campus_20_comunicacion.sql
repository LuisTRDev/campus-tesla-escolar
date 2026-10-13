-- ============================================================================
-- CAMPUS VIRTUAL TESLA · Script 20
-- Comunicación: preferencias y horario de silencio de los avisos push, fotos y
-- audios en los mensajes, reacciones y confirmación de lectura en anuncios,
-- grupos de mensajes por aula y configuración del tutor IA.
--
-- Requiere los scripts 01 a 19. Se puede volver a ejecutar.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Preferencias de avisos y horario de silencio
-- ----------------------------------------------------------------------------
create table if not exists public.notification_prefs (
  profile_id uuid primary key default auth.uid() references public.profiles(id) on delete cascade,
  quiet_enabled boolean not null default true,
  quiet_start time not null default '21:00',
  quiet_end time not null default '06:30',
  quiet_weekends boolean not null default false,
  muted_kinds text[] not null default '{}',
  updated_at timestamptz not null default now()
);

alter table public.push_outbox add column if not exists send_after timestamptz;

-- Próximo momento permitido para avisar a esta persona (hora de Lima).
create or replace function public.push_send_after(p_profile uuid)
returns timestamptz
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  p public.notification_prefs%rowtype;
  v_local timestamp := now() at time zone 'America/Lima';
  v_t time := v_local::time;
  v_next timestamp;
begin
  select * into p from public.notification_prefs where profile_id = p_profile;
  if not found then
    -- Por defecto: silencio de 9:00 p. m. a 6:30 a. m.
    p.quiet_enabled := true; p.quiet_start := '21:00'; p.quiet_end := '06:30'; p.quiet_weekends := false;
  end if;
  v_next := v_local;
  if p.quiet_enabled then
    if p.quiet_start > p.quiet_end then
      -- Cruza la medianoche (ej. 21:00 a 06:30).
      if v_t >= p.quiet_start then
        v_next := (v_local::date + 1) + p.quiet_end;
      elsif v_t < p.quiet_end then
        v_next := v_local::date + p.quiet_end;
      end if;
    elsif v_t >= p.quiet_start and v_t < p.quiet_end then
      v_next := v_local::date + p.quiet_end;
    end if;
  end if;
  if p.quiet_weekends then
    while extract(isodow from v_next) in (6, 7) loop
      v_next := (v_next::date + 1) + coalesce(case when p.quiet_enabled then p.quiet_end end, time '07:00');
    end loop;
  end if;
  if v_next <= v_local then
    return null;
  end if;
  return v_next at time zone 'America/Lima';
end;
$$;

-- Encola respetando los tipos silenciados y el horario de silencio.
-- Los avisos de prueba nunca se silencian.
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
  insert into public.push_outbox (profile_id, kind, title, body, url, data, send_after)
  select distinct on (pid) pid, p_kind, left(p_title, 120), left(coalesce(p_body, ''), 400), p_url, coalesce(p_data, '{}'::jsonb),
         case when p_kind = 'TEST' then null else public.push_send_after(pid) end
  from unnest(p_profiles) as pid
  where pid is not null
    and exists (select 1 from public.push_subscriptions s where s.profile_id = pid)
    and (p_kind = 'TEST' or not exists (
      select 1 from public.notification_prefs np where np.profile_id = pid and p_kind = any(np.muted_kinds)))
$$;

revoke all on function public.queue_push(uuid[], text, text, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.push_send_after(uuid) from public, anon, authenticated;

-- La Edge Function solo toma los avisos que ya pueden salir.
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
      and (send_after is null or send_after <= now())
      and coalesce(send_after, created_at) > now() - interval '2 days'
    order by id
    limit p_limit
    for update skip locked
  )
  returning *
$$;

revoke all on function public.claim_push_batch(integer) from public, anon, authenticated;
grant execute on function public.claim_push_batch(integer) to service_role;

-- Los avisos diferidos salen cuando entra cualquier aviso nuevo; para que salgan
-- puntuales, programa este envío con pg_cron (al final del script).
create or replace function public.dispatch_due_push()
returns void
language plpgsql
security definer
set search_path = public, campus_private
as $$
declare
  v_url text := (select value from campus_private.settings where key = 'push_function_url');
  v_secret text := (select value from campus_private.settings where key = 'push_secret');
begin
  if v_url is not null and v_secret is not null
     and exists (select 1 from public.push_outbox where sent_at is null and send_after is not null and send_after <= now() and attempts < 3) then
    perform net.http_post(url := v_url, headers := jsonb_build_object('Content-Type', 'application/json', 'x-campus-secret', v_secret), body := '{}'::jsonb);
  end if;
end;
$$;

revoke all on function public.dispatch_due_push() from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 2) Fotos, audios y archivos en los mensajes
--    Ruta del archivo: c/{conversation_id}/... (chat) o g/{channel_id}/... (grupo)
-- ----------------------------------------------------------------------------
alter table public.messages add column if not exists attachment_path text;
alter table public.messages add column if not exists attachment_kind text;
alter table public.messages add column if not exists attachment_name text;
alter table public.messages drop constraint if exists messages_attachment_kind_check;
alter table public.messages add constraint messages_attachment_kind_check
  check (attachment_kind is null or attachment_kind in ('IMAGE', 'AUDIO', 'FILE'));

-- ----------------------------------------------------------------------------
-- 3) Grupos de mensajes por aula (alumnos o familias)
--    ANNOUNCE: solo escriben docentes y personal · OPEN: todos conversan
-- ----------------------------------------------------------------------------
create table if not exists public.class_channels (
  id bigint generated always as identity primary key,
  classroom_id bigint not null references public.classrooms(id) on delete cascade,
  audience text not null check (audience in ('STUDENTS', 'FAMILIES')),
  mode text not null default 'ANNOUNCE' check (mode in ('ANNOUNCE', 'OPEN')),
  title text check (title is null or char_length(title) <= 80),
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (classroom_id, audience)
);

create table if not exists public.channel_messages (
  id bigint generated always as identity primary key,
  channel_id bigint not null references public.class_channels(id) on delete cascade,
  sender_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  sender_name text,
  sender_role text,
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  attachment_path text,
  attachment_kind text check (attachment_kind is null or attachment_kind in ('IMAGE', 'AUDIO', 'FILE')),
  attachment_name text,
  hidden boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists idx_channel_messages on public.channel_messages(channel_id, created_at);

create table if not exists public.channel_reads (
  channel_id bigint not null references public.class_channels(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (channel_id, profile_id)
);

create or replace function public.channel_role(p_channel_id bigint)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when public.is_staff() or c.classroom_id in (select public.teacher_classroom_ids()) then 'STAFF'
    when c.audience = 'STUDENTS' and exists (select 1 from public.students s where s.id = public.my_self_student_id() and s.classroom_id = c.classroom_id) then 'MEMBER'
    when c.audience = 'FAMILIES' and public.my_self_student_id() is null and c.classroom_id in (select public.family_classroom_ids()) then 'MEMBER'
  end
  from public.class_channels c where c.id = p_channel_id
$$;

create or replace function public.prepare_channel_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := public.channel_role(new.channel_id);
  v_mode text;
begin
  select mode into v_mode from public.class_channels where id = new.channel_id;
  if v_role is null or (v_role = 'MEMBER' and v_mode <> 'OPEN') then
    raise exception 'En este grupo solo escriben los docentes.';
  end if;
  new.sender_id := auth.uid();
  new.body := btrim(new.body);
  new.hidden := false;
  new.created_at := now();
  select p.full_name, p.role into new.sender_name, new.sender_role from public.profiles p where p.id = new.sender_id;
  return new;
end;
$$;

drop trigger if exists trg_channel_messages_prepare on public.channel_messages;
create trigger trg_channel_messages_prepare before insert on public.channel_messages
for each row execute function public.prepare_channel_message();

-- Aviso a los miembros cuando escribe un docente.
create or replace function public.notify_channel_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.class_channels%rowtype;
begin
  if new.sender_role not in ('TEACHER', 'ADMIN', 'MANAGEMENT', 'AUXILIARY') then
    return null;
  end if;
  select * into c from public.class_channels where id = new.channel_id;
  perform public.queue_push(array(
    select s.profile_id from public.students s
    where c.audience = 'STUDENTS' and s.classroom_id = c.classroom_id and s.profile_id is not null
    union
    select f.pid from public.students s, lateral public.family_profile_ids(s.id, false) as f(pid)
    where c.audience = 'FAMILIES' and s.classroom_id = c.classroom_id
  ), 'CHANNEL', coalesce(new.sender_name, 'Docente') || ' · grupo del aula', left(new.body, 200), '/grupos/' || c.id);
  return null;
exception when others then
  return null;
end;
$$;

drop trigger if exists trg_channel_messages_notify on public.channel_messages;
create trigger trg_channel_messages_notify after insert on public.channel_messages
for each row execute function public.notify_channel_message();

create or replace function public.my_channels()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', c.id, 'classroom_id', c.classroom_id, 'audience', c.audience, 'mode', c.mode,
    'title', coalesce(c.title, btrim(coalesce(cl.grade::text, '') || '° ' || coalesce(cl.section, '') || ' · ' || coalesce(cl.level, ''))),
    'role', public.channel_role(c.id),
    'last', (select jsonb_build_object('body', m.body, 'at', m.created_at, 'sender', m.sender_name)
             from public.channel_messages m where m.channel_id = c.id and not m.hidden order by m.created_at desc limit 1),
    'unread', (select count(*) from public.channel_messages m where m.channel_id = c.id and not m.hidden and m.sender_id <> auth.uid()
               and m.created_at > coalesce((select r.last_read_at from public.channel_reads r where r.channel_id = c.id and r.profile_id = auth.uid()), '-infinity'))
  ) order by c.classroom_id, c.audience), '[]'::jsonb)
  from public.class_channels c join public.classrooms cl on cl.id = c.classroom_id
  where public.channel_role(c.id) is not null
$$;

create or replace function public.mark_channel_read(p_channel_id bigint)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.channel_reads (channel_id, profile_id) select p_channel_id, auth.uid() where public.channel_role(p_channel_id) is not null
  on conflict (channel_id, profile_id) do update set last_read_at = now()
$$;

-- El tutor (o la dirección) crea o cambia el grupo de su aula.
create or replace function public.save_class_channel(p_classroom_id bigint, p_audience text, p_mode text, p_title text default null)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id bigint;
begin
  if not (public.is_staff() or public.is_classroom_tutor(p_classroom_id)) then
    raise exception 'Solo el tutor del aula o la dirección crean grupos.';
  end if;
  insert into public.class_channels (classroom_id, audience, mode, title)
  values (p_classroom_id, p_audience, coalesce(p_mode, 'ANNOUNCE'), nullif(btrim(coalesce(p_title, '')), ''))
  on conflict (classroom_id, audience) do update set mode = excluded.mode, title = excluded.title
  returning id into v_id;
  return v_id;
end;
$$;

-- "Visto": hasta cuándo leyó la otra persona de la conversación.
create or replace function public.conversation_seen(p_conversation_id bigint)
returns timestamptz
language sql
stable
security definer
set search_path = public
as $$
  select max(r.last_read_at) from public.conversation_reads r
  where r.conversation_id = p_conversation_id and r.profile_id <> auth.uid() and public.is_conversation_member(p_conversation_id)
$$;

-- ----------------------------------------------------------------------------
-- 4) Anuncios: reacciones y confirmación de lectura
-- ----------------------------------------------------------------------------
alter table public.announcements add column if not exists require_ack boolean not null default false;

create table if not exists public.announcement_reactions (
  announcement_id bigint not null references public.announcements(id) on delete cascade,
  profile_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  emoji text not null check (emoji in ('👍', '❤️', '🎉', '👏', '😮')),
  created_at timestamptz not null default now(),
  primary key (announcement_id, profile_id, emoji)
);

create table if not exists public.announcement_reads (
  announcement_id bigint not null references public.announcements(id) on delete cascade,
  profile_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (announcement_id, profile_id)
);

-- Reacciones y lecturas de una lista de anuncios (para el muro).
create or replace function public.announcement_social(p_ids bigint[])
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_object_agg(a.id::text, jsonb_build_object(
    'reactions', coalesce((select jsonb_object_agg(r.emoji, r.n) from (
      select emoji, count(*) as n from public.announcement_reactions where announcement_id = a.id group by emoji) r), '{}'::jsonb),
    'mine', coalesce((select jsonb_agg(emoji) from public.announcement_reactions where announcement_id = a.id and profile_id = auth.uid()), '[]'::jsonb),
    'acked', exists (select 1 from public.announcement_reads where announcement_id = a.id and profile_id = auth.uid()),
    'reads', case when a.author_id = auth.uid() or public.is_staff() then (select count(*) from public.announcement_reads where announcement_id = a.id) end
  )), '{}'::jsonb)
  from public.announcements a
  where a.id = any(p_ids)
$$;

-- Quién confirmó la lectura (autor o personal).
create or replace function public.announcement_readers(p_id bigint)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case when exists (select 1 from public.announcements a where a.id = p_id and (a.author_id = auth.uid() or public.is_staff())) then
    coalesce((select jsonb_agg(jsonb_build_object('name', p.full_name, 'role', p.role, 'read_at', r.read_at) order by r.read_at desc)
              from public.announcement_reads r join public.profiles p on p.id = r.profile_id where r.announcement_id = p_id), '[]'::jsonb)
  end
$$;

-- ----------------------------------------------------------------------------
-- 5) Tutor IA por curso (lo atiende la Edge Function campus-tutor)
-- ----------------------------------------------------------------------------
create table if not exists public.tutor_settings (
  offering_id bigint primary key references public.course_offerings(id) on delete cascade,
  enabled boolean not null default false,
  instructions text check (instructions is null or char_length(instructions) <= 2000),
  daily_limit integer not null default 25 check (daily_limit between 1 and 200),
  updated_at timestamptz not null default now()
);

create table if not exists public.tutor_messages (
  id bigint generated always as identity primary key,
  student_id bigint not null references public.students(id) on delete cascade,
  offering_id bigint not null references public.course_offerings(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null check (char_length(content) <= 8000),
  created_at timestamptz not null default now()
);
create index if not exists idx_tutor_messages on public.tutor_messages(student_id, offering_id, created_at);

-- ----------------------------------------------------------------------------
-- 6) Archivos de mensajes y grupos
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('campus-messages', 'campus-messages', false, 10485760,
        array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'application/pdf'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.can_access_message_file(p_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case split_part(p_name, '/', 1)
    when 'c' then public.is_conversation_member(public.try_bigint(split_part(p_name, '/', 2)))
    when 'g' then public.channel_role(public.try_bigint(split_part(p_name, '/', 2))) is not null
    else false end
$$;

drop policy if exists "campus_messages_read" on storage.objects;
drop policy if exists "campus_messages_write" on storage.objects;
create policy "campus_messages_read" on storage.objects for select to authenticated
  using (bucket_id = 'campus-messages' and public.can_access_message_file(name));
create policy "campus_messages_write" on storage.objects for insert to authenticated
  with check (bucket_id = 'campus-messages' and public.can_access_message_file(name));

-- ----------------------------------------------------------------------------
-- 7) Seguridad (RLS)
-- ----------------------------------------------------------------------------
do $$
declare
  t text;
  pol record;
begin
  foreach t in array array[
    'notification_prefs', 'class_channels', 'channel_messages', 'channel_reads', 'announcement_reactions',
    'announcement_reads', 'tutor_settings', 'tutor_messages'
  ] loop
    for pol in select policyname from pg_policies where schemaname = 'public' and tablename = t loop
      execute format('drop policy %I on public.%I', pol.policyname, t);
    end loop;
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

create policy "own" on public.notification_prefs for all to authenticated
  using (profile_id = (select auth.uid())) with check (profile_id = (select auth.uid()));

create policy "view" on public.class_channels for select to authenticated using (public.channel_role(id) is not null);
create policy "view" on public.channel_messages for select to authenticated
  using (public.channel_role(channel_id) is not null and (not hidden or public.channel_role(channel_id) = 'STAFF'));
create policy "create" on public.channel_messages for insert to authenticated
  with check (sender_id = (select auth.uid()) and public.channel_role(channel_id) is not null);
create policy "moderate" on public.channel_messages for update to authenticated
  using (public.channel_role(channel_id) = 'STAFF') with check (public.channel_role(channel_id) = 'STAFF');
create policy "delete_own" on public.channel_messages for delete to authenticated
  using (sender_id = (select auth.uid()) or public.channel_role(channel_id) = 'STAFF');
create policy "own" on public.channel_reads for select to authenticated using (profile_id = (select auth.uid()));

create policy "view" on public.announcement_reactions for select to authenticated
  using (exists (select 1 from public.announcements a where a.id = announcement_id));
create policy "own_insert" on public.announcement_reactions for insert to authenticated
  with check (profile_id = (select auth.uid()) and exists (select 1 from public.announcements a where a.id = announcement_id));
create policy "own_delete" on public.announcement_reactions for delete to authenticated using (profile_id = (select auth.uid()));

create policy "own" on public.announcement_reads for select to authenticated using (profile_id = (select auth.uid()));
create policy "own_insert" on public.announcement_reads for insert to authenticated
  with check (profile_id = (select auth.uid()) and exists (select 1 from public.announcements a where a.id = announcement_id));

create policy "view" on public.tutor_settings for select to authenticated using (public.can_view_offering(offering_id));
create policy "manage" on public.tutor_settings for all to authenticated
  using (public.can_manage_offering(offering_id)) with check (public.can_manage_offering(offering_id));
create policy "view" on public.tutor_messages for select to authenticated
  using (student_id in (select public.my_student_ids()) or public.can_manage_offering(offering_id) or (select public.is_admin()));

do $$
declare
  f text;
begin
  foreach f in array array['prepare_channel_message()', 'notify_channel_message()'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
  end loop;
  foreach f in array array[
    'channel_role(bigint)', 'my_channels()', 'mark_channel_read(bigint)', 'save_class_channel(bigint, text, text, text)',
    'announcement_social(bigint[])', 'announcement_readers(bigint)', 'can_access_message_file(text)', 'conversation_seen(bigint)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- (Opcional) Que los avisos retenidos por el horario de silencio salgan puntuales:
-- select cron.schedule('campus-push-due', '*/10 * * * *', $$select public.dispatch_due_push()$$);

-- Tiempo real para los grupos del aula y las lecturas de mensajes ("visto").
do $$
declare
  t text;
begin
  foreach t in array array['channel_messages', 'conversation_reads'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

select 'Comunicación lista' as estado;
