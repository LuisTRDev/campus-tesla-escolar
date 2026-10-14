-- ============================================================================
-- CAMPUS VIRTUAL TESLA · Script 17
-- Perfil Tesla+: efectos de nombre, auras, vitrina, chispas entre compañeros,
-- misiones semanales, pase de temporada, cofres sorpresa y trayectoria.
--
--   peer_sparks       Chispas que un alumno le da a un compañero de su aula
--   weekly_missions   Misiones que se renuevan cada lunes (hora de Lima)
--   season_rewards    Premios del pase de temporada (por bimestre)
--   season_claims     Premios de temporada ya reclamados
--   chests            Cofres sorpresa (solo con monedas ganadas; probabilidades públicas)
--   chest_openings    Registro de cofres abiertos
--
-- Requiere los scripts 15 y 16. Se puede volver a ejecutar.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Cosméticos nuevos: efecto de nombre y aura; se obtienen también por
--    temporada (SEASON) o en cofres (CHEST)
-- ----------------------------------------------------------------------------
alter table public.cosmetics drop constraint if exists cosmetics_kind_check;
alter table public.cosmetics add constraint cosmetics_kind_check
  -- Incluye THEME y MINI_BG (script 22) para poder volver a ejecutar este script después.
  check (kind in ('AVATAR', 'FRAME', 'BANNER', 'TITLE', 'BACKGROUND', 'NAME_FX', 'AURA', 'THEME', 'MINI_BG'));

alter table public.cosmetics drop constraint if exists cosmetics_unlock_type_check;
alter table public.cosmetics add constraint cosmetics_unlock_type_check
  check (unlock_type in ('DEFAULT', 'LEVEL', 'ACHIEVEMENT', 'PURCHASE', 'SEASON', 'CHEST'));

alter table public.cosmetics drop constraint if exists cosmetics_unlock_check;
alter table public.cosmetics add constraint cosmetics_unlock_check check (
  unlock_type in ('DEFAULT', 'SEASON', 'CHEST')
  or (unlock_type = 'LEVEL' and unlock_level is not null)
  or (unlock_type = 'ACHIEVEMENT' and unlock_achievement_id is not null)
  or (unlock_type = 'PURCHASE' and price_coins is not null)
);

alter table public.cosmetics drop constraint if exists cosmetics_effect_check;
alter table public.cosmetics add constraint cosmetics_effect_check
  check (kind not in ('NAME_FX', 'AURA') or value ~ '^[a-z0-9-]{2,30}$');

alter table public.student_profiles add column if not exists name_fx_id bigint references public.cosmetics(id) on delete set null;
alter table public.student_profiles add column if not exists aura_id bigint references public.cosmetics(id) on delete set null;
-- Vitrina: bloques que el alumno decide mostrar (en orden).
alter table public.student_profiles add column if not exists showcase text[] not null default '{}';
alter table public.student_profiles drop constraint if exists student_profiles_showcase_check;
alter table public.student_profiles add constraint student_profiles_showcase_check check (
  cardinality(showcase) <= 4 and showcase <@ array['STREAK', 'STATS', 'PINS', 'SPARKS', 'RECENT']
);

-- Movimientos nuevos del libro de puntos.
alter table public.point_ledger drop constraint if exists point_ledger_source_check;
alter table public.point_ledger add constraint point_ledger_source_check check (source in (
  'RULE', 'RECOGNITION', 'ACHIEVEMENT', 'GOAL', 'REDEMPTION', 'REFUND', 'PURCHASE', 'ADJUST',
  'SPARK', 'MISSION', 'SEASON', 'CHEST'
));

