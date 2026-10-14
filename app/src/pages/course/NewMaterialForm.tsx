import { useState, type FormEvent } from 'react'
import { Button, Field, Input, Segmented, Select, Textarea } from '@/components/ui'
import { useToast } from '@/lib/toast'
import { toMessage } from '@/lib/errors'
import { createMaterial } from '@/services/campus'
import { FileDropzone, LinkField } from '@/components/files'
import { FILE_UPLOADS } from '@/lib/links'
import { useAsync } from '@/lib/useAsync'
import { localInputToIso } from '@/lib/format'
import { listUnits } from '@/services/aprendizaje'

type Kind = 'FILE' | 'LINK' | 'VIDEO'

export function NewMaterialForm({ offeringId, onDone, defaultUnitId = null }: { offeringId: number; onDone: () => void; defaultUnitId?: number | null }) {
  const toast = useToast()
  const [kind, setKind] = useState<Kind>(FILE_UPLOADS ? 'FILE' : 'LINK')
  const [title, setTitle] = useState('')
  const [unit, setUnit] = useState('')
  const [description, setDescription] = useState('')
  const [url, setUrl] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [unitId, setUnitId] = useState<number | null>(defaultUnitId)
  const [schedule, setSchedule] = useState(false)
  const [publishAt, setPublishAt] = useState('')
  const units = useAsync(() => listUnits(offeringId), [offeringId], { live: false })

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      const at = schedule && publishAt ? localInputToIso(publishAt) : null
      if (schedule && (!at || Date.parse(at) <= Date.now())) throw new Error('Elige una fecha futura para publicarlo.')
      const unitTitle = units.data?.find((u) => u.id === unitId)?.title
      await createMaterial({ offeringId, kind, title, unit: unitTitle ?? unit, unitId, publishAt: at, description, url, file })
      toast(at ? 'Material programado.' : 'Material publicado.')
      onDone()
    } catch (err) {
      setError(toMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Segmented<Kind>
        value={kind}
        onChange={setKind}
        options={[
          ...(FILE_UPLOADS ? [{ value: 'FILE' as Kind, label: 'Archivo' }] : []),
          { value: 'LINK', label: FILE_UPLOADS ? 'Enlace' : 'Documento o enlace' },
          { value: 'VIDEO', label: 'Video' },
        ]}
      />
      {kind === 'FILE' ? (
        <div>
          <p className="mb-1.5 text-sm font-bold">Archivo</p>
          <FileDropzone
            files={file ? [file] : []}
            onChange={(list) => {
              const f = list[0] ?? null
              setFile(f)
              if (f && !title) setTitle(f.name.replace(/\.[^.]+$/, ''))
            }}
            maxBytes={25 * 1024 * 1024}
            hint="PDF, Word, Excel, PowerPoint, imágenes o audio. Máximo 25 MB."
          />
        </div>
      ) : kind === 'VIDEO' ? (
        <Field label="Enlace del video" hint="Los videos de YouTube se ven dentro del campus.">
          <Input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://www.youtube.com/watch?v=…" required />
        </Field>
      ) : (
        <div>
          <p className="mb-1.5 text-sm font-bold">Enlace</p>
          <LinkField
            value={url}
            onChange={setUrl}
            required
            hint={FILE_UPLOADS ? undefined : 'PDF, Word, Excel o PowerPoint: súbelo a Google Drive y pega el enlace. Los de Drive, Docs, Hojas y Presentaciones se ven dentro del campus.'}
          />
        </div>
      )}
      <Field label="Título"><Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={140} required /></Field>
      {units.data?.length ? (
        <Field label="Unidad">
          <Select value={unitId ?? ''} onChange={(e) => setUnitId(e.target.value ? Number(e.target.value) : null)}>
            <option value="">Sin unidad</option>
            {units.data.map((u) => <option key={u.id} value={u.id}>{u.title}</option>)}
          </Select>
        </Field>
      ) : (
        <Field label="Unidad o tema" hint="Opcional. Agrupa los materiales, por ejemplo: Unidad 3, Fracciones.">
          <Input value={unit} onChange={(e) => setUnit(e.target.value)} maxLength={80} />
        </Field>
      )}
      <Field label="Descripción"><Textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} className="min-h-20" /></Field>
      <div>
        <label className="flex items-center gap-2 text-sm font-bold">
          <input type="checkbox" checked={schedule} onChange={(e) => setSchedule(e.target.checked)} className="h-4 w-4 accent-tinta" />
          Programar la publicación
        </label>
        {schedule && (
          <Field label="Se publica el" className="mt-2 max-w-xs"><Input type="datetime-local" value={publishAt} onChange={(e) => setPublishAt(e.target.value)} required /></Field>
        )}
      </div>
      {error && <p role="alert" className="text-sm font-bold text-estado-alerta">{error}</p>}
      <div className="flex justify-end">
        <Button type="submit" loading={busy}>{schedule ? 'Programar material' : 'Publicar material'}</Button>
      </div>
    </form>
  )
}
