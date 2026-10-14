-- ============================================================================
-- CAMPUS VIRTUAL TESLA · Script 22
-- Perfil Tesla al estilo Steam: temas, vitrinas configurables, rareza de los
-- logros, muro de felicitaciones, conjuntos guardados y cosméticos animados.
--
--   cosmetics            Tipos nuevos THEME (tema de los paneles del perfil) y
--                        MINI_BG (fondo animado del mini-perfil), marcos y
--                        avatares animados (se dibujan en la app)
--   student_profiles     theme_id, mini_bg_id, showcase_config, wall_enabled y loadouts
--   profile_wall_posts   Muro de felicitaciones: solo stickers y frases
--                        predefinidas (sin texto libre entre menores)
--   achievements         Logros del muro, de la colección y de los niveles 20 y 30
--   tesla_identities()   Nombre con efecto y avatar de los alumnos para
--                        mensajes, grupos, foro y anuncios
--
-- Nada de esto sube archivos: todo se dibuja con CSS y SVG, así que funciona
-- igual en modo enlaces (Supabase Free) y en modo archivos.
--
-- Requiere los scripts 15, 16 y 17. Se puede volver a ejecutar. Si vuelves a
-- ejecutar el 17, ejecuta otra vez este (el 17 reemplaza tesla_profile).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Cosméticos: tema del perfil, marcos y avatares animados
-- ----------------------------------------------------------------------------
alter table public.cosmetics drop constraint if exists cosmetics_kind_check;
alter table public.cosmetics add constraint cosmetics_kind_check
  check (kind in ('AVATAR', 'FRAME', 'BANNER', 'TITLE', 'BACKGROUND', 'NAME_FX', 'AURA', 'THEME', 'MINI_BG'));

-- Fondo del mini-perfil: como un banner (degradado o escena de la app) o ninguno.
alter table public.cosmetics drop constraint if exists cosmetics_minibg_check;
alter table public.cosmetics add constraint cosmetics_minibg_check check (
  kind <> 'MINI_BG' or value = 'none'
  or value ~ '^#[0-9A-Fa-f]{6},#[0-9A-Fa-f]{6}$'
  or value ~ '^scene:[a-z0-9-]{2,30}$'
);

-- Los marcos ya no son una lista fija: la app dibuja cada clave.
alter table public.cosmetics drop constraint if exists cosmetics_frame_check;
alter table public.cosmetics add constraint cosmetics_frame_check
  check (kind <> 'FRAME' or value ~ '^[a-z0-9-]{2,30}$');

alter table public.cosmetics drop constraint if exists cosmetics_effect_check;
alter table public.cosmetics add constraint cosmetics_effect_check
  check (kind not in ('NAME_FX', 'AURA', 'THEME') or value ~ '^[a-z0-9-]{2,30}$');

-- Avatar: un emoji o un avatar animado de la app ("anim:<clave>").
alter table public.cosmetics drop constraint if exists cosmetics_avatar_check;
alter table public.cosmetics add constraint cosmetics_avatar_check
  check (kind <> 'AVATAR' or value !~ '^anim:' or value ~ '^anim:[a-z0-9-]{2,30}$');

alter table public.student_profiles add column if not exists theme_id bigint references public.cosmetics(id) on delete set null;
alter table public.student_profiles add column if not exists mini_bg_id bigint references public.cosmetics(id) on delete set null;
alter table public.student_profiles add column if not exists showcase_config jsonb not null default '{}'::jsonb;
alter table public.student_profiles add column if not exists wall_enabled boolean not null default true;
alter table public.student_profiles add column if not exists loadouts jsonb not null default '[]'::jsonb;

-- Vitrina: 6 bloques y 6 tipos nuevos.
alter table public.student_profiles drop constraint if exists student_profiles_showcase_check;
alter table public.student_profiles add constraint student_profiles_showcase_check check (
  cardinality(showcase) <= 6 and showcase <@ array[
    'STREAK', 'STATS', 'PINS', 'SPARKS', 'RECENT',
    'TEXT', 'ACHIEVEMENTS', 'RAREST', 'COLLECTION', 'PROJECT', 'COURSE'
  ]
);

-- Logros nuevos: felicitaciones del muro, colección y niveles 20 y 30.
-- (Van antes de los cosméticos porque uno de ellos se desbloquea con «Muro de la fama».)
alter table public.achievements drop constraint if exists achievements_condition_type_check;
alter table public.achievements add constraint achievements_condition_type_check check (condition_type in (
  'MANUAL', 'TASKS_ON_TIME', 'TASKS_HIGH', 'STREAK', 'RECOGNITIONS',
  'MONTH_ATTENDANCE', 'MONTH_PUNCTUALITY', 'LEVEL', 'EARLY_TASKS', 'SPARKS', 'WALL', 'COLLECTION'
));

insert into public.achievements (code, name, description, icon, rarity, is_secret, is_seasonal, condition_type, threshold, reward_xp, reward_coins, sort) values
  ('MURO_1', 'Primera felicitación', 'Recibe tu primera felicitación en el muro.', 'ThumbsUp', 'BRONZE', false, false, 'WALL', 1, 10, 5, 30),
  ('MURO_10', 'Querido por todos', 'Recibe 10 felicitaciones en tu muro.', 'Heart', 'SILVER', false, false, 'WALL', 10, 30, 15, 31),
  ('MURO_50', 'Muro de la fama', 'Recibe 50 felicitaciones en tu muro.', 'Crown', 'GOLD', false, false, 'WALL', 50, 80, 30, 32),
  ('COLECCION_25', 'Coleccionista', 'Consigue el 25 % de los cosméticos del campus.', 'Palette', 'BRONZE', false, false, 'COLLECTION', 25, 20, 10, 33),
  ('COLECCION_50', 'Gran coleccionista', 'Completa el 50 % de la colección de cosméticos.', 'Gem', 'GOLD', false, false, 'COLLECTION', 50, 60, 25, 34),
  ('COLECCION_100', 'Colección completa', 'Consigue todos los cosméticos del campus.', 'Trophy', 'PLATINUM', false, false, 'COLLECTION', 100, 150, 60, 35),
  ('NIVEL_20', 'Nueva forma', 'Llega al nivel 20 y cambia tu insignia de nivel a escudo.', 'Shield', 'GOLD', false, false, 'LEVEL', 20, 50, 20, 36),
  ('NIVEL_30', 'Insignia brillante', 'Llega al nivel 30: tu insignia se vuelve una estrella que brilla.', 'Star', 'PLATINUM', false, false, 'LEVEL', 30, 100, 40, 37)