insert into public.cosmetics (kind, name, value, rarity, unlock_type, unlock_level, unlock_achievement_id, price_coins, sort)
select c.kind, c.name, c.value, c.rarity, c.unlock_type, c.lvl, a.id, c.price, c.sort
from (values
  -- Efectos del nombre
  ('NAME_FX', 'Normal', 'none', 'BRONZE', 'DEFAULT', null, null, null, 1),
  ('NAME_FX', 'Dorado', 'oro', 'SILVER', 'LEVEL', 3, null, null, 2),
  ('NAME_FX', 'Hielo', 'hielo', 'SILVER', 'LEVEL', 6, null, null, 3),
  ('NAME_FX', 'Neón', 'neon', 'SILVER', 'PURCHASE', null, null, 90, 4),
  ('NAME_FX', 'Eléctrico', 'electrico', 'GOLD', 'PURCHASE', null, null, 150, 5),
  ('NAME_FX', 'Arcoíris', 'arcoiris', 'GOLD', 'CHEST', null, null, null, 6),
  ('NAME_FX', 'Fuego', 'fuego', 'GOLD', 'CHEST', null, null, null, 7),
  ('NAME_FX', 'Glitch', 'glitch', 'PLATINUM', 'SEASON', null, null, null, 8),
  -- Auras del avatar
  ('AURA', 'Sin aura', 'none', 'BRONZE', 'DEFAULT', null, null, null, 1),
  ('AURA', 'Chispas', 'chispas', 'SILVER', 'LEVEL', 4, null, null, 2),
  ('AURA', 'Halo', 'halo', 'SILVER', 'PURCHASE', null, null, 110, 3),
  ('AURA', 'Órbita', 'orbita', 'GOLD', 'PURCHASE', null, null, 170, 4),
  ('AURA', 'Plasma', 'plasma', 'GOLD', 'CHEST', null, null, null, 5),
  ('AURA', 'Pétalos', 'petalos', 'SILVER', 'CHEST', null, null, null, 6),
  ('AURA', 'Estelar', 'estelar', 'PLATINUM', 'SEASON', null, null, null, 7),
  ('AURA', 'Corona Tesla', 'corona', 'PLATINUM', 'ACHIEVEMENT', null, 'BOBINA_TESLA', null, 8),
  -- Exclusivos de temporada y de cofres
  ('BACKGROUND', 'Fuegos artificiales', 'scene:fuegos', 'GOLD', 'SEASON', null, null, null, 20),
  ('BACKGROUND', 'Nevada', 'scene:nieve', 'SILVER', 'CHEST', null, null, null, 21),
  ('BANNER', 'Fuegos artificiales', 'scene:fuegos', 'GOLD', 'CHEST', null, null, null, 20),
  ('BANNER', 'Nevada', 'scene:nieve', 'SILVER', 'SEASON', null, null, null, 21),
  ('TITLE', 'Campeón de temporada', 'Campeón de temporada', 'GOLD', 'SEASON', null, null, null, 20),
  ('TITLE', 'Rayo veloz', 'Rayo veloz', 'SILVER', 'CHEST', null, null, null, 21),
  ('TITLE', 'Genio en pausa', 'Genio en pausa', 'BRONZE', 'CHEST', null, null, null, 22),
  ('TITLE', 'Chispa del aula', 'Chispa del aula', 'BRONZE', 'CHEST', null, null, null, 23),
  ('AVATAR', 'Cometa', '☄️', 'SILVER', 'CHEST', null, null, null, 30),
  ('AVATAR', 'Átomo', '⚛️', 'GOLD', 'CHEST', null, null, null, 31),
  ('AVATAR', 'Tiburón', '🦈', 'BRONZE', 'CHEST', null, null, null, 32),
  ('AVATAR', 'Estrella fugaz', '🌠', 'PLATINUM', 'CHEST', null, null, null, 33),
  ('AVATAR', 'Cóndor', '🦅', 'GOLD', 'SEASON', null, null, null, 34)
) as c(kind, name, value, rarity, unlock_type, lvl, ach_code, price, sort)
left join public.achievements a on a.code = c.ach_code
on conflict (kind, name) do nothing;

-- ----------------------------------------------------------------------------
-- 2) Chispas entre compañeros
-- ----------------------------------------------------------------------------
create table if not exists public.peer_sparks (
  id bigint generated always as identity primary key,
  from_student bigint not null references public.students(id) on delete cascade,
  to_student bigint not null references public.students(id) on delete cascade,
  kind text not null check (kind in ('AYUDA', 'EQUIPO', 'ANIMO', 'IDEA', 'AMABLE')),
  created_at timestamptz not null default now(),
  check (from_student <> to_student)
);
create index if not exists idx_peer_sparks_to on public.peer_sparks(to_student, created_at desc);
create index if not exists idx_peer_sparks_from on public.peer_sparks(from_student, created_at desc);

create or replace function public.tesla_spark_label(p_kind text)
returns text
language sql
immutable
set search_path = public
as $$
  select case p_kind
    when 'AYUDA' then 'Me ayudó' when 'EQUIPO' then 'Gran trabajo en equipo' when 'ANIMO' then 'Me dio ánimo'
    when 'IDEA' then 'Tuvo una idea genial' when 'AMABLE' then 'Fue muy amable' else 'Chispa' end
$$;

-- Estadísticas: se agregan las chispas recibidas (para logros y misiones).
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
                where ps.to_student = p_student_id and ps.created_at >= p_from and ps.created_at < p_to)
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
    when 'STREAK' then (select coalesce(max(w.best_streak), 0) from public.student_wallets w where w.student_id = p_student_id)
    when 'LEVEL' then public.tesla_level(coalesce((select w.xp from public.student_wallets w where w.student_id = p_student_id), 0))
    else 0
  end
$$;

alter table public.achievements drop constraint if exists achievements_condition_type_check;
alter table public.achievements add constraint achievements_condition_type_check check (condition_type in (
  'MANUAL', 'TASKS_ON_TIME', 'TASKS_HIGH', 'STREAK', 'RECOGNITIONS',
  'MONTH_ATTENDANCE', 'MONTH_PUNCTUALITY', 'LEVEL', 'EARLY_TASKS', 'SPARKS',
  -- WALL y COLLECTION son del script 22 (para poder volver a ejecutar este script después).
  'WALL', 'COLLECTION'
));

insert into public.achievements (code, name, description, icon, rarity, is_secret, is_seasonal, condition_type, threshold, reward_xp, reward_coins, sort) values
  ('CHISPAZO', 'Chispazo', 'Recibe 10 chispas de tus compañeros.', 'Sparkles', 'SILVER', false, false, 'SPARKS', 10, 30, 15, 17),
  ('ALMA_DEL_AULA', 'Alma del aula', 'Recibe 50 chispas de tus compañeros.', 'HeartHandshake', 'GOLD', false, false, 'SPARKS', 50, 80, 30, 18)
