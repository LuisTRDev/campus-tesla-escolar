-- ============================================================================
-- CAMPUS VIRTUAL TESLA · Script 14
-- Gestión de cuentas desde la plataforma (sin Edge Function).
--
-- Funciones que la app llama como ADMIN o MANAGEMENT:
--   admin_list_accounts          Docentes y personal con su usuario y estado
--   admin_classroom_roster       Alumnos y familias de un aula con su usuario
--   admin_classroom_accounts     Crea las cuentas faltantes de un aula
--                                (alumnos sin DNI reciben un código A0000024;
--                                 cuando ya tienen DNI, su usuario pasa al DNI)
--   admin_create_teacher         Cuenta de docente
--   admin_create_staff           Cuenta de administración, dirección o auxiliar
--   admin_reset_password         Nueva contraseña temporal
--   admin_set_active             Desactivar / reactivar una cuenta
--   admin_update_account         Cambiar nombre o correo
--
-- Requiere el script 13 (campus_auth_user, campus_login_domain).
-- Se puede volver a ejecutar.
-- ============================================================================

create or replace function public.assert_admin()
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not (public.is_admin() or public.is_trusted_backend()) then
    raise exception 'Solo administración o dirección pueden gestionar cuentas.';
  end if;
end;
$$;

-- Contraseña temporal fácil de dictar: Palabra-1234 (aleatoria segura).
create or replace function public.campus_temp_password()
returns text
language plpgsql
volatile
security definer
set search_path = public, extensions
as $$
declare
  v_words text[] := array['Chispa', 'Bobina', 'Voltio', 'Cometa', 'Prisma', 'Radar', 'Faro', 'Orbita',
                          'Nube', 'Condor', 'Puma', 'Andes', 'Lucuma', 'Quinua', 'Colibri', 'Vicuna'];
  v_b bytea := gen_random_bytes(4);
begin
  return v_words[1 + get_byte(v_b, 0) % array_length(v_words, 1)]
      || '-' || (1000 + ((get_byte(v_b, 1) * 256 + get_byte(v_b, 2)) % 9000))::text;
end;
$$;

-- DNI limpio (o null si no tiene el formato de un documento).
create or replace function public.campus_clean_dni(p_value text)
returns text
language sql
immutable
as $$
  select case when v ~ '^[A-Z0-9]{8,12}$' then v else null end
  from (select upper(regexp_replace(coalesce(p_value, ''), '[\s.-]', '', 'g')) as v) x
$$;

-- Código provisional para alumnos sin DNI: A + id de Tesla (A0000024).
create or replace function public.campus_student_code(p_student_id bigint)
returns text
language sql
immutable
as $$ select 'A' || lpad(p_student_id::text, 7, '0') $$;

-- Usuario que la persona escribe en el login, a partir de su correo de Auth.
create or replace function public.campus_username(p_email text)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when lower(p_email) like '%@' || public.campus_login_domain()
      then upper(substr(split_part(lower(p_email), '@', 1), strpos(split_part(lower(p_email), '@', 1), '.') + 1))
    else lower(p_email)
  end
$$;

-- Cambia el correo de un usuario de Auth (y su identidad de correo).
create or replace function public.campus_set_auth_email(p_user_id uuid, p_email text)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_email text := lower(btrim(p_email));
begin
  if exists (select 1 from auth.users where lower(email) = v_email and id <> p_user_id) then
    raise exception 'El usuario % ya está en uso por otra cuenta.', public.campus_username(v_email);
  end if;
  update auth.users set email = v_email, updated_at = now() where id = p_user_id;
  update auth.identities
  set identity_data = coalesce(identity_data, '{}'::jsonb) || jsonb_build_object('email', v_email), updated_at = now()
  where user_id = p_user_id and provider = 'email';
end;
$$;