on conflict (code) do nothing;

insert into public.cosmetics (kind, name, value, rarity, unlock_type, unlock_level, unlock_achievement_id, price_coins, sort)
select c.kind, c.name, c.value, c.rarity, c.unlock_type, c.lvl, a.id, c.price, c.sort
from (values
  -- Temas (cambian el color de todos los paneles del perfil)
  ('THEME', 'Clásico', 'none', 'BRONZE', 'DEFAULT', null, null, null, 1),
  ('THEME', 'Medianoche', 'medianoche', 'BRONZE', 'LEVEL', 3, null, null, 2),
  ('THEME', 'Verano', 'verano', 'SILVER', 'LEVEL', 5, null, null, 3),
  ('THEME', 'Acero', 'acero', 'SILVER', 'PURCHASE', null, null, 80, 4),
  ('THEME', 'Bosque', 'bosque', 'SILVER', 'PURCHASE', null, null, 100, 5),
  ('THEME', 'Cósmico', 'cosmico', 'GOLD', 'PURCHASE', null, null, 160, 6),
  ('THEME', 'Sakura', 'sakura', 'GOLD', 'CHEST', null, null, null, 7),
  ('THEME', 'Neón', 'neon', 'GOLD', 'CHEST', null, null, null, 8),
  ('THEME', 'Gran Estrella', 'oro', 'PLATINUM', 'LEVEL', 12, null, null, 9),
  -- Marcos animados
  ('FRAME', 'Cristal', 'cristal', 'SILVER', 'LEVEL', 7, null, null, 20),
  ('FRAME', 'Rayo', 'rayo', 'GOLD', 'PURCHASE', null, null, 120, 21),
  ('FRAME', 'Circuito vivo', 'circuito', 'GOLD', 'LEVEL', 10, null, null, 22),
  ('FRAME', 'Holográfico', 'holo', 'PLATINUM', 'PURCHASE', null, null, 220, 23),
  ('FRAME', 'Llamas', 'llamas', 'GOLD', 'CHEST', null, null, null, 24),
  ('FRAME', 'Arcoíris', 'arcoiris', 'SILVER', 'CHEST', null, null, null, 25),
  ('FRAME', 'Galaxia', 'galaxia', 'PLATINUM', 'CHEST', null, null, null, 26),
  -- Avatares animados
  ('AVATAR', 'Robot Tesla', 'anim:robot', 'SILVER', 'LEVEL', 4, null, null, 40),
  ('AVATAR', 'Rayo vivo', 'anim:rayo', 'SILVER', 'PURCHASE', null, null, 90, 41),
  ('AVATAR', 'Átomo vivo', 'anim:atomo', 'GOLD', 'PURCHASE', null, null, 140, 42),
  ('AVATAR', 'Búho sabio', 'anim:buho', 'GOLD', 'LEVEL', 9, null, null, 43),
  ('AVATAR', 'Cohete turbo', 'anim:cohete', 'GOLD', 'CHEST', null, null, null, 44),
  ('AVATAR', 'Planeta', 'anim:planeta', 'SILVER', 'CHEST', null, null, null, 45),
  ('AVATAR', 'Bobina viva', 'anim:bobina', 'PLATINUM', 'CHEST', null, null, null, 46),
  ('AVATAR', 'Dragón de fuego', 'anim:dragon', 'PLATINUM', 'PURCHASE', null, null, 300, 47),
  -- Fondos del mini-perfil (la tarjeta que aparece al pasar el cursor)
  ('MINI_BG', 'Sin fondo', 'none', 'BRONZE', 'DEFAULT', null, null, null, 1),
  ('MINI_BG', 'Tinta y oro', '#0B1D33,#F0B429', 'BRONZE', 'DEFAULT', null, null, null, 2),
  ('MINI_BG', 'Noche estrellada', 'scene:galaxia', 'SILVER', 'LEVEL', 3, null, null, 3),
  ('MINI_BG', 'Bobina de Tesla', 'scene:bobina', 'GOLD', 'LEVEL', 8, null, null, 4),
  ('MINI_BG', 'Aurora', 'scene:aurora', 'SILVER', 'PURCHASE', null, null, 90, 5),
  ('MINI_BG', 'Código', 'scene:codigo', 'SILVER', 'PURCHASE', null, null, 100, 6),
  ('MINI_BG', 'Synthwave', 'scene:synthwave', 'GOLD', 'PURCHASE', null, null, 140, 7),
  ('MINI_BG', 'Mar profundo', 'scene:oceano', 'GOLD', 'CHEST', null, null, null, 8),
  ('MINI_BG', 'Sakura', 'scene:sakura', 'GOLD', 'CHEST', null, null, null, 9),
  ('MINI_BG', 'Fuegos artificiales', 'scene:fuegos', 'PLATINUM', 'ACHIEVEMENT', null, 'MURO_50', null, 10)
) as c(kind, name, value, rarity, unlock_type, lvl, ach_code, price, sort)
left join public.achievements a on a.code = c.ach_code
on conflict (kind, name) do nothing;

-- ----------------------------------------------------------------------------
-- 2) Rareza de los logros (qué porcentaje del colegio tiene cada uno)
--    Solo se publican totales, nunca quién los tiene.
-- ----------------------------------------------------------------------------
create or replace function public.tesla_achievement_rarity()
returns table (achievement_id bigint, holders integer, pct numeric)
language sql
stable
security definer
set search_path = public
as $$
  with base as (select greatest(count(*), 1) as n from public.students where classroom_id is not null)
  select a.id,
         count(distinct sa.student_id)::int,
         round(100.0 * count(distinct sa.student_id) / (select n from base), 1)
  from public.achievements a
  left join public.student_achievements sa on sa.achievement_id = a.id
  where a.is_active
  group by a.id
$$;