on conflict (code) do nothing;

-- Un alumno da una chispa a un compañero de su aula: 3 al día, 1 por compañero al día.
-- Quien la recibe gana 5 XP y 1 moneda (solo por las 3 primeras del día).
create or replace function public.give_spark(p_to_student bigint, p_kind text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_from bigint := public.tesla_self_student();
  v_today timestamptz := public.tesla_day_start(public.tesla_today());
  v_id bigint;
  v_rewarded boolean := false;
begin
  if p_to_student = v_from then
    raise exception 'No puedes darte una chispa a ti mismo.';
  end if;
  if p_kind not in ('AYUDA', 'EQUIPO', 'ANIMO', 'IDEA', 'AMABLE') then
    raise exception 'Elige un motivo.';
  end if;
  if not exists (
    select 1 from public.students a join public.students b on b.classroom_id = a.classroom_id
    where a.id = v_from and b.id = p_to_student and a.classroom_id is not null
  ) then
    raise exception 'Solo puedes dar chispas a compañeros de tu aula.';
  end if;

  perform pg_advisory_xact_lock(hashtext('tesla_spark:' || v_from));
  if (select count(*) from public.peer_sparks where from_student = v_from and created_at >= v_today) >= 3 then
    raise exception 'Ya diste tus 3 chispas de hoy. Mañana tendrás más.';
  end if;
  if exists (select 1 from public.peer_sparks where from_student = v_from and to_student = p_to_student and created_at >= v_today) then
    raise exception 'Hoy ya le diste una chispa a %.', public.student_first_name(p_to_student);
  end if;

  insert into public.peer_sparks (from_student, to_student, kind) values (v_from, p_to_student, p_kind) returning id into v_id;

  if (select count(*) from public.peer_sparks where to_student = p_to_student and created_at >= v_today) <= 3 then
    v_rewarded := public.tesla_award(p_to_student, 5, 1, 'SPARK', null, 'SPK:' || v_id,
      'Chispa de un compañero: ' || public.tesla_spark_label(p_kind));
  end if;
  perform public.tesla_push(p_to_student, '⚡ ¡Recibiste una chispa!',
    public.student_first_name(v_from) || ' le dio una chispa a ' || public.student_first_name(p_to_student)
      || ': «' || public.tesla_spark_label(p_kind) || '».',
    '/perfil-tesla?hijo=' || p_to_student);
  perform public.tesla_evaluate(p_to_student);
  return jsonb_build_object('id', v_id, 'rewarded', v_rewarded,
    'left_today', 3 - (select count(*) from public.peer_sparks where from_student = v_from and created_at >= v_today));
end;
$$;

-- Chispas que todavía puede dar hoy el alumno conectado (y a quién ya se las dio).
create or replace function public.my_sparks_today()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'left', 3 - count(ps.id),
    'given_to', coalesce(jsonb_agg(ps.to_student) filter (where ps.id is not null), '[]'::jsonb)
  )
  from (select 1) x
  left join public.peer_sparks ps
    on ps.from_student = public.my_self_student_id()
   and ps.created_at >= public.tesla_day_start(public.tesla_today())
$$;

-- ----------------------------------------------------------------------------
-- 3) Misiones semanales
-- ----------------------------------------------------------------------------
create table if not exists public.weekly_missions (
  id bigint generated always as identity primary key,
  code text not null unique check (code ~ '^[A-Z0-9_]{3,40}$'),
  name text not null check (char_length(btrim(name)) between 3 and 60),
  description text not null default '' check (char_length(description) <= 160),
  icon text not null default 'Target' check (char_length(icon) <= 30),
  metric text not null check (metric in ('TASKS_ON_TIME', 'EARLY_TASKS', 'TASKS_HIGH', 'RECOGNITIONS', 'SPARKS_GIVEN', 'SPARKS_RECEIVED')),
  target integer not null default 1 check (target between 1 and 100),
  reward_xp integer not null default 10 check (reward_xp between 0 and 500),
  reward_coins integer not null default 5 check (reward_coins between 0 and 500),
  is_active boolean not null default true,
  sort smallint not null default 1
);

insert into public.weekly_missions (code, name, description, icon, metric, target, reward_xp, reward_coins, sort) values
  ('SEMANA_PUNTUAL', 'Semana puntual', 'Entrega 3 tareas a tiempo esta semana.', 'Clock', 'TASKS_ON_TIME', 3, 20, 10, 1),
  ('ADELANTADO', 'Adelantado', 'Entrega una tarea con un día de anticipación.', 'Sunrise', 'EARLY_TASKS', 1, 15, 8, 2),
  ('BUEN_NIVEL', 'Buen nivel', 'Logra A o AD en 2 tareas.', 'Star', 'TASKS_HIGH', 2, 20, 10, 3),
  ('DA_CHISPAS', 'Enciende el aula', 'Dale chispas a 2 compañeros.', 'Sparkles', 'SPARKS_GIVEN', 2, 10, 5, 4),
  ('RECONOCIDO_SEMANA', 'Que te reconozcan', 'Recibe un reconocimiento de un docente o una chispa de un compañero.', 'Heart', 'SPARKS_RECEIVED', 1, 10, 5, 5)
