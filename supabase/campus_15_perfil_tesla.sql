-- ============================================================================
-- CAMPUS VIRTUAL TESLA · Script 15
-- Perfil Tesla: puntos, niveles, logros, personalización, canjes y metas de aula.
--
--   tesla_settings          Topes diarios, vencimiento de canjes, curva de niveles, ranking
--   point_rules             Reglas automáticas de puntos (editables)
--   recognition_categories  Categorías de reconocimiento del docente
--   point_ledger            Libro de movimientos de XP y monedas (nunca se borra)
--   student_wallets         Saldo de cada alumno (XP total, monedas disponibles)
--   recognitions            Reconocimientos dados por docentes
--   attendance_months       Asistencia y puntualidad mensual (datos de Tesla)
--   achievements            Catálogo de logros (rareza, secretos, de temporada)
--   student_achievements    Logros obtenidos
--   cosmetics               Avatares, marcos, banners y títulos
--   student_cosmetics       Cosméticos comprados
--   student_profiles        Perfil elegido por el alumno
--   rewards                 Tienda de canjes (privilegios y productos físicos)
--   reward_requests         Solicitudes de canje (las monedas quedan reservadas)
--   classroom_goals         Metas cooperativas de aula
--
-- XP: no se gasta y define el nivel. Monedas: se ganan y se gastan.
-- No hay ranking de notas: el ranking (opcional) mide constancia o mejora.
--
-- Los puntos automáticos los dan triggers que NUNCA bloquean la entrega ni la
-- calificación: si algo falla, se registra un aviso y la operación sigue.
-- Requiere los scripts 01 a 14. Se puede volver a ejecutar.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Configuración y reglas
-- ----------------------------------------------------------------------------
create table if not exists public.tesla_settings (
  id smallint primary key default 1 check (id = 1),
  -- XP para pasar de nivel: nivel N empieza en level_step × N × (N − 1) / 2.
  -- Con 100: nivel 2 = 100 XP, 3 = 300, 4 = 600, 5 = 1000, 10 = 4500.
  level_step integer not null default 100 check (level_step between 10 and 10000),
  teacher_daily_recognitions integer not null default 15 check (teacher_daily_recognitions between 1 and 200),
  student_daily_recognitions integer not null default 3 check (student_daily_recognitions between 1 and 50),
  request_expiry_days integer not null default 7 check (request_expiry_days between 1 and 60),
  ranking_enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

insert into public.tesla_settings (id) values (1) on conflict (id) do nothing;

create table if not exists public.point_rules (
  code text primary key check (code ~ '^[A-Z_]{3,40}$'),
  name text not null check (char_length(btrim(name)) between 3 and 80),
  description text check (description is null or char_length(description) <= 300),
  xp integer not null default 0 check (xp between 0 and 1000),
  coins integer not null default 0 check (coins between 0 and 1000),
  params jsonb not null default '{}'::jsonb check (jsonb_typeof(params) = 'object'),
  is_active boolean not null default true,
  sort smallint not null default 1,
  updated_at timestamptz not null default now()
);

-- Los parámetros numéricos deben ser números (evita reglas mal configuradas).
alter table public.point_rules drop constraint if exists point_rules_params_check;
alter table public.point_rules add constraint point_rules_params_check check (
  coalesce(params ->> 'length', '5') ~ '^[0-9]{1,3}$'
  and coalesce(params ->> 'min_score20', '14') ~ '^[0-9]{1,2}(\.[0-9]+)?$'
  and coalesce(params ->> 'min_pct', '100') ~ '^[0-9]{1,3}(\.[0-9]+)?$'
);

insert into public.point_rules (code, name, description, xp, coins, params, sort) values
  ('TASK_ON_TIME', 'Tarea entregada a tiempo', 'Una vez por tarea, al entregarla antes de la fecha límite.', 10, 2, '{}', 1),
  ('TASK_HIGH', 'Tarea calificada con A o AD', 'Una vez por tarea. En tareas con nota, cuenta desde min_score20 sobre 20.', 15, 3, '{"min_score20": 14}', 2),
  ('STREAK', 'Racha de entregas', 'Cada vez que la racha de tareas seguidas a tiempo llega a un múltiplo de length.', 30, 10, '{"length": 5}', 3),
  ('MONTH_ATTENDANCE', 'Asistencia del mes', 'Al cerrar el mes, si asistió al menos min_pct % de los días de clase (datos de Tesla).', 40, 15, '{"min_pct": 100}', 4),
  ('MONTH_PUNCTUALITY', 'Puntualidad del mes', 'Al cerrar el mes, sin tardanzas y con al menos min_pct % de asistencia.', 40, 15, '{"min_pct": 90}', 5)
on conflict (code) do nothing;

create table if not exists public.recognition_categories (
  id bigint generated always as identity primary key,
  name text not null unique check (char_length(btrim(name)) between 3 and 40),
  icon text not null default 'Heart' check (char_length(icon) <= 30),
  xp integer not null default 20 check (xp between 0 and 500),
  coins integer not null default 5 check (coins between 0 and 500),
  is_active boolean not null default true,
  sort smallint not null default 1
);

insert into public.recognition_categories (name, icon, xp, coins, sort) values
  ('Compañerismo', 'HeartHandshake', 20, 5, 1),
  ('Esfuerzo', 'Flame', 20, 5, 2),
  ('Participación', 'Hand', 20, 5, 3),
  ('Responsabilidad', 'Shield', 20, 5, 4),
  ('Creatividad', 'Lightbulb', 20, 5, 5),
  ('Liderazgo', 'Flag', 20, 5, 6),
  ('Valores Tesla', 'Heart', 25, 5, 7)
on conflict (name) do nothing;

-- ----------------------------------------------------------------------------
-- 2) Puntos: libro de movimientos y saldos
-- ----------------------------------------------------------------------------
create table if not exists public.point_ledger (
  id bigint generated always as identity primary key,
  student_id bigint not null references public.students(id) on delete cascade,
  xp integer not null default 0 check (xp >= 0),
  coins integer not null default 0,
  source text not null check (source in ('RULE', 'RECOGNITION', 'ACHIEVEMENT', 'GOAL', 'REDEMPTION', 'REFUND', 'PURCHASE', 'ADJUST')),
  rule_code text,
  -- Evita pagar dos veces lo mismo (ej. TASK_ON_TIME:12:34).
  ref_key text unique,
  reason text not null check (char_length(reason) <= 200),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_point_ledger_student on public.point_ledger(student_id, created_at desc);

create table if not exists public.student_wallets (
  student_id bigint primary key references public.students(id) on delete cascade,
  xp integer not null default 0 check (xp >= 0),
  coins integer not null default 0 check (coins >= 0),
  best_streak integer not null default 0,
  updated_at timestamptz not null default now()
);

create or replace function public.apply_point_ledger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Primero se intenta sumar al saldo existente (un INSERT con monedas negativas
  -- fallaría por el CHECK aunque luego se convirtiera en UPDATE).
  update public.student_wallets
  set xp = xp + new.xp, coins = coins + new.coins, updated_at = now()
  where student_id = new.student_id;
  if not found then
    insert into public.student_wallets (student_id, xp, coins)
    values (new.student_id, new.xp, new.coins)
    on conflict (student_id) do update
      set xp = student_wallets.xp + excluded.xp,
          coins = student_wallets.coins + excluded.coins,
          updated_at = now();
  end if;
  return new;
exception when check_violation then
  raise exception 'No tienes monedas suficientes.';
end;
$$;

drop trigger if exists trg_point_ledger_wallet on public.point_ledger;
create trigger trg_point_ledger_wallet
after insert on public.point_ledger
for each row execute function public.apply_point_ledger();

create table if not exists public.recognitions (
  id bigint generated always as identity primary key,
  student_id bigint not null references public.students(id) on delete cascade,
  given_by uuid not null references public.profiles(id),
  category_id bigint not null references public.recognition_categories(id),
  reason text not null check (char_length(btrim(reason)) between 5 and 200),
  xp integer not null default 0,
  coins integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_recognitions_student on public.recognitions(student_id, created_at desc);
create index if not exists idx_recognitions_giver on public.recognitions(given_by, created_at desc);

create table if not exists public.attendance_months (
  student_id bigint not null references public.students(id) on delete cascade,
  month date not null check (extract(day from month) = 1),
  school_days integer not null,
  present_days integer not null,
  late_days integer not null,
  perfect_attendance boolean not null,
  perfect_punctuality boolean not null,
  computed_at timestamptz not null default now(),
  primary key (student_id, month)
);

-- ----------------------------------------------------------------------------
-- 3) Logros
-- ----------------------------------------------------------------------------
create table if not exists public.achievements (
  id bigint generated always as identity primary key,
  code text not null unique check (code ~ '^[A-Z0-9_]{3,40}$'),
  name text not null check (char_length(btrim(name)) between 2 and 60),
  description text not null default '' check (char_length(description) <= 200),
  icon text not null default 'Trophy' check (char_length(icon) <= 30),
  rarity text not null default 'BRONZE' check (rarity in ('BRONZE', 'SILVER', 'GOLD', 'PLATINUM')),
  is_secret boolean not null default false,
  -- De temporada: la condición se cuenta dentro del bimestre en curso y se gana una vez por bimestre.
  is_seasonal boolean not null default false,
  condition_type text not null default 'MANUAL' check (condition_type in (
    'MANUAL', 'TASKS_ON_TIME', 'TASKS_HIGH', 'STREAK', 'RECOGNITIONS',
    'MONTH_ATTENDANCE', 'MONTH_PUNCTUALITY', 'LEVEL', 'EARLY_TASKS'
  )),
  threshold integer not null default 1 check (threshold between 1 and 100000),
  reward_xp integer not null default 0 check (reward_xp between 0 and 2000),
  reward_coins integer not null default 0 check (reward_coins between 0 and 2000),
  is_active boolean not null default true,
  sort smallint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.achievements (code, name, description, icon, rarity, is_secret, is_seasonal, condition_type, threshold, reward_xp, reward_coins, sort) values
  ('PRIMERA_ENTREGA', 'Primer paso', 'Entrega tu primera tarea a tiempo.', 'Rocket', 'BRONZE', false, false, 'TASKS_ON_TIME', 1, 10, 5, 1),
  ('PUNTUAL_10', 'Siempre a tiempo', 'Entrega 10 tareas a tiempo.', 'Clock', 'SILVER', false, false, 'TASKS_ON_TIME', 10, 30, 10, 2),
  ('PUNTUAL_50', 'Máquina de entregas', 'Entrega 50 tareas a tiempo.', 'Zap', 'GOLD', false, false, 'TASKS_ON_TIME', 50, 80, 30, 3),
  ('RACHA_5', 'En racha', 'Entrega 5 tareas seguidas a tiempo, sin saltarte ninguna.', 'Flame', 'BRONZE', false, false, 'STREAK', 5, 20, 10, 4),
  ('RACHA_15', 'Imparable', 'Entrega 15 tareas seguidas a tiempo.', 'Flame', 'GOLD', false, false, 'STREAK', 15, 80, 30, 5),
  ('LOGRO_5', 'Buen nivel', 'Obtén A o AD en 5 tareas.', 'Star', 'BRONZE', false, false, 'TASKS_HIGH', 5, 20, 10, 6),
  ('LOGRO_20', 'Mente brillante', 'Obtén A o AD en 20 tareas.', 'Sparkles', 'SILVER', false, false, 'TASKS_HIGH', 20, 50, 20, 7),
  ('RECONOCIDO', 'Reconocido', 'Recibe tu primer reconocimiento de un docente.', 'Heart', 'BRONZE', false, false, 'RECOGNITIONS', 1, 10, 5, 8),
  ('EJEMPLO_AULA', 'Ejemplo del aula', 'Recibe 10 reconocimientos de tus docentes.', 'Crown', 'GOLD', false, false, 'RECOGNITIONS', 10, 80, 30, 9),
  ('ASISTENCIA_PERFECTA', 'Asistencia perfecta', 'Asiste todos los días de clase de un mes.', 'CalendarCheck', 'SILVER', false, false, 'MONTH_ATTENDANCE', 1, 30, 15, 10),
  ('RELOJ_SUIZO', 'Reloj suizo', 'Completa 3 meses sin tardanzas.', 'Clock', 'GOLD', false, false, 'MONTH_PUNCTUALITY', 3, 80, 30, 11),
  ('NIVEL_5', 'Nivel 5', 'Alcanza el nivel 5.', 'Medal', 'SILVER', false, false, 'LEVEL', 5, 0, 20, 12),
  ('BIMESTRE_CONSTANTE', 'Bimestre constante', 'Entrega 12 tareas a tiempo dentro del bimestre.', 'Target', 'SILVER', false, true, 'TASKS_ON_TIME', 12, 40, 15, 13),
  ('MADRUGADOR', 'Madrugador', 'Entrega 5 tareas con más de un día de anticipación.', 'Sunrise', 'SILVER', true, false, 'EARLY_TASKS', 5, 30, 15, 14),
  ('BOBINA_TESLA', 'Bobina de Tesla', 'Alcanza el nivel 10.', 'Zap', 'PLATINUM', true, false, 'LEVEL', 10, 0, 50, 15),
  ('CORAZON_TESLA', 'Corazón Tesla', 'Lo otorga un docente o la dirección por un acto que refleja los valores del colegio.', 'Gem', 'PLATINUM', false, false, 'MANUAL', 1, 100, 40, 16)
on conflict (code) do nothing;

create table if not exists public.student_achievements (
  id bigint generated always as identity primary key,
  achievement_id bigint not null references public.achievements(id) on delete cascade,
  student_id bigint not null references public.students(id) on delete cascade,
  period_id bigint references public.grading_periods(id) on delete cascade,
  awarded_by uuid references public.profiles(id) on delete set null,
  note text check (note is null or char_length(note) <= 200),
  earned_at timestamptz not null default now()
);

create unique index if not exists idx_student_achievements_unique
  on public.student_achievements(achievement_id, student_id, coalesce(period_id, 0));
create index if not exists idx_student_achievements_student on public.student_achievements(student_id, earned_at desc);

-- ----------------------------------------------------------------------------
-- 4) Personalización
-- ----------------------------------------------------------------------------
create table if not exists public.cosmetics (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('AVATAR', 'FRAME', 'BANNER', 'TITLE')),
  name text not null check (char_length(btrim(name)) between 2 and 40),
  -- AVATAR: un emoji · FRAME: none, bronze, silver, gold, platinum, spark, coil
  -- BANNER: dos colores "#RRGGBB,#RRGGBB" · TITLE: el texto del título
  value text not null check (char_length(value) between 1 and 60),
  rarity text not null default 'BRONZE' check (rarity in ('BRONZE', 'SILVER', 'GOLD', 'PLATINUM')),
  unlock_type text not null default 'DEFAULT' check (unlock_type in ('DEFAULT', 'LEVEL', 'ACHIEVEMENT', 'PURCHASE')),
  unlock_level integer check (unlock_level is null or unlock_level between 2 and 100),
  unlock_achievement_id bigint references public.achievements(id) on delete set null,
  price_coins integer check (price_coins is null or price_coins between 1 and 100000),
  is_active boolean not null default true,
  sort smallint not null default 1,
  created_at timestamptz not null default now(),
  unique (kind, name),
  constraint cosmetics_unlock_check check (
    unlock_type = 'DEFAULT'
    or (unlock_type = 'LEVEL' and unlock_level is not null)
    or (unlock_type = 'ACHIEVEMENT' and unlock_achievement_id is not null)
    or (unlock_type = 'PURCHASE' and price_coins is not null)
  ),
  constraint cosmetics_banner_check check (kind <> 'BANNER' or value ~ '^#[0-9A-Fa-f]{6},#[0-9A-Fa-f]{6}$'),
  constraint cosmetics_frame_check check (kind <> 'FRAME' or value in ('none', 'bronze', 'silver', 'gold', 'platinum', 'spark', 'coil'))
);

