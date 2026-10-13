import { useAuth, useFocusStudent } from '@/auth/AuthProvider'
import { Empty, ErrorBox, Loading, PageHeader } from '@/components/ui'
import { CourseCover } from '@/components/course'
import { useAsync } from '@/lib/useAsync'
import {
  classroomLabel, getPeopleNames, listAssignmentsForOfferings, listSubmissionsForAssignments, listTeacherOfferings,
} from '@/services/campus'
import { currentPeriod, listPeriods } from '@/services/notas'
import { familyCourseProgress, teacherCourseProgress } from '@/services/progress'
import { useStudentWork } from '@/services/useStudentWork'

function TeacherCourses() {
  const { profile } = useAuth()
  const { data, loading, error, reload } = useAsync(async () => {
    const [offerings, periods] = await Promise.all([listTeacherOfferings(profile!.id), listPeriods()])
    const assignments = await listAssignmentsForOfferings(offerings)
    const submissions = await listSubmissionsForAssignments(assignments.map((a) => a.id))
    return { offerings, assignments, submissions, period: currentPeriod(periods) }
  }, [profile?.id])

  return (
    <>
      <PageHeader title="Mis cursos" subtitle={data?.period ? `Los cursos que dictas este año. ${data.period.name} en curso.` : 'Los cursos que dictas este año.'} />
      {error && <ErrorBox message={error} onRetry={() => void reload()} />}
      {loading ? <Loading shape="cards" /> : data && (
        data.offerings.length === 0 ? (
          <Empty title="Aún no hay cursos" art="notebook">Cuando el colegio te asigne cursos, aparecerán aquí.</Empty>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {data.offerings.map((o) => {
              const { progress, next } = teacherCourseProgress(data.assignments, data.submissions, o.id, data.period)
              return <CourseCover key={o.id} offering={o} showClassroom progress={progress} next={next} />
            })}
          </div>
        )
      )}
    </>
  )
}

function FamilyCourses() {
  const student = useFocusStudent()
  const { data, loading, error, reload } = useStudentWork(student)
  const teachers = useAsync(async () => getPeopleNames((data?.offerings ?? []).map((o) => o.teacher_id)), [data?.offerings.map((o) => o.id).join(',')])

  return (
    <>
      <PageHeader title="Cursos" subtitle={student ? classroomLabel(student.classroom) : undefined} />
      {error && <ErrorBox message={error} onRetry={() => void reload()} />}
      {loading ? <Loading shape="cards" /> : data && (
        data.offerings.length === 0 ? (
          <Empty title="Aún no hay cursos" art="notebook">Cuando el colegio los configure, aparecerán aquí.</Empty>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {data.offerings.map((o) => {
              const { progress, next } = familyCourseProgress(data.tasks, o.id, data.period)
              return (
                <CourseCover
                  key={o.id}
                  offering={o}
                  teacherName={o.teacher_id ? teachers.data?.[o.teacher_id] ?? data.teachers[o.teacher_id] : undefined}
                  progress={progress}
                  next={next}
                />
              )
            })}
          </div>
        )
      )}
    </>
  )
}

export default function CoursesPage() {
  const { profile } = useAuth()
  return profile?.role === 'TEACHER' ? <TeacherCourses /> : <FamilyCourses />
}