on conflict (code) do nothing;

-- Lunes de la semana en curso (hora de Lima).
create or replace function public.tesla_week_start()
returns date
language sql
stable
as $$ select public.tesla_today() - (extract(isodow from public.tesla_today())::int - 1) $$;

create or replace function public.tesla_mission_value(p_student_id bigint, p_metric text)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_from timestamptz := public.tesla_day_start(public.tesla_week_start());
  v_to timestamptz := public.tesla_day_start(public.tesla_week_start() + 7);
  v_stats jsonb;
begin
  if p_metric = 'SPARKS_GIVEN' then
    return (select count(*) from public.peer_sparks where from_student = p_student_id and created_at >= v_from and created_at < v_to);
  end if;
  v_stats := public.tesla_stats_range(p_student_id, v_from, v_to);
  return case p_metric
    when 'TASKS_ON_TIME' then (v_stats ->> 'on_time')::int
    when 'EARLY_TASKS' then (v_stats ->> 'early')::int
    when 'TASKS_HIGH' then (v_stats ->> 'high')::int
    when 'RECOGNITIONS' then (v_stats ->> 'recognitions')::int
    when 'SPARKS_RECEIVED' then (v_stats ->> 'sparks')::int + (v_stats ->> 'recognitions')::int
    else 0
  end;
end;
$$;

create or replace function public.tesla_missions(p_student_id bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_week date := public.tesla_week_start();
begin
  if not public.can_view_student(p_student_id) then
    raise exception 'No puedes ver este perfil.';
  end if;
  return jsonb_build_object(
    'week_start', v_week,
    'week_end', v_week + 6,
    'missions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', m.id, 'name', m.name, 'description', m.description, 'icon', m.icon, 'metric', m.metric, 'target', m.target,
        'reward_xp', m.reward_xp, 'reward_coins', m.reward_coins,
        'progress', least(m.target, public.tesla_mission_value(p_student_id, m.metric)),
        'claimed', exists (select 1 from public.point_ledger l where l.ref_key = 'MIS:' || p_student_id || ':' || m.id || ':' || v_week)
      ) order by m.sort, m.id)
      from public.weekly_missions m where m.is_active
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.claim_mission(p_mission_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sid bigint := public.tesla_self_student();
  m public.weekly_missions%rowtype;
begin
  select * into m from public.weekly_missions where id = p_mission_id and is_active;
  if not found then
    raise exception 'Esta misión ya no está activa.';
  end if;
  if public.tesla_mission_value(v_sid, m.metric) < m.target then
    raise exception 'Todavía no completas «%».', m.name;
  end if;
  if not public.tesla_award(v_sid, m.reward_xp, m.reward_coins, 'MISSION', null,
      'MIS:' || v_sid || ':' || m.id || ':' || public.tesla_week_start(), 'Misión: ' || m.name, auth.uid()) then
    raise exception 'Ya reclamaste esta misión esta semana.';
  end if;
  perform public.tesla_evaluate(v_sid);
  return jsonb_build_object('xp', m.reward_xp, 'coins', m.reward_coins);
end;
$$;

-- ----------------------------------------------------------------------------
-- 4) Pase de temporada (un bimestre = una temporada)
--    Los premios con period_id nulo valen para cualquier bimestre que no tenga
--    premios propios. La XP de temporada es la XP ganada dentro del bimestre.
-- ----------------------------------------------------------------------------
create table if not exists public.season_rewards (
  id bigint generated always as identity primary key,
  period_id bigint references public.grading_periods(id) on delete cascade,
  tier smallint not null check (tier between 1 and 50),
  xp_needed integer not null check (xp_needed between 1 and 100000),
  coins integer not null default 0 check (coins between 0 and 1000),
  cosmetic_id bigint references public.cosmetics(id) on delete set null,
  is_active boolean not null default true,
  check (coins > 0 or cosmetic_id is not null)
);
create unique index if not exists idx_season_rewards_tier on public.season_rewards(coalesce(period_id, 0), tier);

create table if not exists public.season_claims (
  student_id bigint not null references public.students(id) on delete cascade,
  reward_id bigint not null references public.season_rewards(id) on delete cascade,
  period_id bigint not null references public.grading_periods(id) on delete cascade,
  claimed_at timestamptz not null default now(),
  primary key (student_id, reward_id, period_id)
);

insert into public.season_rewards (period_id, tier, xp_needed, coins, cosmetic_id)
select null, r.tier, r.xp, r.coins, c.id
from (values
  (1, 40, 10, null, null),
  (2, 90, 0, 'TITLE', 'Campeón de temporada'),
  (3, 150, 15, null, null),
  (4, 220, 0, 'BANNER', 'Nevada'),
  (5, 300, 20, null, null),
  (6, 390, 0, 'AVATAR', 'Cóndor'),
  (7, 490, 25, null, null),
  (8, 600, 0, 'NAME_FX', 'Glitch'),
  (9, 720, 30, null, null),
  (10, 850, 0, 'AURA', 'Estelar'),
  (11, 1000, 0, 'BACKGROUND', 'Fuegos artificiales')
) as r(tier, xp, coins, c_kind, c_name)
left join public.cosmetics c on c.kind = r.c_kind and c.name = r.c_name
where not exists (select 1 from public.season_rewards where period_id is null);

