-- ============================================================================
-- CAMPUS VIRTUAL TESLA · FASE 2 · Script 09
-- Mensajería docente ↔ familia, por alumno.
--
--   office_hours             Horario de atención de cada docente
--   conversations            Un hilo por alumno y docente (lo ven todos los
--                            apoderados del alumno que tengan cuenta)
--   messages                 Mensajes (no se editan ni se borran)
--   conversation_reads       Hasta dónde leyó cada persona
--   conversation_access_log  Registro de cada revisión hecha por dirección
--
-- Reglas:
--   · Los alumnos NO usan la mensajería; solo sus apoderados.
--   · Fuera del horario de atención el mensaje se envía, pero no notifica.
--   · Dirección revisa conversaciones ajenas solo con
--     admin_read_conversation(), que deja registro.
--
-- Requiere el script 07. Se puede volver a ejecutar.
-- ============================================================================

create table if not exists public.office_hours (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  weekdays smallint[] not null default '{1,2,3,4,5}',
  starts_at time not null default '07:30',
  ends_at time not null default '16:00',
  away_message text check (away_message is null or char_length(away_message) <= 300),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at),
  check (weekdays <@ '{1,2,3,4,5,6,7}'::smallint[])
);

create table if not exists public.conversations (
  id bigint generated always as identity primary key,
  student_id bigint not null references public.students(id) on delete cascade,
  staff_id uuid not null references public.profiles(id) on delete cascade,
  created_by uuid references public.profiles(id),
  last_message_at timestamptz,
  last_message_preview text,
  last_sender_id uuid,
  created_at timestamptz not null default now(),
  unique (student_id, staff_id)
);

create index if not exists idx_conversations_staff on public.conversations(staff_id, last_message_at desc);
create index if not exists idx_conversations_student on public.conversations(student_id);

