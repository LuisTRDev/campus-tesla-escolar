import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { cleanSingleLine } from '@/lib/security'
import { toMessage } from '@/lib/errors'
import { getSelfStudent, listMyStudents } from '@/services/campus'
import { forgetDevice } from '@/lib/push'
import type { Classroom, Profile, Role, StudentLite } from '@/types'

const CHILD_KEY = 'campus_active_child'
const ROLES: Role[] = ['ADMIN', 'MANAGEMENT', 'AUXILIARY', 'TEACHER', 'STUDENT', 'GUARDIAN']

type AuthState = {
  loading: boolean
  error: string
  session: Session | null
  profile: Profile | null
  /** Para STUDENT: su ficha. */
  selfStudent: StudentLite | null
  /** Para GUARDIAN: sus hijos. */
  children: StudentLite[]
  activeChild: StudentLite | null
  /** Para TEACHER: aulas donde es tutor. */
  tutorClassrooms: Classroom[]
  setActiveChildId: (id: number) => void
  mustChangePassword: boolean
  isAdmin: boolean
  refresh: () => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children: content }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [selfStudent, setSelfStudent] = useState<StudentLite | null>(null)
  const [kids, setKids] = useState<StudentLite[]>([])
  const [tutorClassrooms, setTutorClassrooms] = useState<Classroom[]>([])
  const [activeChildId, setActiveChildIdState] = useState<number | null>(() => {
    const raw = Number(localStorage.getItem(CHILD_KEY))
    return Number.isSafeInteger(raw) && raw > 0 ? raw : null
  })

  const load = useCallback(async (current: Session | null) => {
    setError('')
    setSession(current)
    if (!current?.user) {
      setProfile(null)
      setSelfStudent(null)
      setKids([])
      setTutorClassrooms([])
      setLoading(false)
      return
    }
    try {
      const { data, error: profileError } = await supabase
        .from('profiles')
        .select('id, full_name, role')
        .eq('id', current.user.id)
        .maybeSingle()
      if (profileError) throw profileError
      if (!data || !ROLES.includes(data.role as Role)) {
        setProfile(null)
        setError('Tu cuenta todavía no tiene acceso al campus. Pide al colegio que la active.')
        return
      }
      const nextProfile: Profile = { id: data.id, full_name: cleanSingleLine(data.full_name, 120), role: data.role as Role }
      setProfile(nextProfile)

      if (nextProfile.role === 'STUDENT') {
        setSelfStudent(await getSelfStudent(nextProfile.id))
        setKids([])
      } else if (nextProfile.role === 'GUARDIAN') {
        setSelfStudent(null)
        setKids(await listMyStudents())
      } else {
        setSelfStudent(null)
        setKids([])
      }
      if (nextProfile.role === 'TEACHER') {
        const { data: rooms } = await supabase.from('classrooms').select('id, grade, section, level, tutor_id').eq('tutor_id', nextProfile.id)
        setTutorClassrooms((rooms ?? []) as Classroom[])
      } else {
        setTutorClassrooms([])
      }
    } catch (err) {
      setError(toMessage(err, 'No se pudo cargar tu cuenta.'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let lastUserId: string | null = null
    supabase.auth.getSession().then(({ data }) => {
      lastUserId = data.session?.user.id ?? null
      void load(data.session)
    })
    const { data: listener } = supabase.auth.onAuthStateChange((event, next) => {
      if (event === 'SIGNED_OUT') {
        lastUserId = null
        void load(null)
        return
      }
      if (event === 'USER_UPDATED') {
        setSession(next)
        return
      }
      if (event === 'SIGNED_IN' && next?.user.id !== lastUserId) {
        lastUserId = next?.user.id ?? null
        setLoading(true)
        void load(next)
      }
    })
    return () => listener.subscription.unsubscribe()
  }, [load])

  const setActiveChildId = useCallback((id: number) => {
    setActiveChildIdState(id)
    localStorage.setItem(CHILD_KEY, String(id))
  }, [])

  const value = useMemo<AuthState>(() => {
    const activeChild = kids.find((k) => k.id === activeChildId) ?? kids[0] ?? null
    return {
      loading,
      error,
      session,
      profile,
      selfStudent,
      children: kids,
      activeChild,
      setActiveChildId,
      tutorClassrooms,
      mustChangePassword: session?.user.user_metadata?.must_change_password === true,
      isAdmin: profile?.role === 'ADMIN' || profile?.role === 'MANAGEMENT',
      refresh: () => load(session),
      signOut: async () => {
        localStorage.removeItem(CHILD_KEY)
        await forgetDevice()
        await supabase.auth.signOut()
      },
    }
  }, [loading, error, session, profile, selfStudent, kids, activeChildId, setActiveChildId, tutorClassrooms, load])

  return <AuthContext.Provider value={value}>{content}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider')
  return ctx
}

/** El alumno "en foco": el propio alumno o el hijo seleccionado por la familia. */
export function useFocusStudent(): StudentLite | null {
  const { profile, selfStudent, activeChild } = useAuth()
  if (profile?.role === 'STUDENT') return selfStudent
  if (profile?.role === 'GUARDIAN') return activeChild
  return null
}
