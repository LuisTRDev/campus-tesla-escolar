-- ============================================================================
-- CAMPUS VIRTUAL TESLA · FASE 2 · Script 08
-- Comunicados con confirmación de lectura y respuesta firmada.
--
--   circulars             El comunicado (colegio, nivel o aula)
--   circular_recipients   Una fila por alumno destinatario: lectura, respuesta
--                         y firma de su familia
--
-- Requiere el script 07. Se puede volver a ejecutar.
-- ============================================================================

create table if not exists public.circulars (
  id bigint generated always as identity primary key,
  author_id uuid not null default auth.uid() references public.profiles(id),
  scope text not null check (scope in ('SCHOOL', 'LEVEL', 'CLASSROOM')),
  level text check (level is null or level in ('Primaria', 'Secundaria')),
  classroom_id bigint references public.classrooms(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 3 and 160),
  body text not null check (char_length(body) between 1 and 8000),
  -- NONE: solo lectura · CONSENT: Autorizo / No autorizo
  response_type text not null default 'NONE' check (response_type in ('NONE', 'CONSENT')),
  requires_signature boolean not null default false,
  response_deadline timestamptz,
  attachment_path text,
  attachment_name text,
  published_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint circulars_scope_target_check check (
    (scope = 'SCHOOL' and level is null and classroom_id is null)
    or (scope = 'LEVEL' and level is not null and classroom_id is null)
    or (scope = 'CLASSROOM' and classroom_id is not null and level is null)
  ),
  constraint circulars_signature_check check (not requires_signature or response_type = 'CONSENT')
);

create index if not exists idx_circulars_published on public.circulars(published_at desc);
create index if not exists idx_circulars_classroom on public.circulars(classroom_id);

create table if not exists public.circular_recipients (
  id bigint generated always as identity primary key,
  circular_id bigint not null references public.circulars(id) on delete cascade,
  student_id bigint not null references public.students(id) on delete cascade,
  classroom_id bigint references public.classrooms(id) on delete set null,
  read_at timestamptz,
  read_by uuid references public.profiles(id),
  response text check (response is null or response in ('AUTHORIZED', 'NOT_AUTHORIZED')),
  response_comment text check (response_comment is null or char_length(response_comment) <= 500),
  responded_at timestamptz,
  responded_by uuid references public.profiles(id),
  signer_name text check (signer_name is null or char_length(signer_name) <= 120),
  -- Firma dibujada en la app (PNG en base64, ~10 KB).
  signature text check (signature is null or (signature like 'data:image/png;base64,%' and char_length(signature) <= 200000)),
  unique (circular_id, student_id)
);

create index if not exists idx_circular_recipients_student on public.circular_recipients(student_id);

-- ----------------------------------------------------------------------------
-- 1) Destinatarios: se fijan al publicar (los alumnos que llegan después no
--    reciben comunicados antiguos).
-- ----------------------------------------------------------------------------
create or replace function public.create_circular_recipients()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.circular_recipients (circular_id, student_id, classroom_id)
  select new.id, s.id, s.classroom_id
  from public.students s
  join public.classrooms c on c.id = s.classroom_id
  where (new.scope = 'SCHOOL')
     or (new.scope = 'LEVEL' and c.level = new.level)
     or (new.scope = 'CLASSROOM' and c.id = new.classroom_id)
  on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists trg_circulars_recipients on public.circulars;
create trigger trg_circulars_recipients
after insert on public.circulars
for each row execute function public.create_circular_recipients();