insert into public.cosmetics (kind, name, value, rarity, unlock_type, unlock_level, unlock_achievement_id, price_coins, sort)
select c.kind, c.name, c.value, c.rarity, c.unlock_type, c.lvl, a.id, c.price, c.sort
from (values
  ('AVATAR', 'Chispa', '⚡', 'BRONZE', 'DEFAULT', null, null, null, 1),
  ('AVATAR', 'Búho', '🦉', 'BRONZE', 'DEFAULT', null, null, null, 2),
  ('AVATAR', 'Panda', '🐼', 'BRONZE', 'DEFAULT', null, null, null, 3),
  ('AVATAR', 'Zorro', '🦊', 'BRONZE', 'DEFAULT', null, null, null, 4),
  ('AVATAR', 'Gato', '🐱', 'BRONZE', 'DEFAULT', null, null, null, 5),
  ('AVATAR', 'Perro', '🐶', 'BRONZE', 'DEFAULT', null, null, null, 6),
  ('AVATAR', 'Cohete', '🚀', 'SILVER', 'LEVEL', 3, null, null, 7),
  ('AVATAR', 'León', '🦁', 'SILVER', 'LEVEL', 5, null, null, 8),
  ('AVATAR', 'Dragón', '🐉', 'GOLD', 'LEVEL', 8, null, null, 9),
  ('AVATAR', 'Robot', '🤖', 'GOLD', 'ACHIEVEMENT', null, 'RACHA_15', null, 10),
  ('AVATAR', 'Llama', '🦙', 'SILVER', 'PURCHASE', null, null, 40, 11),
  ('AVATAR', 'Pingüino', '🐧', 'SILVER', 'PURCHASE', null, null, 40, 12),
  ('AVATAR', 'Control', '🎮', 'SILVER', 'PURCHASE', null, null, 50, 13),
  ('AVATAR', 'Unicornio', '🦄', 'GOLD', 'PURCHASE', null, null, 60, 14),
  ('AVATAR', 'Dino', '🦖', 'GOLD', 'PURCHASE', null, null, 80, 15),
  ('FRAME', 'Sin marco', 'none', 'BRONZE', 'DEFAULT', null, null, null, 1),
  ('FRAME', 'Bronce', 'bronze', 'BRONZE', 'LEVEL', 2, null, null, 2),
  ('FRAME', 'Plata', 'silver', 'SILVER', 'LEVEL', 4, null, null, 3),
  ('FRAME', 'Oro', 'gold', 'GOLD', 'LEVEL', 7, null, null, 4),
  ('FRAME', 'Platino', 'platinum', 'PLATINUM', 'ACHIEVEMENT', null, 'BOBINA_TESLA', null, 5),
  ('FRAME', 'Chispa', 'spark', 'SILVER', 'PURCHASE', null, null, 80, 6),
  ('FRAME', 'Bobina', 'coil', 'GOLD', 'PURCHASE', null, null, 150, 7),
  ('BANNER', 'Tinta y oro', '#0B1D33,#F0B429', 'BRONZE', 'DEFAULT', null, null, null, 1),
  ('BANNER', 'Cielo', '#1C5CAB,#86B6EF', 'BRONZE', 'DEFAULT', null, null, null, 2),
  ('BANNER', 'Bosque', '#14532D,#4ADE80', 'SILVER', 'LEVEL', 3, null, null, 3),
  ('BANNER', 'Atardecer', '#7C2D12,#FB923C', 'SILVER', 'LEVEL', 6, null, null, 4),
  ('BANNER', 'Oro puro', '#A16207,#FDE047', 'GOLD', 'ACHIEVEMENT', null, 'RELOJ_SUIZO', null, 5),
  ('BANNER', 'Andes', '#334155,#CBD5E1', 'SILVER', 'PURCHASE', null, null, 70, 6),
  ('BANNER', 'Galaxia', '#1E1B4B,#A855F7', 'GOLD', 'PURCHASE', null, null, 100, 7),
  ('TITLE', 'Aprendiz', 'Aprendiz', 'BRONZE', 'DEFAULT', null, null, null, 1),
  ('TITLE', 'Explorador', 'Explorador', 'BRONZE', 'LEVEL', 3, null, null, 2),
  ('TITLE', 'Constante', 'Constante', 'SILVER', 'ACHIEVEMENT', null, 'RACHA_5', null, 3),
  ('TITLE', 'Puntual', 'Puntual', 'GOLD', 'ACHIEVEMENT', null, 'RELOJ_SUIZO', null, 4),
  ('TITLE', 'Mente brillante', 'Mente brillante', 'SILVER', 'ACHIEVEMENT', null, 'LOGRO_20', null, 5),
  ('TITLE', 'Compañero ejemplar', 'Compañero ejemplar', 'GOLD', 'ACHIEVEMENT', null, 'EJEMPLO_AULA', null, 6),
  ('TITLE', 'Sabio del aula', 'Sabio del aula', 'GOLD', 'LEVEL', 10, null, null, 7),
  ('TITLE', 'Leyenda Tesla', 'Leyenda Tesla', 'PLATINUM', 'ACHIEVEMENT', null, 'BOBINA_TESLA', null, 8),
  ('TITLE', 'Inventor', 'Inventor', 'GOLD', 'PURCHASE', null, null, 120, 9)
) as c(kind, name, value, rarity, unlock_type, lvl, ach_code, price, sort)
left join public.achievements a on a.code = c.ach_code
on conflict (kind, name) do nothing;

