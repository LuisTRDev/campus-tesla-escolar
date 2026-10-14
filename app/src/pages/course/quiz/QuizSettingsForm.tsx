import { useEffect, useState } from 'react'
import { KeyRound, RefreshCw, Save, ShieldCheck } from 'lucide-react'
import { Button, Field, Input, Segmented, Select } from '@/components/ui'
import { useToast } from '@/lib/toast'
import { toMessage } from '@/lib/errors'
import { INTEGRITY_PRESETS, PRESET_INFO } from '@/lib/integrity'
import { updateQuizSettings } from '@/services/aprendizaje'
import { getQuizAccessCode, setQuizAccessCode } from '@/services/integridad'
import type { AssignmentWithCourse, QuizSettings } from '@/types'

type Level = NonNullable<QuizSettings['integrity_level']>

export const QUIZ_DEFAULTS: QuizSettings = {
  time_limit_min: null, max_attempts: 1, shuffle_questions: true, shuffle_options: true, show_answers: 'AFTER_DUE',
  integrity_level: 'STANDARD', ...INTEGRITY_PRESETS.STANDARD,
}

/** ISO → valor de <input type="datetime-local"> en la hora del dispositivo. */
function toLocalInput(iso?: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
}

function randomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => chars[b % chars.length]).join('')
}

const check = 'h-4 w-4 shrink-0 accent-[#0B1D33]'

