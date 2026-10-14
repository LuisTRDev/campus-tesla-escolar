-- ============================================================================
-- CAMPUS VIRTUAL TESLA · Script 16
-- Perfil Tesla: fondos de perfil, banners animados y Estrellas Tesla.
--
--   · Nuevo cosmético BACKGROUND (fondo de toda la página del perfil).
--   · Los banners y fondos pueden ser:
--       "#RRGGBB,#RRGGBB"   degradado de dos colores (solo banners)
--       "scene:<clave>"     escena animada o estática dibujada por la app
--       "img:<ruta>"        imagen subida por la dirección (bucket campus-rewards)
--       "vid:<ruta>"        video en bucle subido por la dirección (webm/mp4)
--       "none"              sin fondo (solo fondos)
--   · Estrellas Tesla: insignias de rango por nivel (bronce, plata, oro y la
--     Gran Estrella). Cada una es también un pin físico: el tutor o la
--     dirección registran cuándo lo entregaron en persona.
--
-- Requiere el script 15. Se puede volver a ejecutar. Si vuelves a ejecutar el
-- 15, ejecuta después este de nuevo (el 15 restablece el bucket de imágenes).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Niveles en los que se gana cada Estrella Tesla
-- ----------------------------------------------------------------------------
alter table public.tesla_settings add column if not exists pin_levels integer[] not null default '{2,5,8,12}';
alter table public.tesla_settings drop constraint if exists tesla_settings_pin_levels_check;
alter table public.tesla_settings add constraint tesla_settings_pin_levels_check check (
  cardinality(pin_levels) = 4
  and pin_levels[1] >= 2 and pin_levels[1] < pin_levels[2]
  and pin_levels[2] < pin_levels[3] and pin_levels[3] < pin_levels[4]
  and pin_levels[4] <= 100
);

-- 0 = todavía ninguna · 1 bronce · 2 plata · 3 oro · 4 Gran Estrella Tesla
create or replace function public.tesla_pin_tier(p_level integer)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select count(*)::int from public.tesla_settings s, unnest(s.pin_levels) l
    where s.id = 1 and coalesce(p_level, 1) >= l
  ), 0)
$$;

create or replace function public.tesla_pin_name(p_tier integer)
returns text
language sql
immutable
set search_path = public
as $$
  select (array['Estrella de Bronce', 'Estrella de Plata', 'Estrella de Oro', 'Gran Estrella Tesla'])[p_tier]
$$;

-- Entregas del pin físico.
create table if not exists public.tesla_pin_deliveries (
  student_id bigint not null references public.students(id) on delete cascade,
  tier smallint not null check (tier between 1 and 4),
  delivered_at timestamptz not null default now(),
  delivered_by uuid references public.profiles(id) on delete set null,
  primary key (student_id, tier)
);

-- ----------------------------------------------------------------------------
-- 2) Cosméticos: fondos y banners con escenas o archivos
-- ----------------------------------------------------------------------------
alter table public.cosmetics drop constraint if exists cosmetics_kind_check;
alter table public.cosmetics add constraint cosmetics_kind_check
  -- Lista completa: los scripts 17 y 22 agregan tipos y este script se puede volver a ejecutar después.
  check (kind in ('AVATAR', 'FRAME', 'BANNER', 'TITLE', 'BACKGROUND', 'NAME_FX', 'AURA', 'THEME', 'MINI_BG'));

alter table public.cosmetics drop constraint if exists cosmetics_banner_check;
alter table public.cosmetics add constraint cosmetics_banner_check check (
  kind <> 'BANNER'
  or value ~ '^#[0-9A-Fa-f]{6},#[0-9A-Fa-f]{6}$'
  or value ~ '^(scene:[a-z0-9-]{2,30}|(img|vid):[A-Za-z0-9/._-]{3,55})$'
);

alter table public.cosmetics drop constraint if exists cosmetics_background_check;
alter table public.cosmetics add constraint cosmetics_background_check check (
  kind <> 'BACKGROUND'
  or value = 'none'
  or value ~ '^(scene:[a-z0-9-]{2,30}|(img|vid):[A-Za-z0-9/._-]{3,55})$'
);