-- ----------------------------------------------------------------------------
-- 2) Acciones de la familia (las hace la base, no la app)
-- ----------------------------------------------------------------------------
create or replace function public.mark_circular_read(p_circular_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.circular_recipients
  set read_at = now(), read_by = auth.uid()
  where circular_id = p_circular_id
    and read_at is null
    and student_id in (select public.my_children_ids());
end;
$$;

create or replace function public.respond_circular(
  p_circular_id bigint,
  p_student_id bigint,
  p_response text,
  p_comment text default null,
  p_signature text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_circular public.circulars%rowtype;
  v_name text;
begin
  if p_student_id not in (select public.my_children_ids()) then
    raise exception 'Solo el padre, madre o apoderado del alumno puede responder.';
  end if;
  select * into v_circular from public.circulars where id = p_circular_id;
  if v_circular.id is null or v_circular.response_type <> 'CONSENT' then
    raise exception 'Este comunicado no pide respuesta.';
  end if;
  if v_circular.response_deadline is not null and now() > v_circular.response_deadline then
    raise exception 'El plazo para responder este comunicado ya venció.';
  end if;
  if p_response not in ('AUTHORIZED', 'NOT_AUTHORIZED') then
    raise exception 'Respuesta no válida.';
  end if;
  if v_circular.requires_signature and coalesce(p_signature, '') = '' then
    raise exception 'Firma el comunicado antes de enviar tu respuesta.';
  end if;

  select p.full_name into v_name from public.profiles p where p.id = auth.uid();

  update public.circular_recipients
  set response = p_response,
      response_comment = nullif(btrim(coalesce(p_comment, '')), ''),
      responded_at = now(),
      responded_by = auth.uid(),
      signer_name = v_name,
      signature = case when v_circular.requires_signature then p_signature else null end,
      read_at = coalesce(read_at, now()),
      read_by = coalesce(read_by, auth.uid())
  where circular_id = p_circular_id and student_id = p_student_id;

  if not found then
    raise exception 'Este comunicado no está dirigido a este alumno.';
  end if;
end;
$$;

revoke all on function public.create_circular_recipients() from public, anon, authenticated;
revoke all on function public.mark_circular_read(bigint) from public, anon;
revoke all on function public.respond_circular(bigint, bigint, text, text, text) from public, anon;
grant execute on function public.mark_circular_read(bigint) to authenticated;
grant execute on function public.respond_circular(bigint, bigint, text, text, text) to authenticated;

-- ----------------------------------------------------------------------------
-- 3) Seguridad (RLS)
-- ----------------------------------------------------------------------------
alter table public.circulars enable row level security;
alter table public.circular_recipients enable row level security;

do $$
declare
  t text;
  pol record;
begin
  foreach t in array array['circulars', 'circular_recipients'] loop
    for pol in select policyname from pg_policies where schemaname = 'public' and tablename = t loop
      execute format('drop policy %I on public.%I', pol.policyname, t);
    end loop;
  end loop;
end $$;

-- Funciones SECURITY DEFINER para que las políticas de las dos tablas no se
-- llamen entre sí (eso provocaría recursión infinita en RLS).
create or replace function public.is_circular_family(p_circular_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.circular_recipients r
    where r.circular_id = p_circular_id and r.student_id in (select public.my_children_ids())
  )
$$;

create or replace function public.can_manage_circular(p_circular_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.circulars c
    where c.id = p_circular_id
      and (
        c.author_id = auth.uid()
        or public.is_staff()
        or (c.scope = 'CLASSROOM' and public.is_classroom_tutor(c.classroom_id))
      )
  )
$$;

revoke all on function public.is_circular_family(bigint) from public, anon;
revoke all on function public.can_manage_circular(bigint) from public, anon;
grant execute on function public.is_circular_family(bigint) to authenticated;
grant execute on function public.can_manage_circular(bigint) to authenticated;

-- Ver el comunicado: personal, su autor, el tutor del aula o la familia destinataria.
create policy "view" on public.circulars for select to authenticated
  using (
    (select public.is_staff())
    or author_id = (select auth.uid())
    or (scope = 'CLASSROOM' and public.is_classroom_tutor(classroom_id))
    or public.is_circular_family(id)
  );

-- Enviar: dirección a cualquiera; el tutor solo a su aula.
create policy "create" on public.circulars for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and (
      (select public.is_admin())
      or (scope = 'CLASSROOM' and public.is_classroom_tutor(classroom_id))
    )
  );

create policy "delete" on public.circulars for delete to authenticated
  using (author_id = (select auth.uid()) or (select public.is_admin()));

create policy "view" on public.circular_recipients for select to authenticated
  using (
    student_id in (select public.my_children_ids())
    or public.can_manage_circular(circular_id)
    or public.is_classroom_tutor(classroom_id)
  );
-- Sin políticas de escritura: las familias responden con respond_circular().

-- Adjuntos del comunicado: bucket privado campus-circulars/{circular_id}/archivo
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('campus-circulars', 'campus-circulars', false, 15728640, array[
  'application/pdf', 'image/jpeg', 'image/png', 'image/webp',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "campus_circulars_read" on storage.objects;
drop policy if exists "campus_circulars_insert" on storage.objects;
drop policy if exists "campus_circulars_delete" on storage.objects;

-- La carpeta usa un id temporal al subir (antes de existir el comunicado),
-- por eso la lectura se valida contra la columna attachment_path.
create policy "campus_circulars_read" on storage.objects for select to authenticated
  using (
    bucket_id = 'campus-circulars'
    and exists (select 1 from public.circulars c where c.attachment_path = name)
  );

create policy "campus_circulars_insert" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'campus-circulars'
    and (public.is_admin() or exists (select 1 from public.classrooms c where c.tutor_id = auth.uid()))
  );

create policy "campus_circulars_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'campus-circulars' and (public.is_admin() or owner_id = auth.uid()::text));

select 'Comunicados listos' as estado;
