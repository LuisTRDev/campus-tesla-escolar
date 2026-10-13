-- ============================================================================
-- CAMPUS VIRTUAL TESLA · FASE 1 · Script 04 de 06
-- Archivos: buckets privados y sus reglas de acceso.
--
--   campus-materials    → {offering_id}/{archivo}
--                         (materiales y adjuntos de tareas del docente)
--   campus-submissions  → {assignment_id}/{student_id}/{archivo}
--                         (trabajos de los alumnos)
--
-- También cierra el bucket "historical-imports" de Tesla solo para personal.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Buckets (privados; los archivos se abren con URLs firmadas)
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('campus-materials', 'campus-materials', false, 26214400, array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'image/jpeg', 'image/png', 'image/webp',
    'audio/mpeg', 'audio/mp4', 'video/mp4',
    'text/plain', 'application/zip'
  ]),
  ('campus-submissions', 'campus-submissions', false, 15728640, array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'image/jpeg', 'image/png', 'image/webp', 'image/heic',
    'audio/mpeg', 'audio/mp4', 'audio/webm',
    'text/plain', 'application/zip'
  ])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- ----------------------------------------------------------------------------
-- 2) Limpiar políticas anteriores de estos buckets y políticas abiertas
-- ----------------------------------------------------------------------------
do $$
declare
  pol record;
begin
  for pol in
    select policyname, qual, with_check
    from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and (
        policyname like 'campus\_%'
        or coalesce(qual, '') ilike '%historical-imports%'
        or coalesce(with_check, '') ilike '%historical-imports%'
        or coalesce(qual, '') = 'true'
        or coalesce(with_check, '') = 'true'
      )
  loop
    raise notice 'Se elimina la política de storage: %', pol.policyname;
    execute format('drop policy %I on storage.objects', pol.policyname);
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- 3) Materiales del docente
-- ----------------------------------------------------------------------------
create policy "campus_materials_read" on storage.objects for select to authenticated
  using (
    bucket_id = 'campus-materials'
    and public.can_view_offering(public.try_bigint((storage.foldername(name))[1]))
  );

create policy "campus_materials_insert" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'campus-materials'
    and public.can_manage_offering(public.try_bigint((storage.foldername(name))[1]))
  );

create policy "campus_materials_update" on storage.objects for update to authenticated
  using (
    bucket_id = 'campus-materials'
    and public.can_manage_offering(public.try_bigint((storage.foldername(name))[1]))
  );

create policy "campus_materials_delete" on storage.objects for delete to authenticated
  using (
    bucket_id = 'campus-materials'
    and public.can_manage_offering(public.try_bigint((storage.foldername(name))[1]))
  );

-- ----------------------------------------------------------------------------
-- 4) Trabajos del alumno
-- ----------------------------------------------------------------------------
create policy "campus_submissions_read" on storage.objects for select to authenticated
  using (
    bucket_id = 'campus-submissions'
    and (
      public.try_bigint((storage.foldername(name))[2]) in (select public.my_student_ids())
      or public.can_manage_assignment(public.try_bigint((storage.foldername(name))[1]))
      or public.is_staff()
    )
  );

create policy "campus_submissions_insert" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'campus-submissions'
    and public.try_bigint((storage.foldername(name))[2]) = public.my_self_student_id()
    and exists (
      select 1 from public.assignments a
      where a.id = public.try_bigint((storage.foldername(name))[1])
        and a.status = 'PUBLISHED'
        and public.can_view_offering(a.offering_id)
    )
  );

create policy "campus_submissions_delete" on storage.objects for delete to authenticated
  using (
    bucket_id = 'campus-submissions'
    and public.try_bigint((storage.foldername(name))[2]) = public.my_self_student_id()
  );

-- ----------------------------------------------------------------------------
-- 5) Tesla: importaciones históricas solo para personal
-- ----------------------------------------------------------------------------
create policy "campus_tesla_historical_staff" on storage.objects for all to authenticated
  using (bucket_id = 'historical-imports' and public.is_staff())
  with check (bucket_id = 'historical-imports' and public.is_staff());

select id, public, file_size_limit from storage.buckets where id like 'campus-%' or id = 'historical-imports';