-- Premios vigentes en un bimestre.
create or replace function public.tesla_season_rewards(p_period_id bigint)
returns setof public.season_rewards
language sql
stable
security definer
set search_path = public
as $$
  select * from public.season_rewards sr
  where sr.is_active
    and (sr.period_id = p_period_id
         or (sr.period_id is null and not exists (select 1 from public.season_rewards x where x.period_id = p_period_id and x.is_active)))
  order by sr.tier
$$;

create or replace function public.tesla_season_xp(p_student_id bigint, p_period public.grading_periods)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(l.xp), 0)::int from public.point_ledger l
  where l.student_id = p_student_id and l.xp > 0
    and l.created_at >= public.tesla_day_start(p_period.starts_on)
    and l.created_at < public.tesla_day_start(p_period.ends_on + 1)
$$;

create or replace function public.tesla_season(p_student_id bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_period public.grading_periods;
  v_xp integer;
begin
  if not public.can_view_student(p_student_id) then
    raise exception 'No puedes ver este perfil.';
  end if;
  v_period := public.tesla_current_period();
  if v_period.id is null then
    return jsonb_build_object('period', null, 'xp', 0, 'rewards', '[]'::jsonb);
  end if;
  v_xp := public.tesla_season_xp(p_student_id, v_period);
  return jsonb_build_object(
    'period', jsonb_build_object('id', v_period.id, 'name', v_period.name, 'starts_on', v_period.starts_on, 'ends_on', v_period.ends_on),
    'xp', v_xp,
    'rewards', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', sr.id, 'tier', sr.tier, 'xp_needed', sr.xp_needed, 'coins', sr.coins,
        'cosmetic', case when c.id is null then null else jsonb_build_object('id', c.id, 'kind', c.kind, 'name', c.name, 'value', c.value, 'rarity', c.rarity) end,
        'claimed', exists (select 1 from public.season_claims sc where sc.student_id = p_student_id and sc.reward_id = sr.id and sc.period_id = v_period.id),
        'owned', c.id is not null and exists (select 1 from public.student_cosmetics so where so.student_id = p_student_id and so.cosmetic_id = c.id)
      ) order by sr.tier)
      from public.tesla_season_rewards(v_period.id) sr
      left join public.cosmetics c on c.id = sr.cosmetic_id
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.claim_season_reward(p_reward_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sid bigint := public.tesla_self_student();
  v_period public.grading_periods;
  sr public.season_rewards%rowtype;
  v_coins integer;
  v_new_cosmetic boolean := false;
begin
  v_period := public.tesla_current_period();
  if v_period.id is null then
    raise exception 'No hay una temporada en curso.';
  end if;
  select * into sr from public.tesla_season_rewards(v_period.id) x where x.id = p_reward_id;
  if not found then
    raise exception 'Este premio no es de la temporada actual.';
  end if;
  if public.tesla_season_xp(v_sid, v_period) < sr.xp_needed then
    raise exception 'Necesitas % XP de temporada para este premio.', sr.xp_needed;
  end if;
  begin
    insert into public.season_claims (student_id, reward_id, period_id) values (v_sid, sr.id, v_period.id);
  exception when unique_violation then
    raise exception 'Ya reclamaste este premio.';
  end;

  v_coins := sr.coins;
  if sr.cosmetic_id is not null then
    insert into public.student_cosmetics (student_id, cosmetic_id) values (v_sid, sr.cosmetic_id)
    on conflict do nothing;
    v_new_cosmetic := found;
    -- Si ya lo tenía (de otra temporada), recibe monedas a cambio.
    if not v_new_cosmetic and v_coins = 0 then
      v_coins := 25;
    end if;
  end if;
  if v_coins > 0 then
    perform public.tesla_award(v_sid, 0, v_coins, 'SEASON', null, 'SEA:' || v_sid || ':' || sr.id || ':' || v_period.id,
      'Temporada ' || v_period.name || ': nivel ' || sr.tier);
  end if;
  return jsonb_build_object('coins', v_coins, 'cosmetic_id', case when v_new_cosmetic then sr.cosmetic_id end);
end;
$$;

-- ----------------------------------------------------------------------------
-- 5) Cofres sorpresa (solo monedas ganadas; probabilidades visibles)
-- ----------------------------------------------------------------------------
create table if not exists public.chests (
  id bigint generated always as identity primary key,
  name text not null unique check (char_length(btrim(name)) between 2 and 40),
  description text not null default '' check (char_length(description) <= 160),
  price integer not null check (price between 1 and 100000),
  w_bronze integer not null default 0 check (w_bronze >= 0),
  w_silver integer not null default 0 check (w_silver >= 0),
  w_gold integer not null default 0 check (w_gold >= 0),
  w_platinum integer not null default 0 check (w_platinum >= 0),
  is_active boolean not null default true,
  sort smallint not null default 1,
  check (w_bronze + w_silver + w_gold + w_platinum > 0)
);

