import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, PartyPopper, X } from 'lucide-react'
import { useAuth } from '@/auth/AuthProvider'
import { AyudaLink } from '@/components/AyudaLink'
import { Panel } from '@/components/ui'
import { pushStatus } from '@/lib/push'
import { firstStepsFor, helpGroup, hideChecklist, isChecklistHidden, markStep, useDoneSteps } from '@/lib/ayuda'
import { cn } from '@/lib/utils'

/**
 * «Primeros pasos»: lista que se tilda sola cuando la persona hace cada cosa
 * (ver la libreta, leer un comunicado…). Al terminar celebra y se puede ocultar.
 */
export function PrimerosPasos({ className }: { className?: string }) {
  const { profile } = useAuth()
  const userId = profile?.id ?? ''
  const done = useDoneSteps(userId)
  const [hidden, setHidden] = useState(() => !!userId && isChecklistHidden(userId))

  useEffect(() => {
    if (!userId) return
    markStep(userId, 'entrar')
    // Los avisos cuentan cuando el celular ya está suscrito, no solo por visitar la pantalla.
    void pushStatus().then((s) => { if (s === 'on') markStep(userId, 'avisos') }).catch(() => undefined)
  }, [userId])

  if (!profile || hidden) return null
  const steps = firstStepsFor(helpGroup(profile.role))
  const complete = steps.filter((s) => done.includes(s.id)).length
  const all = complete === steps.length
  const next = steps.find((s) => !done.includes(s.id))

  function dismiss() {
    hideChecklist(userId)
    setHidden(true)
  }

  return (
    <Panel
      title={all ? '¡Completó los primeros pasos!' : 'Primeros pasos'}
      action={<button onClick={dismiss} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md text-texto-suave hover:bg-papel" aria-label="Ocultar los primeros pasos"><X className="h-5 w-5" /></button>}
      className={className}
    >
      {all ? (
        <div className="page-in flex items-start gap-3">
          <PartyPopper className="mt-0.5 h-7 w-7 shrink-0 text-chispa-600" aria-hidden />
          <p className="text-[15px]">Ya conoce lo más importante del campus. Cuando tenga una duda, toque <b>Ayuda</b> arriba: ahí están los pasos de cada tarea.</p>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-3">
            <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-papel" role="progressbar" aria-valuemin={0} aria-valuemax={steps.length} aria-valuenow={complete} aria-label="Avance de los primeros pasos">
              <div className="h-full rounded-full bg-estado-ok transition-all duration-500" style={{ width: `${(complete / steps.length) * 100}%` }} />
            </div>
            <span className="text-sm font-bold text-texto-suave">{complete} de {steps.length}</span>
          </div>
          <ul className="mt-3 divide-y divide-linea">
            {steps.map((s) => {
              const ok = done.includes(s.id)
              return (
                <li key={s.id} className="flex items-center gap-3 py-2.5">
                  <span className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2', ok ? 'border-estado-ok bg-estado-ok text-white' : 'border-linea')} aria-hidden>
                    {ok && <Check className="check-pop h-4 w-4" strokeWidth={3} />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className={cn('font-bold', ok && 'text-texto-suave line-through decoration-1')}>
                      <span className="sr-only">{ok ? 'Hecho: ' : 'Pendiente: '}</span>{s.label}
                    </p>
                    {!ok && <p className="text-sm text-texto-suave">{s.hint}</p>}
                  </div>
                  {!ok && s.to && <Link to={s.to} className="inline-flex min-h-11 items-center rounded-lg bg-tinta px-3 text-sm font-bold text-white">Hacerlo</Link>}
                  {!ok && s.helpTopic && !s.to && <AyudaLink topic={s.helpTopic} label="Ayuda" />}
                </li>
              )
            })}
          </ul>
          {next?.helpTopic && <div className="mt-2"><AyudaLink topic={next.helpTopic} label={`Ver cómo: ${next.label.toLowerCase()}`} /></div>}
        </>
      )}
    </Panel>
  )
}
