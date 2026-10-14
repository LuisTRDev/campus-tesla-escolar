import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Field, Input, Segmented, Select, Textarea } from '@/components/ui'
import { useToast } from '@/lib/toast'
import { toMessage } from '@/lib/errors'
import { isoToLocalInput, localInputToIso } from '@/lib/format'
import { createAssignment } from '@/services/campus'
import { AttachmentInput } from '@/components/files'
import { FILE_UPLOADS } from '@/lib/links'
import { listCompetencies, setAssignmentCompetencies } from '@/services/notas'
import { useAsync } from '@/lib/useAsync'
import { listUnits } from '@/services/aprendizaje'
import { useDraft } from '@/lib/ux'
import type { GradingType } from '@/types'

function defaultDue(): string {
  const d = new Date(Date.now() + 7 * 86_400_000)
  return `${isoToLocalInput(d.toISOString()).slice(0, 10)}T23:00`
}

export function NewAssignmentForm({ offeringId, subjectId, onDone, defaultKind = 'TASK', defaultUnitId = null }: {
  offeringId: number; subjectId: number; onDone: () => void; defaultKind?: 'TASK' | 'QUIZ'; defaultUnitId?: number | null
}) {
  const toast = useToast()
  const navigate = useNavigate()
  const [kind, setKind] = useState<'TASK' | 'QUIZ'>(defaultKind)
  const [draft, setDraft, clearDraft, hadDraft] = useDraft(`tarea-nueva:${offeringId}`, { title: '', instructions: '' })
  const title = draft.title
  const instructions = draft.instructions
  const setTitle = (v: string) => setDraft((d) => ({ ...d, title: v }))
  const setInstructions = (v: string) => setDraft((d) => ({ ...d, instructions: v }))
  const [unitId, setUnitId] = useState<number | null>(defaultUnitId)
  const [schedule, setSchedule] = useState(false)
  const [publishAt, setPublishAt] = useState('')
  const units = useAsync(() => listUnits(offeringId), [offeringId], { live: false })
  const [due, setDue] = useState(defaultDue)
  const [gradingType, setGradingType] = useState<GradingType>('SCORE')
  const [maxScore, setMaxScore] = useState('20')
  const [allowLate, setAllowLate] = useState(true)
  const [file, setFile] = useState<File | null>(null)
  const [link, setLink] = useState('')
  const [competencyIds, setCompetencyIds] = useState<number[]>([])
  const competencies = useAsync(() => listCompetencies([subjectId]), [subjectId])
  const [busy, setBusy] = useState<'PUBLISHED' | 'DRAFT' | null>(null)
  const [error, setError] = useState('')

  async function save(status: 'PUBLISHED' | 'DRAFT') {
    setError('')
    setBusy(status)
    try {
      const scheduled = schedule && publishAt ? localInputToIso(publishAt) : null
      if (schedule && (!scheduled || Date.parse(scheduled) <= Date.now())) throw new Error('Elige una fecha futura para publicarla.')
      // Las evaluaciones se crean como borrador: primero se agregan las preguntas.
      const finalStatus = scheduled || kind === 'QUIZ' ? 'DRAFT' : status
      const id = await createAssignment({
        offeringId, title, instructions, file, link,
        dueAt: localInputToIso(due),
        gradingType,
        maxScore: Number(maxScore),
        allowLate,
        status: finalStatus,
        kind,
        unitId,
        publishAt: scheduled,
        quizSettings: kind === 'QUIZ' ? { time_limit_min: null, max_attempts: 1, shuffle_questions: true, shuffle_options: true, show_answers: 'AFTER_SUBMIT' } : undefined,
      })
      if (competencyIds.length) await setAssignmentCompetencies(id, competencyIds)
      clearDraft()
      toast(kind === 'QUIZ' ? 'Evaluación creada. Ahora agrega las preguntas.' : scheduled ? 'Tarea programada.' : status === 'PUBLISHED' ? 'Tarea publicada.' : 'Borrador guardado.')
      onDone()
      navigate(`/tarea/${id}`)
    } catch (err) {
      setError(toMessage(err))
    } finally {
      setBusy(null)
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    void save('PUBLISHED')
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Segmented value={kind} onChange={setKind} options={[{ value: 'TASK', label: 'Tarea' }, { value: 'QUIZ', label: 'Evaluación en línea' }]} />
      {kind === 'QUIZ' && <p className="-mt-2 text-sm text-texto-suave">Opción múltiple, verdadero o falso, relacionar y más, con corrección automática. Después de crearla agregas las preguntas.</p>}
      {hadDraft && <p className="rounded-lg bg-chispa-100 px-3 py-2 text-sm text-tinta">Recuperamos lo que estabas escribiendo.</p>}
      <Field label="Título"><Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={140} required /></Field>
      <Field label={kind === 'QUIZ' ? 'Indicaciones para el alumno' : 'Indicaciones'} hint="Explica qué deben hacer y cómo lo vas a evaluar.">
        <Textarea value={instructions} onChange={(e) => setInstructions(e.target.value)} maxLength={8000} className="min-h-36" />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Fecha límite" hint="Hora de Lima. Déjala vacía si no tiene fecha.">
          <Input type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} />
        </Field>
        <Field label="Cómo se califica">
          <Select value={gradingType} onChange={(e) => setGradingType(e.target.value as GradingType)}>
            <option value="SCORE">Nota numérica</option>
            <option value="LEVEL">Nivel de logro (AD, A, B, C)</option>
          </Select>
        </Field>
        {gradingType === 'SCORE' && (
          <Field label="Nota máxima">
            <Input type="number" min={1} max={100} value={maxScore} onChange={(e) => setMaxScore(e.target.value)} required />
          </Field>
        )}
        {!!units.data?.length && (
          <Field label="Unidad">
            <Select value={unitId ?? ''} onChange={(e) => setUnitId(e.target.value ? Number(e.target.value) : null)}>
              <option value="">Sin unidad</option>
              {units.data.map((u) => <option key={u.id} value={u.id}>{u.title}</option>)}
            </Select>
          </Field>
        )}
      </div>
      <div>
        <label className="flex items-center gap-2 text-sm font-bold">
          <input type="checkbox" checked={schedule} onChange={(e) => setSchedule(e.target.checked)} className="h-4 w-4 accent-tinta" />
          Programar la publicación
        </label>
        {schedule && (
          <Field label="Se publica el" hint="Hasta entonces queda como borrador y los alumnos no la ven." className="mt-2 max-w-xs">
            <Input type="datetime-local" value={publishAt} onChange={(e) => setPublishAt(e.target.value)} required />
          </Field>
        )}
      </div>
      <div>
        <p className="mb-1.5 text-sm font-bold">{FILE_UPLOADS ? 'Archivo de apoyo' : 'Enlace de apoyo'} <span className="font-normal text-texto-suave">(opcional)</span></p>
        <AttachmentInput file={file} onFile={setFile} link={link} onLink={setLink} maxBytes={25 * 1024 * 1024} hint="Ficha, guía o lectura. Máximo 25 MB." linkHint="Ficha, guía o lectura en Google Drive." />
      </div>
      {!!competencies.data?.length && (
        <fieldset>
          <legend className="mb-1.5 text-sm font-bold">Competencias que evalúa</legend>
          <p className="mb-2 text-xs text-texto-suave">Las notas de esta tarea se usarán como evidencia en el registro del bimestre.</p>
          <div className="space-y-1.5">
            {competencies.data.map((c) => (
              <label key={c.id} className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={competencyIds.includes(c.id)}
                  onChange={(e) => setCompetencyIds((ids) => e.target.checked ? [...ids, c.id] : ids.filter((x) => x !== c.id))}
                  className="mt-0.5 h-4 w-4 accent-tinta"
                />
                <span><b>{c.code}</b> {c.name}</span>
              </label>
            ))}
          </div>
        </fieldset>
      )}
      <label className="flex items-center gap-2 text-sm font-bold">
        <input type="checkbox" checked={allowLate} onChange={(e) => setAllowLate(e.target.checked)} className="h-4 w-4 accent-tinta" />
        Aceptar entregas después de la fecha límite (se marcan como tardías)
      </label>
      {error && <p role="alert" className="text-sm font-bold text-estado-alerta">{error}</p>}
      <div className="flex flex-wrap justify-end gap-2">
        {kind === 'TASK' && !schedule && <Button type="button" variant="secondary" loading={busy === 'DRAFT'} disabled={!!busy} onClick={() => void save('DRAFT')}>Guardar borrador</Button>}
        <Button type="submit" loading={busy === 'PUBLISHED'} disabled={!!busy}>
          {kind === 'QUIZ' ? 'Crear y agregar preguntas' : schedule ? 'Programar tarea' : 'Publicar tarea'}
        </Button>
      </div>
    </form>
  )
}