-- ----------------------------------------------------------------------------
-- 3) Muro de felicitaciones
--    Solo stickers y frases de esta lista: no hay texto libre que moderar.
-- ----------------------------------------------------------------------------
create or replace function public.tesla_wall_phrase(p_code text)
returns text
language sql
immutable
set search_path = public
as $$
  select case p_code
    when 'FELICIDADES' then '¡Felicitaciones!'
    when 'SIGUE_ASI' then '¡Sigue así!'
    when 'GRAN_TRABAJO' then '¡Gran trabajo!'
    when 'GRACIAS' then 'Gracias por tu ayuda'
    when 'CRACK' then '¡Eres un crack!'
    when 'INSPIRAS' then 'Nos inspiras'
    when 'EQUIPO' then 'Gran compañero de equipo'
    when 'ORGULLO' then 'Estamos orgullosos de ti'
    when 'NIVEL' then '¡Felicidades por tu nuevo nivel!'
    when 'ANIMO' then '¡Tú puedes!'
    else null end
$$;

create table if not exists public.profile_wall_posts (
  id bigint generated always as identity primary key,
  to_student bigint not null references public.students(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  author_student bigint references public.students(id) on delete cascade,
  sticker text not null check (sticker in (
    'rayo', 'estrella', 'trofeo', 'cohete', 'corazon', 'fuego', 'aplauso', 'cerebro', 'corona', 'arcoiris', 'libro', 'medalla'
  )),
  phrase text not null check (public.tesla_wall_phrase(phrase) is not null),
  created_at timestamptz not null default now()
);
create index if not exists idx_wall_to on public.profile_wall_posts(to_student, created_at desc);
create index if not exists idx_wall_author on public.profile_wall_posts(author_id, created_at desc);

alter table public.profile_wall_posts enable row level security;
-- Sin políticas: solo se lee y escribe con las funciones de este script.

create or replace function public.post_wall_message(p_to_student bigint, p_sticker text, p_phrase text)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_self bigint := public.my_self_student_id();
  v_today timestamptz := public.tesla_day_start(public.tesla_today());
  v_role text := public.app_role();
  v_author text;
  v_id bigint;
begin
  if v_uid is null then
    raise exception 'Inicia sesión para escribir en el muro.';
  end if;
  if v_self = p_to_student then
    raise exception 'No puedes escribir en tu propio muro.';
  end if;
  if not (
    (v_self is not null and exists (
      select 1 from public.students a join public.students b on b.classroom_id = a.classroom_id
      where a.id = v_self and b.id = p_to_student and a.classroom_id is not null))
    or (v_self is null and public.can_view_student(p_to_student))
  ) then
    raise exception 'Solo su aula, su familia y sus docentes pueden escribir en este muro.';
  end if;
  if coalesce((select wall_enabled from public.student_profiles where student_id = p_to_student), true) = false then
    raise exception 'Este alumno tiene su muro cerrado.';
  end if;
  if public.tesla_wall_phrase(p_phrase) is null then
    raise exception 'Elige una frase.';
  end if;

  perform pg_advisory_xact_lock(hashtext('tesla_wall:' || v_uid));
  if exists (select 1 from public.profile_wall_posts where author_id = v_uid and to_student = p_to_student and created_at >= v_today) then
    raise exception 'Hoy ya felicitaste a %. ¡Mañana puedes volver!', public.student_first_name(p_to_student);
  end if;
  if (select count(*) from public.profile_wall_posts where author_id = v_uid and created_at >= v_today) >= 10 then
    raise exception 'Llegaste al máximo de 10 felicitaciones por día.';
  end if;

  insert into public.profile_wall_posts (to_student, author_id, author_student, sticker, phrase)
  values (p_to_student, v_uid, v_self, p_sticker, p_phrase)
  returning id into v_id;

  v_author := case
    when v_self is not null then public.student_first_name(v_self)
    when v_role = 'GUARDIAN' then 'Tu familia'
    else coalesce((select full_name from public.profiles where id = v_uid), 'Tu docente') end;
  perform public.tesla_push(p_to_student, '🎉 Nuevo mensaje en tu muro',
    v_author || ' le dejó «' || public.tesla_wall_phrase(p_phrase) || '» a ' || public.student_first_name(p_to_student) || '.',
    '/perfil-tesla?hijo=' || p_to_student || '&vista=muro');
  -- Logros del muro (Primera felicitación, Querido por todos, Muro de la fama).
  perform public.tesla_evaluate(p_to_student);
  return v_id;
end;
$$;

create or replace function public.tesla_wall(p_student_id bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_owner boolean := p_student_id = public.my_self_student_id();
  v_manage boolean := public.can_manage_tesla_student(p_student_id);
begin
  if not public.can_view_tesla_profile(p_student_id) then
    raise exception 'No puedes ver este perfil.';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', w.id, 'sticker', w.sticker, 'phrase', w.phrase, 'text', public.tesla_wall_phrase(w.phrase), 'created_at', w.created_at,
      'can_remove', v_owner or v_manage or w.author_id = v_uid,
      'author', case
        when w.author_student is not null then jsonb_build_object(
          'kind', 'STUDENT', 'student_id', w.author_student, 'name', s.first_name,
          'avatar', (select c.value from public.cosmetics c where c.id = coalesce(sp.avatar_id, public.tesla_default_cosmetic('AVATAR'))),
          'frame', (select c.value from public.cosmetics c where c.id = coalesce(sp.frame_id, public.tesla_default_cosmetic('FRAME'))))
        when p.role = 'GUARDIAN' then jsonb_build_object('kind', 'FAMILY', 'name', 'Su familia')
        else jsonb_build_object('kind', 'STAFF', 'name', coalesce(p.full_name, 'Docente'),
          'role', case when p.role = 'TEACHER' then 'Docente' else 'Colegio' end)
      end
    ) order by w.created_at desc)
    from (select * from public.profile_wall_posts where to_student = p_student_id order by created_at desc limit 40) w
    left join public.students s on s.id = w.author_student
    left join public.student_profiles sp on sp.student_id = w.author_student
    left join public.profiles p on p.id = w.author_id
  ), '[]'::jsonb);
end;
$$;

-- Quita un mensaje: lo puede hacer su autor, el dueño del muro, su tutor o la dirección.
create or replace function public.remove_wall_post(p_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  w public.profile_wall_posts%rowtype;
begin
  select * into w from public.profile_wall_posts where id = p_id;
  if not found then
    return;
  end if;
  if not (w.author_id = auth.uid() or w.to_student = public.my_self_student_id() or public.can_manage_tesla_student(w.to_student)) then
    raise exception 'No puedes quitar este mensaje.';
  end if;
  delete from public.profile_wall_posts where id = p_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- 4) Logros nuevos: felicitaciones recibidas y porcentaje de la colección
