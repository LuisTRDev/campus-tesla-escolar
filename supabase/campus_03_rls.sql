-- ============================================================================
-- CAMPUS VIRTUAL TESLA · FASE 1 · Script 03 de 06
-- Seguridad por filas (RLS) para TODA la base: tablas de Tesla y del campus.
--
-- Antes: cualquier usuario con sesión podía leer y modificar todo.
-- Ahora:
--   · Personal (ADMIN, MANAGEMENT, AUXILIARY): igual que antes en Tesla.
--   · Docentes: leen los datos de las aulas donde enseñan o son tutores.
--   · Alumnos: solo sus propios datos.
--   · Apoderados: solo los datos de sus hijos.
--
-- IMPORTANTE: este script BORRA las políticas existentes de las tablas
-- listadas y las recrea. La app Tesla sigue funcionando para el personal.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Borrar políticas anteriores y activar RLS
-- ----------------------------------------------------------------------------
do $$
declare
  t text;
  pol record;
begin
  foreach t in array array[
    -- Tesla
    'classrooms', 'students', 'guardians', 'student_guardians', 'attendance',
    'school_settings', 'presentation_controls', 'presentation_violations',
    'profiles', 'notifications', 'alerts', 'attendance_closures', 'audit_logs',
    'historical_import_batches', 'historical_import_records', 'access_events',
    'guardian_debts', 'pension_payments',
    -- Campus
    'academic_years', 'subjects', 'course_offerings', 'announcements',
    'materials', 'assignments', 'submissions', 'weekly_digests'
  ] loop
    if to_regclass(format('public.%I', t)) is null then
      raise notice 'Tabla % no existe, se omite.', t;
      continue;
    end if;

    for pol in
      select policyname from pg_policies where schemaname = 'public' and tablename = t
    loop
      execute format('drop policy %I on public.%I', pol.policyname, t);
    end loop;

    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- 2) Personal del colegio: acceso completo a las tablas operativas de Tesla
-- ----------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'classrooms', 'students', 'guardians', 'student_guardians', 'attendance',
    'presentation_controls', 'presentation_violations', 'notifications', 'alerts',
    'attendance_closures', 'audit_logs', 'historical_import_batches',
    'historical_import_records', 'access_events', 'guardian_debts', 'pension_payments'
  ] loop
    if to_regclass(format('public.%I', t)) is not null then
      execute format(
        'create policy "staff_all" on public.%I for all to authenticated
           using ((select public.is_staff())) with check ((select public.is_staff()))',
        t
      );
    end if;
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- 3) Tesla: lectura para docentes y familias
-- ----------------------------------------------------------------------------
-- Aulas
create policy "teacher_read" on public.classrooms for select to authenticated
  using ((select public.is_teacher()));
create policy "family_read" on public.classrooms for select to authenticated
  using (id in (select public.family_classroom_ids()));

-- Alumnos
create policy "teacher_read" on public.students for select to authenticated
  using (classroom_id in (select public.teacher_classroom_ids()));
create policy "family_read" on public.students for select to authenticated
  using (id in (select public.my_student_ids()));

-- Apoderados: cada apoderado ve su propia ficha.
create policy "guardian_read_self" on public.guardians for select to authenticated
  using (profile_id = (select auth.uid()));

create policy "family_read" on public.student_guardians for select to authenticated
  using (guardian_id in (select public.my_guardian_ids()));

-- Asistencia
create policy "teacher_read" on public.attendance for select to authenticated
  using ((select public.can_view_student(student_id)));
create policy "family_read" on public.attendance for select to authenticated
  using (student_id in (select public.my_student_ids()));

create policy "family_read" on public.access_events for select to authenticated
  using (student_id in (select public.my_student_ids()));

-- Presentación personal
create policy "teacher_family_read" on public.presentation_controls for select to authenticated
  using ((select public.can_view_student(student_id)));

create policy "teacher_family_read" on public.presentation_violations for select to authenticated
  using (exists (
    select 1 from public.presentation_controls pc
    where pc.id = presentation_control_id
      and public.can_view_student(pc.student_id)
  ));

-- Notificaciones (las anuladas no se muestran a la familia)
create policy "teacher_read" on public.notifications for select to authenticated
  using ((select public.is_teacher()) and student_id in (
    select s.id from public.students s where s.classroom_id in (select public.teacher_classroom_ids())
  ));
create policy "family_read" on public.notifications for select to authenticated
  using (not voided and student_id in (select public.my_student_ids()));

-- Alertas: solo personal y docentes (son internas, no para familias)
create policy "teacher_read" on public.alerts for select to authenticated
  using ((select public.is_teacher()) and student_id in (
    select s.id from public.students s where s.classroom_id in (select public.teacher_classroom_ids())
  ));

-- Pensiones: cada apoderado ve las suyas
do $$
begin
  if to_regclass('public.pension_payments') is not null then
    execute 'create policy "guardian_read" on public.pension_payments for select to authenticated
               using (guardian_id in (select public.my_guardian_ids()))';
  end if;
  if to_regclass('public.guardian_debts') is not null then
    execute 'create policy "guardian_read" on public.guardian_debts for select to authenticated
               using (guardian_id in (select public.my_guardian_ids()))';
  end if;
end $$;