alter table public.student_profiles add column if not exists background_id bigint references public.cosmetics(id) on delete set null;

insert into public.cosmetics (kind, name, value, rarity, unlock_type, unlock_level, unlock_achievement_id, price_coins, sort)
select c.kind, c.name, c.value, c.rarity, c.unlock_type, c.lvl, a.id, c.price, c.sort
from (values
  -- Fondos del perfil
  ('BACKGROUND', 'Sin fondo', 'none', 'BRONZE', 'DEFAULT', null, null, null, 1),
  ('BACKGROUND', 'Cuaderno', 'scene:cuaderno', 'BRONZE', 'DEFAULT', null, null, null, 2),
  ('BACKGROUND', 'Cordillera', 'scene:andes', 'BRONZE', 'DEFAULT', null, null, null, 3),
  ('BACKGROUND', 'Noche estrellada', 'scene:galaxia', 'SILVER', 'LEVEL', 3, null, null, 4),
  ('BACKGROUND', 'Mar profundo', 'scene:oceano', 'SILVER', 'LEVEL', 4, null, null, 5),
  ('BACKGROUND', 'Volcán', 'scene:lava', 'GOLD', 'LEVEL', 8, null, null, 6),
  ('BACKGROUND', 'Academia Stella', 'scene:academia', 'GOLD', 'ACHIEVEMENT', null, 'EJEMPLO_AULA', null, 7),
  ('BACKGROUND', 'Sakura', 'scene:sakura', 'SILVER', 'PURCHASE', null, null, 140, 8),
  ('BACKGROUND', 'Código', 'scene:codigo', 'SILVER', 'PURCHASE', null, null, 120, 9),
  ('BACKGROUND', 'Aurora', 'scene:aurora', 'GOLD', 'PURCHASE', null, null, 160, 10),
  ('BACKGROUND', 'Circuito', 'scene:circuito', 'GOLD', 'PURCHASE', null, null, 150, 11),
  ('BACKGROUND', 'Synthwave', 'scene:synthwave', 'GOLD', 'PURCHASE', null, null, 180, 12),
  ('BACKGROUND', 'Bobina de Tesla', 'scene:bobina', 'PLATINUM', 'PURCHASE', null, null, 250, 13),
  -- Banners animados
  ('BANNER', 'Olas', 'scene:oceano', 'BRONZE', 'DEFAULT', null, null, null, 10),
  ('BANNER', 'Vía láctea', 'scene:galaxia', 'SILVER', 'LEVEL', 2, null, null, 11),
  ('BANNER', 'Circuito', 'scene:circuito', 'SILVER', 'LEVEL', 5, null, null, 12),
  ('BANNER', 'Escudo Stella', 'scene:academia', 'GOLD', 'ACHIEVEMENT', null, 'RECONOCIDO', null, 13),
  ('BANNER', 'Sakura', 'scene:sakura', 'SILVER', 'PURCHASE', null, null, 60, 14),
  ('BANNER', 'Aurora', 'scene:aurora', 'GOLD', 'PURCHASE', null, null, 70, 15),
  ('BANNER', 'Synthwave', 'scene:synthwave', 'GOLD', 'PURCHASE', null, null, 80, 16),
  ('BANNER', 'Rayos', 'scene:bobina', 'PLATINUM', 'PURCHASE', null, null, 110, 17)
) as c(kind, name, value, rarity, unlock_type, lvl, ach_code, price, sort)
left join public.achievements a on a.code = c.ach_code
on conflict (kind, name) do nothing;

