-- ============================================================================
-- CAMPUS VIRTUAL TESLA · Script 28
-- Videos de ayuda del colegio (el botón «Ayuda» de la app).
--
-- La app trae las explicaciones paso a paso escritas. Con este script la
-- dirección puede sumar, a cada tema, un video corto (30 a 60 segundos) grabado
-- por el propio colegio y subido a YouTube («no listado») o a Google Drive. Solo
-- se guarda el enlace, así que funciona igual en modo enlaces y en modo archivos.
--
-- Se pegan en el campus: Sistema → Ayuda (ADMIN o MANAGEMENT). Queda en
-- campus_private.settings (clave 'help_videos') como un objeto
-- {"justificar": "https://youtu.be/…", …} y todos los usuarios con sesión lo leen.
--
-- Es opcional: sin este script el botón «Ayuda» funciona con los pasos escritos
-- y simplemente no muestra videos.
--
-- Requiere los scripts 01 a 27. Se puede volver a ejecutar (conserva los enlaces).
-- ============================================================================

insert into campus_private.settings (key, value)
values ('help_videos', '{}')
on conflict (key) do nothing;

-- Lo leen las personas con sesión (el botón «Ayuda» de cualquier rol).
create or replace function public.campus_help_videos()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v text;
begin
  if auth.uid() is null then
    return '{}'::jsonb;
  end if;
  select value into v from campus_private.settings where key = 'help_videos';
  return coalesce(nullif(v, '')::jsonb, '{}'::jsonb);
exception when others then
  return '{}'::jsonb;
end;
$$;

revoke all on function public.campus_help_videos() from public, anon;
grant execute on function public.campus_help_videos() to authenticated;

-- Guarda los enlaces (solo ADMIN o MANAGEMENT). Cada valor debe ser https.
create or replace function public.set_campus_help_videos(p_videos jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  k text;
  v text;
  clean jsonb := '{}'::jsonb;
begin
  if not public.is_admin() then
    raise exception 'Solo la dirección puede cambiar los videos de ayuda.';
  end if;
  if p_videos is null or jsonb_typeof(p_videos) <> 'object' then
    raise exception 'Los videos de ayuda tienen un formato no válido.';
  end if;
  if (select count(*) from jsonb_object_keys(p_videos)) > 60 then
    raise exception 'Son demasiados videos de ayuda.';
  end if;

  for k, v in select key, btrim(value) from jsonb_each_text(p_videos) loop
    if k !~ '^[a-z0-9-]{1,40}$' then
      raise exception 'El tema "%" no es válido.', left(k, 40);
    end if;
    if v = '' then
      continue; -- vacío = sin video
    end if;
    if v !~* '^https://[^[:space:]]{4,}$' or length(v) > 500 then
      raise exception 'El enlace del tema "%" debe empezar con https://', k;
    end if;
    clean := clean || jsonb_build_object(k, v);
  end loop;

  insert into campus_private.settings (key, value)
  values ('help_videos', clean::text)
  on conflict (key) do update set value = excluded.value;

  perform public.audit_write('SETTING', 'campus_settings', 'help_videos',
    'Actualizó los videos de ayuda (' || (select count(*) from jsonb_object_keys(clean)) || ' con video)',
    jsonb_build_object('temas', (select coalesce(jsonb_agg(key), '[]'::jsonb) from jsonb_object_keys(clean) as key)));
  return clean;
end;
$$;

revoke all on function public.set_campus_help_videos(jsonb) from public, anon;
grant execute on function public.set_campus_help_videos(jsonb) to authenticated;