insert into public.chests (name, description, price, w_bronze, w_silver, w_gold, w_platinum, sort) values
  ('Cofre de chispas', 'Un cosmético sorpresa de los cofres. Ideal para empezar.', 60, 55, 33, 10, 2, 1),
  ('Cofre Tesla', 'Más chances de oro y platino.', 150, 0, 45, 42, 13, 2)
on conflict (name) do nothing;

create table if not exists public.chest_openings (
  id bigint generated always as identity primary key,
  student_id bigint not null references public.students(id) on delete cascade,
  chest_id bigint references public.chests(id) on delete set null,
  cosmetic_id bigint references public.cosmetics(id) on delete set null,
  price integer not null,
  refund integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_chest_openings_student on public.chest_openings(student_id, created_at desc);

create or replace function public.open_chest(p_chest_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sid bigint := public.tesla_self_student();
  ch public.chests%rowtype;
  v_coins integer;
  v_total integer;
  v_roll numeric;
  v_rarity text;
  v_cid bigint;
  v_dup boolean := false;
  v_refund integer := 0;
  v_open_id bigint;
  c public.cosmetics%rowtype;
begin
  select * into ch from public.chests where id = p_chest_id and is_active;
  if not found then
    raise exception 'Este cofre no está disponible.';
  end if;
  if not exists (select 1 from public.cosmetics where unlock_type = 'CHEST' and is_active) then
    raise exception 'Este cofre todavía no tiene premios.';
  end if;
  perform pg_advisory_xact_lock(hashtext('tesla_chest:' || v_sid));
  select coins into v_coins from public.student_wallets where student_id = v_sid;
  if coalesce(v_coins, 0) < ch.price then
    raise exception 'Te faltan % monedas para abrir «%».', ch.price - coalesce(v_coins, 0), ch.name;
  end if;

  -- Sorteo de la rareza según los pesos del cofre.
  v_total := ch.w_bronze + ch.w_silver + ch.w_gold + ch.w_platinum;
  v_roll := random() * v_total;
  v_rarity := case
    when v_roll < ch.w_bronze then 'BRONZE'
    when v_roll < ch.w_bronze + ch.w_silver then 'SILVER'
    when v_roll < ch.w_bronze + ch.w_silver + ch.w_gold then 'GOLD'
    else 'PLATINUM' end;

  -- Un cosmético de esa rareza que no tenga; si no queda, cualquiera de las rarezas posibles.
  select id into v_cid from public.cosmetics x
  where x.unlock_type = 'CHEST' and x.is_active and x.rarity = v_rarity
    and not exists (select 1 from public.student_cosmetics so where so.student_id = v_sid and so.cosmetic_id = x.id)
  order by random() limit 1;
  if v_cid is null then
    select id into v_cid from public.cosmetics x
    where x.unlock_type = 'CHEST' and x.is_active
      and ((x.rarity = 'BRONZE' and ch.w_bronze > 0) or (x.rarity = 'SILVER' and ch.w_silver > 0)
        or (x.rarity = 'GOLD' and ch.w_gold > 0) or (x.rarity = 'PLATINUM' and ch.w_platinum > 0))
      and not exists (select 1 from public.student_cosmetics so where so.student_id = v_sid and so.cosmetic_id = x.id)
    order by random() limit 1;
  end if;
  -- Ya tiene todo: sale un repetido y se devuelve la mitad del precio.
  if v_cid is null then
    v_dup := true;
    v_refund := ch.price / 2;
    select id into v_cid from public.cosmetics x where x.unlock_type = 'CHEST' and x.is_active order by random() limit 1;
  end if;

  insert into public.chest_openings (student_id, chest_id, cosmetic_id, price, refund)
  values (v_sid, ch.id, v_cid, ch.price, v_refund)
  returning id into v_open_id;
  if not v_dup then
    insert into public.student_cosmetics (student_id, cosmetic_id) values (v_sid, v_cid) on conflict do nothing;
  end if;
  perform public.tesla_award(v_sid, 0, -(ch.price - v_refund), 'CHEST', null, 'CHE:' || v_open_id,
    'Cofre: ' || ch.name || case when v_dup then ' (repetido)' else '' end, auth.uid());

  select * into c from public.cosmetics where id = v_cid;
  return jsonb_build_object(
    'duplicate', v_dup, 'refund', v_refund,
    'cosmetic', jsonb_build_object('id', c.id, 'kind', c.kind, 'name', c.name, 'value', c.value, 'rarity', c.rarity)
  );
end;
$$;

-- ----------------------------------------------------------------------------
-- 6) Trayectoria: los hitos del alumno en orden
-- ----------------------------------------------------------------------------
create or replace function public.tesla_timeline(p_student_id bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_private boolean := public.can_view_student(p_student_id);
begin
  if not public.can_view_tesla_profile(p_student_id) then
    raise exception 'No puedes ver este perfil.';
  end if;
  return coalesce((
    select jsonb_agg(e order by (e ->> 'at') desc)
    from (
      select e from (
        -- Logros
        select jsonb_build_object('at', sa.earned_at, 'type', 'ACHIEVEMENT', 'title', 'Logro: ' || a.name,
                                  'detail', a.description, 'icon', a.icon, 'rarity', a.rarity) as e
        from public.student_achievements sa join public.achievements a on a.id = sa.achievement_id
        where sa.student_id = p_student_id
        union all
        -- Subidas de nivel y Estrellas ganadas (se reconstruyen con el libro de puntos)
        select case when public.tesla_pin_tier(lv.lvl) > public.tesla_pin_tier(lv.prev)
                 then jsonb_build_object('at', lv.created_at, 'type', 'PIN', 'title', 'Ganó la ' || public.tesla_pin_name(public.tesla_pin_tier(lv.lvl)),
                                         'detail', 'Llegó al nivel ' || lv.lvl || '.', 'tier', public.tesla_pin_tier(lv.lvl))
                 else jsonb_build_object('at', lv.created_at, 'type', 'LEVEL', 'title', 'Subió al nivel ' || lv.lvl, 'detail', null) end
        from (
          select c.created_at, public.tesla_level(c.cum) as lvl,
                 coalesce(lag(public.tesla_level(c.cum)) over (order by c.created_at, c.id), 1) as prev
          from (
            select l.id, l.created_at, (sum(l.xp) over (order by l.created_at, l.id))::int as cum
            from public.point_ledger l where l.student_id = p_student_id and l.xp > 0
          ) c
        ) lv
        where lv.lvl > lv.prev
        union all
        -- Pines entregados
        select jsonb_build_object('at', d.delivered_at, 'type', 'PIN_DELIVERED', 'title', 'Recibió el pin de la ' || public.tesla_pin_name(d.tier),
                                  'detail', 'Entregado en el colegio.', 'tier', d.tier)
        from public.tesla_pin_deliveries d where d.student_id = p_student_id
        union all
        -- Chispas recibidas (agrupadas por día)
        select jsonb_build_object('at', max(ps.created_at), 'type', 'SPARKS',
                                  'title', case when count(*) = 1 then 'Recibió una chispa' else 'Recibió ' || count(*) || ' chispas' end,
                                  'detail', string_agg(distinct public.tesla_spark_label(ps.kind), ' · '))
        from public.peer_sparks ps where ps.to_student = p_student_id
        group by (ps.created_at at time zone 'America/Lima')::date
        union all
        -- Premios de temporada con cosmético
        select jsonb_build_object('at', sc.claimed_at, 'type', 'SEASON', 'title', 'Premio de temporada: ' || c.name, 'detail', null)
        from public.season_claims sc join public.season_rewards sr on sr.id = sc.reward_id
        join public.cosmetics c on c.id = sr.cosmetic_id
        where sc.student_id = p_student_id
        union all
        -- Reconocimientos de docentes (solo quien puede ver los datos privados)
        select jsonb_build_object('at', r.created_at, 'type', 'RECOGNITION', 'title', 'Reconocimiento: ' || rc.name, 'detail', r.reason, 'icon', rc.icon)
        from public.recognitions r join public.recognition_categories rc on rc.id = r.category_id
        where r.student_id = p_student_id and v_private
      ) all_events
      order by (e ->> 'at') desc
      limit 80
    ) t
  ), '[]'::jsonb);
end;
$$;

-- ----------------------------------------------------------------------------
-- 7) Perfil (lectura): efectos, vitrina y chispas
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
  v_showcase text[];
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
    'is_classmate', public.my_self_student_id() is not null and p_student_id <> public.my_self_student_id()
                    and st.classroom_id = (select s2.classroom_id from public.students s2 where s2.id = public.my_self_student_id()),
    'can_manage', public.can_manage_tesla_student(p_student_id),
    'bio', pr.bio,
    'hide_from_rankings', coalesce(pr.hide_from_rankings, false),
    'avatar', (select jsonb_build_object('id', c.id, 'name', c.name, 'value', c.value) from public.cosmetics c where c.id = coalesce(pr.avatar_id, public.tesla_default_cosmetic('AVATAR'))),
    'frame', (select jsonb_build_object('id', c.id, 'name', c.name, 'value', c.value) from public.cosmetics c where c.id = coalesce(pr.frame_id, public.tesla_default_cosmetic('FRAME'))),
    'banner', (select jsonb_build_object('id', c.id, 'name', c.name, 'value', c.value) from public.cosmetics c where c.id = coalesce(pr.banner_id, public.tesla_default_cosmetic('BANNER'))),
    'title', (select jsonb_build_object('id', c.id, 'name', c.name, 'value', c.value) from public.cosmetics c where c.id = coalesce(pr.title_id, public.tesla_default_cosmetic('TITLE'))),
    'background', (select jsonb_build_object('id', c.id, 'name', c.name, 'value', c.value) from public.cosmetics c where c.id = coalesce(pr.background_id, public.tesla_default_cosmetic('BACKGROUND'))),
    'name_fx', (select jsonb_build_object('id', c.id, 'name', c.name, 'value', c.value) from public.cosmetics c where c.id = coalesce(pr.name_fx_id, public.tesla_default_cosmetic('NAME_FX'))),
    'aura', (select jsonb_build_object('id', c.id, 'name', c.name, 'value', c.value) from public.cosmetics c where c.id = coalesce(pr.aura_id, public.tesla_default_cosmetic('AURA'))),
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
    )
  );

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
              where sa.student_id = p_student_id order by sa.earned_at desc limit 4) r), '[]'::jsonb) end
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

