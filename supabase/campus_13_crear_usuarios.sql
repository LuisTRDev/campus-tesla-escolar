-- ============================================================================
-- CAMPUS VIRTUAL TESLA · Script 13
-- Crear cuentas de alumno, familia y docente desde el SQL Editor.
--
-- Uso (después de ejecutar este script una vez):
--   select public.campus_crear_docente('ana.torres@colegio.pe', 'Ana Torres', 'Tesla-2026');
--   select public.campus_crear_alumno('71234567', 'Tesla-2026');
--   select public.campus_crear_familia('40123456', 'Tesla-2026');
--
-- · El alumno y la familia se buscan por DNI en Tesla (students / guardians).
-- · La contraseña es temporal: el campus pide cambiarla en el primer ingreso.
-- · Si la cuenta ya existe, se le pone la contraseña nueva y se vuelve a vincular.
-- · Solo se pueden usar desde el SQL Editor (no desde la app).
-- ============================================================================

-- Dominio interno de las cuentas con DNI: debe ser igual a VITE_LOGIN_DOMAIN.
create or replace function public.campus_login_domain()
returns text
language sql
immutable
as $$ select 'campus.tesla.edu.pe' $$;

-- Crea (o actualiza) un usuario de Auth con correo confirmado.
create or replace function public.campus_auth_user(p_email text, p_password text, p_full_name text)
returns uuid
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_email text := lower(btrim(p_email));
  v_id uuid;
  v_meta jsonb := jsonb_build_object('full_name', btrim(p_full_name), 'must_change_password', true);
begin
  if char_length(coalesce(p_password, '')) < 8 then
    raise exception 'La contraseña debe tener al menos 8 caracteres.';
  end if;

  select id into v_id from auth.users where lower(email) = v_email;

  if v_id is null then
    v_id := gen_random_uuid();
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change, email_change_token_new
    ) values (
      '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', v_email,
      crypt(p_password, gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}'::jsonb, v_meta, now(), now(),
      '', '', '', ''
    );
    insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
    values (
      gen_random_uuid(), v_id, v_id::text, 'email',
      jsonb_build_object('sub', v_id::text, 'email', v_email, 'email_verified', true),
      now(), now(), now()
    );
  else
    update auth.users
    set encrypted_password = crypt(p_password, gen_salt('bf')),
        email_confirmed_at = coalesce(email_confirmed_at, now()),
        raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || v_meta,
        updated_at = now()
    where id = v_id;
  end if;

  return v_id;
end;
$$;