create table if not exists public.student_cosmetics (
  student_id bigint not null references public.students(id) on delete cascade,
  cosmetic_id bigint not null references public.cosmetics(id) on delete cascade,
  acquired_at timestamptz not null default now(),
  primary key (student_id, cosmetic_id)
);

create table if not exists public.student_profiles (
  student_id bigint primary key references public.students(id) on delete cascade,
  avatar_id bigint references public.cosmetics(id) on delete set null,
  frame_id bigint references public.cosmetics(id) on delete set null,
  banner_id bigint references public.cosmetics(id) on delete set null,
  title_id bigint references public.cosmetics(id) on delete set null,
  featured bigint[] not null default '{}' check (cardinality(featured) <= 3),
  bio text check (bio is null or char_length(bio) <= 140),
  hide_from_rankings boolean not null default false,
  updated_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 5) Tienda de canjes
-- ----------------------------------------------------------------------------
create table if not exists public.rewards (
  id bigint generated always as identity primary key,
  name text not null check (char_length(btrim(name)) between 2 and 80),
  description text check (description is null or char_length(description) <= 500),
  kind text not null default 'PRIVILEGE' check (kind in ('PRIVILEGE', 'PHYSICAL')),
  price_coins integer not null check (price_coins between 1 and 100000),
  -- null = ilimitado (solo privilegios). Se descuenta al solicitar y vuelve si se rechaza o vence.
  stock integer check (stock is null or stock >= 0),
  per_student_limit integer check (per_student_limit is null or per_student_limit between 1 and 100),
  image_path text,
  level text check (level is null or level in ('Inicial', 'Primaria', 'Secundaria')),
  starts_on date,
  ends_on date,
  is_active boolean not null default true,
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rewards_physical_stock_check check (kind <> 'PHYSICAL' or stock is not null),
  constraint rewards_dates_check check (ends_on is null or starts_on is null or ends_on >= starts_on)
);

create table if not exists public.reward_requests (
  id bigint generated always as identity primary key,
  reward_id bigint not null references public.rewards(id) on delete restrict,
  student_id bigint not null references public.students(id) on delete cascade,
  reward_name text not null,
  reward_kind text not null,
  price integer not null,
  status text not null default 'PENDING' check (status in ('PENDING', 'APPROVED', 'REJECTED', 'DELIVERED', 'EXPIRED', 'CANCELLED')),
  note text check (note is null or char_length(note) <= 200),
  requested_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  decided_by uuid references public.profiles(id) on delete set null,
  decided_at timestamptz,
  decision_reason text check (decision_reason is null or char_length(decision_reason) <= 300),
  delivered_by uuid references public.profiles(id) on delete set null,
  delivered_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists idx_reward_requests_student on public.reward_requests(student_id, created_at desc);
create index if not exists idx_reward_requests_status on public.reward_requests(status, created_at);

-- ----------------------------------------------------------------------------
-- 6) Metas cooperativas de aula
-- ----------------------------------------------------------------------------
create table if not exists public.classroom_goals (
  id bigint generated always as identity primary key,
  classroom_id bigint not null references public.classrooms(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 3 and 100),
  description text check (description is null or char_length(description) <= 300),
  metric text not null check (metric in ('ON_TIME_TASKS', 'ATTENDANCE', 'RECOGNITIONS', 'XP')),
  target integer not null check (target between 1 and 1000000),
  starts_on date not null,
  ends_on date not null,
  reward_text text check (reward_text is null or char_length(reward_text) <= 120),
  reward_xp integer not null default 0 check (reward_xp between 0 and 200),
  reward_coins integer not null default 0 check (reward_coins between 0 and 100),
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'COMPLETED', 'CANCELLED')),
  completed_at timestamptz,
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  check (ends_on >= starts_on)
);

create index if not exists idx_classroom_goals_classroom on public.classroom_goals(classroom_id, status);

-- updated_at
do $$
declare
  t text;
begin
  foreach t in array array['tesla_settings', 'point_rules', 'achievements', 'rewards', 'reward_requests'] loop
    execute format('drop trigger if exists trg_%1$s_updated_at on public.%1$I', t);
    execute format('create trigger trg_%1$s_updated_at before update on public.%1$I for each row execute function public.set_updated_at()', t);
  end loop;
end $$;

-- Avisos push del Perfil Tesla.
alter table public.push_outbox drop constraint if exists push_outbox_kind_check;
alter table public.push_outbox add constraint push_outbox_kind_check
  check (kind in ('ASSIGNMENT', 'GRADE', 'LATE', 'CIRCULAR', 'MESSAGE', 'DIGEST', 'TEST', 'TESLA'));

-- ----------------------------------------------------------------------------
-- 7) Funciones internas (no se exponen a la app)
-- ----------------------------------------------------------------------------
create or replace function public.tesla_today()
returns date
language sql
stable
as $$ select (now() at time zone 'America/Lima')::date $$;

-- Inicio del día (hora de Lima) como timestamptz.
create or replace function public.tesla_day_start(p_day date)
returns timestamptz
language sql
immutable
as $$ select p_day::timestamp at time zone 'America/Lima' $$;

create or replace function public.tesla_level(p_xp integer)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select greatest(1, floor((1 + sqrt(1 + 8.0 * greatest(p_xp, 0) / s.level_step)) / 2 + 1e-9)::int)
  from public.tesla_settings s where s.id = 1
$$;

-- XP con la que empieza un nivel.
create or replace function public.tesla_level_xp(p_level integer)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select (s.level_step * greatest(p_level, 1)::bigint * (greatest(p_level, 1) - 1) / 2)::int
  from public.tesla_settings s where s.id = 1
$$;

-- Bimestre en curso del año actual (o null en vacaciones).
create or replace function public.tesla_current_period()
returns public.grading_periods
language sql
stable
security definer
set search_path = public
as $$
  select gp.*
  from public.grading_periods gp
  join public.academic_years y on y.id = gp.academic_year_id and y.is_current
  where public.tesla_today() between gp.starts_on and gp.ends_on
  order by gp.number
  limit 1
$$;