-- Compañeros del aula: se agregan el efecto de nombre y el aura.
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
  name_fx text,
  aura text,
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
         (select c.value from public.cosmetics c where c.id = coalesce(p.name_fx_id, public.tesla_default_cosmetic('NAME_FX'))),
         (select c.value from public.cosmetics c where c.id = coalesce(p.aura_id, public.tesla_default_cosmetic('AURA'))),
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
-- 8) Guardar el perfil (todos los cosméticos en una lista + vitrina)
-- ----------------------------------------------------------------------------
create or replace function public.save_my_tesla_profile(
  p_cosmetic_ids bigint[], p_featured bigint[], p_bio text, p_hide_from_rankings boolean, p_showcase text[]
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
  v_id bigint;
  v_pick record;
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
  if cardinality(v_showcase) > 4 or not (v_showcase <@ array['STREAK', 'STATS', 'PINS', 'SPARKS', 'RECENT']) then
    raise exception 'La vitrina admite hasta 4 bloques.';
  end if;
  if char_length(coalesce(v_bio, '')) > 140 then
    raise exception 'La presentación puede tener hasta 140 caracteres.';
  end if;

  select
    (select id from public.cosmetics where id = any(v_ids) and kind = 'AVATAR') as avatar_id,
    (select id from public.cosmetics where id = any(v_ids) and kind = 'FRAME') as frame_id,
    (select id from public.cosmetics where id = any(v_ids) and kind = 'BANNER') as banner_id,
    (select id from public.cosmetics where id = any(v_ids) and kind = 'TITLE') as title_id,
    (select id from public.cosmetics where id = any(v_ids) and kind = 'BACKGROUND') as background_id,
    (select id from public.cosmetics where id = any(v_ids) and kind = 'NAME_FX') as name_fx_id,
    (select id from public.cosmetics where id = any(v_ids) and kind = 'AURA') as aura_id
  into v_pick;

  insert into public.student_profiles (student_id, avatar_id, frame_id, banner_id, title_id, background_id, name_fx_id, aura_id,
                                       featured, bio, hide_from_rankings, showcase, updated_at)
  values (v_sid, v_pick.avatar_id, v_pick.frame_id, v_pick.banner_id, v_pick.title_id, v_pick.background_id, v_pick.name_fx_id, v_pick.aura_id,
          v_featured, v_bio, coalesce(p_hide_from_rankings, false), v_showcase, now())
  on conflict (student_id) do update
    set avatar_id = excluded.avatar_id, frame_id = excluded.frame_id, banner_id = excluded.banner_id,
        title_id = excluded.title_id, background_id = excluded.background_id, name_fx_id = excluded.name_fx_id,
        aura_id = excluded.aura_id, featured = excluded.featured, bio = excluded.bio,
        hide_from_rankings = excluded.hide_from_rankings, showcase = excluded.showcase, updated_at = now();
end;
$$;

-- ----------------------------------------------------------------------------
-- 9) Seguridad
-- ----------------------------------------------------------------------------
do $$
declare
  t text;
  pol record;