create table if not exists public.messages (
  id bigint generated always as identity primary key,
  conversation_id bigint not null references public.conversations(id) on delete cascade,
  sender_id uuid not null default auth.uid() references public.profiles(id),
  sender_name text,
  sender_role text,
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  -- false si llegó fuera del horario de atención del docente.
  notify boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists idx_messages_conversation on public.messages(conversation_id, created_at);

create table if not exists public.conversation_reads (
  conversation_id bigint not null references public.conversations(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (conversation_id, profile_id)
);

create table if not exists public.conversation_access_log (
  id bigint generated always as identity primary key,
  conversation_id bigint not null references public.conversations(id) on delete cascade,
  profile_id uuid not null references public.profiles(id),
  reason text not null check (char_length(btrim(reason)) between 5 and 300),
  accessed_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 1) Funciones
-- ----------------------------------------------------------------------------
-- ¿Este docente/directivo puede conversar con la familia de este alumno?
create or replace function public.can_chat(p_student_id bigint, p_staff_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.students s
    join public.profiles p on p.id = p_staff_id and p.is_active
    where s.id = p_student_id
      and (
        p.role in ('ADMIN', 'MANAGEMENT')
        or (p.role = 'TEACHER' and (
          exists (select 1 from public.classrooms c where c.id = s.classroom_id and c.tutor_id = p_staff_id)
          or exists (
            select 1 from public.course_offerings o
            where o.classroom_id = s.classroom_id and o.teacher_id = p_staff_id and o.is_active
          )
        ))
      )
  )
$$;

create or replace function public.is_conversation_member(p_conversation_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.conversations c
    where c.id = p_conversation_id
      and (c.staff_id = auth.uid() or c.student_id in (select public.my_children_ids()))
  )
$$;

create or replace function public.in_office_hours(p_profile_id uuid, p_at timestamptz default now())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with h as (
    select coalesce(oh.weekdays, '{1,2,3,4,5}'::smallint[]) as weekdays,
           coalesce(oh.starts_at, '07:30'::time) as starts_at,
           coalesce(oh.ends_at, '16:00'::time) as ends_at
    from (select 1) x
    left join public.office_hours oh on oh.profile_id = p_profile_id
  ),
  t as (select (p_at at time zone 'America/Lima') as local)
  select extract(isodow from t.local)::smallint = any (h.weekdays)
     and t.local::time between h.starts_at and h.ends_at
  from h, t
$$;

-- Abre (o reutiliza) la conversación entre un alumno y un docente.
create or replace function public.start_conversation(p_student_id bigint, p_staff_id uuid)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id bigint;
  v_role text := public.app_role();
begin
  if v_role = 'GUARDIAN' then
    if p_student_id not in (select public.my_children_ids()) then
      raise exception 'Solo puedes escribir sobre tus hijos.';
    end if;
  elsif v_role in ('TEACHER', 'ADMIN', 'MANAGEMENT') then
    if p_staff_id is distinct from auth.uid() then
      raise exception 'Solo puedes abrir conversaciones a tu nombre.';
    end if;
  else
    raise exception 'Tu cuenta no puede usar la mensajería.';
  end if;

  if not public.can_chat(p_student_id, p_staff_id) then
    raise exception 'Ese docente no enseña en el aula del alumno.';
  end if;

  insert into public.conversations (student_id, staff_id, created_by)
  values (p_student_id, p_staff_id, auth.uid())
  on conflict (student_id, staff_id) do update set student_id = excluded.student_id
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.mark_conversation_read(p_conversation_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_conversation_member(p_conversation_id) then
    return;
  end if;
  insert into public.conversation_reads (conversation_id, profile_id, last_read_at)
  values (p_conversation_id, auth.uid(), now())
  on conflict (conversation_id, profile_id) do update set last_read_at = now();
end;
$$;

-- Dirección: leer una conversación ajena dejando registro del motivo.
create or replace function public.admin_read_conversation(p_conversation_id bigint, p_reason text)
returns setof public.messages
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Solo dirección puede revisar conversaciones.';
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 5 then
    raise exception 'Escribe el motivo de la revisión.';
  end if;
  insert into public.conversation_access_log (conversation_id, profile_id, reason)
  values (p_conversation_id, auth.uid(), btrim(p_reason));
  return query select * from public.messages where conversation_id = p_conversation_id order by created_at;
end;
$$;

-- Antes de guardar: datos del remitente y si notifica (horario de atención).
create or replace function public.prepare_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conv public.conversations%rowtype;
begin
  select * into v_conv from public.conversations where id = new.conversation_id;
  new.sender_id := auth.uid();
  new.body := btrim(new.body);
  new.created_at := now();
  select p.full_name, p.role into new.sender_name, new.sender_role from public.profiles p where p.id = new.sender_id;

  if new.sender_id = v_conv.staff_id then
    -- Docente → familia: siempre notifica.
    new.notify := true;
  else
    -- Familia → docente: solo dentro de su horario de atención.
    new.notify := public.in_office_hours(v_conv.staff_id, now());
  end if;
  return new;
end;
$$;

drop trigger if exists trg_messages_prepare on public.messages;
create trigger trg_messages_prepare
before insert on public.messages
for each row execute function public.prepare_message();

create or replace function public.after_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.conversations
  set last_message_at = new.created_at,
      last_message_preview = left(new.body, 140),
      last_sender_id = new.sender_id
  where id = new.conversation_id;

  insert into public.conversation_reads (conversation_id, profile_id, last_read_at)
  values (new.conversation_id, new.sender_id, new.created_at)
  on conflict (conversation_id, profile_id) do update set last_read_at = excluded.last_read_at;
  return new;
end;
$$;

drop trigger if exists trg_messages_after on public.messages;
create trigger trg_messages_after
after insert on public.messages
for each row execute function public.after_message();

revoke all on function public.can_chat(bigint, uuid) from public, anon;
revoke all on function public.is_conversation_member(bigint) from public, anon;
revoke all on function public.in_office_hours(uuid, timestamptz) from public, anon;
revoke all on function public.start_conversation(bigint, uuid) from public, anon;
revoke all on function public.mark_conversation_read(bigint) from public, anon;
revoke all on function public.admin_read_conversation(bigint, text) from public, anon;
grant execute on function public.can_chat(bigint, uuid) to authenticated;
grant execute on function public.is_conversation_member(bigint) to authenticated;
grant execute on function public.in_office_hours(uuid, timestamptz) to authenticated;
grant execute on function public.start_conversation(bigint, uuid) to authenticated;
grant execute on function public.mark_conversation_read(bigint) to authenticated;
grant execute on function public.admin_read_conversation(bigint, text) to authenticated;

-- ----------------------------------------------------------------------------
-- 2) Seguridad (RLS)
-- ----------------------------------------------------------------------------
alter table public.office_hours enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.conversation_reads enable row level security;
alter table public.conversation_access_log enable row level security;

do $$
declare
  t text;
  pol record;
begin
  foreach t in array array['office_hours', 'conversations', 'messages', 'conversation_reads', 'conversation_access_log'] loop
    for pol in select policyname from pg_policies where schemaname = 'public' and tablename = t loop
      execute format('drop policy %I on public.%I', pol.policyname, t);
    end loop;
  end loop;
end $$;

create policy "authenticated_read" on public.office_hours for select to authenticated using (true);
create policy "own_write" on public.office_hours for all to authenticated
  using (profile_id = (select auth.uid())) with check (profile_id = (select auth.uid()));

-- Dirección ve QUIÉN conversa con quién (no el contenido).
create policy "view" on public.conversations for select to authenticated
  using (
    staff_id = (select auth.uid())
    or student_id in (select public.my_children_ids())
    or (select public.is_admin())
  );

create policy "member_read" on public.messages for select to authenticated
  using (public.is_conversation_member(conversation_id));
create policy "member_send" on public.messages for insert to authenticated
  with check (sender_id = (select auth.uid()) and public.is_conversation_member(conversation_id));
-- Sin update ni delete: los mensajes quedan como constancia.

create policy "own" on public.conversation_reads for select to authenticated
  using (profile_id = (select auth.uid()));

create policy "admin_read" on public.conversation_access_log for select to authenticated
  using ((select public.is_admin()));

-- ----------------------------------------------------------------------------
-- 3) Tiempo real
-- ----------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['messages', 'conversations'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

select 'Mensajería lista' as estado;
