import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { useAuth } from '@/auth/AuthProvider'
import { Button } from '@/components/ui'
import { Illustration, type ArtName } from '@/components/illustrations'
import { cn } from '@/lib/utils'
import type { Role } from '@/types'

type Step = { art: ArtName; title: string; body: ReactNode; cta?: { label: string; to: string } }

function stepsFor(role: Role, name: string): Step[] {
  switch (role) {
    case 'GUARDIAN':
      return [
        { art: 'coil', title: `Bienvenida, familia ${name}`, body: 'Aquí ves la semana de tu hijo: asistencia, tareas, notas y avisos del colegio. Si tienes varios hijos, cámbialos desde arriba.' },
        { art: 'mail', title: 'Comunicados y mensajes', body: 'Los comunicados reemplazan la agenda: léelos y firma las autorizaciones desde el celular. Escribe a los docentes sin dar tu WhatsApp.' },
        { art: 'bell', title: 'Entérate al instante', body: 'Activa las notificaciones y te avisaremos de tardanzas, comunicados, notas y mensajes.', cta: { label: 'Activar notificaciones', to: '/notificaciones' } },
      ]
    case 'STUDENT':
      return [
        { art: 'coil', title: `¡Hola, ${name}!`, body: 'Este es tu campus: tus cursos, tus tareas y los avisos del colegio en un solo lugar.' },
        { art: 'tasks', title: 'Entrega tus tareas', body: 'Abre una tarea, escribe tu respuesta o súbele una foto de tu cuaderno con la cámara, y entrégala antes de la fecha límite.' },
        { art: 'bell', title: 'No te pierdas nada', body: 'Activa las notificaciones para saber cuándo hay una tarea nueva o te ponen nota.', cta: { label: 'Activar notificaciones', to: '/notificaciones' } },
      ]
    case 'TEACHER':
      return [
        { art: 'notebook', title: `Bienvenido, ${name}`, body: 'Cada curso es un cuaderno: publica novedades, materiales y tareas; el anillo muestra cuánto llevas revisado.' },
        { art: 'grades', title: 'Notas por competencias', body: 'Marca qué competencias evalúa cada tarea. En “Notas” el campus te sugiere el nivel de cada alumno a partir de sus entregas.' },
        { art: 'search', title: 'Encuentra todo al instante', body: <>Pulsa <kbd className="rounded border border-linea px-1.5 font-bold">Ctrl</kbd> + <kbd className="rounded border border-linea px-1.5 font-bold">K</kbd> (o la lupa) para saltar a cualquier alumno, curso o tarea. Configura tu horario de atención en “Mensajes”.</> },
      ]
    default:
      return [
        { art: 'notebook', title: `Bienvenida, ${name}`, body: 'Tu inicio es el Panel: asistencia, tareas, notas y lectura de comunicados de todo el colegio, por aula y por docente. En “Cursos por aula” asignas docentes y tutores.' },
        { art: 'mail', title: 'Comunicados y bimestres', body: 'Envía comunicados con confirmación de lectura y firma. En “Bimestres” cierras el registro y publicas las libretas.' },
        { art: 'search', title: 'Búsqueda rápida', body: <>Pulsa <kbd className="rounded border border-linea px-1.5 font-bold">Ctrl</kbd> + <kbd className="rounded border border-linea px-1.5 font-bold">K</kbd> para encontrar cualquier alumno por nombre o DNI, curso o tarea.</> },
      ]
  }
}

const key = (id: string) => `campus_tour_done_${id}`

export function Onboarding() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState(0)
  const touch = useRef<number | null>(null)

  useEffect(() => {
    if (!profile) return
    try {
      if (!localStorage.getItem(key(profile.id))) setOpen(true)
    } catch { /* sin almacenamiento: no se muestra */ }
  }, [profile])

  if (!open || !profile) return null
  const steps = stepsFor(profile.role, profile.full_name?.split(' ')[0] ?? '')
  const current = steps[step]
  const last = step === steps.length - 1

  function finish(to?: string) {
    try { localStorage.setItem(key(profile!.id), '1') } catch { /* sin almacenamiento */ }
    setOpen(false)
    if (to) navigate(to)
  }

  return (
    <div className="fixed inset-0 z-[55] flex items-end justify-center sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="Recorrido de bienvenida">
      <div className="backdrop-in absolute inset-0 bg-tinta/60" />
      <div
        className="sheet-up relative w-full max-w-md overflow-hidden rounded-t-2xl bg-superficie pb-[env(safe-area-inset-bottom)] shadow-2xl sm:rounded-2xl"
        onTouchStart={(e) => { touch.current = e.touches[0].clientX }}
        onTouchEnd={(e) => {
          if (touch.current == null) return
          const dx = e.changedTouches[0].clientX - touch.current
          touch.current = null
          if (dx < -50 && !last) setStep((s) => s + 1)
          if (dx > 50 && step > 0) setStep((s) => s - 1)
        }}
      >
        <div className="relative flex h-48 items-center justify-center overflow-hidden bg-tinta">
          <div className="login-coils absolute inset-0 opacity-80" aria-hidden />
          <div key={step} className="page-in relative rounded-full bg-superficie/95 p-4 shadow-lg">
            <Illustration name={current.art} className="h-28 w-28" />
          </div>
        </div>
        <div key={`t${step}`} className="page-in px-6 pb-5 pt-6">
          <p className="text-xs font-bold uppercase tracking-wide text-chispa-600">Paso {step + 1} de {steps.length}</p>
          <h2 className="mt-1 font-display text-2xl font-bold leading-tight">{current.title}</h2>
          <p className="mt-2 text-[15px] leading-relaxed text-texto-suave">{current.body}</p>
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-linea px-6 py-4">
          <div className="flex gap-1.5" aria-hidden>
            {steps.map((_, i) => <span key={i} className={cn('h-2 rounded-full transition-all', i === step ? 'w-6 bg-chispa' : 'w-2 bg-linea')} />)}
          </div>
          <div className="flex items-center gap-2">
            {step === 0
              ? <Button variant="ghost" onClick={() => finish()}>Saltar</Button>
              : <Button variant="ghost" onClick={() => setStep((s) => s - 1)} aria-label="Anterior"><ArrowLeft className="h-4 w-4" /></Button>}
            {last ? (
              current.cta
                ? <><Button variant="secondary" onClick={() => finish()}>Después</Button><Button onClick={() => finish(current.cta!.to)}>{current.cta.label}</Button></>
                : <Button onClick={() => finish()}>Empezar</Button>
            ) : (
              <Button onClick={() => setStep((s) => s + 1)}>Siguiente<ArrowRight className="h-4 w-4" /></Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