--    Se agregan a las estadísticas del script 17 (por eso, si vuelves a
--    ejecutar el 17, ejecuta otra vez este).
-- ----------------------------------------------------------------------------
-- Porcentaje de los cosméticos especiales (no gratuitos) que tiene el alumno.
create or replace function public.tesla_collection_pct(p_student_id bigint)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(floor(100.0 * count(*) filter (where public.tesla_cosmetic_unlocked(p_student_id, c.id)) / nullif(count(*), 0))::int, 0)
  from public.cosmetics c
  where c.is_active and c.unlock_type <> 'DEFAULT'
$$;

create or replace function public.tesla_stats_range(p_student_id bigint, p_from timestamptz, p_to timestamptz)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with min_score as (
    select coalesce((select (params ->> 'min_score20')::numeric from public.point_rules where code = 'TASK_HIGH'), 14) as v
  )
  select jsonb_build_object(
    'on_time', (select count(*) from public.submissions sb
                 where sb.student_id = p_student_id and not sb.is_late
                   and sb.submitted_at >= p_from and sb.submitted_at < p_to),
    'early', (select count(*) from public.submissions sb join public.assignments a on a.id = sb.assignment_id
               where sb.student_id = p_student_id and a.due_at is not null
                 and sb.submitted_at <= a.due_at - interval '24 hours'
                 and sb.submitted_at >= p_from and sb.submitted_at < p_to),
    'high', (select count(*) from public.submissions sb join public.assignments a on a.id = sb.assignment_id
              where sb.student_id = p_student_id and sb.status = 'GRADED'
                and coalesce(sb.graded_at, sb.updated_at) >= p_from and coalesce(sb.graded_at, sb.updated_at) < p_to
                and ((a.grading_type = 'LEVEL' and sb.level in ('A', 'AD'))
                  or (a.grading_type = 'SCORE' and sb.score is not null
                      and sb.score / a.max_score * 20 >= (select v from min_score)))),
    'recognitions', (select count(*) from public.recognitions r
                      where r.student_id = p_student_id and r.created_at >= p_from and r.created_at < p_to),
    'att_months', (select count(*) from public.attendance_months m
                    where m.student_id = p_student_id and m.perfect_attendance
                      and public.tesla_day_start(m.month) >= p_from and public.tesla_day_start(m.month) < p_to),
    'punct_months', (select count(*) from public.attendance_months m
                      where m.student_id = p_student_id and m.perfect_punctuality
                        and public.tesla_day_start(m.month) >= p_from and public.tesla_day_start(m.month) < p_to),
    'sparks', (select count(*) from public.peer_sparks ps
                where ps.to_student = p_student_id and ps.created_at >= p_from and ps.created_at < p_to),
    -- Felicitaciones recibidas (quitar un mensaje no quita un logro ya ganado).
    'wall', (select count(*) from public.profile_wall_posts wp
              where wp.to_student = p_student_id and wp.created_at >= p_from and wp.created_at < p_to)
  )
$$;

create or replace function public.tesla_stat_value(p_stats jsonb, p_condition text, p_student_id bigint)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select case p_condition
    when 'TASKS_ON_TIME' then (p_stats ->> 'on_time')::int
    when 'TASKS_HIGH' then (p_stats ->> 'high')::int
    when 'EARLY_TASKS' then (p_stats ->> 'early')::int
    when 'RECOGNITIONS' then (p_stats ->> 'recognitions')::int
    when 'MONTH_ATTENDANCE' then (p_stats ->> 'att_months')::int
    when 'MONTH_PUNCTUALITY' then (p_stats ->> 'punct_months')::int
    when 'SPARKS' then coalesce((p_stats ->> 'sparks')::int, 0)
    when 'WALL' then coalesce((p_stats ->> 'wall')::int, 0)
    when 'COLLECTION' then public.tesla_collection_pct(p_student_id)
    when 'STREAK' then (select coalesce(max(w.best_streak), 0) from public.student_wallets w where w.student_id = p_student_id)
    when 'LEVEL' then public.tesla_level(coalesce((select w.xp from public.student_wallets w where w.student_id = p_student_id), 0))
    else 0
  end
$$;

-- Progreso de los logros (pestaña Logros): se agrega el porcentaje de la colección.
create or replace function public.tesla_progress(p_student_id bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_period public.grading_periods;
  v_all jsonb;
begin
  if not public.can_view_student(p_student_id) then
    raise exception 'No puedes ver este perfil.';
  end if;
  v_period := public.tesla_current_period();
  v_all := public.tesla_stats_range(p_student_id, '-infinity', 'infinity');
  return jsonb_build_object(
    'all', v_all || jsonb_build_object(
      'streak', public.tesla_stat_value(v_all, 'STREAK', p_student_id),
      'level', public.tesla_stat_value(v_all, 'LEVEL', p_student_id),
      'collection', public.tesla_collection_pct(p_student_id)),
    'season', case when v_period.id is null then null
              else public.tesla_stats_range(p_student_id, public.tesla_day_start(v_period.starts_on), public.tesla_day_start(v_period.ends_on + 1)) end,
    'period', case when v_period.id is null then null
              else jsonb_build_object('id', v_period.id, 'name', v_period.name, 'starts_on', v_period.starts_on, 'ends_on', v_period.ends_on) end,
    'secret_total', (select count(*) from public.achievements where is_secret and is_active)
  );
end;
$$;

-- Al conseguir un cosmético (compra, cofre o temporada) se revisan los logros de colección.
-- Nunca bloquea la compra: si algo falla, solo queda una advertencia.
create or replace function public.tesla_on_cosmetic_owned()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    perform public.tesla_evaluate(new.student_id);
  exception when others then
    raise warning '[tesla_on_cosmetic_owned] %', sqlerrm;
  end;
  return new;
end;
$$;

drop trigger if exists trg_tesla_cosmetic_owned on public.student_cosmetics;
create trigger trg_tesla_cosmetic_owned after insert on public.student_cosmetics
for each row execute function public.tesla_on_cosmetic_owned();

-- ----------------------------------------------------------------------------
-- 5) Identidad Tesla en todo el campus (mensajes, grupos, foro y anuncios)
--    Devuelve el efecto del nombre y el avatar de los autores que son alumnos,
--    solo si quien consulta puede ver su perfil (aula, familia, docentes y personal).
-- ----------------------------------------------------------------------------
create or replace function public.tesla_identities(p_profile_ids uuid[])
returns table (profile_id uuid, student_id bigint, name_fx text, avatar text, frame text, aura text, level integer)
language sql
stable
security definer
set search_path = public
as $$
  select s.profile_id, s.id,
         (select c.value from public.cosmetics c where c.id = coalesce(p.name_fx_id, public.tesla_default_cosmetic('NAME_FX'))),
         (select c.value from public.cosmetics c where c.id = coalesce(p.avatar_id, public.tesla_default_cosmetic('AVATAR'))),
         (select c.value from public.cosmetics c where c.id = coalesce(p.frame_id, public.tesla_default_cosmetic('FRAME'))),
         (select c.value from public.cosmetics c where c.id = coalesce(p.aura_id, public.tesla_default_cosmetic('AURA'))),
         public.tesla_level(coalesce(w.xp, 0))
  from public.students s
  left join public.student_profiles p on p.student_id = s.id
  left join public.student_wallets w on w.student_id = s.id
  where s.profile_id = any((coalesce(p_profile_ids, '{}'::uuid[]))[1:200])
    and public.can_view_tesla_profile(s.id)