begin
  foreach t in array array['peer_sparks', 'weekly_missions', 'season_rewards', 'season_claims', 'chests', 'chest_openings'] loop
    for pol in select policyname from pg_policies where schemaname = 'public' and tablename = t loop
      execute format('drop policy %I on public.%I', pol.policyname, t);
    end loop;
    execute format('alter table public.%I enable row level security', t);
  end loop;
  -- Catálogos: todos leen, dirección edita.
  foreach t in array array['weekly_missions', 'season_rewards', 'chests'] loop
    execute format('create policy "authenticated_read" on public.%I for select to authenticated using (true)', t);
    execute format('create policy "admin_write" on public.%I for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()))', t);
  end loop;
end $$;

-- Datos de cada alumno: se escriben solo con las funciones de este script.
create policy "view" on public.peer_sparks for select to authenticated
  using (public.can_view_student(to_student) or public.can_view_student(from_student));
create policy "view" on public.season_claims for select to authenticated using (public.can_view_student(student_id));
create policy "view" on public.chest_openings for select to authenticated using (public.can_view_student(student_id));

do $$
declare
  f text;
begin
  -- Funciones internas: solo las usan otras funciones de la base.
  foreach f in array array[
    'tesla_stats_range(bigint, timestamptz, timestamptz)', 'tesla_stat_value(jsonb, text, bigint)',
    'tesla_mission_value(bigint, text)', 'tesla_season_rewards(bigint)', 'tesla_season_xp(bigint, public.grading_periods)'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
  end loop;

  foreach f in array array[
    'tesla_spark_label(text)', 'give_spark(bigint, text)', 'my_sparks_today()',
    'tesla_week_start()', 'tesla_missions(bigint)', 'claim_mission(bigint)',
    'tesla_season(bigint)', 'claim_season_reward(bigint)',
    'open_chest(bigint)', 'tesla_timeline(bigint)', 'tesla_profile(bigint)', 'tesla_classroom_profiles(bigint)',
    'save_my_tesla_profile(bigint[], bigint[], text, boolean, text[])'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

select 'Perfil Tesla+ listo' as estado;