-- ----------------------------------------------------------------------------
-- 3) Puntos: avisa cuando el alumno gana una Estrella Tesla
-- ----------------------------------------------------------------------------
create or replace function public.tesla_award(
  p_student_id bigint, p_xp integer, p_coins integer, p_source text,
  p_rule_code text, p_ref_key text, p_reason text, p_by uuid default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id bigint;
  v_xp_before integer;
  v_level_before integer;
  v_level_after integer;
  v_tier integer;
begin
  if coalesce(p_xp, 0) = 0 and coalesce(p_coins, 0) = 0 then
    return false;
  end if;
  select xp into v_xp_before from public.student_wallets where student_id = p_student_id;
  v_xp_before := coalesce(v_xp_before, 0);

  insert into public.point_ledger (student_id, xp, coins, source, rule_code, ref_key, reason, created_by)
  values (p_student_id, coalesce(p_xp, 0), coalesce(p_coins, 0), p_source, p_rule_code, p_ref_key, left(p_reason, 200), p_by)
  on conflict (ref_key) do nothing
  returning id into v_id;

  if v_id is null then
    return false;
  end if;

  if coalesce(p_xp, 0) > 0 then
    v_level_before := public.tesla_level(v_xp_before);
    v_level_after := public.tesla_level(v_xp_before + p_xp);
    if v_level_after > v_level_before then
      v_tier := public.tesla_pin_tier(v_level_after);
      if v_tier > public.tesla_pin_tier(v_level_before) then
        perform public.tesla_push(p_student_id, '¡' || public.tesla_pin_name(v_tier) || '!',
          public.student_first_name(p_student_id) || ' llegó al nivel ' || v_level_after || ' y ganó la '
            || public.tesla_pin_name(v_tier) || '. Su tutor le entregará el pin en el colegio.',
          '/perfil-tesla?hijo=' || p_student_id);
      else
        perform public.tesla_push(p_student_id, '¡Nivel ' || v_level_after || '!',
          public.student_first_name(p_student_id) || ' subió al nivel ' || v_level_after || ' en su Perfil Tesla.',
          '/perfil-tesla?hijo=' || p_student_id);
      end if;
    end if;
  end if;
  return true;
end;
$$;

-- ----------------------------------------------------------------------------
-- 4) Perfil (lectura): fondo, niveles de las estrellas y pines entregados
-- ----------------------------------------------------------------------------
create or replace function public.tesla_profile(p_student_id bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_private boolean := public.can_view_student(p_student_id);
  st record;
  w record;
  pr public.student_profiles%rowtype;
  v_level integer;
  v_result jsonb;
begin
  if not public.can_view_tesla_profile(p_student_id) then
    raise exception 'No puedes ver este perfil.';
  end if;
  select s.id, s.first_name, s.last_name, s.classroom_id, c.grade, c.section, c.level
  into st from public.students s left join public.classrooms c on c.id = s.classroom_id where s.id = p_student_id;
  select coalesce(sw.xp, 0) as xp, coalesce(sw.coins, 0) as coins, coalesce(sw.best_streak, 0) as best_streak
  into w from (select 1) x left join public.student_wallets sw on sw.student_id = p_student_id;
  select * into pr from public.student_profiles where student_id = p_student_id;
  v_level := public.tesla_level(w.xp);

  v_result := jsonb_build_object(
    'student_id', st.id,
    'first_name', st.first_name,
    'last_name', st.last_name,
    'classroom_id', st.classroom_id,
    'classroom', btrim(coalesce(st.grade, '') || '° ' || coalesce(st.section, '') || ' · ' || coalesce(st.level, '')),
    'xp', w.xp,
    'level', v_level,
    'level_xp', public.tesla_level_xp(v_level),
    'next_level_xp', public.tesla_level_xp(v_level + 1),
    'is_self', p_student_id = public.my_self_student_id(),
    'can_manage', public.can_manage_tesla_student(p_student_id),
    'bio', pr.bio,
    'hide_from_rankings', coalesce(pr.hide_from_rankings, false),
    'avatar', (select jsonb_build_object('id', c.id, 'name', c.name, 'value', c.value) from public.cosmetics c where c.id = coalesce(pr.avatar_id, public.tesla_default_cosmetic('AVATAR'))),
    'frame', (select jsonb_build_object('id', c.id, 'name', c.name, 'value', c.value) from public.cosmetics c where c.id = coalesce(pr.frame_id, public.tesla_default_cosmetic('FRAME'))),
    'banner', (select jsonb_build_object('id', c.id, 'name', c.name, 'value', c.value) from public.cosmetics c where c.id = coalesce(pr.banner_id, public.tesla_default_cosmetic('BANNER'))),
    'title', (select jsonb_build_object('id', c.id, 'name', c.name, 'value', c.value) from public.cosmetics c where c.id = coalesce(pr.title_id, public.tesla_default_cosmetic('TITLE'))),
    'background', (select jsonb_build_object('id', c.id, 'name', c.name, 'value', c.value) from public.cosmetics c where c.id = coalesce(pr.background_id, public.tesla_default_cosmetic('BACKGROUND'))),
    'pin_levels', (select to_jsonb(s.pin_levels) from public.tesla_settings s where s.id = 1),
    'pins', coalesce((
      select jsonb_agg(jsonb_build_object('tier', d.tier, 'delivered_at', d.delivered_at) order by d.tier)
      from public.tesla_pin_deliveries d where d.student_id = p_student_id
    ), '[]'::jsonb),
    'featured', coalesce((
      select jsonb_agg(jsonb_build_object('id', a.id, 'name', a.name, 'icon', a.icon, 'rarity', a.rarity) order by array_position(pr.featured, a.id))
      from public.achievements a
      where a.id = any(coalesce(pr.featured, '{}'))
        and exists (select 1 from public.student_achievements sa where sa.achievement_id = a.id and sa.student_id = p_student_id)
    ), '[]'::jsonb),
    'counts', (
      select jsonb_build_object(
        'BRONZE', count(*) filter (where a.rarity = 'BRONZE'), 'SILVER', count(*) filter (where a.rarity = 'SILVER'),
        'GOLD', count(*) filter (where a.rarity = 'GOLD'), 'PLATINUM', count(*) filter (where a.rarity = 'PLATINUM'),
        'total', count(*))
      from public.student_achievements sa join public.achievements a on a.id = sa.achievement_id
      where sa.student_id = p_student_id
    )
  );

  -- Monedas, racha y canjes: solo el alumno, su familia, sus docentes y el personal.
  if v_private then
    v_result := v_result || jsonb_build_object(
      'coins', w.coins,
      'reserved', (select coalesce(sum(price), 0) from public.reward_requests where student_id = p_student_id and status = 'PENDING'),
      'best_streak', w.best_streak,
      'current_streak', public.tesla_current_streak(p_student_id)
    );
  end if;
  return v_result;
end;
$$;

-- Compañeros del aula: se agrega la Estrella Tesla de cada uno.
drop function if exists public.tesla_classroom_profiles(bigint);
create function public.tesla_classroom_profiles(p_classroom_id bigint)
returns table (
  student_id bigint,
  first_name text,
  last_name text,
  level integer,
  pin_tier integer,
  xp integer,
  coins integer,
  avatar text,
  frame text,
  title text,
  achievements integer,
  recognitions_today integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_private boolean := public.is_staff() or p_classroom_id in (select public.teacher_classroom_ids());
begin
  if not v_private and not exists (
    select 1 from public.students s where s.id = public.my_self_student_id() and s.classroom_id = p_classroom_id
  ) then
    raise exception 'No puedes ver esta aula.';
  end if;
  return query
  select s.id, s.first_name, s.last_name,
         public.tesla_level(coalesce(w.xp, 0)),
         public.tesla_pin_tier(public.tesla_level(coalesce(w.xp, 0))),
         case when v_private then coalesce(w.xp, 0) end,
         case when v_private then coalesce(w.coins, 0) end,
         (select c.value from public.cosmetics c where c.id = coalesce(p.avatar_id, public.tesla_default_cosmetic('AVATAR'))),
         (select c.value from public.cosmetics c where c.id = coalesce(p.frame_id, public.tesla_default_cosmetic('FRAME'))),
         (select c.value from public.cosmetics c where c.id = coalesce(p.title_id, public.tesla_default_cosmetic('TITLE'))),
         (select count(*) from public.student_achievements sa where sa.student_id = s.id)::int,
         case when v_private then (select count(*) from public.recognitions r
                                   where r.student_id = s.id and r.created_at >= public.tesla_day_start(public.tesla_today()))::int end
  from public.students s
  left join public.student_wallets w on w.student_id = s.id
  left join public.student_profiles p on p.student_id = s.id
  where s.classroom_id = p_classroom_id
  order by s.last_name, s.first_name;
end;
$$;

-- ----------------------------------------------------------------------------
-- 5) Guardar el perfil (ahora con fondo)
-- ----------------------------------------------------------------------------
create or replace function public.update_my_tesla_profile(
  p_avatar_id bigint, p_frame_id bigint, p_banner_id bigint, p_title_id bigint, p_background_id bigint,
  p_featured bigint[], p_bio text, p_hide_from_rankings boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sid bigint := public.tesla_self_student();
  v_featured bigint[];
  v_bio text := nullif(btrim(regexp_replace(coalesce(p_bio, ''), '\s+', ' ', 'g')), '');
  v_pair record;
begin
  for v_pair in
    select * from (values ('AVATAR', p_avatar_id), ('FRAME', p_frame_id), ('BANNER', p_banner_id),
                          ('TITLE', p_title_id), ('BACKGROUND', p_background_id)) as x(kind, cid)
    where cid is not null
  loop
    if not exists (select 1 from public.cosmetics where id = v_pair.cid and kind = v_pair.kind) then
      raise exception 'Elección no válida.';
    end if;
    if not public.tesla_cosmetic_unlocked(v_sid, v_pair.cid) then
      raise exception 'Todavía no desbloqueas «%».', (select name from public.cosmetics where id = v_pair.cid);
    end if;
  end loop;

  select coalesce(array_agg(x order by ord), '{}') into v_featured
  from (select distinct on (x) x, ord from unnest(coalesce(p_featured, '{}')) with ordinality as u(x, ord) order by x, ord) d;
  if cardinality(v_featured) > 3 then
    raise exception 'Puedes destacar hasta 3 insignias.';
  end if;
  if exists (
    select 1 from unnest(v_featured) f
    where not exists (select 1 from public.student_achievements sa where sa.student_id = v_sid and sa.achievement_id = f)
  ) then
    raise exception 'Solo puedes destacar logros que ya obtuviste.';
  end if;
  if char_length(coalesce(v_bio, '')) > 140 then
    raise exception 'La presentación puede tener hasta 140 caracteres.';
  end if;

  insert into public.student_profiles (student_id, avatar_id, frame_id, banner_id, title_id, background_id, featured, bio, hide_from_rankings, updated_at)
  values (v_sid, p_avatar_id, p_frame_id, p_banner_id, p_title_id, p_background_id, v_featured, v_bio, coalesce(p_hide_from_rankings, false), now())
  on conflict (student_id) do update
    set avatar_id = excluded.avatar_id, frame_id = excluded.frame_id, banner_id = excluded.banner_id,
        title_id = excluded.title_id, background_id = excluded.background_id, featured = excluded.featured,
        bio = excluded.bio, hide_from_rankings = excluded.hide_from_rankings, updated_at = now();
end;
$$;

-- Versión anterior (sin fondo): conserva el fondo elegido. La usan las pestañas
-- que sigan abiertas con la versión previa de la app.
create or replace function public.update_my_tesla_profile(
  p_avatar_id bigint, p_frame_id bigint, p_banner_id bigint, p_title_id bigint,
  p_featured bigint[], p_bio text, p_hide_from_rankings boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.update_my_tesla_profile(
    p_avatar_id, p_frame_id, p_banner_id, p_title_id,
    (select background_id from public.student_profiles where student_id = public.tesla_self_student()),
    p_featured, p_bio, p_hide_from_rankings
  );
end;
$$;

-- ----------------------------------------------------------------------------
-- 6) Entrega de los pines físicos
-- ----------------------------------------------------------------------------
-- Estrellas ganadas (entregadas o no) de un aula, o de todo el colegio para el personal.
create or replace function public.tesla_pin_queue(p_classroom_id bigint default null)
returns table (
  student_id bigint,
  first_name text,
  last_name text,
  classroom_id bigint,
  classroom text,
  level integer,
  tier integer,
  delivered_at timestamptz,
  can_deliver boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if p_classroom_id is null then
    if not public.is_staff() then
      raise exception 'Elige un aula.';
    end if;
  elsif not (public.is_staff() or p_classroom_id in (select public.teacher_classroom_ids())) then
    raise exception 'No puedes ver esta aula.';
  end if;

  return query
  with st as (
    select s.id, s.first_name, s.last_name, s.classroom_id,
           btrim(coalesce(c.grade, '') || '° ' || coalesce(c.section, '') || ' · ' || coalesce(c.level, '')) as classroom,
           public.tesla_level(coalesce(w.xp, 0)) as lvl
    from public.students s
    left join public.classrooms c on c.id = s.classroom_id
    left join public.student_wallets w on w.student_id = s.id
    where (p_classroom_id is null or s.classroom_id = p_classroom_id)
      and coalesce(w.xp, 0) > 0
  )
  select st.id, st.first_name, st.last_name, st.classroom_id, st.classroom, st.lvl, t.tier, d.delivered_at,
         public.can_manage_tesla_student(st.id)
  from st
  cross join lateral generate_series(1, public.tesla_pin_tier(st.lvl)) as t(tier)
  left join public.tesla_pin_deliveries d on d.student_id = st.id and d.tier = t.tier
  order by (d.delivered_at is null) desc, d.delivered_at desc nulls last, st.classroom, st.last_name, st.first_name, t.tier;
end;
$$;

create or replace function public.set_pin_delivered(p_student_id bigint, p_tier integer, p_delivered boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.can_manage_tesla_student(p_student_id) then
    raise exception 'Solo el tutor del aula o la dirección registran la entrega de los pines.';
  end if;
  if p_tier is null or p_tier not between 1 and 4 then
    raise exception 'Estrella no válida.';
  end if;
  if p_delivered then
    if public.tesla_pin_tier(public.tesla_level(coalesce((select xp from public.student_wallets where student_id = p_student_id), 0))) < p_tier then
      raise exception 'El alumno todavía no gana la %.', public.tesla_pin_name(p_tier);
    end if;
    insert into public.tesla_pin_deliveries (student_id, tier, delivered_by)
    values (p_student_id, p_tier, auth.uid())
    on conflict (student_id, tier) do nothing;
    perform public.tesla_push(p_student_id, '¡Pin entregado!',
      public.student_first_name(p_student_id) || ' recibió su ' || public.tesla_pin_name(p_tier) || '. ¡Que la luzca con orgullo!',
      '/perfil-tesla?hijo=' || p_student_id);
  else
    delete from public.tesla_pin_deliveries where student_id = p_student_id and tier = p_tier;
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- 7) Seguridad
-- ----------------------------------------------------------------------------
alter table public.tesla_pin_deliveries enable row level security;
drop policy if exists "view" on public.tesla_pin_deliveries;
create policy "view" on public.tesla_pin_deliveries for select to authenticated using (public.can_view_tesla_profile(student_id));

-- Imágenes y videos de fondos y banners: mismo bucket que la tienda, en la carpeta cosmetics/.
update storage.buckets
set file_size_limit = 12582912,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/webm', 'video/mp4']
where id = 'campus-rewards';

do $$
declare
  f text;
begin
  foreach f in array array[
    'tesla_pin_tier(integer)', 'tesla_pin_name(integer)', 'tesla_profile(bigint)', 'tesla_classroom_profiles(bigint)',
    'update_my_tesla_profile(bigint, bigint, bigint, bigint, bigint, bigint[], text, boolean)',
    'update_my_tesla_profile(bigint, bigint, bigint, bigint, bigint[], text, boolean)',
    'tesla_pin_queue(bigint)', 'set_pin_delivered(bigint, integer, boolean)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

select 'Fondos y Estrellas Tesla listos' as estado;