-- ----------------------------------------------------------------------------
-- 1) Listas
-- ----------------------------------------------------------------------------
create or replace function public.admin_list_accounts()
returns table (
  profile_id uuid,
  full_name text,
  role text,
  username text,
  is_active boolean,
  last_sign_in_at timestamptz,
  created_at timestamptz,
  offerings integer,
  tutor_of integer
)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
#variable_conflict use_column
begin
  perform public.assert_admin();
  return query
  select p.id, p.full_name, p.role, public.campus_username(u.email), p.is_active, u.last_sign_in_at, u.created_at,
         (select count(*) from public.course_offerings o where o.teacher_id = p.id and o.is_active)::int,
         (select count(*) from public.classrooms c where c.tutor_id = p.id)::int
  from public.profiles p
  join auth.users u on u.id = p.id
  where p.role in ('ADMIN', 'MANAGEMENT', 'AUXILIARY', 'TEACHER')
  order by case p.role when 'TEACHER' then 1 else 0 end, p.full_name;
end;
$$;

create or replace function public.admin_classroom_roster(p_classroom_id bigint)
returns table (
  kind text,
  person_id bigint,
  name text,
  dni text,
  student_name text,
  profile_id uuid,
  username text,
  is_active boolean,
  last_sign_in_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
#variable_conflict use_column
begin
  perform public.assert_admin();
  return query
  with st as (
    select s.* from public.students s where s.classroom_id = p_classroom_id
  ),
  gu as (
    select distinct on (g.id) g.id, g.full_name, g.dni, g.profile_id,
           coalesce(s.last_name, '') || ', ' || coalesce(s.first_name, '') as child
    from st s
    join public.student_guardians sg on sg.student_id = s.id
    join public.guardians g on g.id = sg.guardian_id
    order by g.id, s.last_name
  )
  select 'STUDENT', s.id, coalesce(s.last_name, '') || ', ' || coalesce(s.first_name, ''), s.dni, null::text,
         s.profile_id, public.campus_username(u.email), p.is_active, u.last_sign_in_at
  from st s
  left join auth.users u on u.id = s.profile_id
  left join public.profiles p on p.id = s.profile_id
  union all
  select 'GUARDIAN', g.id, coalesce(g.full_name, 'Apoderado'), g.dni, g.child,
         g.profile_id, public.campus_username(u.email), p.is_active, u.last_sign_in_at
  from gu g
  left join auth.users u on u.id = g.profile_id
  left join public.profiles p on p.id = g.profile_id
  order by 1 desc, 3;
end;
$$;

-- ----------------------------------------------------------------------------
-- 2) Cuentas de un aula (alumnos y familias)
-- ----------------------------------------------------------------------------
create or replace function public.admin_classroom_accounts(p_classroom_id bigint, p_include_guardians boolean default true)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_created jsonb := '[]'::jsonb;
  v_skipped jsonb := '[]'::jsonb;
  v_room text;
  s record;
  g record;
  v_name text;
  v_dni text;
  v_user text;
  v_pw text;
  v_id uuid;
  v_email text;
