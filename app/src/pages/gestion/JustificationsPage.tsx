import { useState, type FormEvent } from 'react'
import { Check, FileCheck, Paperclip, Send, Trash2, X } from 'lucide-react'
import { useAuth, useFocusStudent } from '@/auth/AuthProvider'
import { AyudaLink } from '@/components/AyudaLink'
import { Badge, Button, Empty, ErrorBox, Field, Input, Loading, PageHeader, Panel, Segmented, Textarea } from '@/components/ui'
import { AttachmentInput, usePreview } from '@/components/files'
import { useAsync } from '@/lib/useAsync'
import { useToast } from '@/lib/toast'
import { toMessage } from '@/lib/errors'
import { formatShort, limaToday } from '@/lib/format'
import { studentName } from '@/services/campus'
import {
  BUCKET_JUSTIFICATIONS, createJustification, deleteJustification, listJustifications, reviewJustification, type Justification,
} from '@/services/gestion'

const STATUS: Record<Justification['status'], { label: string; tone: 'spark' | 'ok' | 'alert' }> = {
  PENDING: { label: 'Por revisar', tone: 'spark' }, APPROVED: { label: 'Aprobada', tone: 'ok' }, REJECTED: { label: 'No aprobada', tone: 'alert' },
}

function dates(j: Justification) {
  return j.date_from === j.date_to ? formatShort(j.date_from) : `del ${formatShort(j.date_from)} al ${formatShort(j.date_to)}`
}

function Attachment({ j }: { j: Justification }) {
  const preview = usePreview()
  if (!j.attachment_path) return null
  return (
    <button onClick={() => preview({ bucket: BUCKET_JUSTIFICATIONS, path: j.attachment_path!, name: j.attachment_name ?? 'Adjunto' })}
      className="mt-1 inline-flex items-center gap-1 text-sm font-bold text-tinta-500 hover:underline">
      <Paperclip className="h-4 w-4" />{j.attachment_name ?? 'Ver adjunto'}
    </button>
  )
}

