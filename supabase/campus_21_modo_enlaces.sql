-- ============================================================================
-- CAMPUS VIRTUAL TESLA · Script 21
-- Modo enlaces / modo archivos, que la dirección cambia desde el campus.
--
-- Con el plan gratuito de Supabase (1 GB de Storage) los materiales, entregas,
-- adjuntos, audios e imágenes se guardan fuera (Google Drive, YouTube…) y el
-- campus solo guarda el enlace: es el MODO ENLACES, el predeterminado.
-- Con un plan con espacio se activa el MODO ARCHIVOS y se vuelve a subir a los
-- buckets del campus.
--
-- El modo se cambia en el campus: Sistema → Archivos (ADMIN o MANAGEMENT).
-- Queda guardado en campus_private.settings (clave 'file_uploads') y:
--   · la app lo lee al abrirse y muestra campos de enlace o de archivo;
--   · las políticas de este script lo aplican también en la base: en modo
--     enlaces nadie puede subir archivos a los buckets del campus, aunque use
--     la API directamente.
--
-- No borra nada: los archivos que ya estaban se siguen viendo y se pueden
-- eliminar. Los buckets y sus políticas (scripts 04, 08, 15, 18, 19 y 20)
-- quedan intactos. Los dos modos conviven sin migrar datos.
--
-- Requiere los scripts 01 a 20. Se puede volver a ejecutar (conserva el modo
-- elegido).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Modo actual (predeterminado: enlaces)
-- ----------------------------------------------------------------------------
insert into campus_private.settings (key, value)
values ('file_uploads', 'false')
on conflict (key) do nothing;

-- Lo leen la app (también antes de iniciar sesión) y las políticas de Storage.
create or replace function public.campus_file_uploads()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select value = 'true' from campus_private.settings where key = 'file_uploads'), false)
$$;

revoke all on function public.campus_file_uploads() from public;
grant execute on function public.campus_file_uploads() to anon, authenticated;

-- ----------------------------------------------------------------------------
-- 2) Cambiar el modo (solo ADMIN o MANAGEMENT; queda en la auditoría)
-- ----------------------------------------------------------------------------
create or replace function public.set_campus_file_uploads(p_enabled boolean)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Solo la dirección puede cambiar el modo de archivos.';
  end if;
  if p_enabled is null then
    raise exception 'Indica el modo de archivos.';
  end if;

  insert into campus_private.settings (key, value)
  values ('file_uploads', p_enabled::text)
  on conflict (key) do update set value = excluded.value;

  perform public.audit_write('SETTING', 'campus_settings', 'file_uploads',
    case when p_enabled then 'Activó el modo archivos (subidas a Supabase)'
         else 'Activó el modo enlaces (sin subidas a Supabase)' end,
    jsonb_build_object('file_uploads', p_enabled));
  return p_enabled;
end;
$$;

revoke all on function public.set_campus_file_uploads(boolean) from public, anon;
grant execute on function public.set_campus_file_uploads(boolean) to authenticated;

-- ----------------------------------------------------------------------------
-- 3) Espacio usado (para decidir el modo desde el campus)
-- ----------------------------------------------------------------------------
create or replace function public.campus_storage_usage()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'No autorizado';
  end if;
  return jsonb_build_object(
    'database_bytes', pg_database_size(current_database()),
    'buckets', coalesce((
      select jsonb_agg(jsonb_build_object('bucket', bucket_id, 'files', files, 'bytes', bytes) order by bytes desc)
      from (
        select bucket_id, count(*) as files, coalesce(sum((metadata->>'size')::bigint), 0) as bytes
        from storage.objects
        group by bucket_id
      ) b
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.campus_storage_usage() from public, anon;
grant execute on function public.campus_storage_usage() to authenticated;

-- ----------------------------------------------------------------------------
-- 4) Bloqueo de subidas en modo enlaces
-- ----------------------------------------------------------------------------
-- Las políticas restrictivas se combinan con AND con las permisivas de cada
-- bucket: en modo enlaces, aunque la política del bucket permita subir, esta
-- lo impide; en modo archivos no estorba.
-- (El nombre no empieza con "campus_" para que el script 04 no la borre si se
-- vuelve a ejecutar.)
drop policy if exists "modo_enlaces_sin_subidas" on storage.objects;
create policy "modo_enlaces_sin_subidas" on storage.objects
  as restrictive for insert to anon, authenticated
  with check (bucket_id not like 'campus-%' or public.campus_file_uploads());

drop policy if exists "modo_enlaces_sin_reemplazos" on storage.objects;
create policy "modo_enlaces_sin_reemplazos" on storage.objects
  as restrictive for update to anon, authenticated
  using (bucket_id not like 'campus-%' or public.campus_file_uploads())
  with check (bucket_id not like 'campus-%' or public.campus_file_uploads());

-- ----------------------------------------------------------------------------
-- Revisión: modo actual, espacio usado hoy por bucket (Storage) y tamaño de
-- la base. El plan gratuito permite 1 GB de Storage y 500 MB de base de datos.
-- ----------------------------------------------------------------------------
select case when public.campus_file_uploads() then 'Modo archivos' else 'Modo enlaces' end as modo_actual;

select bucket_id,
       count(*) as archivos,
       pg_size_pretty(coalesce(sum((metadata->>'size')::bigint), 0)) as espacio
from storage.objects
group by bucket_id
order by sum((metadata->>'size')::bigint) desc nulls last;

select pg_size_pretty(pg_database_size(current_database())) as tamano_base_de_datos;
