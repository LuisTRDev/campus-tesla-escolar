import { Suspense, type ReactNode } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from '@/auth/AuthProvider'
import { Shell } from '@/components/layout/Shell'
import { Empty, Loading } from '@/components/ui'
import { lazyPage, usePrefetch } from '@/lib/perf'
import Login from '@/pages/Login'
import ChangePassword from '@/pages/ChangePassword'
// Todas las pantallas (incluido el inicio de cada rol) se cargan solo cuando se abren:
// así el primer arranque en el celular descarga lo mínimo.
const StudentHome = lazyPage(() => import('@/pages/student/StudentHome'))
const GuardianHome = lazyPage(() => import('@/pages/guardian/GuardianHome'))
const TeacherHome = lazyPage(() => import('@/pages/teacher/TeacherHome'))
const AdminCourses = lazyPage(() => import('@/pages/admin/AdminCourses'))
const AdminAccounts = lazyPage(() => import('@/pages/admin/AdminAccounts'))
const CoursePage = lazyPage(() => import('@/pages/course/CoursePage'))
const AssignmentPage = lazyPage(() => import('@/pages/course/AssignmentPage'))
const CoursesPage = lazyPage(() => import('@/pages/shared/CoursesPage'))
const TasksPage = lazyPage(() => import('@/pages/shared/TasksPage'))
const AnnouncementsPage = lazyPage(() => import('@/pages/shared/AnnouncementsPage'))
const GradebookPage = lazyPage(() => import('@/pages/notas/GradebookPage'))
const ConsolidatedPage = lazyPage(() => import('@/pages/notas/ConsolidatedPage'))
const ReportCardPage = lazyPage(() => import('@/pages/notas/ReportCardPage'))
const AdminPeriods = lazyPage(() => import('@/pages/admin/AdminPeriods'))
const DirectorDashboard = lazyPage(() => import('@/pages/admin/DirectorDashboard'))
const CircularsPage = lazyPage(() => import('@/pages/comunicados/CircularsPage'))
const CircularDetailPage = lazyPage(() => import('@/pages/comunicados/CircularDetailPage'))
const MessagesPage = lazyPage(() => import('@/pages/mensajes/MessagesPage'))
const AgendaPage = lazyPage(() => import('@/pages/calendario/AgendaPage'))
const SchedulePage = lazyPage(() => import('@/pages/calendario/SchedulePage'))
const NotificationsPage = lazyPage(() => import('@/pages/NotificationsPage'))
const PerfilTeslaPage = lazyPage(() => import('@/pages/tesla/PerfilTeslaPage'))
const TiendaPage = lazyPage(() => import('@/pages/tesla/TiendaPage'))
const TeslaAulaPage = lazyPage(() => import('@/pages/tesla/TeslaAulaPage'))
const AdminRecompensas = lazyPage(() => import('@/pages/admin/AdminRecompensas'))

const PlannerPage = lazyPage(() => import('@/pages/teacher/PlannerPage'))
const ResourcesPage = lazyPage(() => import('@/pages/teacher/ResourcesPage'))
const AlertsPage = lazyPage(() => import('@/pages/gestion/AlertsPage'))
const AppointmentsPage = lazyPage(() => import('@/pages/gestion/AppointmentsPage'))
const JustificationsPage = lazyPage(() => import('@/pages/gestion/JustificationsPage'))
const SurveysPage = lazyPage(() => import('@/pages/gestion/SurveysPage'))
const ChannelsPage = lazyPage(() => import('@/pages/comunicacion/ChannelsPage'))
const SystemPage = lazyPage(() => import('@/pages/admin/SystemPage'))
const AjustesPage = lazyPage(() => import('@/pages/AjustesPage'))

const L = ({ children }: { children: ReactNode }) => <Suspense fallback={<Loading shape="page" />}>{children}</Suspense>

function Home() {
  const { profile } = useAuth()
  switch (profile?.role) {
    case 'TEACHER': return <TeacherHome />
    case 'STUDENT': return <StudentHome />
    case 'GUARDIAN': return <GuardianHome />
    default: return <DirectorDashboard />
  }
}

function NotFound() {
  return <Empty title="Esta página no existe" art="search">Vuelve al inicio desde el menú.</Empty>
}