$$;

-- ----------------------------------------------------------------------------
-- 6) Moderación de lo que escribe el alumno (presentación, caja de texto y proyecto)
-- ----------------------------------------------------------------------------
create or replace function public.moderate_tesla_profile(p_student_id bigint, p_part text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.can_manage_tesla_student(p_student_id) then
    raise exception 'Solo el tutor o la dirección pueden hacerlo.';
  end if;
  if p_part = 'BIO' then
    update public.student_profiles set bio = null, updated_at = now() where student_id = p_student_id;
  elsif p_part in ('TEXT', 'PROJECT') then
    update public.student_profiles
      set showcase_config = showcase_config - p_part, showcase = array_remove(showcase, p_part), updated_at = now()
      where student_id = p_student_id;
  else
    raise exception 'Parte no válida.';
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- 7) Perfil (lectura): tema, fondo del mini-perfil, vitrinas nuevas, muro y conjuntos
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
  v_self boolean;
  st record;
  w record;
  pr public.student_profiles%rowtype;
  v_level integer;
  v_result jsonb;
  v_showcase text[];
  v_cfg jsonb;
  v_all jsonb;
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
  v_showcase := coalesce(pr.showcase, '{}');
  v_cfg := coalesce(pr.showcase_config, '{}'::jsonb);
  v_self := p_student_id = public.my_self_student_id();

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
    'is_self', coalesce(v_self, false),
    'is_classmate', public.my_self_student_id() is not null and p_student_id <> public.my_self_student_id()
                    and st.classroom_id = (select s2.classroom_id from public.students s2 where s2.id = public.my_self_student_id()),
    'can_manage', public.can_manage_tesla_student(p_student_id),
    'bio', pr.bio,
    'hide_from_rankings', coalesce(pr.hide_from_rankings, false),
    'wall_enabled', coalesce(pr.wall_enabled, true),
    'wall_count', (select count(*) from public.profile_wall_posts wp where wp.to_student = p_student_id),
    'avatar', (select jsonb_build_object('id', c.id, 'name', c.name, 'value', c.value) from public.cosmetics c where c.id = coalesce(pr.avatar_id, public.tesla_default_cosmetic('AVATAR'))),
    'frame', (select jsonb_build_object('id', c.id, 'name', c.name, 'value', c.value) from public.cosmetics c where c.id = coalesce(pr.frame_id, public.tesla_default_cosmetic('FRAME'))),
    'banner', (select jsonb_build_object('id', c.id, 'name', c.name, 'value', c.value) from public.cosmetics c where c.id = coalesce(pr.banner_id, public.tesla_default_cosmetic('BANNER'))),
    'title', (select jsonb_build_object('id', c.id, 'name', c.name, 'value', c.value) from public.cosmetics c where c.id = coalesce(pr.title_id, public.tesla_default_cosmetic('TITLE'))),
    'background', (select jsonb_build_object('id', c.id, 'name', c.name, 'value', c.value) from public.cosmetics c where c.id = coalesce(pr.background_id, public.tesla_default_cosmetic('BACKGROUND'))),
    'name_fx', (select jsonb_build_object('id', c.id, 'name', c.name, 'value', c.value) from public.cosmetics c where c.id = coalesce(pr.name_fx_id, public.tesla_default_cosmetic('NAME_FX'))),
    'aura', (select jsonb_build_object('id', c.id, 'name', c.name, 'value', c.value) from public.cosmetics c where c.id = coalesce(pr.aura_id, public.tesla_default_cosmetic('AURA'))),
    'theme', (select jsonb_build_object('id', c.id, 'name', c.name, 'value', c.value) from public.cosmetics c where c.id = coalesce(pr.theme_id, public.tesla_default_cosmetic('THEME'))),
    'mini_bg', (select jsonb_build_object('id', c.id, 'name', c.name, 'value', c.value) from public.cosmetics c where c.id = coalesce(pr.mini_bg_id, public.tesla_default_cosmetic('MINI_BG'))),
    'pin_levels', (select to_jsonb(s.pin_levels) from public.tesla_settings s where s.id = 1),
    'pins', coalesce((
      select jsonb_agg(jsonb_build_object('tier', d.tier, 'delivered_at', d.delivered_at) order by d.tier)
      from public.tesla_pin_deliveries d where d.student_id = p_student_id
    ), '[]'::jsonb),
    'sparks', (select count(*) from public.peer_sparks ps where ps.to_student = p_student_id),
    'showcase', to_jsonb(v_showcase),
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
    ),
    'cosmetics_owned', (
      select count(*) from public.cosmetics c where c.is_active and c.unlock_type <> 'DEFAULT' and public.tesla_cosmetic_unlocked(p_student_id, c.id)
    )
  );

  -- El editor necesita la configuración completa y los conjuntos guardados.
  if v_self then
    v_result := v_result || jsonb_build_object('showcase_config', v_cfg, 'loadouts', coalesce(pr.loadouts, '[]'::jsonb));
  end if;

  -- Vitrina: solo se calculan (y se publican) los bloques que el alumno eligió mostrar.
  if cardinality(v_showcase) > 0 then
    v_all := public.tesla_stats_range(p_student_id, '-infinity', 'infinity');
    v_result := v_result || jsonb_build_object('showcase_data', jsonb_strip_nulls(jsonb_build_object(
      'STREAK', case when 'STREAK' = any(v_showcase) then
        jsonb_build_object('current', public.tesla_current_streak(p_student_id), 'best', w.best_streak) end,
      'STATS', case when 'STATS' = any(v_showcase) then
        jsonb_build_object('on_time', (v_all ->> 'on_time')::int, 'high', (v_all ->> 'high')::int,
                           'early', (v_all ->> 'early')::int, 'recognitions', (v_all ->> 'recognitions')::int) end,
      'SPARKS', case when 'SPARKS' = any(v_showcase) then (
        select jsonb_build_object('total', count(*),
          'kinds', coalesce((select jsonb_object_agg(k.kind, k.n) from (
            select ps2.kind, count(*) as n from public.peer_sparks ps2 where ps2.to_student = p_student_id group by ps2.kind) k), '{}'::jsonb))
        from public.peer_sparks ps where ps.to_student = p_student_id) end,
      'RECENT', case when 'RECENT' = any(v_showcase) then coalesce((
        select jsonb_agg(jsonb_build_object('id', r.id, 'name', r.name, 'icon', r.icon, 'rarity', r.rarity, 'earned_at', r.earned_at) order by r.earned_at desc)
        from (select a.id, a.name, a.icon, a.rarity, sa.earned_at from public.student_achievements sa
              join public.achievements a on a.id = sa.achievement_id
              where sa.student_id = p_student_id order by sa.earned_at desc limit 4) r), '[]'::jsonb) end,
      'TEXT', case when 'TEXT' = any(v_showcase) then v_cfg -> 'TEXT' end,
      'PROJECT', case when 'PROJECT' = any(v_showcase) then v_cfg -> 'PROJECT' end,
      'ACHIEVEMENTS', case when 'ACHIEVEMENTS' = any(v_showcase) then coalesce((
        select jsonb_agg(jsonb_build_object('id', a.id, 'name', a.name, 'icon', a.icon, 'rarity', a.rarity,
                                            'earned_at', e.earned_at, 'pct', r.pct) order by u.ord)
        from jsonb_array_elements_text(coalesce(v_cfg #> '{ACHIEVEMENTS,ids}', '[]'::jsonb)) with ordinality as u(id, ord)
        join public.achievements a on a.id = u.id::bigint
        join lateral (select max(sa.earned_at) as earned_at from public.student_achievements sa
                      where sa.student_id = p_student_id and sa.achievement_id = a.id) e on e.earned_at is not null
        left join public.tesla_achievement_rarity() r on r.achievement_id = a.id), '[]'::jsonb) end,
      'RAREST', case when 'RAREST' = any(v_showcase) then coalesce((
        select jsonb_agg(jsonb_build_object('id', x.id, 'name', x.name, 'icon', x.icon, 'rarity', x.rarity,
                                            'description', x.description, 'pct', x.pct, 'earned_at', x.earned_at) order by x.pct, x.earned_at)
        from (select a.id, a.name, a.icon, a.rarity, a.description, r.pct, max(sa.earned_at) as earned_at
              from public.student_achievements sa
              join public.achievements a on a.id = sa.achievement_id
              join public.tesla_achievement_rarity() r on r.achievement_id = a.id
              where sa.student_id = p_student_id
              group by a.id, a.name, a.icon, a.rarity, a.description, r.pct
              order by r.pct, max(sa.earned_at) limit 3) x), '[]'::jsonb) end,
      'COLLECTION', case when 'COLLECTION' = any(v_showcase) then jsonb_build_object(
        'items', coalesce((
          select jsonb_agg(jsonb_build_object('id', c.id, 'kind', c.kind, 'name', c.name, 'value', c.value, 'rarity', c.rarity) order by u.ord)
          from jsonb_array_elements_text(coalesce(v_cfg #> '{COLLECTION,ids}', '[]'::jsonb)) with ordinality as u(id, ord)
          join public.cosmetics c on c.id = u.id::bigint
          where public.tesla_cosmetic_unlocked(p_student_id, c.id)), '[]'::jsonb),
        'owned', (select count(*) from public.cosmetics c where c.is_active and c.unlock_type <> 'DEFAULT' and public.tesla_cosmetic_unlocked(p_student_id, c.id)),
        'total', (select count(*) from public.cosmetics c where c.is_active and c.unlock_type <> 'DEFAULT')) end,
      'COURSE', case when 'COURSE' = any(v_showcase) then (
        select jsonb_build_object('offering_id', o.id, 'name', sj.name, 'teacher', p.full_name, 'note', v_cfg #>> '{COURSE,note}')
        from public.course_offerings o
        join public.subjects sj on sj.id = o.subject_id
        left join public.profiles p on p.id = o.teacher_id
        where o.id = nullif(v_cfg #>> '{COURSE,offering_id}', '')::bigint and o.classroom_id = st.classroom_id and o.is_active) end
    )));
  end if;

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

-- ----------------------------------------------------------------------------
-- 8) Guardar el perfil: tema, fondo del mini-perfil, vitrina configurable y muro
--    p_config y p_wall_enabled son opcionales: si llegan en null se conserva
--    lo guardado (así sigue funcionando una app anterior a este script).
-- ----------------------------------------------------------------------------
drop function if exists public.save_my_tesla_profile(bigint[], bigint[], text, boolean, text[]);
drop function if exists public.save_my_tesla_profile(bigint[], bigint[], text, boolean, text[], jsonb, boolean);
create function public.save_my_tesla_profile(
  p_cosmetic_ids bigint[], p_featured bigint[], p_bio text, p_hide_from_rankings boolean, p_showcase text[],
  p_config jsonb default null, p_wall_enabled boolean default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sid bigint := public.tesla_self_student();
  v_ids bigint[] := array(select distinct x from unnest(coalesce(p_cosmetic_ids, '{}')) x where x is not null);
  v_featured bigint[];
  v_showcase text[];
  v_bio text := nullif(btrim(regexp_replace(coalesce(p_bio, ''), '\s+', ' ', 'g')), '');
  v_cfg jsonb;
  v_part jsonb;
  v_text text;
  v_title text;
  v_url text;
  v_list bigint[];
  v_id bigint;
  v_pick record;
  v_classroom bigint := (select classroom_id from public.students where id = v_sid);
begin
  foreach v_id in array v_ids loop
    if not exists (select 1 from public.cosmetics where id = v_id) then
      raise exception 'Elección no válida.';
    end if;
    if not public.tesla_cosmetic_unlocked(v_sid, v_id) then
      raise exception 'Todavía no desbloqueas «%».', (select name from public.cosmetics where id = v_id);
    end if;
  end loop;
  if (select count(*) from public.cosmetics where id = any(v_ids)) <> (select count(distinct kind) from public.cosmetics where id = any(v_ids)) then
    raise exception 'Elige solo una opción de cada tipo.';
  end if;

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

  select coalesce(array_agg(x order by ord), '{}') into v_showcase
  from (select distinct on (x) x, ord from unnest(coalesce(p_showcase, '{}')) with ordinality as u(x, ord) order by x, ord) d;
  if cardinality(v_showcase) > 6 or not (v_showcase <@ array[
    'STREAK', 'STATS', 'PINS', 'SPARKS', 'RECENT', 'TEXT', 'ACHIEVEMENTS', 'RAREST', 'COLLECTION', 'PROJECT', 'COURSE'
  ]) then
    raise exception 'La vitrina admite hasta 6 bloques.';
  end if;
  if char_length(coalesce(v_bio, '')) > 140 then
    raise exception 'La presentación puede tener hasta 140 caracteres.';
  end if;

  -- Configuración de los bloques: se valida y se guarda solo lo conocido.
  if p_config is null then
    v_cfg := coalesce((select showcase_config from public.student_profiles where student_id = v_sid), '{}'::jsonb);
  else
    v_cfg := '{}'::jsonb;

    v_part := p_config -> 'TEXT';
    if jsonb_typeof(v_part) = 'object' then
      v_title := nullif(btrim(regexp_replace(coalesce(v_part ->> 'title', ''), '\s+', ' ', 'g')), '');
      v_text := nullif(btrim(regexp_replace(regexp_replace(coalesce(v_part ->> 'body', ''), '[ \t]+', ' ', 'g'), '\n{3,}', E'\n\n', 'g')), '');
      if char_length(coalesce(v_title, '')) > 40 then raise exception 'El título de la caja de texto puede tener hasta 40 caracteres.'; end if;
      if char_length(coalesce(v_text, '')) > 400 then raise exception 'La caja de texto puede tener hasta 400 caracteres.'; end if;
      if v_text is not null then
        v_cfg := v_cfg || jsonb_build_object('TEXT', jsonb_strip_nulls(jsonb_build_object('title', v_title, 'body', v_text)));
      end if;
    end if;

    v_part := p_config -> 'PROJECT';
    if jsonb_typeof(v_part) = 'object' and nullif(btrim(coalesce(v_part ->> 'url', '')), '') is not null then
      v_url := btrim(v_part ->> 'url');
      v_title := nullif(btrim(regexp_replace(coalesce(v_part ->> 'title', ''), '\s+', ' ', 'g')), '');
      v_text := nullif(btrim(regexp_replace(coalesce(v_part ->> 'note', ''), '\s+', ' ', 'g')), '');
      if v_url !~ '^https://[^\s<>"]{4,}$' then raise exception 'El enlace del proyecto debe empezar con https://'; end if;
      if char_length(v_url) > 300 then raise exception 'El enlace del proyecto es demasiado largo.'; end if;
      if char_length(coalesce(v_title, '')) not between 2 and 60 then raise exception 'Escribe el nombre del proyecto (hasta 60 caracteres).'; end if;
      if char_length(coalesce(v_text, '')) > 140 then raise exception 'La descripción del proyecto puede tener hasta 140 caracteres.'; end if;
      v_cfg := v_cfg || jsonb_build_object('PROJECT', jsonb_strip_nulls(jsonb_build_object('title', v_title, 'url', v_url, 'note', v_text)));
    end if;

    v_part := p_config #> '{ACHIEVEMENTS,ids}';
    if jsonb_typeof(v_part) = 'array' then
      select coalesce(array_agg(x order by ord), '{}') into v_list
      from (select distinct on (x) x, ord from jsonb_array_elements_text(v_part) with ordinality as u(t, ord)
            cross join lateral (select case when t ~ '^\d{1,18}$' then t::bigint end as x) c
            where x is not null order by x, ord) d;
      if cardinality(v_list) > 6 then raise exception 'La vitrina de logros admite hasta 6.'; end if;
      if exists (select 1 from unnest(v_list) f where not exists (
        select 1 from public.student_achievements sa where sa.student_id = v_sid and sa.achievement_id = f)) then
        raise exception 'Solo puedes mostrar logros que ya obtuviste.';
      end if;
      v_cfg := v_cfg || jsonb_build_object('ACHIEVEMENTS', jsonb_build_object('ids', to_jsonb(v_list)));
    end if;

    v_part := p_config #> '{COLLECTION,ids}';
    if jsonb_typeof(v_part) = 'array' then
      select coalesce(array_agg(x order by ord), '{}') into v_list
      from (select distinct on (x) x, ord from jsonb_array_elements_text(v_part) with ordinality as u(t, ord)
            cross join lateral (select case when t ~ '^\d{1,18}$' then t::bigint end as x) c
            where x is not null order by x, ord) d;
      if cardinality(v_list) > 8 then raise exception 'La colección admite hasta 8 cosméticos.'; end if;
      if exists (select 1 from unnest(v_list) f where not public.tesla_cosmetic_unlocked(v_sid, f)) then
        raise exception 'Solo puedes mostrar cosméticos que ya tienes.';
      end if;
      v_cfg := v_cfg || jsonb_build_object('COLLECTION', jsonb_build_object('ids', to_jsonb(v_list)));
    end if;

    v_part := p_config -> 'COURSE';
    if jsonb_typeof(v_part) = 'object' and coalesce(v_part ->> 'offering_id', '') ~ '^\d{1,18}$' then
      v_id := (v_part ->> 'offering_id')::bigint;
      v_text := nullif(btrim(regexp_replace(coalesce(v_part ->> 'note', ''), '\s+', ' ', 'g')), '');
      if not exists (select 1 from public.course_offerings o where o.id = v_id and o.classroom_id = v_classroom and o.is_active) then
        raise exception 'Elige uno de los cursos de tu aula.';
      end if;
      if char_length(coalesce(v_text, '')) > 140 then raise exception 'El comentario del curso puede tener hasta 140 caracteres.'; end if;
      v_cfg := v_cfg || jsonb_build_object('COURSE', jsonb_strip_nulls(jsonb_build_object('offering_id', v_id, 'note', v_text)));
    end if;
  end if;

  -- Un bloque que necesita contenido no se publica vacío.
  if 'TEXT' = any(v_showcase) and v_cfg -> 'TEXT' is null then raise exception 'Escribe el texto de tu caja de texto.'; end if;
  if 'PROJECT' = any(v_showcase) and v_cfg -> 'PROJECT' is null then raise exception 'Agrega el enlace de tu proyecto destacado.'; end if;
  if 'COURSE' = any(v_showcase) and v_cfg -> 'COURSE' is null then raise exception 'Elige tu curso favorito.'; end if;

  select
    (select id from public.cosmetics where id = any(v_ids) and kind = 'AVATAR') as avatar_id,
    (select id from public.cosmetics where id = any(v_ids) and kind = 'FRAME') as frame_id,
    (select id from public.cosmetics where id = any(v_ids) and kind = 'BANNER') as banner_id,
    (select id from public.cosmetics where id = any(v_ids) and kind = 'TITLE') as title_id,
    (select id from public.cosmetics where id = any(v_ids) and kind = 'BACKGROUND') as background_id,
    (select id from public.cosmetics where id = any(v_ids) and kind = 'NAME_FX') as name_fx_id,
    (select id from public.cosmetics where id = any(v_ids) and kind = 'AURA') as aura_id,
    (select id from public.cosmetics where id = any(v_ids) and kind = 'THEME') as theme_id,
    (select id from public.cosmetics where id = any(v_ids) and kind = 'MINI_BG') as mini_bg_id
  into v_pick;

  insert into public.student_profiles (student_id, avatar_id, frame_id, banner_id, title_id, background_id, name_fx_id, aura_id, theme_id, mini_bg_id,
                                       featured, bio, hide_from_rankings, showcase, showcase_config, wall_enabled, updated_at)
  values (v_sid, v_pick.avatar_id, v_pick.frame_id, v_pick.banner_id, v_pick.title_id, v_pick.background_id, v_pick.name_fx_id, v_pick.aura_id,
          v_pick.theme_id, v_pick.mini_bg_id, v_featured, v_bio, coalesce(p_hide_from_rankings, false), v_showcase, v_cfg, coalesce(p_wall_enabled, true), now())
  on conflict (student_id) do update
    set avatar_id = excluded.avatar_id, frame_id = excluded.frame_id, banner_id = excluded.banner_id,
        title_id = excluded.title_id, background_id = excluded.background_id, name_fx_id = excluded.name_fx_id,
        aura_id = excluded.aura_id,
        -- Una app anterior no envía el tema ni el fondo del mini-perfil: se conservan los elegidos.
        theme_id = case when exists (select 1 from public.cosmetics where id = any(v_ids) and kind = 'THEME')
                        or p_config is not null then excluded.theme_id else student_profiles.theme_id end,
        mini_bg_id = case when exists (select 1 from public.cosmetics where id = any(v_ids) and kind = 'MINI_BG')
                          or p_config is not null then excluded.mini_bg_id else student_profiles.mini_bg_id end,
        featured = excluded.featured, bio = excluded.bio,
        hide_from_rankings = excluded.hide_from_rankings, showcase = excluded.showcase, showcase_config = excluded.showcase_config,
        wall_enabled = coalesce(p_wall_enabled, student_profiles.wall_enabled), updated_at = now();
end;
$$;

-- ----------------------------------------------------------------------------
-- 9) Conjuntos guardados (hasta 3 combinaciones de cosméticos)
--    Equipar un conjunto usa save_my_tesla_profile, que vuelve a validar todo.
-- ----------------------------------------------------------------------------
create or replace function public.save_tesla_loadout(p_slot integer, p_name text, p_cosmetic_ids bigint[])
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sid bigint := public.tesla_self_student();
  v_name text := nullif(btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g')), '');
  v_ids bigint[] := array(select distinct x from unnest(coalesce(p_cosmetic_ids, '{}')) x where x is not null);
  v_list jsonb;
begin
  if p_slot is null or p_slot not between 1 and 3 then
    raise exception 'Hay 3 espacios para conjuntos.';
  end if;
  insert into public.student_profiles (student_id) values (v_sid) on conflict (student_id) do nothing;
  select coalesce(jsonb_agg(e order by (e ->> 'slot')::int), '[]'::jsonb) into v_list
  from jsonb_array_elements((select loadouts from public.student_profiles where student_id = v_sid)) e
  where (e ->> 'slot')::int <> p_slot;

  if p_cosmetic_ids is not null then
    if char_length(coalesce(v_name, '')) not between 1 and 24 then
      raise exception 'Ponle un nombre al conjunto (hasta 24 caracteres).';
    end if;
    if cardinality(v_ids) = 0 or (select count(*) from public.cosmetics where id = any(v_ids)) <> cardinality(v_ids)
       or (select count(*) from public.cosmetics where id = any(v_ids)) <> (select count(distinct kind) from public.cosmetics where id = any(v_ids)) then
      raise exception 'El conjunto no es válido.';
    end if;
    v_list := v_list || jsonb_build_array(jsonb_build_object('slot', p_slot, 'name', v_name, 'ids', to_jsonb(v_ids)));
    select jsonb_agg(e order by (e ->> 'slot')::int) into v_list from jsonb_array_elements(v_list) e;
  end if;

  update public.student_profiles set loadouts = v_list, updated_at = now() where student_id = v_sid;
  return v_list;
end;
$$;

-- ----------------------------------------------------------------------------
-- 10) Permisos
-- ----------------------------------------------------------------------------
do $$
declare
  f text;
begin
  foreach f in array array[
    'tesla_achievement_rarity()', 'tesla_wall_phrase(text)', 'post_wall_message(bigint, text, text)', 'tesla_wall(bigint)',
    'remove_wall_post(bigint)', 'moderate_tesla_profile(bigint, text)', 'tesla_profile(bigint)', 'tesla_progress(bigint)',
    'tesla_identities(uuid[])',
    'save_my_tesla_profile(bigint[], bigint[], text, boolean, text[], jsonb, boolean)', 'save_tesla_loadout(integer, text, bigint[])'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
  -- Internas: solo las usan otras funciones de la base.
  foreach f in array array['tesla_collection_pct(bigint)', 'tesla_on_cosmetic_owned()'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
  end loop;
end $$;

select 'Perfil Tesla estilo Steam listo' as estado;
