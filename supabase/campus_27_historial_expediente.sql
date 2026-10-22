-- ============================================================================
-- CAMPUS VIRTUAL TESLA · Script 27
-- Historial del Índice Tesla (Retrato Tesla).
--
-- Guarda UNA foto del índice por alumno y por semana (lunes a domingo, hora de
-- Lima) para dibujar la línea de progreso y celebrar cuando sube de rango.
-- La historia empieza cuando se ejecuta este script: no se reconstruye el
-- pasado, y cada semana queda con el último valor visto.
--
--   · expediente_history(alumno): la familia lo llama al abrir el Retrato;
--     guarda la foto de esta semana y devuelve las últimas 30.
--   · expediente_snapshot_all(): foto de todos los alumnos (para pg_cron, ver
--     el bloque comentado del final). Solo dirección o el servidor.
--
-- La tabla no se lee directamente: solo estas funciones, y la familia solo ve
-- a sus propios hijos. Requiere el script 25. Se puede volver a ejecutar.
-- ============================================================================

create table if not exists public.expediente_snapshots (
  student_id bigint not null references public.students(id) on delete cascade,
  week_start date not null,
  score integer not null check (score between 0 and 100),
  parts jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (student_id, week_start)
);

alter table public.expediente_snapshots enable row level security;
revoke all on table public.expediente_snapshots from public, anon, authenticated;

create or replace function public.expediente_week_start()
returns date
language sql
stable
as $$
  select date_trunc('week', now() at time zone 'America/Lima')::date
$$;

-- Guarda la foto de esta semana (si el índice se puede calcular).
create or replace function public.expediente_save_snapshot(p_student_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v jsonb;
  v_score integer;
begin
  v := public.expediente_compute(p_student_id);
  v_score := (v -> 'score' ->> 'value')::integer;
  if v_score is null then
    return;
  end if;
  insert into public.expediente_snapshots (student_id, week_start, score, parts)
  values (p_student_id, public.expediente_week_start(), v_score, coalesce(v -> 'score' -> 'parts', '[]'::jsonb))
  on conflict (student_id, week_start)
  do update set score = excluded.score, parts = excluded.parts, updated_at = now();
end;
$$;

-- La familia: guarda la foto de la semana y devuelve el recorrido.
create or replace function public.expediente_history(p_student_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_student_id is null or p_student_id not in (select public.my_children_ids()) then
    raise exception 'Solo la familia del alumno puede ver su expediente.';
  end if;
  perform public.expediente_save_snapshot(p_student_id);
  return coalesce((
    select jsonb_agg(jsonb_build_object('week', h.week_start, 'score', h.score, 'parts', h.parts) order by h.week_start)
    from (
      select * from public.expediente_snapshots
      where student_id = p_student_id
      order by week_start desc limit 30
    ) h
  ), '[]'::jsonb);
end;
$$;

-- Todos los alumnos con apoderado (para el cierre semanal con pg_cron).
create or replace function public.expediente_snapshot_all()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  n integer := 0;
begin
  if not public.is_trusted_backend() then
    perform public.assert_admin();
  end if;
  for r in select distinct sg.student_id from public.student_guardians sg loop
    begin
      perform public.expediente_save_snapshot(r.student_id);
      n := n + 1;
    exception when others then
      null; -- un alumno con datos raros no detiene a los demás
    end;
  end loop;
  return n;
end;
$$;

revoke all on function public.expediente_week_start() from public, anon;
revoke all on function public.expediente_save_snapshot(bigint) from public, anon, authenticated;
revoke all on function public.expediente_history(bigint) from public, anon;
revoke all on function public.expediente_snapshot_all() from public, anon;
grant execute on function public.expediente_week_start() to authenticated;
grant execute on function public.expediente_history(bigint) to authenticated;
grant execute on function public.expediente_snapshot_all() to authenticated;

-- Opcional: foto de todos los alumnos cada viernes a las 11:00 p. m. (hora de Lima),
-- para que la línea no dependa de que la familia abra el Retrato. Requiere pg_cron.
-- select cron.schedule('campus-expediente-semanal', '0 4 * * 6', $$select public.expediente_snapshot_all()$$);

select 'Historial del Retrato Tesla listo' as estado;