export default function App() {
  const { loading, session, profile, error, mustChangePassword, isAdmin, signOut, tutorClassrooms } = useAuth()

  // Con buena conexión, las pantallas más usadas del rol se descargan en un momento libre.
  const role = profile?.role
  usePrefetch(
    role === 'STUDENT' ? [CoursesPage, TasksPage, CoursePage, AssignmentPage, PerfilTeslaPage]
      : role === 'GUARDIAN' ? [TasksPage, ReportCardPage, MessagesPage, CoursePage]
      : role === 'TEACHER' ? [CoursesPage, CoursePage, AssignmentPage, GradebookPage]
      : [AdminCourses, AnnouncementsPage, CircularsPage, GradebookPage],
    !!profile && !mustChangePassword,
  )

  if (loading) {
    return <div className="flex min-h-dvh items-center justify-center"><Loading label="Abriendo el campus…" /></div>
  }

  if (!session) return <Login />

  if (!profile) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="max-w-md text-texto">{error || 'Tu cuenta no tiene acceso al campus.'}</p>
        <button onClick={() => void signOut()} className="font-bold text-tinta underline">Salir</button>
      </div>
    )
  }

  if (mustChangePassword) return <ChangePassword forced />

  const isFamily = profile.role === 'STUDENT' || profile.role === 'GUARDIAN'
  const isStaff = profile.role === 'ADMIN' || profile.role === 'MANAGEMENT' || profile.role === 'AUXILIARY'
  const isTeacher = profile.role === 'TEACHER'
  const home = <Navigate to="/" replace />

  return (
    <Routes>
      <Route element={<Shell />}>
        <Route index element={<Home />} />
        <Route path="cursos" element={profile.role === 'TEACHER' || isFamily ? <CoursesPage /> : <Navigate to="/" replace />} />
        <Route path="tareas" element={isFamily ? <TasksPage /> : <Navigate to="/" replace />} />
        <Route path="anuncios" element={<AnnouncementsPage />} />
        <Route path="curso/:offeringId" element={<CoursePage />} />
        <Route path="tarea/:assignmentId" element={<AssignmentPage />} />
        <Route path="notas" element={isTeacher || isStaff ? <GradebookPage /> : home} />
        <Route path="notas/:offeringId" element={isTeacher || isStaff ? <GradebookPage /> : home} />
        <Route path="consolidado" element={isStaff || tutorClassrooms.length > 0 ? <ConsolidatedPage /> : home} />
        <Route path="libreta" element={isFamily ? <ReportCardPage /> : home} />
        <Route path="libreta/:studentId" element={!isFamily ? <ReportCardPage /> : home} />
        <Route path="libretas/:classroomId" element={!isFamily ? <ReportCardPage bulk /> : home} />
        <Route path="comunicados" element={profile.role !== 'STUDENT' ? <CircularsPage /> : home} />
        <Route path="comunicados/:circularId" element={profile.role !== 'STUDENT' ? <CircularDetailPage /> : home} />
        <Route path="mensajes" element={profile.role === 'GUARDIAN' || isTeacher || isAdmin ? <MessagesPage /> : home} />
        <Route path="mensajes/:conversationId" element={profile.role === 'GUARDIAN' || isTeacher || isAdmin ? <MessagesPage /> : home} />
        <Route path="agenda" element={<AgendaPage />} />
        <Route path="horario" element={<SchedulePage />} />
        <Route path="notificaciones" element={<NotificationsPage />} />
        <Route path="perfil-tesla" element={isFamily ? <PerfilTeslaPage /> : isTeacher || isStaff ? <Navigate to="/tesla/aula" replace /> : home} />
        <Route path="perfil-tesla/:studentId" element={<PerfilTeslaPage />} />
        <Route path="tienda" element={isFamily ? <TiendaPage /> : home} />
        <Route path="tesla/aula" element={isTeacher || isStaff ? <TeslaAulaPage /> : home} />
        <Route path="admin/recompensas" element={isAdmin ? <AdminRecompensas /> : home} />
        <Route path="admin/cursos" element={isStaff ? <AdminCourses /> : home} />
        <Route path="admin/bimestres" element={isAdmin ? <AdminPeriods /> : home} />
        <Route path="admin/cuentas" element={isAdmin ? <AdminAccounts /> : <Navigate to="/" replace />} />
        <Route path="planificador" element={isTeacher ? <L><PlannerPage /></L> : home} />
        <Route path="recursos" element={isTeacher || isStaff ? <L><ResourcesPage /></L> : home} />
        <Route path="alertas" element={isTeacher || isStaff ? <L><AlertsPage /></L> : home} />
        <Route path="citas" element={isTeacher || profile.role === 'GUARDIAN' || isAdmin ? <L><AppointmentsPage /></L> : home} />
        <Route path="justificaciones" element={profile.role !== 'STUDENT' ? <L><JustificationsPage /></L> : home} />
        <Route path="encuestas" element={<L><SurveysPage /></L>} />
        <Route path="grupos" element={<L><ChannelsPage /></L>} />
        <Route path="grupos/:channelId" element={<L><ChannelsPage /></L>} />
        <Route path="admin/sistema" element={isAdmin ? <L><SystemPage /></L> : home} />
        <Route path="ajustes" element={<L><AjustesPage /></L>} />
        <Route path="cambiar-clave" element={<div className="py-4"><ChangePassword /></div>} />
        <Route path="login" element={<Navigate to="/" replace />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}
