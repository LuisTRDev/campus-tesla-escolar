import { useState, type FormEvent } from 'react'
import { useDraft } from '@/lib/ux'
import { Link, useNavigate } from 'react-router-dom'
import { FileSignature, Mail, MailOpen, Plus } from 'lucide-react'
import { useAuth } from '@/auth/AuthProvider'
import { Badge, Button, Empty, ErrorBox, Field, Input, Loading, Modal, PageHeader, Panel, Select, Textarea } from '@/components/ui'
import { useAsync } from '@/lib/useAsync'
import { useToast } from '@/lib/toast'
import { toMessage } from '@/lib/errors'
import { cn } from '@/lib/utils'
import { formatShort, localInputToIso, relativeDue } from '@/lib/format'
import { classroomLabel, listClassrooms } from '@/services/campus'
import { createCircular, listCirculars, listRecipients, listRecipientStats } from '@/services/comunicados'
import { FileDropzone } from '@/components/files'
import type { Circular, CircularScope, Classroom } from '@/types'

function scopeLabel(c: Circular, classrooms: Classroom[]): string {
  if (c.scope === 'SCHOOL') return 'Todo el colegio'
  if (c.scope === 'LEVEL') return c.level ?? ''
  return classroomLabel(classrooms.find((x) => x.id === c.classroom_id))
}

// ---------------------------------------------------------------------------
// Formulario
// ---------------------------------------------------------------------------
function NewCircularForm({ classrooms, isAdmin, onDone }: { classrooms: Classroom[]; isAdmin: boolean; onDone: (id: number) => void }) {
  const { profile } = useAuth()
  const [target, setTarget] = useState(isAdmin ? 'SCHOOL' : String(classrooms[0]?.id ?? ''))
  // Se guarda solo como borrador mientras se escribe.
  const [title, setTitle, clearTitle] = useDraft(profile ? 'comunicado-titulo:' + profile.id : null, '')
  const [body, setBody, clearBody, hadDraft] = useDraft(profile ? 'comunicado-texto:' + profile.id : null, '')
  const [consent, setConsent] = useState(false)
  const [signature, setSignature] = useState(true)
  const [deadline, setDeadline] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!profile) return
    setError('')
    setBusy(true)
    try {
      const scope: CircularScope = target === 'SCHOOL' ? 'SCHOOL' : target.startsWith('LEVEL:') ? 'LEVEL' : 'CLASSROOM'
      const id = await createCircular({
        scope,
        level: scope === 'LEVEL' ? target.slice(6) : undefined,
        classroomId: scope === 'CLASSROOM' ? Number(target) : undefined,
        title, body, consent, signature,
        deadline: consent && deadline ? localInputToIso(deadline) : null,
        file,
        authorId: profile.id,
      })
      clearTitle()
      clearBody()
      onDone(id)
    } catch (err) {
      setError(toMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {hadDraft && <p className="rounded-lg bg-chispa-100 px-3 py-2 text-sm text-tinta">Recuperamos el borrador que estabas escribiendo.</p>}
      <Field label="Para">
        <Select value={target} onChange={(e) => setTarget(e.target.value)}>
          {isAdmin && <option value="SCHOOL">Todas las familias del colegio</option>}
          {isAdmin && <option value="LEVEL:Primaria">Familias de Primaria</option>}
          {isAdmin && <option value="LEVEL:Secundaria">Familias de Secundaria</option>}
          {classrooms.map((c) => <option key={c.id} value={c.id}>{classroomLabel(c)}</option>)}
        </Select>
      </Field>
      <Field label="Título"><Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} required /></Field>
      <Field label="Contenido"><Textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={8000} className="min-h-40" required /></Field>
      <div>
        <p className="mb-1.5 text-sm font-bold">Adjunto <span className="font-normal text-texto-suave">(opcional)</span></p>
        <FileDropzone files={file ? [file] : []} onChange={(l) => setFile(l[0] ?? null)} maxBytes={15 * 1024 * 1024} accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx" hint="PDF, imagen o Word, máximo 15 MB." />
      </div>

      <div className="rounded-lg border border-linea p-4">
        <label className="flex items-start gap-2 text-sm font-bold">
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 h-4 w-4 accent-tinta" />
          <span>Pedir respuesta “Autorizo / No autorizo”<span className="block font-normal text-texto-suave">Para paseos, salidas, actividades o autorizaciones.</span></span>
        </label>
        {consent && (
          <div className="mt-4 space-y-4 pl-6">
            <label className="flex items-center gap-2 text-sm font-bold">
              <input type="checkbox" checked={signature} onChange={(e) => setSignature(e.target.checked)} className="h-4 w-4 accent-tinta" />
              Pedir firma de la familia
            </label>
            <Field label="Responder hasta" hint="Opcional. Hora de Lima.">
              <Input type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
            </Field>
          </div>
        )}
      </div>

      {error && <p role="alert" className="text-sm font-bold text-estado-alerta">{error}</p>}
      <div className="flex justify-end"><Button type="submit" loading={busy}>Enviar comunicado</Button></div>
    </form>
  )
}