function FamilyView() {
  const toast = useToast()
  const child = useFocusStudent()
  const { data, loading, error, reload } = useAsync(() => (child ? listJustifications({ studentId: child.id }) : Promise.resolve([])), [child?.id])
  const [form, setForm] = useState({ kind: 'FALTA' as 'FALTA' | 'TARDANZA', from: limaToday(), to: limaToday(), reason: '' })
  const [file, setFile] = useState<File | null>(null)
  const [link, setLink] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!child) return
    setBusy(true)
    try {
      await createJustification({ studentId: child.id, ...form, file, link })
      toast('Justificación enviada al tutor.')
      setForm({ ...form, reason: '' })
      setFile(null)
      setLink('')
      void reload(true)
    } catch (err) {
      toast(toMessage(err), 'error')
    } finally {
      setBusy(false)
    }
  }

  if (!child) return <Empty title="Elige a tu hijo" art="tasks" />
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
      <Panel title={`Justificar a ${child.first_name ?? 'tu hijo'}`} action={<AyudaLink topic="justificar" />} className="h-fit">
        <form onSubmit={submit} className="space-y-4">
          <Segmented value={form.kind} onChange={(v) => setForm({ ...form, kind: v })} options={[{ value: 'FALTA', label: 'Falta' }, { value: 'TARDANZA', label: 'Tardanza' }]} />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Desde"><Input type="date" max={limaToday()} value={form.from} onChange={(e) => setForm({ ...form, from: e.target.value, to: e.target.value > form.to ? e.target.value : form.to })} required /></Field>
            <Field label="Hasta"><Input type="date" min={form.from} value={form.to} onChange={(e) => setForm({ ...form, to: e.target.value })} required /></Field>
          </div>
          <Field label="Motivo"><Textarea value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} maxLength={1000} required className="min-h-24" placeholder="Tuvo fiebre y lo llevamos al médico." /></Field>
          <div>
            <p className="mb-1.5 text-sm font-bold">Constancia <span className="font-normal text-texto-suave">(opcional: receta, certificado o foto)</span></p>
            <AttachmentInput file={file} onFile={setFile} link={link} onLink={setLink} maxBytes={5 * 1024 * 1024} accept="image/jpeg,image/png,image/webp,application/pdf" hint="Foto o PDF de hasta 5 MB." linkHint="Sube la foto o el PDF a Google Drive y pega el enlace." />
          </div>
          <Button variant="accion" type="submit" loading={busy}><Send className="h-4 w-4" />Enviar justificación</Button>
        </form>
      </Panel>
      <Panel title="Enviadas">
        {error && <ErrorBox message={error} onRetry={() => void reload()} />}
        {loading ? <Loading /> : !data?.length ? <Empty title="Aún no ha enviado justificaciones" art="tasks" compact>Si su hijo faltó o llegó tarde, llene el formulario y toque «Enviar justificación». Aquí verá si fue aprobada.</Empty> : (
          <ul className="divide-y divide-linea">
            {data.map((j) => (
              <li key={j.id} className="py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <b>{j.kind === 'FALTA' ? 'Falta' : 'Tardanza'} {dates(j)}</b>
                  <Badge tone={STATUS[j.status].tone}>{STATUS[j.status].label}</Badge>
                  {j.status === 'PENDING' && (
                    <button className="ml-auto text-texto-suave hover:text-estado-alerta" aria-label="Retirar"
                      onClick={async () => { if (confirm('¿Retirar esta justificación?')) { await deleteJustification(j.id).catch((e) => toast(toMessage(e), 'error')); void reload(true) } }}>
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
                <p className="text-sm text-texto-suave">{j.reason}</p>
                <Attachment j={j} />
                {j.review_note && <p className="mt-1 text-sm italic">Respuesta: “{j.review_note}”</p>}
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  )
}

function ReviewerView() {
  const toast = useToast()
  const [view, setView] = useState<'pending' | 'all'>('pending')
  const { data, loading, error, reload } = useAsync(() => listJustifications({ pendingOnly: view === 'pending' }), [view])
  const [notes, setNotes] = useState<Record<number, string>>({})
  const [busy, setBusy] = useState<number | null>(null)

  async function decide(j: Justification, approve: boolean) {
    setBusy(j.id)
    try {
      await reviewJustification(j.id, approve, notes[j.id] ?? '')
      toast(approve ? 'Justificación aprobada. Se avisó a la familia.' : 'Justificación rechazada.')
      void reload(true)
    } catch (err) {
      toast(toMessage(err), 'error')
    } finally {
      setBusy(null)
    }
  }

  return (
    <>
      <div className="mb-4"><Segmented value={view} onChange={setView} options={[{ value: 'pending', label: 'Por revisar' }, { value: 'all', label: 'Historial' }]} /></div>
      {error && <ErrorBox message={error} onRetry={() => void reload()} />}
      {loading ? <Loading /> : !data?.length ? (
        <Empty title={view === 'pending' ? 'No hay justificaciones por revisar' : 'Sin justificaciones'} art="tasks">Las familias las envían desde su cuenta.</Empty>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {data.map((j) => (
            <li key={j.id} className="rounded-xl border border-linea bg-superficie p-4">
              <div className="flex flex-wrap items-center gap-2">
                <FileCheck className="h-5 w-5 text-tinta-500" />
                <b>{studentName(j.student ?? null)}</b>
                <Badge tone={STATUS[j.status].tone}>{STATUS[j.status].label}</Badge>
              </div>
              <p className="mt-1 text-sm"><b>{j.kind === 'FALTA' ? 'Falta' : 'Tardanza'}</b> {dates(j)} · enviada el {formatShort(j.created_at)}</p>
              <p className="mt-1 text-sm text-texto-suave">{j.reason}</p>
              <Attachment j={j} />
              {j.status === 'PENDING' ? (
                <div className="mt-3 space-y-2">
                  <Input value={notes[j.id] ?? ''} onChange={(e) => setNotes((n) => ({ ...n, [j.id]: e.target.value }))} maxLength={500} placeholder="Comentario para la familia (opcional)" />
                  <div className="flex gap-2">
                    <Button size="sm" loading={busy === j.id} onClick={() => void decide(j, true)}><Check className="h-4 w-4" />Aprobar</Button>
                    <Button size="sm" variant="danger" disabled={busy === j.id} onClick={() => void decide(j, false)}><X className="h-4 w-4" />No aprobar</Button>
                  </div>
                </div>
              ) : j.review_note && <p className="mt-2 text-sm italic">“{j.review_note}”</p>}
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

export default function JustificationsPage() {
  const { profile } = useAuth()
  const family = profile?.role === 'GUARDIAN'
  return (
    <>
      <PageHeader title="Justificaciones" subtitle={family ? 'Justifica faltas o tardanzas de tu hijo con su constancia.' : 'Revisa las justificaciones que envían las familias.'} />
      {family ? <FamilyView /> : <ReviewerView />}
    </>
  )
}