create or replace function public.tesla_push(p_student_id bigint, p_title text, p_body text, p_url text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.queue_push(array(select public.family_profile_ids(p_student_id, true)), 'TESLA', p_title, p_body, p_url);
exception when others then
  raise warning '[tesla_push] %', sqlerrm;
end;
$$;

-- Registra un movimiento. Devuelve false si ya existía (misma ref_key).
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
      perform public.tesla_push(p_student_id, '¡Nivel ' || v_level_after || '!',
        public.student_first_name(p_student_id) || ' subió al nivel ' || v_level_after || ' en su Perfil Tesla.',
        '/perfil-tesla?hijo=' || p_student_id);
    end if;
  end if;
  return true;
end;
$$;

-- Aplica una regla automática si está activa.
create or replace function public.tesla_rule_award(p_student_id bigint, p_rule_code text, p_ref_key text, p_reason text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.point_rules%rowtype;
begin
  select * into r from public.point_rules where code = p_rule_code and is_active;
  if not found then
    return false;
  end if;
  return public.tesla_award(p_student_id, r.xp, r.coins, 'RULE', r.code, p_ref_key, coalesce(p_reason, r.name));
end;
$$;

-- Racha actual: tareas seguidas a tiempo, de la más reciente hacia atrás.
-- Cuentan las tareas ya vencidas y las que ya entregó aunque no hayan vencido.
create or replace function public.tesla_current_streak(p_student_id bigint)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  with a as (
    select asg.due_at, sb.id as sid, sb.is_late
    from public.students st
    join public.course_offerings o on o.classroom_id = st.classroom_id and o.is_active
    join public.assignments asg on asg.offering_id = o.id
    left join public.submissions sb on sb.assignment_id = asg.id and sb.student_id = st.id
    where st.id = p_student_id
      and asg.status in ('PUBLISHED', 'CLOSED')
      and asg.due_at is not null
      and (asg.due_at < now() or sb.id is not null)
  ),
  marked as (
    select sum(case when sid is not null and not is_late then 0 else 1 end)
             over (order by due_at desc rows unbounded preceding) as breaks
    from a
  )
  select count(*)::int from marked where breaks = 0
$$;

-- Estadísticas del alumno en un rango (para logros y progreso).
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
                        and public.tesla_day_start(m.month) >= p_from and public.tesla_day_start(m.month) < p_to)
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
    when 'STREAK' then (select coalesce(max(w.best_streak), 0) from public.student_wallets w where w.student_id = p_student_id)
    when 'LEVEL' then public.tesla_level(coalesce((select w.xp from public.student_wallets w where w.student_id = p_student_id), 0))
    else 0
  end
$$;

-- Otorga un logro (si no lo tiene) con su premio y aviso. Devuelve true si lo otorgó.
create or replace function public.tesla_grant_achievement(p_achievement_id bigint, p_student_id bigint, p_period_id bigint, p_by uuid, p_note text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  a public.achievements%rowtype;
  v_id bigint;
begin
  select * into a from public.achievements where id = p_achievement_id;
  insert into public.student_achievements (achievement_id, student_id, period_id, awarded_by, note)
  values (p_achievement_id, p_student_id, p_period_id, p_by, nullif(btrim(coalesce(p_note, '')), ''))
  on conflict do nothing
  returning id into v_id;
  if v_id is null then
    return false;
  end if;
  perform public.tesla_award(p_student_id, a.reward_xp, a.reward_coins, 'ACHIEVEMENT', null,
    'ACH:' || a.id || ':' || p_student_id || ':' || coalesce(p_period_id, 0), 'Logro: ' || a.name, p_by);
  perform public.tesla_push(p_student_id,
    case a.rarity when 'PLATINUM' then '¡Logro platino!' when 'GOLD' then '¡Logro de oro!' when 'SILVER' then '¡Logro de plata!' else '¡Nuevo logro!' end,
    public.student_first_name(p_student_id) || ' desbloqueó «' || a.name || '».',
    '/perfil-tesla?hijo=' || p_student_id);
  return true;
end;
$$;

-- Revisa los logros automáticos del alumno.
create or replace function public.tesla_evaluate(p_student_id bigint)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_period public.grading_periods;
  v_all jsonb;
  v_season jsonb;
  a record;
  v_granted integer := 0;
  v_round integer;
begin
  v_period := public.tesla_current_period();
  -- Dos vueltas: un logro puede dar XP que sube de nivel y desbloquea otro logro de nivel.
  for v_round in 1..2 loop
    v_all := public.tesla_stats_range(p_student_id, '-infinity', 'infinity');
    if v_period.id is not null then
      v_season := public.tesla_stats_range(p_student_id, public.tesla_day_start(v_period.starts_on), public.tesla_day_start(v_period.ends_on + 1));
    end if;
    for a in
      select ac.* from public.achievements ac
      where ac.is_active and ac.condition_type <> 'MANUAL'
        and (not ac.is_seasonal or v_period.id is not null)
        and not exists (
          select 1 from public.student_achievements sa
          where sa.achievement_id = ac.id and sa.student_id = p_student_id
            and coalesce(sa.period_id, 0) = case when ac.is_seasonal then v_period.id else 0 end
        )
    loop
      if public.tesla_stat_value(case when a.is_seasonal then v_season else v_all end, a.condition_type, p_student_id) >= a.threshold then
        if public.tesla_grant_achievement(a.id, p_student_id, case when a.is_seasonal then v_period.id end, null, null) then
          v_granted := v_granted + 1;
        end if;
      end if;
    end loop;
  end loop;
  return v_granted;
end;
$$;

-- Progreso de una meta de aula.
create or replace function public.tesla_goal_progress(p_goal_id bigint)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  with g as (select * from public.classroom_goals where id = p_goal_id),
  st as (select s.id from public.students s, g where s.classroom_id = g.classroom_id)
  select case (select metric from g)
    when 'ON_TIME_TASKS' then (
      select count(*) from public.submissions sb, g
      where sb.student_id in (select id from st) and not sb.is_late
        and sb.submitted_at >= public.tesla_day_start(g.starts_on) and sb.submitted_at < public.tesla_day_start(g.ends_on + 1))
    when 'ATTENDANCE' then (
      select count(*) from public.attendance att, g
      where att.student_id in (select id from st) and att.status in ('ON_TIME', 'LATE')
        and att.date between g.starts_on and g.ends_on)
    when 'RECOGNITIONS' then (
      select count(*) from public.recognitions r, g
      where r.student_id in (select id from st)
        and r.created_at >= public.tesla_day_start(g.starts_on) and r.created_at < public.tesla_day_start(g.ends_on + 1))
    when 'XP' then (
      select coalesce(sum(l.xp), 0) from public.point_ledger l, g
      where l.student_id in (select id from st) and l.source in ('RULE', 'RECOGNITION', 'ACHIEVEMENT')
        and l.created_at >= public.tesla_day_start(g.starts_on) and l.created_at < public.tesla_day_start(g.ends_on + 1))
    else 0
  end::int
$$;

-- Marca como cumplidas las metas activas que llegaron a su objetivo y premia a todo el aula.
create or replace function public.tesla_check_goals(p_classroom_id bigint)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  g record;
  s record;
  v_done integer := 0;
begin
  for g in
    select * from public.classroom_goals
    where classroom_id = p_classroom_id and status = 'ACTIVE'
      and public.tesla_today() >= starts_on
      and public.tesla_today() <= ends_on + 1
    for update skip locked
  loop
    if public.tesla_goal_progress(g.id) >= g.target then
      update public.classroom_goals set status = 'COMPLETED', completed_at = now() where id = g.id;
      v_done := v_done + 1;
      for s in select id from public.students where classroom_id = p_classroom_id loop
        perform public.tesla_award(s.id, g.reward_xp, g.reward_coins, 'GOAL', null,
          'GOAL:' || g.id || ':' || s.id, 'Meta del aula: ' || g.title);
        perform public.tesla_push(s.id, '¡Meta del aula cumplida!',
          g.title || coalesce('. Premio: ' || g.reward_text, '') || '.', '/perfil-tesla?vista=aula&hijo=' || s.id);
      end loop;
    end if;
  end loop;
  return v_done;
end;
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'tesla_push(bigint, text, text, text)',
    'tesla_award(bigint, integer, integer, text, text, text, text, uuid)',
    'tesla_rule_award(bigint, text, text, text)',
    'tesla_grant_achievement(bigint, bigint, bigint, uuid, text)',
    'tesla_evaluate(bigint)',
    'tesla_check_goals(bigint)',
    'tesla_stats_range(bigint, timestamptz, timestamptz)',
    'tesla_stat_value(jsonb, text, bigint)',
    'tesla_current_streak(bigint)',
    'tesla_goal_progress(bigint)',
    'apply_point_ledger()'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
  end loop;
end $$;

grant execute on function public.tesla_level(integer) to authenticated;
grant execute on function public.tesla_level_xp(integer) to authenticated;
grant execute on function public.tesla_current_period() to authenticated;

-- ----------------------------------------------------------------------------
-- 8) Puntos automáticos: entregas y calificaciones
-- ----------------------------------------------------------------------------
create or replace function public.tesla_on_submission()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  a record;
  v_streak integer;
  v_len integer;
  v_min numeric;
  v_title text;
  v_paid boolean;
begin
  select asg.title, asg.grading_type, asg.max_score, o.classroom_id
  into a
  from public.assignments asg join public.course_offerings o on o.id = asg.offering_id
  where asg.id = new.assignment_id;
  v_title := left(a.title, 120);

  -- Cada paso va en su propio bloque: si uno falla, los demás igual se aplican.
  -- Entrega a tiempo (primera entrega o reenvío tras devolución) y racha.
  if new.status = 'SUBMITTED' and not new.is_late
     and (tg_op = 'INSERT' or old.status is distinct from 'SUBMITTED') then
    begin
      v_paid := public.tesla_rule_award(new.student_id, 'TASK_ON_TIME',
        'TASK_ON_TIME:' || new.assignment_id || ':' || new.student_id, 'A tiempo: ' || v_title);
    exception when others then
      raise warning '[tesla_on_submission:on_time] %', sqlerrm;
    end;
    begin
      v_streak := public.tesla_current_streak(new.student_id);
      update public.student_wallets set best_streak = greatest(best_streak, v_streak) where student_id = new.student_id;
      select greatest(coalesce((params ->> 'length')::int, 5), 2) into v_len from public.point_rules where code = 'STREAK';
      if v_len is not null and v_streak > 0 and v_streak % v_len = 0 then
        perform public.tesla_rule_award(new.student_id, 'STREAK',
          'STREAK:' || new.student_id || ':' || new.assignment_id, 'Racha de ' || v_streak || ' tareas a tiempo');
      end if;
    exception when others then
      raise warning '[tesla_on_submission:streak] %', sqlerrm;
    end;
  end if;

  -- Calificación A / AD (o nota alta).
  if new.status = 'GRADED' and (tg_op = 'INSERT' or old.status is distinct from 'GRADED'
                                or old.score is distinct from new.score or old.level is distinct from new.level) then
    begin
      select coalesce((params ->> 'min_score20')::numeric, 14) into v_min from public.point_rules where code = 'TASK_HIGH';
      if (a.grading_type = 'LEVEL' and new.level in ('A', 'AD'))
         or (a.grading_type = 'SCORE' and new.score is not null and new.score / a.max_score * 20 >= coalesce(v_min, 14)) then
        perform public.tesla_rule_award(new.student_id, 'TASK_HIGH',
          'TASK_HIGH:' || new.assignment_id || ':' || new.student_id, 'Buen logro: ' || v_title);
      end if;
    exception when others then
      raise warning '[tesla_on_submission:grade] %', sqlerrm;
    end;
  end if;

  begin
    perform public.tesla_evaluate(new.student_id);
  exception when others then
    raise warning '[tesla_on_submission:achievements] %', sqlerrm;
  end;
  begin
    perform public.tesla_check_goals(a.classroom_id);
  exception when others then
    raise warning '[tesla_on_submission:goals] %', sqlerrm;
  end;
  return null;
exception when others then
  raise warning '[tesla_on_submission] %', sqlerrm;
  return null;
end;
$$;

revoke all on function public.tesla_on_submission() from public, anon, authenticated;

drop trigger if exists trg_submissions_tesla on public.submissions;
create trigger trg_submissions_tesla
after insert or update of status, score, level on public.submissions
for each row execute function public.tesla_on_submission();

-- ----------------------------------------------------------------------------
-- 9) Asistencia y puntualidad del mes (datos de Tesla)
--    Se ejecuta el 1.° de cada mes con pg_cron o con el botón de dirección.
-- ----------------------------------------------------------------------------
create or replace function public.tesla_close_month(p_month date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_from date := date_trunc('month', p_month)::date;
  v_to date := (date_trunc('month', p_month) + interval '1 month - 1 day')::date;
  v_days integer;
  v_att_min numeric;
  v_punct_min numeric;
  v_key text := to_char(date_trunc('month', p_month), 'YYYY-MM');
  v_label text;
  s record;
  v_pct numeric;
  v_att integer := 0;
  v_punct integer := 0;
  v_students integer := 0;
begin
  if not (public.is_admin() or public.is_trusted_backend()) then
    raise exception 'Solo administración o dirección pueden cerrar el mes.';
  end if;
  if v_to >= public.tesla_today() then
    raise exception 'El mes todavía no termina.';
  end if;
  v_days := public.school_days_between(v_from, v_to);
  if v_days = 0 then
    return jsonb_build_object('month', v_key, 'school_days', 0, 'students', 0, 'attendance', 0, 'punctuality', 0);
  end if;
  select coalesce((params ->> 'min_pct')::numeric, 100) into v_att_min from public.point_rules where code = 'MONTH_ATTENDANCE';
  select coalesce((params ->> 'min_pct')::numeric, 90) into v_punct_min from public.point_rules where code = 'MONTH_PUNCTUALITY';
  v_label := (array['enero','febrero','marzo','abril','mayo','junio','julio','agosto','setiembre','octubre','noviembre','diciembre'])[extract(month from v_from)::int];

  for s in
    select st.id,
           count(distinct att.date) filter (where att.status in ('ON_TIME', 'LATE') and extract(isodow from att.date) between 1 and 5)::int as present,
           count(distinct att.date) filter (where att.status = 'LATE')::int as late
    from public.students st
    left join public.attendance att on att.student_id = st.id and att.date between v_from and v_to
    where st.classroom_id is not null
    group by st.id
  loop
    v_students := v_students + 1;
    v_pct := least(s.present, v_days) * 100.0 / v_days;
    insert into public.attendance_months (student_id, month, school_days, present_days, late_days, perfect_attendance, perfect_punctuality)
    values (s.id, v_from, v_days, s.present, s.late, v_pct >= coalesce(v_att_min, 100), s.late = 0 and v_pct >= coalesce(v_punct_min, 90))
    on conflict (student_id, month) do update
      set school_days = excluded.school_days, present_days = excluded.present_days, late_days = excluded.late_days,
          perfect_attendance = excluded.perfect_attendance, perfect_punctuality = excluded.perfect_punctuality, computed_at = now();

    if v_pct >= coalesce(v_att_min, 100) then
      v_att := v_att + 1;
      perform public.tesla_rule_award(s.id, 'MONTH_ATTENDANCE', 'MONTH_ATTENDANCE:' || s.id || ':' || v_key, 'Asistencia de ' || v_label);
    end if;
    if s.late = 0 and v_pct >= coalesce(v_punct_min, 90) then
      v_punct := v_punct + 1;
      perform public.tesla_rule_award(s.id, 'MONTH_PUNCTUALITY', 'MONTH_PUNCTUALITY:' || s.id || ':' || v_key, 'Puntualidad de ' || v_label);
    end if;
    perform public.tesla_evaluate(s.id);
  end loop;

  return jsonb_build_object('month', v_key, 'school_days', v_days, 'students', v_students, 'attendance', v_att, 'punctuality', v_punct);
end;
$$;

-- ----------------------------------------------------------------------------
-- 10) Acceso
-- ----------------------------------------------------------------------------
-- ¿Puede ver el perfil público? Personal, sus docentes, su familia y su aula.
create or replace function public.can_view_tesla_profile(p_student_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.can_view_student(p_student_id)
    or exists (
      select 1 from public.students me join public.students other on other.classroom_id = me.classroom_id
      where me.id = public.my_self_student_id() and other.id = p_student_id
    )
$$;

-- Tutor del aula del alumno o dirección (aprueban canjes, moderan la bio).
create or replace function public.can_manage_tesla_student(p_student_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin()
    or exists (select 1 from public.students s where s.id = p_student_id and public.is_classroom_tutor(s.classroom_id))
$$;

create or replace function public.tesla_self_student()
returns bigint
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_id bigint := public.my_self_student_id();
begin
  if v_id is null then
    raise exception 'Solo el alumno puede hacer esto desde su cuenta.';
  end if;
  return v_id;
end;
$$;

-- ¿El alumno ya desbloqueó este cosmético?
create or replace function public.tesla_cosmetic_unlocked(p_student_id bigint, p_cosmetic_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.cosmetics c
    where c.id = p_cosmetic_id and c.is_active
      and case c.unlock_type
        when 'DEFAULT' then true
        when 'LEVEL' then public.tesla_level(coalesce((select w.xp from public.student_wallets w where w.student_id = p_student_id), 0)) >= c.unlock_level
        when 'ACHIEVEMENT' then exists (select 1 from public.student_achievements sa where sa.student_id = p_student_id and sa.achievement_id = c.unlock_achievement_id)
        when 'PURCHASE' then exists (select 1 from public.student_cosmetics sc where sc.student_id = p_student_id and sc.cosmetic_id = c.id)
        else false
      end
  )
  -- Lo comprado o ya equipado se conserva aunque cambien las reglas.
  or exists (select 1 from public.student_cosmetics sc where sc.student_id = p_student_id and sc.cosmetic_id = p_cosmetic_id)
$$;

create or replace function public.tesla_default_cosmetic(p_kind text)
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select id from public.cosmetics where kind = p_kind and unlock_type = 'DEFAULT' and is_active order by sort, id limit 1
$$;

-- ----------------------------------------------------------------------------
-- 11) Perfil (lectura)
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

-- Estadísticas para mostrar el avance de los logros.
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
      'level', public.tesla_stat_value(v_all, 'LEVEL', p_student_id)),
    'season', case when v_period.id is null then null
              else public.tesla_stats_range(p_student_id, public.tesla_day_start(v_period.starts_on), public.tesla_day_start(v_period.ends_on + 1)) end,
    'period', case when v_period.id is null then null
              else jsonb_build_object('id', v_period.id, 'name', v_period.name, 'starts_on', v_period.starts_on, 'ends_on', v_period.ends_on) end,
    'secret_total', (select count(*) from public.achievements where is_secret and is_active)
  );
