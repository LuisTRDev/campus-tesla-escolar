-- ============================================================================
-- CAMPUS VIRTUAL TESLA · FASE 1 · Script 06 de 06
-- Datos iniciales del piloto: áreas curriculares y cursos de UN aula.
--
-- ANTES DE EJECUTAR, cambia los valores marcados con  <-- CAMBIAR
--   1. Crea las cuentas de los docentes (Authentication > Users > Add user)
--      o desde la app del campus en "Cuentas" (recomendado).
--   2. Escribe abajo el id del aula piloto y los correos de los docentes.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Áreas curriculares (catálogo del colegio). Puedes editar colores.
-- ----------------------------------------------------------------------------
insert into public.subjects (name, short_name, color, level) values
  ('Matemática',                        'MAT', '#2563EB', 'Secundaria'),
  ('Comunicación',                      'COM', '#DC2626', 'Secundaria'),
  ('Inglés',                            'ING', '#7C3AED', 'Secundaria'),
  ('Ciencia y Tecnología',              'CyT', '#059669', 'Secundaria'),
  ('Ciencias Sociales',                 'CCSS','#B45309', 'Secundaria'),
  ('Desarrollo Personal, Ciudadanía y Cívica', 'DPCC', '#DB2777', 'Secundaria'),
  ('Educación para el Trabajo',         'EPT', '#0891B2', 'Secundaria'),
  ('Arte y Cultura',                    'ART', '#EA580C', 'Secundaria'),
  ('Educación Física',                  'EF',  '#16A34A', 'Secundaria'),
  ('Educación Religiosa',               'REL', '#4B5563', 'Secundaria'),
  ('Matemática',                        'MAT', '#2563EB', 'Primaria'),
  ('Comunicación',                      'COM', '#DC2626', 'Primaria'),
  ('Inglés',                            'ING', '#7C3AED', 'Primaria'),
  ('Ciencia y Tecnología',              'CyT', '#059669', 'Primaria'),
  ('Personal Social',                   'PS',  '#B45309', 'Primaria'),
  ('Arte y Cultura',                    'ART', '#EA580C', 'Primaria'),
  ('Educación Física',                  'EF',  '#16A34A', 'Primaria'),
  ('Educación Religiosa',               'REL', '#4B5563', 'Primaria')
on conflict do nothing;

-- ----------------------------------------------------------------------------
-- 2) Cursos del aula piloto
--    Descomenta el bloque, cambia los valores y ejecútalo.
-- ----------------------------------------------------------------------------
/*
do $$
declare
  v_classroom_id bigint := 1;                               -- <-- CAMBIAR: id del aula piloto
  v_year_id bigint := (select id from public.academic_years where is_current);
  v_level text;
begin
  select level into v_level from public.classrooms where id = v_classroom_id;
  if v_level is null then
    raise exception 'El aula % no existe o no tiene nivel (Primaria/Secundaria).', v_classroom_id;
  end if;

  -- Tutor del aula (debe tener cuenta con rol TEACHER)
  update public.classrooms
  set tutor_id = (select id from public.profiles p
                  join auth.users u using (id)
                  where lower(u.email) = lower('tutor@colegio.pe'))   -- <-- CAMBIAR
  where id = v_classroom_id;

  -- Un curso por docente. Agrega una línea por cada curso del piloto.
  -- Formato: ('Nombre exacto del área', 'correo del docente')
  insert into public.course_offerings (academic_year_id, classroom_id, subject_id, teacher_id)
  select v_year_id, v_classroom_id, sj.id, u.id
  from (values
    ('Matemática',           'docente.mate@colegio.pe'),          -- <-- CAMBIAR
    ('Comunicación',         'docente.comu@colegio.pe'),
    ('Ciencia y Tecnología', 'docente.ciencia@colegio.pe')
  ) as x(subject_name, teacher_email)
  join public.subjects sj
    on sj.name = x.subject_name
   and sj.level = v_level
  left join auth.users u on lower(u.email) = lower(x.teacher_email)
  on conflict (academic_year_id, classroom_id, subject_id)
  do update set teacher_id = excluded.teacher_id, is_active = true;

  raise notice 'Cursos del aula % listos.', v_classroom_id;
end $$;
*/

-- ----------------------------------------------------------------------------
-- 3) Verificación final
-- ----------------------------------------------------------------------------
select c.id as aula_id,
       c.grade || ' ' || coalesce(c.section, '') || ' · ' || coalesce(c.level, '') as aula,
       sj.name as curso,
       coalesce(p.full_name, '(sin docente)') as docente
from public.course_offerings o
join public.classrooms c on c.id = o.classroom_id
join public.subjects sj on sj.id = o.subject_id
left join public.profiles p on p.id = o.teacher_id
order by c.id, sj.name;
