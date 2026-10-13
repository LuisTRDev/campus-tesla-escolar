-- ============================================================================
-- CAMPUS VIRTUAL TESLA · Pruebas automáticas de las funciones críticas
--
-- Cómo usarlo: pega todo en el SQL Editor y ejecútalo. Corre dentro de una
-- transacción que se deshace al final (ROLLBACK): no cambia ningún dato.
-- Si todo está bien, el resultado final dice "Todas las pruebas pasaron".
-- Si algo falla, se detiene con un mensaje "FALLÓ: …" que indica qué revisar.
--
-- Ejecútalo después de cada cambio en los scripts SQL (y antes de publicar).
-- ============================================================================
begin;

create or replace function pg_temp.check(p_ok boolean, p_name text)
returns void language plpgsql as $$
begin
  if p_ok is not true then
    raise exception 'FALLÓ: %', p_name;
  end if;
  raise notice 'ok: %', p_name;
end $$;

-- ----------------------------------------------------------------------------
-- 1) Niveles, XP y Estrellas Tesla
-- ----------------------------------------------------------------------------
do $$
declare
  v_step integer := (select level_step from public.tesla_settings where id = 1);
begin
  perform pg_temp.check(public.tesla_level(0) = 1, 'nivel con 0 XP es 1');
  perform pg_temp.check(public.tesla_level(v_step - 1) = 1, 'un punto antes del nivel 2 sigue en 1');
  perform pg_temp.check(public.tesla_level(v_step) = 2, 'nivel 2 empieza en level_step');
  perform pg_temp.check(public.tesla_level_xp(3) = v_step * 3, 'nivel 3 empieza en 3 × level_step');
  perform pg_temp.check(public.tesla_level(public.tesla_level_xp(10)) = 10, 'tesla_level y tesla_level_xp son inversas');
  perform pg_temp.check(public.tesla_level(-50) = 1, 'XP negativa no rompe el nivel');
  perform pg_temp.check(public.tesla_pin_tier(1) = 0, 'nivel 1 no tiene Estrella');
  perform pg_temp.check(public.tesla_pin_tier(100) = 4, 'nivel 100 tiene la Gran Estrella');
  perform pg_temp.check(public.tesla_pin_name(2) = 'Estrella de Plata', 'nombre de la Estrella 2');
end $$;

-- ----------------------------------------------------------------------------
-- 2) Corrección automática de evaluaciones
-- ----------------------------------------------------------------------------
do $$
begin
  perform pg_temp.check(public.quiz_grade_answer('SINGLE', '"b"', '"b"', 2) = 2, 'opción única correcta');
  perform pg_temp.check(public.quiz_grade_answer('SINGLE', '"b"', '"a"', 2) = 0, 'opción única incorrecta');
  perform pg_temp.check(public.quiz_grade_answer('SINGLE', '"b"', null, 2) = 0, 'sin responder vale 0');
  perform pg_temp.check(public.quiz_grade_answer('MULTI', '["a","c"]', '["c","a"]', 3) = 3, 'varias correctas en otro orden');
  perform pg_temp.check(public.quiz_grade_answer('MULTI', '["a","c"]', '["a"]', 3) = 0, 'varias correctas incompletas');
  perform pg_temp.check(public.quiz_grade_answer('TRUE_FALSE', 'false', 'false', 1) = 1, 'verdadero o falso');
  perform pg_temp.check(public.quiz_grade_answer('MATCH', '{"l1":"r1","l2":"r2"}', '{"l1":"r1","l2":"r9"}', 4) = 2, 'relacionar da puntaje parcial');
  perform pg_temp.check(public.quiz_grade_answer('SHORT', '["Ácido cítrico"]', '"  acido   CITRICO "', 1) = 1, 'respuesta corta sin tildes ni mayúsculas');
  perform pg_temp.check(public.quiz_grade_answer('OPEN', null, '"texto"', 5) is null, 'desarrollo queda para el docente');
  perform pg_temp.check(public.quiz_grade_answer('SINGLE', '"b"', '{"raro": 1}', 1) = 0, 'respuesta con formato raro no rompe');
  perform pg_temp.check(public.campus_level_from_20(18) = 'AD' and public.campus_level_from_20(14) = 'A'
    and public.campus_level_from_20(11) = 'B' and public.campus_level_from_20(10) = 'C', 'niveles AD/A/B/C desde nota sobre 20');
  perform pg_temp.check(public.campus_norm('  Ñandú   Perú ') = 'nandu peru', 'normalización de texto');
end $$;

-- ----------------------------------------------------------------------------
-- 3) Libro de puntos: saldo, idempotencia y monedas negativas
-- ----------------------------------------------------------------------------
do $$
declare
  v_sid bigint := (select id from public.students order by id limit 1);
  v_before record;
  v_after record;
  v_ok boolean;