-- Docente: ingresa con su correo real.
create or replace function public.campus_crear_docente(p_email text, p_full_name text, p_password text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if lower(btrim(p_email)) like '%@' || public.campus_login_domain() then
    raise exception 'Usa el correo real del docente, no el dominio interno del campus.';
  end if;
  v_id := public.campus_auth_user(p_email, p_password, p_full_name);
  perform public.admin_link_account(v_id, 'TEACHER', p_full_name);
  return format('Docente listo · usuario: %s · clave temporal: %s', lower(btrim(p_email)), p_password);
end;
$$;

-- Alumno: se busca en Tesla por DNI; ingresa con su DNI en la pestaña "Alumno".
create or replace function public.campus_crear_alumno(p_dni text, p_password text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dni text := upper(regexp_replace(coalesce(p_dni, ''), '[\s.-]', '', 'g'));
  v_student record;
  v_name text;
  v_id uuid;
begin
  select id, first_name, last_name into v_student
  from public.students
  where upper(regexp_replace(coalesce(dni, ''), '[\s.-]', '', 'g')) = v_dni
  limit 1;
  if v_student.id is null then
    raise exception 'No hay ningún alumno con DNI % en Tesla.', v_dni;
  end if;
  v_name := btrim(coalesce(v_student.first_name, '') || ' ' || coalesce(v_student.last_name, ''));
  v_id := public.campus_auth_user(format('alumno.%s@%s', lower(v_dni), public.campus_login_domain()), p_password, v_name);
  perform public.admin_link_account(v_id, 'STUDENT', v_name, v_student.id, null, v_dni);
  return format('Alumno listo · %s · usuario (DNI): %s · clave temporal: %s', v_name, v_dni, p_password);
end;
$$;

-- Familia: el apoderado se busca en Tesla por DNI; ingresa en la pestaña "Familia".
create or replace function public.campus_crear_familia(p_dni text, p_password text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dni text := upper(regexp_replace(coalesce(p_dni, ''), '[\s.-]', '', 'g'));
  v_guardian record;
  v_id uuid;
begin
  select id, full_name into v_guardian
  from public.guardians
  where upper(regexp_replace(coalesce(dni, ''), '[\s.-]', '', 'g')) = v_dni
  limit 1;
  if v_guardian.id is null then
    raise exception 'No hay ningún apoderado con DNI % en Tesla.', v_dni;
  end if;
  v_id := public.campus_auth_user(format('familia.%s@%s', lower(v_dni), public.campus_login_domain()), p_password, coalesce(v_guardian.full_name, 'Apoderado'));
  perform public.admin_link_account(v_id, 'GUARDIAN', coalesce(v_guardian.full_name, 'Apoderado'), null, v_guardian.id, v_dni);
  return format('Familia lista · %s · usuario (DNI): %s · clave temporal: %s', v_guardian.full_name, v_dni, p_password);
end;
$$;

-- Solo el SQL Editor (rol postgres) puede crear cuentas así.
revoke all on function public.campus_auth_user(text, text, text) from public, anon, authenticated;
revoke all on function public.campus_crear_docente(text, text, text) from public, anon, authenticated;
revoke all on function public.campus_crear_alumno(text, text) from public, anon, authenticated;
revoke all on function public.campus_crear_familia(text, text) from public, anon, authenticated;

select 'Funciones para crear cuentas listas' as estado;

-- ----------------------------------------------------------------------------
-- Alumno SIN DNI: usuario provisional "A" + su id de Tesla (ej. A0000123).
-- Ingresa en la pestaña "Alumno" escribiendo ese código en lugar del DNI.
-- Cuando llegue su DNI, usa campus_crear_alumno(dni, clave): la cuenta nueva
-- reemplaza a la provisional.
-- ----------------------------------------------------------------------------
create or replace function public.campus_crear_alumno_sin_dni(p_student_id bigint, p_password text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student record;
  v_user text := 'A' || lpad(p_student_id::text, 7, '0');
  v_name text;
  v_id uuid;
begin
  select id, first_name, last_name into v_student from public.students where id = p_student_id;
  if v_student.id is null then
    raise exception 'No existe el alumno con id % en Tesla.', p_student_id;
  end if;
  v_name := btrim(coalesce(v_student.first_name, '') || ' ' || coalesce(v_student.last_name, ''));
  v_id := public.campus_auth_user(format('alumno.%s@%s', lower(v_user), public.campus_login_domain()), p_password, v_name);
  perform public.admin_link_account(v_id, 'STUDENT', v_name, v_student.id, null, null);
  return format('Alumno listo · %s · usuario: %s · clave temporal: %s', v_name, v_user, p_password);
end;
$$;

revoke all on function public.campus_crear_alumno_sin_dni(bigint, text) from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- Administración / dirección: gestiona cursos, cuentas, bimestres y panel.
-- p_role: 'ADMIN' (administración) o 'MANAGEMENT' (dirección).
-- Ojo: también tiene acceso completo en Tesla Control Escolar (misma base).
-- ----------------------------------------------------------------------------
create or replace function public.campus_crear_admin(p_email text, p_full_name text, p_password text, p_role text default 'ADMIN')
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := upper(btrim(p_role));
  v_id uuid;
begin
  if v_role not in ('ADMIN', 'MANAGEMENT') then
    raise exception 'El rol debe ser ADMIN o MANAGEMENT.';
  end if;
  if lower(btrim(p_email)) like '%@' || public.campus_login_domain() then
    raise exception 'Usa un correo real, no el dominio interno del campus.';
  end if;
  v_id := public.campus_auth_user(p_email, p_password, p_full_name);
  perform public.admin_link_account(v_id, v_role, p_full_name);
  return format('Cuenta %s lista · usuario: %s · clave temporal: %s', v_role, lower(btrim(p_email)), p_password);
end;
$$;

revoke all on function public.campus_crear_admin(text, text, text, text) from public, anon, authenticated;
