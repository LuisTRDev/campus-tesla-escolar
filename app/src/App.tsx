import { lazy, Suspense, type ReactNode } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from '@/auth/AuthProvider'
import { Shell } from '@/components/layout/Shell'
import { Empty, Loading } from '@/components/ui'
import Login from '@/pages/Login'
import ChangePassword from '@/pages/ChangePassword'
import StudentHome from '@/pages/student/StudentHome'
import GuardianHome from '@/pages/guardian/GuardianHome'
import TeacherHome from '@/pages/teacher/TeacherHome'
const AdminCourses = lazy(() => import('@/pages/admin/AdminCourses'))
const AdminAccounts = lazy(() => import('@/pages/admin/AdminAccounts'))
const CoursePage = lazy(() => import('@/pages/course/CoursePage'))
const AssignmentPage = lazy(() => import('@/pages/course/AssignmentPage'))
import CoursesPage from '@/pages/shared/CoursesPage'
import TasksPage from '@/pages/shared/TasksPage'
import AnnouncementsPage from '@/pages/shared/AnnouncementsPage'
const GradebookPage = lazy(() => import('@/pages/notas/GradebookPage'))
const ConsolidatedPage = lazy(() => import('@/pages/notas/ConsolidatedPage'))
const ReportCardPage = lazy(() => import('@/pages/notas/ReportCardPage'))
const AdminPeriods = lazy(() => import('@/pages/admin/AdminPeriods'))
import DirectorDashboard from '@/pages/admin/DirectorDashboard'
const CircularsPage = lazy(() => import('@/pages/comunicados/CircularsPage'))
const CircularDetailPage = lazy(() => import('@/pages/comunicados/CircularDetailPage'))
const MessagesPage = lazy(() => import('@/pages/mensajes/MessagesPage'))
const AgendaPage = lazy(() => import('@/pages/calendario/AgendaPage'))
const SchedulePage = lazy(() => import('@/pages/calendario/SchedulePage'))
import NotificationsPage from '@/pages/NotificationsPage'
const PerfilTeslaPage = lazy(() => import('@/pages/tesla/PerfilTeslaPage'))
const TiendaPage = lazy(() => import('@/pages/tesla/TiendaPage'))
const TeslaAulaPage = lazy(() => import('@/pages/tesla/TeslaAulaPage'))
const AdminRecompensas = lazy(() => import('@/pages/admin/AdminRecompensas'))

// Pantallas nuevas: se cargan solo cuando se abren.
const PlannerPage = lazy(() => import('@/pages/teacher/PlannerPage'))
const ResourcesPage = lazy(() => import('@/pages/teacher/ResourcesPage'))
const AlertsPage = lazy(() => import('@/pages/gestion/AlertsPage'))
const AppointmentsPage = lazy(() => import('@/pages/gestion/AppointmentsPage'))
const JustificationsPage = lazy(() => import('@/pages/gestion/JustificationsPage'))
const SurveysPage = lazy(() => import('@/pages/gestion/SurveysPage'))
const ChannelsPage = lazy(() => import('@/pages/comunicacion/ChannelsPage'))
const SystemPage = lazy(() => import('@/pages/admin/SystemPage'))
const AjustesPage = lazy(() => import('@/pages/AjustesPage'))

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

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center"><Loading label="Abriendo el campus…" /></div>
  }

  if (!session) return <Login />

  if (!profile) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
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