end;
$$;

-- Compañeros del aula (tarjetas). El personal y los docentes ven además XP y monedas.
create or replace function public.tesla_classroom_profiles(p_classroom_id bigint)
returns table (
  student_id bigint,
  first_name text,
  last_name text,
  level integer,
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

-- Ranking opcional de constancia o mejora (nunca de notas) del bimestre en curso.
-- Constancia: XP de entregas a tiempo, rachas, asistencia y puntualidad.
-- Mejora: esa misma XP comparada con el bimestre anterior.
create or replace function public.tesla_constancy_board(p_classroom_id bigint, p_mode text default 'CONSTANCY')
returns table (
  rank integer,
  student_id bigint,
  first_name text,
  last_name text,
  avatar text,
  frame text,
  points integer,
  previous integer,
  is_mine boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_period public.grading_periods;
  v_prev public.grading_periods;
  v_full boolean := public.is_staff() or p_classroom_id in (select public.teacher_classroom_ids())
                    or exists (select 1 from public.students s where s.id = public.my_self_student_id() and s.classroom_id = p_classroom_id);
  v_family boolean := exists (select 1 from public.students s where s.id in (select public.my_children_ids()) and s.classroom_id = p_classroom_id);
begin
  if not v_full and not v_family then
    raise exception 'No puedes ver esta aula.';
  end if;
  if not (select ranking_enabled from public.tesla_settings where id = 1) then
    return;
  end if;
  v_period := public.tesla_current_period();
  if v_period.id is null then
    return;
  end if;
  select * into v_prev from public.grading_periods
  where academic_year_id = v_period.academic_year_id and number = v_period.number - 1;

  return query
  with st as (
    select s.id, s.first_name, s.last_name, p.avatar_id, p.frame_id
    from public.students s
    left join public.student_profiles p on p.student_id = s.id
    where s.classroom_id = p_classroom_id and not coalesce(p.hide_from_rankings, false)
  ),
  pts as (
    select st.*,
      (select coalesce(sum(l.xp), 0) from public.point_ledger l
        where l.student_id = st.id and l.source = 'RULE'
          and l.rule_code in ('TASK_ON_TIME', 'STREAK', 'MONTH_ATTENDANCE', 'MONTH_PUNCTUALITY')
          and l.created_at >= public.tesla_day_start(v_period.starts_on) and l.created_at < public.tesla_day_start(v_period.ends_on + 1))::int as cur,
      case when v_prev.id is null then null else
      (select coalesce(sum(l.xp), 0) from public.point_ledger l
        where l.student_id = st.id and l.source = 'RULE'
          and l.rule_code in ('TASK_ON_TIME', 'STREAK', 'MONTH_ATTENDANCE', 'MONTH_PUNCTUALITY')
          and l.created_at >= public.tesla_day_start(v_prev.starts_on) and l.created_at < public.tesla_day_start(v_prev.ends_on + 1))::int end as prev
    from st
  ),
  ranked as (
    select pts.*,
           (case when p_mode = 'IMPROVEMENT' then pts.cur - coalesce(pts.prev, 0) else pts.cur end) as score,
           rank() over (order by (case when p_mode = 'IMPROVEMENT' then pts.cur - coalesce(pts.prev, 0) else pts.cur end) desc)::int as rk
    from pts
    where pts.cur > 0
  )
  select r.rk, r.id, r.first_name, r.last_name,
         (select c.value from public.cosmetics c where c.id = coalesce(r.avatar_id, public.tesla_default_cosmetic('AVATAR'))),
         (select c.value from public.cosmetics c where c.id = coalesce(r.frame_id, public.tesla_default_cosmetic('FRAME'))),
         r.score, r.prev,
         r.id = public.my_self_student_id() or r.id in (select public.my_children_ids())
  from ranked r
  -- Las familias solo ven la posición de sus hijos, no los nombres de otros alumnos.
  where (v_full and r.rk <= 10) or r.id = public.my_self_student_id() or r.id in (select public.my_children_ids())
  order by r.rk, r.last_name;
end;
$$;

-- ----------------------------------------------------------------------------
-- 12) Acciones del alumno
-- ----------------------------------------------------------------------------
create or replace function public.update_my_tesla_profile(
  p_avatar_id bigint, p_frame_id bigint, p_banner_id bigint, p_title_id bigint,
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
    select * from (values ('AVATAR', p_avatar_id), ('FRAME', p_frame_id), ('BANNER', p_banner_id), ('TITLE', p_title_id)) as x(kind, cid)
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

  insert into public.student_profiles (student_id, avatar_id, frame_id, banner_id, title_id, featured, bio, hide_from_rankings, updated_at)
  values (v_sid, p_avatar_id, p_frame_id, p_banner_id, p_title_id, v_featured, v_bio, coalesce(p_hide_from_rankings, false), now())
  on conflict (student_id) do update
    set avatar_id = excluded.avatar_id, frame_id = excluded.frame_id, banner_id = excluded.banner_id,
        title_id = excluded.title_id, featured = excluded.featured, bio = excluded.bio,
        hide_from_rankings = excluded.hide_from_rankings, updated_at = now();
end;
$$;

create or replace function public.buy_cosmetic(p_cosmetic_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sid bigint := public.tesla_self_student();
  c public.cosmetics%rowtype;
  v_coins integer;
begin
  select * into c from public.cosmetics where id = p_cosmetic_id and is_active;
  if not found or c.unlock_type <> 'PURCHASE' then
    raise exception 'Este cosmético no está a la venta.';
  end if;
  if exists (select 1 from public.student_cosmetics where student_id = v_sid and cosmetic_id = c.id) then
    raise exception 'Ya tienes «%».', c.name;
  end if;
  select coins into v_coins from public.student_wallets where student_id = v_sid for update;
  if coalesce(v_coins, 0) < c.price_coins then
    raise exception 'Te faltan % monedas para «%».', c.price_coins - coalesce(v_coins, 0), c.name;
  end if;
  insert into public.student_cosmetics (student_id, cosmetic_id) values (v_sid, c.id);
  perform public.tesla_award(v_sid, 0, -c.price_coins, 'PURCHASE', null, 'COS:' || v_sid || ':' || c.id, 'Compra: ' || c.name, auth.uid());
end;
$$;

-- ----------------------------------------------------------------------------
-- 13) Reconocimientos y logros manuales
-- ----------------------------------------------------------------------------
create or replace function public.give_recognition(p_student_id bigint, p_category_id bigint, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  cat public.recognition_categories%rowtype;
  cfg public.tesla_settings%rowtype;
  v_reason text := btrim(regexp_replace(coalesce(p_reason, ''), '\s+', ' ', 'g'));
  v_today timestamptz := public.tesla_day_start(public.tesla_today());
  v_id bigint;
  v_teacher text;
  v_classroom bigint;
begin
  select classroom_id into v_classroom from public.students where id = p_student_id;
  if not (public.is_admin() or (public.is_teacher() and v_classroom in (select public.teacher_classroom_ids()))) then
    raise exception 'Solo puedes reconocer a alumnos de tus aulas.';
  end if;
  select * into cat from public.recognition_categories where id = p_category_id and is_active;
  if not found then
    raise exception 'Elige una categoría.';
  end if;
  if char_length(v_reason) < 5 or char_length(v_reason) > 200 then
    raise exception 'Escribe el motivo (entre 5 y 200 caracteres).';
  end if;
  select * into cfg from public.tesla_settings where id = 1;

  -- Bloquea al docente para que dos reconocimientos simultáneos no se salten el tope.
  perform pg_advisory_xact_lock(hashtext('tesla_recognition:' || auth.uid()::text));
  if (select count(*) from public.recognitions where given_by = auth.uid() and created_at >= v_today) >= cfg.teacher_daily_recognitions then
    raise exception 'Llegaste al tope de % reconocimientos por día.', cfg.teacher_daily_recognitions;
  end if;
  if exists (select 1 from public.recognitions where given_by = auth.uid() and student_id = p_student_id and created_at >= v_today) then
    raise exception 'Ya reconociste hoy a %. Podrás hacerlo de nuevo mañana.', public.student_first_name(p_student_id);
  end if;
  if (select count(*) from public.recognitions where student_id = p_student_id and created_at >= v_today) >= cfg.student_daily_recognitions then
    raise exception '% ya recibió % reconocimientos hoy (el tope por alumno).', public.student_first_name(p_student_id), cfg.student_daily_recognitions;
  end if;

  insert into public.recognitions (student_id, given_by, category_id, reason, xp, coins)
  values (p_student_id, auth.uid(), cat.id, v_reason, cat.xp, cat.coins)
  returning id into v_id;

  perform public.tesla_award(p_student_id, cat.xp, cat.coins, 'RECOGNITION', null, 'REC:' || v_id, cat.name || ': ' || v_reason, auth.uid());
  select full_name into v_teacher from public.profiles where id = auth.uid();
  perform public.tesla_push(p_student_id, 'Reconocimiento: ' || cat.name,
    coalesce(v_teacher, 'Tu docente') || ' reconoció a ' || public.student_first_name(p_student_id) || ': ' || left(v_reason, 140),
    '/perfil-tesla?hijo=' || p_student_id);
  perform public.tesla_evaluate(p_student_id);
  perform public.tesla_check_goals(v_classroom);
  return jsonb_build_object('id', v_id, 'xp', cat.xp, 'coins', cat.coins);
end;
$$;

create or replace function public.award_achievement(p_achievement_id bigint, p_student_id bigint, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  a public.achievements%rowtype;
  v_period public.grading_periods;
  v_classroom bigint;
begin
  select * into a from public.achievements where id = p_achievement_id and is_active;
  if not found then
    raise exception 'El logro no existe o está desactivado.';
  end if;
  select classroom_id into v_classroom from public.students where id = p_student_id;
  if not public.is_admin() then
    if not (public.is_teacher() and v_classroom in (select public.teacher_classroom_ids())) then
      raise exception 'Solo puedes otorgar logros a alumnos de tus aulas.';
    end if;
    if a.condition_type <> 'MANUAL' then
      raise exception 'Los docentes solo otorgan logros manuales; este se gana solo.';
    end if;
  end if;
  if a.is_seasonal then
    v_period := public.tesla_current_period();
    if v_period.id is null then
      raise exception 'Este logro es de temporada y ahora no hay un bimestre en curso.';
    end if;
  end if;
  if not public.tesla_grant_achievement(a.id, p_student_id, v_period.id, auth.uid(), left(p_note, 200)) then
    raise exception '% ya tiene este logro.', public.student_first_name(p_student_id);
  end if;
  perform public.tesla_evaluate(p_student_id);
end;
$$;

create or replace function public.clear_tesla_bio(p_student_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.can_manage_tesla_student(p_student_id) then
    raise exception 'Solo el tutor o la dirección pueden hacerlo.';
  end if;
  update public.student_profiles set bio = null, updated_at = now() where student_id = p_student_id;
end;
$$;

create or replace function public.admin_adjust_points(p_student_id bigint, p_xp integer, p_coins integer, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Solo administración o dirección pueden ajustar puntos.';
  end if;
  if coalesce(p_xp, 0) < 0 then
    raise exception 'La XP no se quita: solo se pueden ajustar monedas hacia abajo.';
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 5 then
    raise exception 'Escribe el motivo del ajuste.';
  end if;
  perform public.tesla_award(p_student_id, coalesce(p_xp, 0), coalesce(p_coins, 0), 'ADJUST', null, null, 'Ajuste: ' || btrim(p_reason), auth.uid());
  perform public.tesla_evaluate(p_student_id);
end;
$$;

-- ----------------------------------------------------------------------------
-- 14) Canjes
-- ----------------------------------------------------------------------------
-- Devuelve monedas y stock de una solicitud que no se concretó.
create or replace function public.tesla_release_request(p_request public.reward_requests, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.tesla_award(p_request.student_id, 0, p_request.price, 'REFUND', null, 'REFUND:' || p_request.id,
    'Devolución: ' || p_request.reward_name || ' (' || p_reason || ')');
  update public.rewards set stock = stock + 1 where id = p_request.reward_id and stock is not null;
end;
$$;

revoke all on function public.tesla_release_request(public.reward_requests, text) from public, anon, authenticated;

create or replace function public.expire_reward_requests()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.reward_requests%rowtype;
  v_n integer := 0;
begin
  for r in
    update public.reward_requests
    set status = 'EXPIRED', decided_at = now(), decision_reason = 'Venció sin respuesta'
    where status = 'PENDING' and expires_at < now()
    returning *
  loop
    v_n := v_n + 1;
    perform public.tesla_release_request(r, 'venció');
    perform public.tesla_push(r.student_id, 'Canje vencido', '«' || r.reward_name || '» no se respondió a tiempo. Te devolvimos ' || r.price || ' monedas.',
      '/tienda?hijo=' || r.student_id);
  end loop;
  return v_n;
end;
$$;

create or replace function public.request_reward(p_reward_id bigint, p_note text default null)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sid bigint := public.tesla_self_student();
  rw public.rewards%rowtype;
  v_level text;
  v_classroom bigint;
  v_coins integer;
  v_id bigint;
  v_days integer;
  v_targets uuid[];
  v_name text;
begin
  perform public.expire_reward_requests();
  select * into rw from public.rewards where id = p_reward_id for update;
  if not found or not rw.is_active then
    raise exception 'Esta recompensa no está disponible.';
  end if;
  if (rw.starts_on is not null and public.tesla_today() < rw.starts_on) or (rw.ends_on is not null and public.tesla_today() > rw.ends_on) then
    raise exception 'Esta recompensa no está vigente.';
  end if;
  select c.level, s.classroom_id into v_level, v_classroom
  from public.students s left join public.classrooms c on c.id = s.classroom_id where s.id = v_sid;
  if rw.level is not null and rw.level is distinct from v_level then
    raise exception 'Esta recompensa es para %.', rw.level;
  end if;
  if rw.stock is not null and rw.stock <= 0 then
    raise exception 'Se agotó «%».', rw.name;
  end if;
  if rw.per_student_limit is not null and (
    select count(*) from public.reward_requests
    where reward_id = rw.id and student_id = v_sid and status in ('PENDING', 'APPROVED', 'DELIVERED')
  ) >= rw.per_student_limit then
    raise exception 'Ya canjeaste «%» el máximo de veces permitido (%).', rw.name, rw.per_student_limit;
  end if;
  select coins into v_coins from public.student_wallets where student_id = v_sid for update;
  if coalesce(v_coins, 0) < rw.price_coins then
    raise exception 'Te faltan % monedas.', rw.price_coins - coalesce(v_coins, 0);
  end if;

  select request_expiry_days into v_days from public.tesla_settings where id = 1;
  insert into public.reward_requests (reward_id, student_id, reward_name, reward_kind, price, note, requested_by, expires_at)
  values (rw.id, v_sid, rw.name, rw.kind, rw.price_coins, nullif(left(btrim(coalesce(p_note, '')), 200), ''), auth.uid(), now() + make_interval(days => v_days))
  returning id into v_id;

  if rw.stock is not null then
    update public.rewards set stock = stock - 1 where id = rw.id;
  end if;
  perform public.tesla_award(v_sid, 0, -rw.price_coins, 'REDEMPTION', null, 'REQ:' || v_id, 'Canje: ' || rw.name, auth.uid());

  -- Aviso al tutor (o a la dirección si el aula no tiene tutor).
  select array_agg(id) into v_targets from (
    select c.tutor_id as id from public.classrooms c where c.id = v_classroom and c.tutor_id is not null
  ) t;
  if v_targets is null then
    select array_agg(p.id) into v_targets from public.profiles p where p.role in ('ADMIN', 'MANAGEMENT') and p.is_active;
  end if;
  select btrim(coalesce(first_name, '') || ' ' || coalesce(last_name, '')) into v_name from public.students where id = v_sid;
  begin
    perform public.queue_push(v_targets, 'TESLA', 'Solicitud de canje', v_name || ' pide «' || rw.name || '».', '/tesla/aula?vista=canjes');
  exception when others then
    raise warning '[request_reward push] %', sqlerrm;
  end;
  perform public.tesla_push(v_sid, 'Canje solicitado', '«' || rw.name || '» está esperando aprobación. Reservamos ' || rw.price_coins || ' monedas.',
    '/tienda?hijo=' || v_sid);
  return v_id;
end;
$$;

create or replace function public.cancel_reward_request(p_request_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.reward_requests%rowtype;
begin
  select * into r from public.reward_requests where id = p_request_id for update;
  if not found or r.student_id is distinct from public.my_self_student_id() then
    raise exception 'La solicitud no existe.';
  end if;
  if r.status <> 'PENDING' then
    raise exception 'Solo puedes cancelar una solicitud pendiente.';
  end if;
  update public.reward_requests set status = 'CANCELLED', decided_at = now(), decision_reason = 'Cancelada por el alumno' where id = r.id;
  perform public.tesla_release_request(r, 'cancelado');
end;
$$;

create or replace function public.decide_reward_request(p_request_id bigint, p_approve boolean, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.reward_requests%rowtype;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  perform public.expire_reward_requests();
  select * into r from public.reward_requests where id = p_request_id for update;
  if not found or not public.can_manage_tesla_student(r.student_id) then
    raise exception 'Solo el tutor del aula o la dirección pueden responder este canje.';
  end if;
  if r.status <> 'PENDING' then
    raise exception 'Esta solicitud ya no está pendiente.';
  end if;
  if not p_approve and char_length(coalesce(v_reason, '')) < 3 then
    raise exception 'Escribe el motivo del rechazo.';
  end if;

  update public.reward_requests
  set status = case when p_approve then 'APPROVED' else 'REJECTED' end,
      decided_by = auth.uid(), decided_at = now(), decision_reason = left(v_reason, 300)
  where id = r.id;

  if p_approve then
    perform public.tesla_push(r.student_id, 'Canje aprobado', '«' || r.reward_name || '» fue aprobado.'
      || case when r.reward_kind = 'PHYSICAL' then ' Te avisaremos cuando esté listo para recoger.' else '' end,
      '/tienda?hijo=' || r.student_id);
  else
    perform public.tesla_release_request(r, 'rechazado');
    perform public.tesla_push(r.student_id, 'Canje rechazado', '«' || r.reward_name || '»: ' || left(v_reason, 140) || '. Te devolvimos ' || r.price || ' monedas.',
      '/tienda?hijo=' || r.student_id);
  end if;
end;
$$;

create or replace function public.deliver_reward_request(p_request_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.reward_requests%rowtype;
begin
  select * into r from public.reward_requests where id = p_request_id for update;
  if not found or not public.can_manage_tesla_student(r.student_id) then
    raise exception 'Solo el tutor del aula o la dirección pueden marcar la entrega.';
  end if;
  if r.status <> 'APPROVED' then
    raise exception 'Primero hay que aprobar la solicitud.';
  end if;
  update public.reward_requests set status = 'DELIVERED', delivered_by = auth.uid(), delivered_at = now() where id = r.id;
  perform public.tesla_push(r.student_id, 'Canje entregado', '¡Disfruta «' || r.reward_name || '»!', '/tienda?hijo=' || r.student_id);
end;
$$;

-- ----------------------------------------------------------------------------
-- 15) Metas de aula
-- ----------------------------------------------------------------------------
create or replace function public.save_classroom_goal(
  p_id bigint, p_classroom_id bigint, p_title text, p_description text, p_metric text, p_target integer,
  p_starts_on date, p_ends_on date, p_reward_text text, p_reward_xp integer, p_reward_coins integer
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id bigint := p_id;
  v_classroom bigint := p_classroom_id;
begin
  if v_id is not null then
    select classroom_id into v_classroom from public.classroom_goals where id = v_id and status = 'ACTIVE';
    if v_classroom is null then
      raise exception 'Solo se pueden editar metas activas.';
    end if;
  end if;
  if not (public.is_admin() or public.is_classroom_tutor(v_classroom)) then
    raise exception 'Solo el tutor del aula o la dirección pueden crear metas.';
  end if;
  if v_id is null then
    insert into public.classroom_goals (classroom_id, title, description, metric, target, starts_on, ends_on, reward_text, reward_xp, reward_coins)
    values (v_classroom, btrim(p_title), nullif(btrim(coalesce(p_description, '')), ''), p_metric, p_target, p_starts_on, p_ends_on,
            nullif(btrim(coalesce(p_reward_text, '')), ''), coalesce(p_reward_xp, 0), coalesce(p_reward_coins, 0))
    returning id into v_id;
  else
    update public.classroom_goals
    set title = btrim(p_title), description = nullif(btrim(coalesce(p_description, '')), ''), metric = p_metric, target = p_target,
        starts_on = p_starts_on, ends_on = p_ends_on, reward_text = nullif(btrim(coalesce(p_reward_text, '')), ''),
        reward_xp = coalesce(p_reward_xp, 0), reward_coins = coalesce(p_reward_coins, 0)
    where id = v_id;
  end if;
  perform public.tesla_check_goals(v_classroom);
  return v_id;
end;
$$;

create or replace function public.cancel_classroom_goal(p_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_classroom bigint;
begin
  select classroom_id into v_classroom from public.classroom_goals where id = p_id and status = 'ACTIVE';
  if v_classroom is null or not (public.is_admin() or public.is_classroom_tutor(v_classroom)) then
    raise exception 'Solo el tutor del aula o la dirección pueden cancelar metas activas.';
  end if;
  update public.classroom_goals set status = 'CANCELLED' where id = p_id;
end;
$$;

-- Lista las metas con su avance (y cierra las que se cumplieron).
create or replace function public.tesla_classroom_goals(p_classroom_id bigint)
returns table (
  id bigint,
  title text,
  description text,
  metric text,
  target integer,
  progress integer,
  starts_on date,
  ends_on date,
  reward_text text,
  reward_xp integer,
  reward_coins integer,
  status text,
  completed_at timestamptz,
  can_manage boolean
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if not (public.is_staff()
          or p_classroom_id in (select public.teacher_classroom_ids())
          or p_classroom_id in (select public.family_classroom_ids())) then
    raise exception 'No puedes ver esta aula.';
  end if;
  perform public.tesla_check_goals(p_classroom_id);
  return query
  select g.id, g.title, g.description, g.metric, g.target, public.tesla_goal_progress(g.id),
         g.starts_on, g.ends_on, g.reward_text, g.reward_xp, g.reward_coins, g.status, g.completed_at,
         public.is_admin() or public.is_classroom_tutor(g.classroom_id)
  from public.classroom_goals g
  where g.classroom_id = p_classroom_id and g.status <> 'CANCELLED'
  order by (g.status = 'ACTIVE') desc, g.ends_on desc
  limit 20;
end;
$$;

-- ----------------------------------------------------------------------------
-- 16) Seguridad (RLS)
-- ----------------------------------------------------------------------------
do $$
declare
  t text;
  pol record;
begin
  foreach t in array array[
    'tesla_settings', 'point_rules', 'recognition_categories', 'point_ledger', 'student_wallets',
    'recognitions', 'attendance_months', 'achievements', 'student_achievements', 'cosmetics',
    'student_cosmetics', 'student_profiles', 'rewards', 'reward_requests', 'classroom_goals'
  ] loop
    for pol in select policyname from pg_policies where schemaname = 'public' and tablename = t loop
      execute format('drop policy %I on public.%I', pol.policyname, t);
    end loop;
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- Catálogos: todos leen, dirección edita.
do $$
declare
  t text;
begin
  foreach t in array array['tesla_settings', 'point_rules', 'recognition_categories', 'cosmetics'] loop
    execute format('create policy "authenticated_read" on public.%I for select to authenticated using (true)', t);
    execute format('create policy "admin_write" on public.%I for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()))', t);
  end loop;
end $$;

-- Logros: los secretos solo los ve el personal, los docentes o quien ya los obtuvo.
create policy "view" on public.achievements for select to authenticated
  using (
    not is_secret
    or (select public.is_staff()) or (select public.is_teacher())
    or exists (select 1 from public.student_achievements sa
               where sa.achievement_id = achievements.id and sa.student_id in (select public.my_student_ids()))
  );
create policy "admin_write" on public.achievements for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- Datos de cada alumno: él, su familia, sus docentes y el personal.
-- Se escriben solo con las funciones de este script (no hay políticas de escritura).
create policy "view" on public.point_ledger for select to authenticated using (public.can_view_student(student_id));
create policy "view" on public.student_wallets for select to authenticated using (public.can_view_student(student_id));
create policy "view" on public.recognitions for select to authenticated using (public.can_view_student(student_id));
create policy "view" on public.attendance_months for select to authenticated using (public.can_view_student(student_id));
create policy "view" on public.student_cosmetics for select to authenticated using (public.can_view_student(student_id));
create policy "view" on public.reward_requests for select to authenticated using (public.can_view_student(student_id));
-- Los logros y el perfil también los ven sus compañeros de aula.
create policy "view" on public.student_achievements for select to authenticated using (public.can_view_tesla_profile(student_id));
create policy "view" on public.student_profiles for select to authenticated using (public.can_view_tesla_profile(student_id));

-- Tienda: se ven las recompensas activas; dirección las administra.
create policy "view" on public.rewards for select to authenticated
  using (is_active or (select public.is_admin()));
create policy "admin_write" on public.rewards for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create policy "view" on public.classroom_goals for select to authenticated
  using (
    (select public.is_staff())
    or classroom_id in (select public.teacher_classroom_ids())
    or classroom_id in (select public.family_classroom_ids())
  );

-- ----------------------------------------------------------------------------
-- 17) Imágenes de la tienda (bucket privado; se abren con URL firmada)
--     Ruta: {reward_id}/{archivo}
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('campus-rewards', 'campus-rewards', false, 3145728, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- (Nombres "tesla_" para que el script 04 no las borre si se vuelve a ejecutar.)
drop policy if exists "tesla_rewards_read" on storage.objects;
drop policy if exists "tesla_rewards_insert" on storage.objects;
drop policy if exists "tesla_rewards_update" on storage.objects;
drop policy if exists "tesla_rewards_delete" on storage.objects;

create policy "tesla_rewards_read" on storage.objects for select to authenticated
  using (bucket_id = 'campus-rewards');
create policy "tesla_rewards_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'campus-rewards' and public.is_admin());
create policy "tesla_rewards_update" on storage.objects for update to authenticated
  using (bucket_id = 'campus-rewards' and public.is_admin());
create policy "tesla_rewards_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'campus-rewards' and public.is_admin());

-- ----------------------------------------------------------------------------
-- 18) Permisos de las funciones que llama la app
-- ----------------------------------------------------------------------------
do $$
declare
  f text;
begin
  foreach f in array array[
    'tesla_today()', 'tesla_day_start(date)',
    'can_view_tesla_profile(bigint)', 'can_manage_tesla_student(bigint)', 'tesla_self_student()',
    'tesla_cosmetic_unlocked(bigint, bigint)', 'tesla_default_cosmetic(text)',
    'tesla_profile(bigint)', 'tesla_progress(bigint)', 'tesla_classroom_profiles(bigint)',
    'tesla_constancy_board(bigint, text)', 'update_my_tesla_profile(bigint, bigint, bigint, bigint, bigint[], text, boolean)',
    'buy_cosmetic(bigint)', 'give_recognition(bigint, bigint, text)', 'award_achievement(bigint, bigint, text)',
    'clear_tesla_bio(bigint)', 'admin_adjust_points(bigint, integer, integer, text)',
    'expire_reward_requests()', 'request_reward(bigint, text)', 'cancel_reward_request(bigint)',
    'decide_reward_request(bigint, boolean, text)', 'deliver_reward_request(bigint)',
    'save_classroom_goal(bigint, bigint, text, text, text, integer, date, date, text, integer, integer)',
    'cancel_classroom_goal(bigint)', 'tesla_classroom_goals(bigint)', 'tesla_close_month(date)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- 19) (Opcional) Tareas automáticas con pg_cron
-- ----------------------------------------------------------------------------
-- Cierre del mes anterior: el 1.° de cada mes a las 7:00 a. m. (hora de Lima).
-- select cron.schedule('tesla-close-month', '0 12 1 * *',
--   $$select public.tesla_close_month(((now() at time zone 'America/Lima')::date - interval '1 month')::date)$$);
-- Canjes vencidos: cada hora (también se revisan al abrir la tienda o la bandeja de canjes).
-- select cron.schedule('tesla-expire-requests', '15 * * * *', $$select public.expire_reward_requests()$$);

select 'Perfil Tesla listo' as estado;