// ---------------------------------------------------------------------------
// Página
// ---------------------------------------------------------------------------
export default function CircularsPage() {
  const { profile, isAdmin, tutorClassrooms } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const [creating, setCreating] = useState(false)
  const isFamily = profile?.role === 'GUARDIAN'
  const canSend = isAdmin || tutorClassrooms.length > 0

  const { data, loading, error, reload } = useAsync(async () => {
    const circulars = await listCirculars()
    const ids = circulars.map((c) => c.id)
    const [classrooms, stats, mine] = await Promise.all([
      isAdmin || profile?.role === 'AUXILIARY' ? listClassrooms() : Promise.resolve(tutorClassrooms),
      isFamily ? Promise.resolve(new Map()) : listRecipientStats(ids),
      isFamily ? listRecipients(ids) : Promise.resolve([]),
    ])
    return { circulars, classrooms, stats, mine }
  }, [profile?.id, isAdmin, isFamily, tutorClassrooms.length])

  return (
    <>
      <PageHeader
        title="Comunicados"
        subtitle={isFamily ? 'Mensajes del colegio que necesitan tu lectura o tu respuesta.' : 'Envía comunicados a las familias y revisa quién los leyó.'}
        action={canSend && <Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" />Nuevo comunicado</Button>}
      />
      {error && <ErrorBox message={error} onRetry={() => void reload()} />}
      {loading ? <Loading /> : !data?.circulars.length ? (
        <Empty title="No hay comunicados" art="mail" icon={<Mail className="h-6 w-6" />}>
          {canSend ? 'Envía el primero con el botón “Nuevo comunicado”.' : 'Cuando el colegio envíe uno, aparecerá aquí.'}
        </Empty>
      ) : (
        <Panel bodyClassName="p-0">
          <ul className="divide-y divide-linea">
            {data.circulars.map((c) => {
              const mine = data.mine.filter((r) => r.circular_id === c.id)
              const unread = isFamily && mine.some((r) => !r.read_at)
              const pending = isFamily && c.response_type === 'CONSENT' && mine.some((r) => !r.response)
              const s = data.stats.get(c.id)
              const deadline = c.response_deadline ? relativeDue(c.response_deadline) : null
              return (
                <li key={c.id}>
                  <Link to={`/comunicados/${c.id}`} className="flex items-start gap-4 px-5 py-4 hover:bg-papel">
                    <span className={cn('mt-0.5 rounded-lg p-2', unread ? 'bg-chispa-100 text-tinta' : 'bg-papel text-texto-suave')}>
                      {c.response_type === 'CONSENT' ? <FileSignature className="h-5 w-5" /> : unread ? <Mail className="h-5 w-5" /> : <MailOpen className="h-5 w-5" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className={cn('truncate', unread ? 'font-bold' : 'font-semibold')}>{c.title}</p>
                      <p className="text-sm text-texto-suave">
                        {formatShort(c.published_at)} · {scopeLabel(c, data.classrooms)}
                      </p>
                      {pending && deadline && <p className={cn('text-sm', deadline.tone === 'overdue' ? 'text-estado-alerta' : 'font-bold text-estado-tarde')}>Responder: {deadline.label.replace(/^Vence/, 'vence').replace(/^Venció/, 'venció')}</p>}
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      {unread && <Badge tone="spark">Nuevo</Badge>}
                      {pending && <Badge tone="late">Responder</Badge>}
                      {s && (
                        <>
                          <span className="text-sm"><b>{s.read}</b>/{s.total} leídos</span>
                          {c.response_type === 'CONSENT' && <span className="text-xs text-texto-suave">{s.authorized} sí · {s.denied} no · {s.total - s.authorized - s.denied} pendientes</span>}
                        </>
                      )}
                    </div>
                  </Link>
                </li>
              )
            })}
          </ul>
        </Panel>
      )}

      <Modal open={creating} onClose={() => setCreating(false)} title="Nuevo comunicado" wide>
        {data && (
          <NewCircularForm
            classrooms={data.classrooms}
            isAdmin={isAdmin}
            onDone={(id) => { setCreating(false); toast('Comunicado enviado.'); navigate(`/comunicados/${id}`) }}
          />
        )}
      </Modal>
    </>
  )
}