begin
  perform public.assert_admin();

  select coalesce(c.grade, '') || ' ' || coalesce(c.section, '') || ' de ' || coalesce(c.level, '')
  into v_room from public.classrooms c where c.id = p_classroom_id;
  if v_room is null then
    raise exception 'El aula no existe.';
  end if;

  for s in
    select st.id, st.first_name, st.last_name, st.dni, st.profile_id, u.email
    from public.students st
    left join auth.users u on u.id = st.profile_id
    where st.classroom_id = p_classroom_id
    order by st.last_name, st.first_name
  loop
    v_name := btrim(coalesce(s.first_name, '') || ' ' || coalesce(s.last_name, ''));
    v_dni := public.campus_clean_dni(s.dni);
    begin
      if s.profile_id is not null then
        -- Ya tiene cuenta con código y ahora tiene DNI: su usuario pasa al DNI (misma clave).
        if v_dni is not null and s.email is not null
           and lower(s.email) <> format('alumno.%s@%s', lower(v_dni), public.campus_login_domain())
           and lower(s.email) = format('alumno.%s@%s', lower(public.campus_student_code(s.id)), public.campus_login_domain()) then
          perform public.campus_set_auth_email(s.profile_id, format('alumno.%s@%s', lower(v_dni), public.campus_login_domain()));
          v_created := v_created || jsonb_build_object('kind', 'STUDENT', 'name', v_name, 'username', v_dni,
            'password', null, 'detail', 'Ahora ingresa con su DNI; su contraseña no cambia');
        end if;
        continue;
      end if;

      v_user := coalesce(v_dni, public.campus_student_code(s.id));
      v_pw := public.campus_temp_password();
      v_id := public.campus_auth_user(format('alumno.%s@%s', lower(v_user), public.campus_login_domain()), v_pw, v_name);
      perform public.admin_link_account(v_id, 'STUDENT', v_name, s.id, null, v_dni);
      v_created := v_created || jsonb_build_object('kind', 'STUDENT', 'name', v_name, 'username', v_user,
        'password', v_pw, 'detail', v_room || case when v_dni is null then ' · código provisional (sin DNI)' else '' end);
    exception when others then
      v_skipped := v_skipped || jsonb_build_object('name', v_name, 'reason', sqlerrm);
    end;
  end loop;

  if p_include_guardians then
    for g in
      select distinct on (gd.id) gd.id, gd.full_name, gd.dni, gd.profile_id,
             btrim(coalesce(st.first_name, '') || ' ' || coalesce(st.last_name, '')) as child
      from public.students st
      join public.student_guardians sg on sg.student_id = st.id
      join public.guardians gd on gd.id = sg.guardian_id
      where st.classroom_id = p_classroom_id
      order by gd.id, st.last_name
    loop
      if g.profile_id is not null then
        continue;
      end if;
      v_name := coalesce(nullif(btrim(g.full_name), ''), 'Apoderado');
      v_dni := public.campus_clean_dni(g.dni);
      if v_dni is null then
        v_skipped := v_skipped || jsonb_build_object('name', v_name, 'reason', 'el apoderado no tiene DNI registrado en Tesla');
        continue;
      end if;
      begin
        v_pw := public.campus_temp_password();
        v_email := format('familia.%s@%s', lower(v_dni), public.campus_login_domain());
        v_id := public.campus_auth_user(v_email, v_pw, v_name);
        perform public.admin_link_account(v_id, 'GUARDIAN', v_name, null, g.id, v_dni);
        v_created := v_created || jsonb_build_object('kind', 'GUARDIAN', 'name', v_name, 'username', v_dni,
          'password', v_pw, 'detail', 'Familia de ' || g.child);
      exception when others then
        v_skipped := v_skipped || jsonb_build_object('name', v_name, 'reason', sqlerrm);
      end;
    end loop;
  end if;

  return jsonb_build_object('created', v_created, 'skipped', v_skipped);
end;
$$;

-- ----------------------------------------------------------------------------
-- 3) Docentes y personal
-- ----------------------------------------------------------------------------
create or replace function public.admin_create_staff(p_email text, p_full_name text, p_role text)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_name text := btrim(coalesce(p_full_name, ''));
  v_role text := upper(btrim(coalesce(p_role, '')));
  v_existing text;
  v_pw text := public.campus_temp_password();
  v_id uuid;
  v_reused boolean;
begin
  perform public.assert_admin();
  if v_role not in ('TEACHER', 'ADMIN', 'MANAGEMENT', 'AUXILIARY') then
    raise exception 'Rol no válido.';
  end if;
  if v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then
    raise exception 'El correo no es válido.';
  end if;
  if v_email like '%@' || public.campus_login_domain() then
    raise exception 'Usa el correo real de la persona, no el dominio interno del campus.';
  end if;
  if char_length(v_name) < 3 then
    raise exception 'Escribe el nombre completo.';
  end if;

  select p.role into v_existing
  from auth.users u join public.profiles p on p.id = u.id
  where lower(u.email) = v_email;
  if v_existing is not null and v_existing <> v_role then
    raise exception 'Ese correo ya pertenece a una cuenta con rol %.', v_existing;
  end if;
  v_reused := v_existing is not null;

  v_id := public.campus_auth_user(v_email, v_pw, v_name);
  perform public.admin_link_account(v_id, v_role, v_name);
  return jsonb_build_object('kind', v_role, 'name', v_name, 'username', v_email, 'password', v_pw,
    'detail', case when v_reused then 'La cuenta ya existía: se generó una contraseña nueva' else null end);
