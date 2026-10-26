import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, CheckCircle2, Download, Paperclip, Trash2, XCircle } from 'lucide-react'
import { useAuth } from '@/auth/AuthProvider'
import { AyudaLink } from '@/components/AyudaLink'
import { Badge, Button, Empty, ErrorBox, Field, Loading, PageHeader, Panel, Segmented, Textarea } from '@/components/ui'
import { Escudo } from '@/components/brand'
import { SignaturePad } from '@/components/SignaturePad'
import { useAsync } from '@/lib/useAsync'
import { useToast } from '@/lib/toast'
import { toMessage } from '@/lib/errors'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import { formatDue, formatShort, formatTime } from '@/lib/format'
import { classroomLabel, listClassrooms, studentName } from '@/services/campus'
import { usePreview } from '@/components/files'
import {
  BUCKET_CIRCULARS, RESPONSE_LABELS, deleteCircular, getCircular, listRecipients, markCircularRead, respondCircular,
} from '@/services/comunicados'
import type { Circular, CircularRecipient, ConsentResponse, StudentLite } from '@/types'

// ---------------------------------------------------------------------------
// Respuesta de la familia (una por hijo)
// ---------------------------------------------------------------------------
function ConsentForm({ circular, recipient, child, onDone }: { circular: Circular; recipient: CircularRecipient; child: StudentLite | undefined; onDone: () => void }) {
  const toast = useToast()
  const [response, setResponse] = useState<ConsentResponse | null>(null)
  const [comment, setComment] = useState('')
  const [signature, setSignature] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const expired = !!circular.response_deadline && Date.parse(circular.response_deadline) < Date.now()
  const name = child?.first_name ?? 'tu hijo'

  if (recipient.response) {
    return (
      <div className="rounded-lg bg-papel p-4">
        <p className="flex items-center gap-2 font-bold">
          {recipient.response === 'AUTHORIZED' ? <CheckCircle2 className="h-5 w-5 text-estado-ok" /> : <XCircle className="h-5 w-5 text-estado-alerta" />}
          {RESPONSE_LABELS[recipient.response]} que {name} participe
        </p>
        <p className="mt-1 text-sm text-texto-suave">Respondido por {recipient.signer_name ?? 'la familia'} el {formatShort(recipient.responded_at!)} a las {formatTime(recipient.responded_at!)}.</p>
        {recipient.response_comment && <p className="mt-2 text-sm">“{recipient.response_comment}”</p>}
        {recipient.signature && <img src={recipient.signature} alt="Firma" className="mt-3 h-16 rounded border border-linea bg-white" />}
      </div>
    )
  }
  if (expired) return <p className="text-sm text-estado-alerta">El plazo para responder venció el {formatDue(circular.response_deadline)}.</p>

  async function submit() {
    if (!response) { toast('Elige “Autorizo” o “No autorizo”.', 'error'); return }
    if (circular.requires_signature && !signature) { toast('Firma antes de enviar.', 'error'); return }
    setBusy(true)
    try {
      await respondCircular({ circularId: circular.id, studentId: recipient.student_id, response, comment, signature })
      toast('Respuesta enviada al colegio.')
      onDone()
    } catch (err) {
      toast(toMessage(err), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-2">
        {(['AUTHORIZED', 'NOT_AUTHORIZED'] as ConsentResponse[]).map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => setResponse(r)}
            aria-pressed={response === r}
            className={cn(
              'flex min-h-14 items-center justify-center gap-2 rounded-lg border-2 font-bold transition-colors',
              response === r
                ? r === 'AUTHORIZED' ? 'border-estado-ok bg-estado-ok/10 text-estado-ok' : 'border-estado-alerta bg-estado-alerta/10 text-estado-alerta'
                : 'border-linea text-texto-suave hover:border-tinta-500',
            )}
          >
            {r === 'AUTHORIZED' ? <CheckCircle2 className="h-5 w-5" /> : <XCircle className="h-5 w-5" />}
            {RESPONSE_LABELS[r]}
          </button>
        ))}
      </div>
      <Field label="Comentario" hint="Opcional. Por ejemplo, una alergia o quién recoge al alumno.">
        <Textarea value={comment} onChange={(e) => setComment(e.target.value)} maxLength={500} className="min-h-20" />
      </Field>
      {circular.requires_signature && (
        <div>
          <p className="mb-1.5 text-sm font-bold">Firma del padre, madre o apoderado</p>
          <SignaturePad onChange={setSignature} />
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="accion" onClick={() => void submit()} loading={busy}>Enviar respuesta</Button>
        <AyudaLink topic="familia-comunicados" />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Seguimiento para quien envía
// ---------------------------------------------------------------------------
type Filter = 'all' | 'unread' | 'pending'

function Tracking({ circular, recipients }: { circular: Circular; recipients: CircularRecipient[] }) {
  const [filter, setFilter] = useState<Filter>('all')
  const extra = useAsync(async () => {
    const ids = [...new Set(recipients.map((r) => r.student_id))]
    const names = new Map<number, string>()
    for (let i = 0; i < ids.length; i += 300) {
      const { data, error } = await supabase.from('students').select('id, first_name, last_name').in('id', ids.slice(i, i + 300))
      if (error) throw error
      for (const s of data ?? []) names.set(s.id, `${s.last_name ?? ''}, ${s.first_name ?? ''}`)
    }
    const classrooms = await listClassrooms()
    return { names, classrooms }
  }, [recipients])

  const consent = circular.response_type === 'CONSENT'
  const rows = useMemo(() => {
    const list = recipients.filter((r) => filter === 'all' || (filter === 'unread' ? !r.read_at : !r.response))
    const names = extra.data?.names
    return list.sort((a, b) => (a.classroom_id ?? 0) - (b.classroom_id ?? 0) || (names?.get(a.student_id) ?? '').localeCompare(names?.get(b.student_id) ?? '', 'es'))
  }, [recipients, filter, extra.data])

  const read = recipients.filter((r) => r.read_at).length
  const yes = recipients.filter((r) => r.response === 'AUTHORIZED').length
  const no = recipients.filter((r) => r.response === 'NOT_AUTHORIZED').length
  const roomLabel = (id: number | null) => classroomLabel(extra.data?.classrooms.find((c) => c.id === id))

  function exportCsv() {
    const header = ['Aula', 'Alumno', 'Leído', ...(consent ? ['Respuesta', 'Respondió', 'Fecha respuesta', 'Comentario'] : [])]
    const lines = rows.map((r) => [
      roomLabel(r.classroom_id),
      extra.data?.names.get(r.student_id) ?? r.student_id,
      r.read_at ? `${formatShort(r.read_at)} ${formatTime(r.read_at)}` : 'No',
      ...(consent ? [r.response ? RESPONSE_LABELS[r.response] : 'Sin responder', r.signer_name ?? '', r.responded_at ? `${formatShort(r.responded_at)} ${formatTime(r.responded_at)}` : '', r.response_comment ?? ''] : []),
    ])
    const csv = [header, ...lines].map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\r\n')
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `comunicado-${circular.id}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <Panel
      title="Seguimiento"
      action={<Button size="sm" variant="secondary" onClick={exportCsv}><Download className="h-4 w-4" />CSV</Button>}
    >
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div><p className="font-display text-3xl font-bold">{read}<span className="text-lg text-texto-suave">/{recipients.length}</span></p><p className="text-sm text-texto-suave">leyeron</p></div>
        {consent && <>
          <div><p className="font-display text-3xl font-bold text-estado-ok">{yes}</p><p className="text-sm text-texto-suave">autorizan</p></div>
          <div><p className="font-display text-3xl font-bold text-estado-alerta">{no}</p><p className="text-sm text-texto-suave">no autorizan</p></div>
          <div><p className="font-display text-3xl font-bold text-estado-tarde">{recipients.length - yes - no}</p><p className="text-sm text-texto-suave">sin responder</p></div>
        </>}
      </div>
      <div className="mb-3">
        <Segmented<Filter>
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: 'Todos' },
            { value: 'unread', label: 'Sin leer' },
            ...(consent ? [{ value: 'pending' as Filter, label: 'Sin responder' }] : []),
          ]}
        />
      </div>
      {extra.loading ? <Loading /> : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[32rem] text-left text-sm">
            <thead className="text-texto-suave">
              <tr>
                <th className="py-2 pr-3">Alumno</th>
                <th className="py-2 pr-3">Leído</th>
                {consent && <th className="py-2 pr-3">Respuesta</th>}
                {circular.requires_signature && <th className="py-2">Firma</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-linea">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="py-2 pr-3"><b>{extra.data?.names.get(r.student_id) ?? '…'}</b><span className="block text-xs text-texto-suave">{roomLabel(r.classroom_id)}</span></td>
                  <td className="py-2 pr-3">{r.read_at ? `${formatShort(r.read_at)}, ${formatTime(r.read_at)}` : <span className="text-texto-suave">No</span>}</td>
                  {consent && (
                    <td className="py-2 pr-3">
                      {r.response ? <Badge tone={r.response === 'AUTHORIZED' ? 'ok' : 'alert'}>{RESPONSE_LABELS[r.response]}</Badge> : <span className="text-texto-suave">Pendiente</span>}
                      {r.response_comment && <span className="block text-xs text-texto-suave">“{r.response_comment}”</span>}
                    </td>
                  )}
                  {circular.requires_signature && <td className="py-2">{r.signature ? <img src={r.signature} alt={`Firma de ${r.signer_name ?? ''}`} title={r.signer_name ?? ''} className="h-10 rounded border border-linea bg-white" /> : '—'}</td>}
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && <p className="py-4 text-sm text-texto-suave">Nadie en esta lista.</p>}
        </div>
      )}
    </Panel>
  )
}

// ---------------------------------------------------------------------------
// Página
// ---------------------------------------------------------------------------
export default function CircularDetailPage() {
  const { circularId } = useParams()
  const id = Number(circularId)
  const navigate = useNavigate()
  const toast = useToast()
  const { profile, isAdmin, children } = useAuth()
  const isFamily = profile?.role === 'GUARDIAN'
  const preview = usePreview()

  const { data, loading, error, reload } = useAsync(async () => {
    const circular = await getCircular(id)
    const recipients = circular ? await listRecipients([id]) : []
    return { circular, recipients }
  }, [id])

  useEffect(() => {
    if (isFamily && data?.recipients.some((r) => !r.read_at)) void markCircularRead(id).catch(() => undefined)
  }, [isFamily, data, id])

  if (loading) return <Loading />
  if (error) return <ErrorBox message={error} onRetry={() => void reload()} />
  if (!data?.circular) return <Empty title="No encontramos este comunicado" art="search">Puede que haya sido eliminado o que no tengas acceso.</Empty>

  const { circular, recipients } = data
  const canManage = !isFamily && (isAdmin || circular.author_id === profile?.id || profile?.role === 'AUXILIARY' || profile?.role === 'TEACHER')

  async function remove() {
    if (!confirm('¿Eliminar este comunicado? Se borrarán también las respuestas y firmas.')) return
    try {
      await deleteCircular(circular)
      toast('Comunicado eliminado.')
      navigate('/comunicados', { replace: true })
    } catch (err) {
      toast(toMessage(err), 'error')
    }
  }

  return (
    <>
      <Link to="/comunicados" className="mb-4 inline-flex items-center gap-1.5 text-sm font-bold text-texto-suave hover:text-texto">
        <ArrowLeft className="h-4 w-4" />Comunicados
      </Link>
      <PageHeader
        title={circular.title}
        subtitle={`Enviado el ${formatShort(circular.published_at)} a las ${formatTime(circular.published_at)}.${circular.response_deadline ? ` Responder hasta el ${formatDue(circular.response_deadline)}.` : ''}`}
        action={(isAdmin || circular.author_id === profile?.id) && <Button variant="danger" size="sm" onClick={() => void remove()}><Trash2 className="h-4 w-4" />Eliminar</Button>}
      />

      <div className={cn('grid gap-6', canManage ? 'lg:grid-cols-[1fr_1.3fr]' : 'lg:grid-cols-[1.3fr_1fr]')}>
        {/* Hoja membretada, como las circulares impresas del colegio. */}
        <article className="relative h-fit overflow-hidden rounded-xl border border-linea bg-superficie">
          <header className="flex items-center gap-3 px-5 pb-3 pt-4">
            <Escudo className="h-12 w-10 shrink-0" />
            <div className="min-w-0 flex-1 leading-tight">
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-tinta">I.E.P. Nikola Tesla</p>
              <p className="font-slab text-sm font-extrabold uppercase tracking-wide">Comunicado N.° {String(circular.id).padStart(4, '0')}</p>
            </div>
            <p className="cifras text-right text-xs text-texto-suave">{formatShort(circular.published_at)}</p>
          </header>
          <div className="franja-h h-[5px]" aria-hidden />
          {isFamily && recipients.length > 0 && recipients.every((r) => r.read_at) && (
            <span className="stamp-in pointer-events-none absolute right-5 top-20 rounded-lg border-[3px] border-double border-estado-ok px-2.5 py-0.5 font-slab text-sm font-extrabold uppercase tracking-[0.14em] text-estado-ok" style={{ rotate: '-12deg' }} aria-hidden>Leído</span>
          )}
          <div className="px-5 py-5">
          <p className="max-w-prosa whitespace-pre-line text-[15px] leading-relaxed">{circular.body}</p>
          {circular.attachment_path && (
            <button
              onClick={() => preview({ bucket: BUCKET_CIRCULARS, path: circular.attachment_path!, name: circular.attachment_name ?? 'Adjunto' })}
              className="mt-4 inline-flex items-center gap-2 rounded-lg border border-linea px-3 py-2 text-sm font-bold hover:border-tinta-500"
            >
              <Paperclip className="h-4 w-4" />{circular.attachment_name ?? 'Adjunto'}
            </button>
          )}
          <p className="mt-8 text-sm font-bold">La Dirección</p>
          <p className="lema text-[10px] text-texto-suave">Pasión por educar</p>
          </div>
        </article>

        {canManage ? (
          <Tracking circular={circular} recipients={recipients} />
        ) : circular.response_type === 'CONSENT' ? (
          <div className="space-y-6">
            {recipients.map((r) => {
              const child = children.find((c) => c.id === r.student_id)
              return (
                <Panel key={r.id} title={`Respuesta por ${child ? studentName(child) : 'tu hijo'}`}>
                  <ConsentForm circular={circular} recipient={r} child={child} onDone={() => void reload(true)} />
                </Panel>
              )
            })}
          </div>
        ) : (
          <Panel title="Confirmación" className="h-fit">
            <p className="flex items-center gap-2 text-sm"><CheckCircle2 className="h-5 w-5 text-estado-ok" />El colegio ya sabe que leíste este comunicado.</p>
          </Panel>
        )}
      </div>
    </>
  )
}
