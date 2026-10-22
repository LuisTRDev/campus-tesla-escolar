import { useMemo, useState } from 'react'
import { CalendarCheck, ClipboardCheck, Clock, Flame, Rocket, TrendingUp, type LucideIcon } from 'lucide-react'
import { Panel } from '@/components/ui'
import { cn } from '@/lib/utils'
import { combinedIndex, suggestions, type SuggestionIcon } from '@/lib/expedienteSim'
import { bandOf, type Expediente } from '@/services/expediente'
import { ScoreRing } from './widgets'

const ICONS: Record<SuggestionIcon, LucideIcon> = {
  tasks: ClipboardCheck,
  late: Clock,
  attendance: CalendarCheck,
  streak: Flame,
  grade: TrendingUp,
}

/**
 * «¿Cómo subir el índice?»: cada tarjeta dice qué pasaría con el índice si ocurre algo concreto.
 * Al pasar el cursor, enfocar o tocar una tarjeta, el círculo dibuja hasta dónde llegaría.
 */
export function HowToRise({ e, name }: { e: Expediente; name: string }) {
  const list = useMemo(() => suggestions(e), [e])
  const all = useMemo(() => combinedIndex(e, list), [e, list])
  const [hover, setHover] = useState<string | null>(null)
  const [pinned, setPinned] = useState<string | null>(null)
  const [everything, setEverything] = useState(false)
  const value = e.score.value
  if (value == null) return null

  const activeId = hover ?? pinned
  const sel = list.find((s) => s.id === activeId)
  const preview = everything && all ? all.to : sel?.to ?? null
  const band = bandOf(value)
  const topBand = bandOf(100)

  return (
    <Panel title="¿Cómo subir el índice?">
      <div className="grid items-center gap-6 md:grid-cols-[13rem_1fr] [&>*]:min-w-0">
        <div className="space-y-3">
          <ScoreRing value={value} band={band} preview={preview} compact />
          <p className="min-h-[2.5rem] text-center text-sm font-semibold text-texto" aria-live="polite">
            {preview != null && preview > value
              ? `Pasaría de ${value} a ${preview}${bandOf(preview).id !== band.id ? ` · ${bandOf(preview).label}` : ''}`
              : list.length > 0 ? 'Toca una idea para ver el efecto' : ''}
          </p>
        </div>

        {list.length === 0 ? (
          <div className="flex items-start gap-3 rounded-xl bg-estado-ok/10 p-4 text-estado-ok">
            <Rocket className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
            <p className="text-[15px] font-semibold">
              {value >= topBand.min ? `${name} está en lo más alto.` : `${name} ya está haciendo todo bien.`} Mantener el ritmo (tareas a tiempo, puntualidad y constancia) es la mejor forma de sostener el índice.
            </p>
          </div>
        ) : (
          <div>
            <ul className="space-y-2.5">
              {list.map((s, i) => {
                const Icon = ICONS[s.icon]
                const on = !everything && activeId === s.id
                return (
                  <li key={s.id} className="exp-rise" style={{ animationDelay: `${i * 70}ms` }}>
                    <button
                      type="button"
                      aria-pressed={pinned === s.id}
                      onMouseEnter={() => { setHover(s.id); setEverything(false) }}
                      onMouseLeave={() => setHover(null)}
                      onFocus={() => { setHover(s.id); setEverything(false) }}
                      onBlur={() => setHover(null)}
                      onClick={() => { setPinned((p) => (p === s.id ? null : s.id)); setEverything(false) }}
                      className={cn(
                        'flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-all',
                        on ? 'border-transparent bg-papel shadow-md' : 'border-linea bg-superficie hover:bg-papel',
                      )}
                      style={on ? { boxShadow: `0 0 0 2px ${bandOf(s.to).from}` } : undefined}
                    >
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-tinta/10 text-tinta dark:text-tinta-ink"><Icon className="h-5 w-5" aria-hidden /></span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[15px] font-bold leading-snug text-texto">{s.title}</span>
                        <span className="block text-[13px] leading-snug text-texto-suave">{s.detail}</span>
                      </span>
                      <span className="flex shrink-0 flex-col items-end gap-0.5">
                        <span className="cifras rounded-full bg-estado-ok/10 px-2.5 py-0.5 text-sm font-bold text-estado-ok">+{s.gain}</span>
                        {s.newBand && <span className="text-[11px] font-bold text-texto-suave">→ {s.newBand.label}</span>}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
            {list.length > 1 && all && all.gain >= 1 && (
              <button
                type="button"
                aria-pressed={everything}
                onClick={() => { setEverything((v) => !v); setPinned(null); setHover(null) }}
                className={cn('mt-3 inline-flex min-h-10 items-center gap-2 rounded-full border px-4 text-sm font-bold transition-colors', everything ? 'border-transparent bg-tinta text-white' : 'border-linea bg-superficie text-texto hover:bg-papel')}
              >
                <Rocket className="h-4 w-4" aria-hidden />Si se logra todo junto: {all.to}{all.newBand ? ` · ${all.newBand.label}` : ''}
              </button>
            )}
            <p className="mt-3 text-xs text-texto-suave">Es una simulación con las mismas reglas del índice, solo para orientar. No es una promesa de nota.</p>
          </div>
        )}
      </div>
    </Panel>
  )
}
