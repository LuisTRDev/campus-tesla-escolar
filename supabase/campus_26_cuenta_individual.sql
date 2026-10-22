-- ============================================================================
-- CAMPUS VIRTUAL TESLA · Script 26
-- Crear la cuenta de UNA sola persona (alumno o familia) desde Cuentas.
--
-- admin_classroom_accounts (script 14) crea todas las cuentas que faltan de un
-- aula. Esta función hace lo mismo para un alumno o un apoderado concreto, con
-- las mismas reglas y la misma respuesta ({created, skipped}), así la pantalla
-- reutiliza las fichas imprimibles.
--
--   · Alumno: usuario = su DNI, o un código provisional (A0000024) si no tiene.
--   · Familia: usuario = su DNI (si Tesla no lo tiene, no se crea).
--   · Si ya tiene cuenta, no hace nada y lo dice.
--
-- Solo ADMIN o MANAGEMENT. Requiere el script 14. Se puede volver a ejecutar.
-- ============================================================================

create or replace function public.admin_create_person_account(p_kind text, p_person_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_created jsonb := '[]'::jsonb;
  v_skipped jsonb := '[]'::jsonb;
  s record;
  g record;
  v_name text;
  v_dni text;
  v_user text;
  v_pw text;
  v_id uuid;
  v_room text;
begin
  perform public.assert_admin();

  if p_kind = 'STUDENT' then
    select st.id, st.first_name, st.last_name, st.dni, st.profile_id,
           btrim(coalesce(c.grade, '') || ' ' || coalesce(c.section, '') || ' de ' || coalesce(c.level, '')) as room
      into s
    from public.students st
    left join public.classrooms c on c.id = st.classroom_id
    where st.id = p_person_id;
    if not found then
      raise exception 'El alumno no existe.';
    end if;
    v_name := btrim(coalesce(s.first_name, '') || ' ' || coalesce(s.last_name, ''));
    if s.profile_id is not null then
      v_skipped := v_skipped || jsonb_build_object('name', v_name, 'reason', 'ya tiene cuenta');
    else
      v_dni := public.campus_clean_dni(s.dni);
      begin
        v_user := coalesce(v_dni, public.campus_student_code(s.id));
        v_pw := public.campus_temp_password();
        v_id := public.campus_auth_user(format('alumno.%s@%s', lower(v_user), public.campus_login_domain()), v_pw, v_name);
        perform public.admin_link_account(v_id, 'STUDENT', v_name, s.id, null, v_dni);
        v_created := v_created || jsonb_build_object('kind', 'STUDENT', 'name', v_name, 'username', v_user,
          'password', v_pw, 'detail', coalesce(s.room, '') || case when v_dni is null then ' · código provisional (sin DNI)' else '' end);
      exception when others then
        v_skipped := v_skipped || jsonb_build_object('name', v_name, 'reason', sqlerrm);
      end;
    end if;

  elsif p_kind = 'GUARDIAN' then
    select gd.id, gd.full_name, gd.dni, gd.profile_id,
           (select string_agg(btrim(coalesce(st.first_name, '') || ' ' || coalesce(st.last_name, '')), ' y ')
            from public.student_guardians sg join public.students st on st.id = sg.student_id
            where sg.guardian_id = gd.id) as children
      into g
    from public.guardians gd
    where gd.id = p_person_id;
    if not found then
      raise exception 'El apoderado no existe.';
    end if;
    v_name := coalesce(nullif(btrim(g.full_name), ''), 'Apoderado');
    v_dni := public.campus_clean_dni(g.dni);
    if g.profile_id is not null then
      v_skipped := v_skipped || jsonb_build_object('name', v_name, 'reason', 'ya tiene cuenta');
    elsif v_dni is null then
      v_skipped := v_skipped || jsonb_build_object('name', v_name, 'reason', 'el apoderado no tiene DNI registrado en Tesla');
    else
      begin
        v_pw := public.campus_temp_password();
        v_id := public.campus_auth_user(format('familia.%s@%s', lower(v_dni), public.campus_login_domain()), v_pw, v_name);
        perform public.admin_link_account(v_id, 'GUARDIAN', v_name, null, g.id, v_dni);
        v_created := v_created || jsonb_build_object('kind', 'GUARDIAN', 'name', v_name, 'username', v_dni,
          'password', v_pw, 'detail', 'Familia de ' || coalesce(g.children, 'su hijo'));
      exception when others then
        v_skipped := v_skipped || jsonb_build_object('name', v_name, 'reason', sqlerrm);
      end;
    end if;

  else
    raise exception 'Elige un alumno o un apoderado.';
  end if;

  return jsonb_build_object('created', v_created, 'skipped', v_skipped);
end;
$$;

revoke all on function public.admin_create_person_account(text, bigint) from public, anon;
grant execute on function public.admin_create_person_account(text, bigint) to authenticated;

select 'Cuenta individual lista' as estado;