end;
$$;

create or replace function public.admin_create_teacher(p_email text, p_full_name text)
returns jsonb
language sql
security definer
set search_path = public
as $$ select public.admin_create_staff(p_email, p_full_name, 'TEACHER') $$;

-- ----------------------------------------------------------------------------
-- 4) Acciones sobre una cuenta
-- ----------------------------------------------------------------------------
create or replace function public.admin_reset_password(p_profile_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_pw text := public.campus_temp_password();
  v_email text;
  v_name text;
  v_role text;
begin
  perform public.assert_admin();
  select u.email, p.full_name, p.role into v_email, v_name, v_role
  from auth.users u join public.profiles p on p.id = u.id where u.id = p_profile_id;
  if v_email is null then
    raise exception 'La cuenta no existe.';
  end if;
  update auth.users
  set encrypted_password = crypt(v_pw, gen_salt('bf')),
      raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || '{"must_change_password": true}'::jsonb,
      updated_at = now()
  where id = p_profile_id;
  return jsonb_build_object('kind', v_role, 'name', v_name, 'username', public.campus_username(v_email),
    'password', v_pw, 'detail', 'Contraseña restablecida');
end;
$$;

create or replace function public.admin_set_active(p_profile_id uuid, p_active boolean)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  perform public.assert_admin();
  if p_profile_id = auth.uid() and not p_active then
    raise exception 'No puedes desactivar tu propia cuenta.';
  end if;
  update public.profiles set is_active = p_active where id = p_profile_id;
  if not found then
    raise exception 'La cuenta no existe.';
  end if;
  -- Además de quitarle los permisos, impide que inicie sesión.
  update auth.users set banned_until = case when p_active then null else 'infinity'::timestamptz end, updated_at = now()
  where id = p_profile_id;
end;
$$;

create or replace function public.admin_update_account(p_profile_id uuid, p_full_name text, p_email text default null)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_role text;
  v_name text := btrim(coalesce(p_full_name, ''));
  v_email text := lower(btrim(coalesce(p_email, '')));
begin
  perform public.assert_admin();
  select role into v_role from public.profiles where id = p_profile_id;
  if v_role is null then
    raise exception 'La cuenta no existe.';
  end if;
  if char_length(v_name) < 3 then
    raise exception 'Escribe el nombre completo.';
  end if;
  update public.profiles set full_name = v_name where id = p_profile_id;

  if v_email <> '' and v_role in ('TEACHER', 'ADMIN', 'MANAGEMENT', 'AUXILIARY') then
    if v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' or v_email like '%@' || public.campus_login_domain() then
      raise exception 'El correo no es válido.';
    end if;
    perform public.campus_set_auth_email(p_profile_id, v_email);
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- 5) Permisos
-- ----------------------------------------------------------------------------
revoke all on function public.campus_temp_password() from public, anon, authenticated;
revoke all on function public.campus_set_auth_email(uuid, text) from public, anon, authenticated;

do $$
declare
  f text;
begin
  foreach f in array array[
    'assert_admin()', 'admin_list_accounts()', 'admin_classroom_roster(bigint)',
    'admin_classroom_accounts(bigint, boolean)', 'admin_create_staff(text, text, text)',
    'admin_create_teacher(text, text)', 'admin_reset_password(uuid)', 'admin_set_active(uuid, boolean)',
    'admin_update_account(uuid, text, text)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

grant execute on function public.campus_clean_dni(text) to authenticated;
grant execute on function public.campus_student_code(bigint) to authenticated;
grant execute on function public.campus_username(text) to authenticated;

select 'Gestión de cuentas desde la plataforma lista' as estado;
