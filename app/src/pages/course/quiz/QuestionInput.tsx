import { Check } from 'lucide-react'
import { Input, Select, Textarea } from '@/components/ui'
import { haptic } from '@/lib/ux'
import { cn } from '@/lib/utils'
import type { AttemptQuestion, MatchOptions, Option, QuizAnswer } from '@/services/aprendizaje'

export function QuestionInput({ q, value, onChange, disabled }: { q: AttemptQuestion; value: QuizAnswer; onChange: (v: QuizAnswer) => void; disabled?: boolean }) {
  if (q.type === 'SINGLE' || q.type === 'MULTI') {
    const sel = q.type === 'MULTI' ? ((value as string[]) ?? []) : value
    return (
      <div className="space-y-2">
        {(q.options as Option[]).map((o) => {
          const on = q.type === 'MULTI' ? (sel as string[]).includes(o.id) : sel === o.id
          return (
            <button key={o.id} type="button" disabled={disabled} aria-pressed={on}
              onClick={() => { haptic(); onChange(q.type === 'MULTI' ? (on ? (sel as string[]).filter((x) => x !== o.id) : [...(sel as string[]), o.id]) : o.id) }}
              className={cn('flex w-full items-center gap-3 rounded-xl border-2 px-4 py-3 text-left transition-colors', on ? 'border-tinta bg-chispa-100 font-bold text-tinta' : 'border-linea hover:border-tinta-500')}>
              <span className={cn('flex h-5 w-5 shrink-0 items-center justify-center border-2', q.type === 'MULTI' ? 'rounded' : 'rounded-full', on ? 'border-tinta bg-tinta text-white' : 'border-linea')}>
                {on && <Check className="h-3 w-3" />}
              </span>
              {o.text}
            </button>
          )
        })}
        {q.type === 'MULTI' && <p className="text-xs text-texto-suave">Puedes marcar varias.</p>}
      </div>
    )
  }
  if (q.type === 'TRUE_FALSE') {
    return (
      <div className="grid grid-cols-2 gap-2">
        {[true, false].map((v) => (
          <button key={String(v)} type="button" disabled={disabled} aria-pressed={value === v} onClick={() => { haptic(); onChange(v) }}
            className={cn('rounded-xl border-2 px-4 py-3 font-bold', value === v ? 'border-tinta bg-chispa-100 text-tinta' : 'border-linea hover:border-tinta-500')}>
            {v ? 'Verdadero' : 'Falso'}
          </button>
        ))}
      </div>
    )
  }
  if (q.type === 'MATCH') {
    const m = q.options as MatchOptions
    const v = (value as Record<string, string>) ?? {}
    return (
      <div className="space-y-2">
        {m.left.map((l) => (
          <div key={l.id} className="grid items-center gap-2 sm:grid-cols-[1fr_1fr]">
            <span className="rounded-lg bg-papel px-3 py-2 font-bold">{l.text}</span>
            <Select disabled={disabled} value={v[l.id] ?? ''} onChange={(e) => onChange({ ...v, [l.id]: e.target.value })} aria-label={`Pareja de ${l.text}`}>
              <option value="">Elegir…</option>
              {m.right.map((r) => <option key={r.id} value={r.id}>{r.text}</option>)}
            </Select>
          </div>
        ))}
      </div>
    )
  }
  if (q.type === 'SHORT') return <Input disabled={disabled} value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)} maxLength={200} placeholder="Tu respuesta" />
  return <Textarea disabled={disabled} value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)} maxLength={4000} className="min-h-32" placeholder="Desarrolla tu respuesta" />
}

export function answered(v: QuizAnswer): boolean {
  if (v == null || v === '') return false
  if (Array.isArray(v)) return v.length > 0
  if (typeof v === 'object') return Object.values(v).some(Boolean)
  return true
}

export function describeAnswer(q: AttemptQuestion, v: QuizAnswer): string {
  if (!answered(v)) return 'Sin responder'
  if (q.type === 'SINGLE') return (q.options as Option[]).find((o) => o.id === v)?.text ?? '—'
  if (q.type === 'MULTI') return (q.options as Option[]).filter((o) => (v as string[]).includes(o.id)).map((o) => o.text).join(', ')
  if (q.type === 'TRUE_FALSE') return v ? 'Verdadero' : 'Falso'
  if (q.type === 'MATCH') {
    const m = q.options as MatchOptions
    return m.left.map((l) => `${l.text} → ${m.right.find((r) => r.id === (v as Record<string, string>)[l.id])?.text ?? '—'}`).join(' · ')
  }
  return String(v)
}