begin
  if v_sid is null then
    raise notice 'sin alumnos: se omiten las pruebas del libro de puntos';
    return;
  end if;
  select coalesce(xp, 0) as xp, coalesce(coins, 0) as coins into v_before
  from (select 1) x left join public.student_wallets w on w.student_id = v_sid;

  perform pg_temp.check(public.tesla_award(v_sid, 10, 3, 'ADJUST', null, 'PRUEBA:' || v_sid, 'Prueba automática'), 'se registra un movimiento');
  perform pg_temp.check(not public.tesla_award(v_sid, 10, 3, 'ADJUST', null, 'PRUEBA:' || v_sid, 'Prueba automática'), 'el mismo movimiento no se paga dos veces');
  select xp, coins into v_after from public.student_wallets where student_id = v_sid;
  perform pg_temp.check(v_after.xp = v_before.xp + 10 and v_after.coins = v_before.coins + 3, 'el saldo suma exactamente una vez');

  begin
    perform public.tesla_award(v_sid, 0, -(v_after.coins + 1000), 'ADJUST', null, 'PRUEBA-NEG:' || v_sid, 'Prueba de saldo negativo');
    v_ok := false;
  exception when others then
    v_ok := true;
  end;
  perform pg_temp.check(v_ok, 'no se puede quedar con monedas negativas');
end $$;

-- ----------------------------------------------------------------------------
-- 4) Reglas de entregas (operación de confianza de las evaluaciones)
-- ----------------------------------------------------------------------------
do $$
begin
  perform pg_temp.check(not public.campus_trusted_op(), 'la marca de confianza empieza apagada');
  perform public.campus_set_trusted(true);
  perform pg_temp.check(public.campus_trusted_op(), 'la marca de confianza se activa solo dentro de la transacción');
  perform public.campus_set_trusted(false);
  perform pg_temp.check(not public.campus_trusted_op(), 'la marca de confianza se apaga');
  -- La app no debe poder activarla: sin permiso de ejecución para los usuarios.
  perform pg_temp.check(not has_function_privilege('authenticated', 'public.campus_set_trusted(boolean)', 'execute'), 'los usuarios no pueden activar la marca de confianza');
  perform pg_temp.check(not has_function_privilege('authenticated', 'public.tesla_award(bigint, integer, integer, text, text, text, text, uuid)', 'execute'), 'los usuarios no pueden darse puntos');
  perform pg_temp.check(not has_function_privilege('authenticated', 'public.queue_push(uuid[], text, text, text, text, jsonb)', 'execute'), 'los usuarios no pueden encolar avisos push');
  perform pg_temp.check(not has_function_privilege('anon', 'public.quiz_start(bigint)', 'execute'), 'anónimos no pueden rendir evaluaciones');
end $$;

-- ----------------------------------------------------------------------------
-- 5) Seguridad: todas las tablas del campus tienen RLS activo
-- ----------------------------------------------------------------------------
do $$
declare
  t text;
begin
  for t in
    select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and c.relname = any(array[
      'assignments', 'submissions', 'materials', 'announcements', 'competency_grades', 'point_ledger', 'student_wallets',
      'reward_requests', 'quiz_questions', 'quiz_answer_keys', 'quiz_attempts', 'forum_threads', 'forum_posts',
      'student_observations', 'absence_justifications', 'audit_log', 'survey_responses', 'channel_messages',
      'notification_prefs', 'tutor_messages', 'peer_sparks', 'chests', 'season_rewards'
    ])
  loop
    perform pg_temp.check((select relrowsecurity from pg_class where oid = ('public.' || t)::regclass), 'RLS activo en ' || t);
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- 6) Horario de silencio de los avisos
-- ----------------------------------------------------------------------------
do $$
declare
  v_profile uuid := (select id from public.profiles limit 1);
  v_after timestamptz;
begin
  if v_profile is null then return; end if;
  insert into public.notification_prefs (profile_id, quiet_enabled, quiet_start, quiet_end, quiet_weekends)
  values (v_profile, true, '00:00', '23:59', false)
  on conflict (profile_id) do update set quiet_enabled = true, quiet_start = '00:00', quiet_end = '23:59', quiet_weekends = false;
  v_after := public.push_send_after(v_profile);
  perform pg_temp.check(v_after is not null and v_after > now(), 'en horario de silencio el aviso se difiere');
  update public.notification_prefs set quiet_enabled = false where profile_id = v_profile;
  perform pg_temp.check(public.push_send_after(v_profile) is null, 'sin horario de silencio el aviso sale al instante');
end $$;

select 'Todas las pruebas pasaron ✔' as resultado;

rollback;