-- Configuración escolar: todos la leen (hora de ingreso), solo personal la edita
create policy "authenticated_read" on public.school_settings for select to authenticated
  using (true);
create policy "staff_write" on public.school_settings for all to authenticated
  using ((select public.is_staff())) with check ((select public.is_staff()));

-- ----------------------------------------------------------------------------
-- 4) Perfiles
-- ----------------------------------------------------------------------------
create policy "read_own" on public.profiles for select to authenticated
  using (id = (select auth.uid()));
create policy "staff_read" on public.profiles for select to authenticated
  using ((select public.is_staff()));
create policy "update_own" on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy "admin_all" on public.profiles for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- ----------------------------------------------------------------------------
-- 5) Campus: catálogos
-- ----------------------------------------------------------------------------
create policy "authenticated_read" on public.academic_years for select to authenticated using (true);
create policy "admin_write" on public.academic_years for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create policy "authenticated_read" on public.subjects for select to authenticated using (true);
create policy "admin_write" on public.subjects for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- ----------------------------------------------------------------------------
-- 6) Campus: cursos
-- ----------------------------------------------------------------------------
create policy "view" on public.course_offerings for select to authenticated
  using (public.can_view_offering(id));
create policy "admin_write" on public.course_offerings for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- ----------------------------------------------------------------------------
-- 7) Campus: anuncios
-- ----------------------------------------------------------------------------
create policy "view" on public.announcements for select to authenticated
  using (
    (
      scope = 'SCHOOL'
      or (scope = 'COURSE' and public.can_view_offering(offering_id))
      or (scope = 'CLASSROOM' and (
        (select public.is_staff())
        or classroom_id in (select public.teacher_classroom_ids())
        or classroom_id in (select public.family_classroom_ids())
      ))
    )
    and (published_at <= now() or author_id = (select auth.uid()) or (select public.is_staff()))
  );

create policy "create" on public.announcements for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and (
      (scope = 'COURSE' and public.can_manage_offering(offering_id))
      or (scope = 'CLASSROOM' and (
        (select public.is_admin())
        or exists (select 1 from public.classrooms c where c.id = classroom_id and c.tutor_id = (select auth.uid()))
      ))
      or (scope = 'SCHOOL' and (select public.is_admin()))
    )
  );

create policy "edit_own" on public.announcements for update to authenticated
  using (author_id = (select auth.uid()) or (select public.is_admin()))
  with check (author_id = (select auth.uid()) or (select public.is_admin()));

create policy "delete_own" on public.announcements for delete to authenticated
  using (author_id = (select auth.uid()) or (select public.is_admin()));

-- ----------------------------------------------------------------------------
-- 8) Campus: materiales y tareas
-- ----------------------------------------------------------------------------
create policy "view" on public.materials for select to authenticated
  using (public.can_view_offering(offering_id) and (published or public.can_manage_offering(offering_id)));
create policy "manage" on public.materials for all to authenticated
  using (public.can_manage_offering(offering_id))
  with check (public.can_manage_offering(offering_id));

create policy "view" on public.assignments for select to authenticated
  using (public.can_view_offering(offering_id) and (status <> 'DRAFT' or public.can_manage_offering(offering_id)));
create policy "manage" on public.assignments for all to authenticated
  using (public.can_manage_offering(offering_id))
  with check (public.can_manage_offering(offering_id));

-- ----------------------------------------------------------------------------
-- 9) Campus: entregas
--    Las reglas finas (quién cambia qué campo) están en el trigger
--    enforce_submission_rules del script 02.
-- ----------------------------------------------------------------------------
create policy "view" on public.submissions for select to authenticated
  using (
    student_id in (select public.my_student_ids())
    or public.can_manage_assignment(assignment_id)
    or (select public.is_staff())
  );

create policy "student_create" on public.submissions for insert to authenticated
  with check (
    student_id = (select public.my_self_student_id())
    and exists (
      select 1 from public.assignments a
      where a.id = assignment_id
        and a.status = 'PUBLISHED'
        and public.can_view_offering(a.offering_id)
    )
  );

create policy "student_or_teacher_update" on public.submissions for update to authenticated
  using (student_id = (select public.my_self_student_id()) or public.can_manage_assignment(assignment_id))
  with check (student_id = (select public.my_self_student_id()) or public.can_manage_assignment(assignment_id));

create policy "admin_delete" on public.submissions for delete to authenticated
  using ((select public.is_admin()));

-- ----------------------------------------------------------------------------
-- 10) Campus: resúmenes semanales
-- ----------------------------------------------------------------------------
create policy "view" on public.weekly_digests for select to authenticated
  using (public.can_view_student(student_id));
create policy "admin_write" on public.weekly_digests for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- ----------------------------------------------------------------------------
-- 11) Revisión: tablas públicas con RLS apagado o políticas abiertas
--     Si aparece algo aquí, revísalo (pueden ser tablas de otras fases).
-- ----------------------------------------------------------------------------
select 'RLS desactivado' as problema, c.relname as tabla, null as politica
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
union all
select 'Política abierta (using true) con escritura', tablename, policyname
from pg_policies
where schemaname = 'public'
  and cmd in ('ALL', 'INSERT', 'UPDATE', 'DELETE')
  and (coalesce(qual, '') = 'true' or coalesce(with_check, '') = 'true')
order by 1, 2;