export function QuizSettingsForm({ assignment, questionCount, onSaved }: { assignment: AssignmentWithCourse; questionCount: number; onSaved: () => void }) {
  const toast = useToast()
  const [s, setS] = useState<QuizSettings>({ ...QUIZ_DEFAULTS, ...(assignment.quiz_settings ?? {}) })
  const [busy, setBusy] = useState(false)
  const [code, setCode] = useState('')
  const [savedCode, setSavedCode] = useState<string | null>(null)
  const [codeBusy, setCodeBusy] = useState(false)
  const level: Level = s.integrity_level ?? 'CUSTOM'

  useEffect(() => {
    let alive = true
    void getQuizAccessCode(assignment.id).then((c) => { if (alive) { setSavedCode(c); setCode(c ?? '') } })
    return () => { alive = false }
  }, [assignment.id])

  /** Cambiar una opción suelta pasa el nivel a "Personalizado". */
  const set = (patch: Partial<QuizSettings>) => setS((x) => ({ ...x, ...patch, integrity_level: 'CUSTOM' }))

  async function save() {
    setBusy(true)
    try {
      await updateQuizSettings(assignment.id, { ...s, pick_count: s.pick_count && s.pick_count > 0 ? s.pick_count : null })
      toast('Configuración guardada.')
      onSaved()
    } catch (err) {
      toast(toMessage(err), 'error')
    } finally {
      setBusy(false)
    }
  }

  async function saveCode(value: string | null) {
    setCodeBusy(true)
    try {
      await setQuizAccessCode(assignment.id, value)
      const clean = value ? value.toUpperCase().replace(/\s/g, '') : null
      setSavedCode(clean)
      setCode(clean ?? '')
      toast(clean ? `Código de acceso: ${clean}` : 'La evaluación ya no pide código.')
    } catch (err) {
      toast(toMessage(err), 'error')
    } finally {
      setCodeBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Tiempo límite (minutos)" hint="Vacío: sin límite.">
          <Input type="number" inputMode="numeric" min={1} max={300} value={s.time_limit_min ?? ''} onChange={(e) => setS({ ...s, time_limit_min: e.target.value ? Number(e.target.value) : null })} />
        </Field>
        <Field label="Intentos permitidos"><Input type="number" inputMode="numeric" min={1} max={10} value={s.max_attempts ?? 1} onChange={(e) => setS({ ...s, max_attempts: Number(e.target.value) })} /></Field>
        <Field label="Mostrar respuestas correctas" hint="Nunca se muestran mientras al alumno le queden intentos.">
          <Select value={s.show_answers} onChange={(e) => setS({ ...s, show_answers: e.target.value as QuizSettings['show_answers'] })}>
            <option value="AFTER_DUE">Después de la fecha límite (recomendado)</option>
            <option value="AFTER_SUBMIT">Al terminar</option>
            <option value="NEVER">Nunca (solo ve su nota)</option>
          </Select>
        </Field>
        <Field label="Preguntas por alumno" hint={`Vacío: todas${questionCount ? ` (${questionCount})` : ''}. Si pones menos, cada alumno recibe otras al azar.`}>
          <Input type="number" inputMode="numeric" min={1} max={Math.max(questionCount, 1)} value={s.pick_count ?? ''}
            onChange={(e) => setS({ ...s, pick_count: e.target.value ? Number(e.target.value) : null })} />
        </Field>
        <div className="space-y-2 sm:col-span-2">
          <label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={!!s.shuffle_questions} onChange={(e) => setS({ ...s, shuffle_questions: e.target.checked })} className={check} />Preguntas en orden al azar</label>
          <label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={!!s.shuffle_options} onChange={(e) => setS({ ...s, shuffle_options: e.target.checked })} className={check} />Opciones en orden al azar</label>
        </div>
      </div>

      <fieldset className="space-y-4 rounded-xl border border-linea p-4">
        <legend className="flex items-center gap-1.5 px-1 font-display font-bold"><ShieldCheck className="h-4 w-4" />Integridad</legend>
        <div className="overflow-x-auto">
          <Segmented<Level>
            value={level}
            onChange={(v) => { if (v !== 'CUSTOM') setS((x) => ({ ...x, ...INTEGRITY_PRESETS[v], integrity_level: v })) }}
            options={[
              { value: 'FREE', label: PRESET_INFO.FREE.label },
              { value: 'STANDARD', label: PRESET_INFO.STANDARD.label },
              { value: 'STRICT', label: PRESET_INFO.STRICT.label },
              { value: 'CUSTOM', label: 'A medida' },
            ]}
          />
        </div>
        <p className="text-sm text-texto-suave">{level === 'CUSTOM' ? 'Elegiste cada opción.' : PRESET_INFO[level].hint}</p>

        <div className="grid gap-3 sm:grid-cols-[1fr_9rem]">
          <Field label="Si el alumno sale de la evaluación">
            <Select value={s.leave_action ?? 'WARN'} onChange={(e) => set({ leave_action: e.target.value as QuizSettings['leave_action'] })}>
              <option value="LOG">Solo registrarlo</option>
              <option value="WARN">Avisarle y registrarlo</option>
              <option value="CLOSE">Enviar la evaluación al llegar al límite</option>
            </Select>
          </Field>
          {s.leave_action === 'CLOSE' && (
            <Field label="Salidas permitidas">
              <Input type="number" inputMode="numeric" min={1} max={20} value={s.max_leaves ?? 3} onChange={(e) => set({ max_leaves: Math.max(1, Number(e.target.value) || 1) })} />
            </Field>
          )}
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={!!s.sequential} onChange={(e) => set({ sequential: e.target.checked })} className={`${check} mt-0.5`} /><span><b>Una pregunta a la vez</b><br /><span className="text-texto-suave">Sin volver atrás; no ven las siguientes antes de tiempo.</span></span></label>
          <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={!!s.lock_device} onChange={(e) => set({ lock_device: e.target.checked })} className={`${check} mt-0.5`} /><span><b>Un solo dispositivo</b><br /><span className="text-texto-suave">Si lo abren en otro, lo liberas desde Resultados.</span></span></label>
          <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={!!s.block_paste} onChange={(e) => set({ block_paste: e.target.checked })} className={`${check} mt-0.5`} /><span><b>No permitir pegar texto</b><br /><span className="text-texto-suave">Igual se registra si lo intentan.</span></span></label>
          <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={s.watermark !== false} onChange={(e) => set({ watermark: e.target.checked })} className={`${check} mt-0.5`} /><span><b>Marca de agua</b><br /><span className="text-texto-suave">Nombre y DNI sobre las preguntas: desanima las capturas.</span></span></label>
          <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={!!s.fullscreen} onChange={(e) => set({ fullscreen: e.target.checked })} className={`${check} mt-0.5`} /><span><b>Pantalla completa</b><br /><span className="text-texto-suave">En Android y computadoras (el iPhone no lo permite).</span></span></label>
        </div>
        <Field label="Hora límite para empezar (opcional)" hint="Útil si la toman en clase: después de esa hora nadie puede empezar.">
          <Input type="datetime-local" value={toLocalInput(s.start_until)} onChange={(e) => set({ start_until: e.target.value ? new Date(e.target.value).toISOString() : null })} className="max-w-xs" />
        </Field>

        <div className="rounded-lg bg-papel p-3">
          <p className="mb-2 flex items-center gap-1.5 text-sm font-bold"><KeyRound className="h-4 w-4" />Código de acceso {savedCode && <span className="rounded bg-tinta px-2 py-0.5 font-mono text-white">{savedCode}</span>}</p>
          <p className="mb-2 text-xs text-texto-suave">Díctalo en clase al empezar: sin él no se puede abrir la evaluación. Los alumnos no lo pueden ver en la app.</p>
          <div className="flex flex-wrap gap-2">
            <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={12} placeholder="Sin código" className="w-36 font-mono uppercase" autoCapitalize="characters" autoComplete="off" />
            <Button type="button" size="sm" variant="ghost" onClick={() => setCode(randomCode())}><RefreshCw className="h-4 w-4" />Generar</Button>
            <Button type="button" size="sm" variant="secondary" loading={codeBusy} disabled={!code.trim() || code === savedCode} onClick={() => void saveCode(code)}>Guardar código</Button>
            {savedCode && <Button type="button" size="sm" variant="ghost" disabled={codeBusy} onClick={() => void saveCode(null)}>Quitar</Button>}
          </div>
        </div>
      </fieldset>

      <div className="flex justify-end"><Button size="sm" onClick={() => void save()} loading={busy}><Save className="h-4 w-4" />Guardar configuración</Button></div>
    </div>
  )
}
