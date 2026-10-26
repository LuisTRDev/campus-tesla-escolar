import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from 'react'
import { Camera, Download, ExternalLink, FileText, FileSpreadsheet, FileImage, FileAudio, Film, Link2, Plus, UploadCloud, X } from 'lucide-react'
import { Button, Input, Modal, Skeleton } from '@/components/ui'
import { AyudaLink } from '@/components/AyudaLink'
import { supabase } from '@/lib/supabase'
import { formatBytes } from '@/lib/format'
import { cn } from '@/lib/utils'
import { toMessage } from '@/lib/errors'
import { cleanLink, FILE_UPLOADS, isExternal, linkInfo } from '@/lib/links'

// ---------------------------------------------------------------------------
// Tipos de archivo
// ---------------------------------------------------------------------------
type Kind = 'image' | 'pdf' | 'sheet' | 'audio' | 'video' | 'doc'

export function fileKind(name: string, type?: string | null): Kind {
  const t = (type ?? '').toLowerCase()
  const ext = name.toLowerCase().split('.').pop() ?? ''
  if (t.startsWith('image/') || ['jpg', 'jpeg', 'png', 'webp', 'gif', 'heic'].includes(ext)) return 'image'
  if (t === 'application/pdf' || ext === 'pdf') return 'pdf'
  if (t.includes('sheet') || t.includes('excel') || ['xls', 'xlsx', 'csv'].includes(ext)) return 'sheet'
  if (t.startsWith('audio/') || ['mp3', 'm4a', 'webm', 'ogg'].includes(ext)) return 'audio'
  if (t.startsWith('video/') || ['mp4', 'mov'].includes(ext)) return 'video'
  return 'doc'
}

const KIND_ICON = { image: FileImage, pdf: FileText, sheet: FileSpreadsheet, audio: FileAudio, video: Film, doc: FileText }

export function FileIcon({ name, type, className }: { name: string; type?: string | null; className?: string }) {
  const Icon = KIND_ICON[fileKind(name, type)]
  return <Icon className={className} />
}

const isTouch = () => typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches
const isAndroid = () => /android/i.test(navigator.userAgent)

// ---------------------------------------------------------------------------
// Vista previa dentro del campus (imágenes, PDF, audio y video)
// ---------------------------------------------------------------------------
/** Archivo de Storage o, si `path` empieza con https://, un enlace externo (modo enlaces). */
export type StoredFile = { bucket: string; path: string; name: string; type?: string | null; size?: number | null }

const PreviewContext = createContext<(file: StoredFile) => void>(() => undefined)

/** Abre la vista previa de un archivo guardado en Storage o de un enlace. */
export function usePreview() {
  return useContext(PreviewContext)
}

const urlCache = new Map<string, { url: string; at: number }>()

/** URL firmada (10 min), reutilizada mientras sigue vigente. Un enlace externo se devuelve tal cual. */
export async function signedUrl(bucket: string, path: string, download?: string): Promise<string> {
  if (isExternal(path)) return path
  const key = `${bucket}/${path}/${download ?? ''}`
  const hit = urlCache.get(key)
  if (hit && Date.now() - hit.at < 8 * 60_000) return hit.url
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 600, download ? { download } : undefined)
  if (error || !data?.signedUrl) throw error ?? new Error('No se pudo abrir el archivo.')
  urlCache.set(key, { url: data.signedUrl, at: Date.now() })
  return data.signedUrl
}

export function PreviewProvider({ children }: { children: ReactNode }) {
  const [file, setFile] = useState<StoredFile | null>(null)
  const [url, setUrl] = useState<string | null>(null)
  const [error, setError] = useState('')

  const open = useCallback((f: StoredFile) => {
    setFile(f)
    setUrl(null)
    setError('')
    signedUrl(f.bucket, f.path).then(setUrl).catch(() => setError('No se pudo abrir el archivo. Puede que ya no exista o que no tengas acceso.'))
  }, [])

  const kind = file ? fileKind(file.name, file.type) : 'doc'
  const link = file && isExternal(file.path) ? linkInfo(file.path) : null

  async function download() {
    if (!file) return
    try {
      window.location.href = await signedUrl(file.bucket, file.path, file.name)
    } catch {
      setError('No se pudo descargar el archivo.')
    }
  }

  return (
    <PreviewContext.Provider value={open}>
      {children}
      <Modal open={!!file} onClose={() => setFile(null)} title={file?.name ?? ''} wide>
        {file && (
          <div className="space-y-4">
            {link ? (
              link.embed
                ? <iframe src={link.embed} title={file.name} allow="autoplay; fullscreen" allowFullScreen className="h-[65vh] w-full rounded-lg border border-linea bg-white" />
                : (
                  <div className="flex flex-col items-center gap-2 rounded-lg bg-papel p-8 text-center">
                    <Link2 className="h-12 w-12 text-texto-suave" />
                    <p className="font-bold">{link.label}</p>
                    <p className="max-w-full break-all text-sm text-texto-suave">{file.path}</p>
                    <p className="text-sm text-texto-suave">Este enlace se abre en una pestaña nueva.</p>
                  </div>
                )
            ) : error ? <p className="text-sm text-estado-alerta">{error}</p> : !url ? <Skeleton className="h-[50vh] w-full" /> : (
              <>
                {kind === 'image' && <img src={url} alt={file.name} className="mx-auto max-h-[65vh] rounded-lg object-contain" />}
                {kind === 'pdf' && (isAndroid()
                  ? <p className="rounded-lg bg-papel p-4 text-sm text-texto-suave">Este celular no muestra PDF dentro de la página. Usa “Abrir” para verlo.</p>
                  : <iframe src={url} title={file.name} className="h-[65vh] w-full rounded-lg border border-linea bg-white" />)}
                {kind === 'audio' && <audio src={url} controls className="w-full" />}
                {kind === 'video' && <video src={url} controls className="max-h-[65vh] w-full rounded-lg bg-black" />}
                {(kind === 'doc' || kind === 'sheet') && (
                  <div className="flex flex-col items-center gap-2 rounded-lg bg-papel p-8 text-center">
                    <FileIcon name={file.name} type={file.type} className="h-12 w-12 text-texto-suave" />
                    <p className="text-sm text-texto-suave">Este tipo de archivo se abre con su programa (Word, Excel, PowerPoint…).</p>
                  </div>
                )}
              </>
            )}
            <div className="flex flex-wrap justify-end gap-2">
              {link ? (
                <>
                  {link.embed && <span className="mr-auto self-center text-sm text-texto-suave">¿No se ve? Ábrelo en una pestaña nueva.</span>}
                  <a href={file.path} target="_blank" rel="noopener noreferrer"><Button><ExternalLink className="h-4 w-4" />Abrir en una pestaña</Button></a>
                </>
              ) : (
                <>
                  {file.size ? <span className="mr-auto self-center text-sm text-texto-suave">{formatBytes(file.size)}</span> : null}
                  {url && <a href={url} target="_blank" rel="noopener noreferrer"><Button variant="secondary"><ExternalLink className="h-4 w-4" />Abrir</Button></a>}
                  <Button onClick={() => void download()}><Download className="h-4 w-4" />Descargar</Button>
                </>
              )}
            </div>
          </div>
        )}
      </Modal>
    </PreviewContext.Provider>
  )
}

/** Miniatura de un archivo guardado: foto real si es imagen, ícono si no. */
export function StoredThumb({ file, className }: { file: StoredFile; className?: string }) {
  const [url, setUrl] = useState<string | null>(null)
  const external = isExternal(file.path)
  const isImage = !external && fileKind(file.name, file.type) === 'image'
  useEffect(() => {
    if (!isImage) return
    let alive = true
    signedUrl(file.bucket, file.path).then((u) => { if (alive) setUrl(u) }).catch(() => undefined)
    return () => { alive = false }
  }, [file.bucket, file.path, isImage])
  if (isImage && url) return <img src={url} alt="" loading="lazy" className={cn('object-cover', className)} />
  if (isImage) return <Skeleton className={className} />
  if (external) {
    return (
      <span className={cn('flex items-center justify-center bg-papel text-tinta-500', className)}>
        <Link2 className="h-6 w-6" />
      </span>
    )
  }
  return (
    <span className={cn('flex items-center justify-center bg-papel text-texto-suave', className)}>
      <FileIcon name={file.name} type={file.type} className="h-6 w-6" />
    </span>
  )
}

/** Archivo guardado como tarjeta: miniatura + nombre; abre la vista previa. */
export function StoredFileCard({ file, onRemove }: { file: StoredFile; onRemove?: () => void }) {
  const preview = usePreview()
  return (
    <li className="group relative flex items-center gap-3 rounded-xl border border-linea bg-superficie p-2 pr-3">
      <button type="button" onClick={() => preview(file)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <StoredThumb file={file} className="h-12 w-12 shrink-0 rounded-lg" />
        <span className="min-w-0">
          <span className="block truncate text-sm font-bold group-hover:underline">{file.name}</span>
          {isExternal(file.path)
            ? <span className="block truncate text-xs text-texto-suave">{file.name === linkInfo(file.path).label ? file.path.replace(/^https:\/\/(www\.)?/i, '') : linkInfo(file.path).label}</span>
            : file.size ? <span className="text-xs text-texto-suave">{formatBytes(file.size)}</span> : null}
        </span>
      </button>
      {onRemove && (
        <button type="button" onClick={onRemove} className="rounded-md p-1.5 text-texto-suave hover:text-estado-alerta" aria-label={`Quitar ${file.name}`}>
          <X className="h-4 w-4" />
        </button>
      )}
    </li>
  )
}

// ---------------------------------------------------------------------------
// Zona para subir: arrastrar y soltar, elegir o tomar una foto
// ---------------------------------------------------------------------------
function LocalThumb({ file, className }: { file: File; className?: string }) {
  const url = useMemo(() => (fileKind(file.name, file.type) === 'image' ? URL.createObjectURL(file) : null), [file])
  useEffect(() => () => { if (url) URL.revokeObjectURL(url) }, [url])
  if (url) return <img src={url} alt="" className={cn('object-cover', className)} />
  return (
    <span className={cn('flex items-center justify-center bg-papel text-texto-suave', className)}>
      <FileIcon name={file.name} type={file.type} className="h-6 w-6" />
    </span>
  )
}

export function FileDropzone({ files, onChange, max = 1, maxBytes, accept, hint, camera = true }: {
  files: File[]
  onChange: (files: File[]) => void
  max?: number
  maxBytes?: number
  accept?: string
  hint?: string
  camera?: boolean
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const cameraRef = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)
  const [error, setError] = useState('')
  const full = files.length >= max
  const touch = isTouch()

  function add(list: FileList | File[] | null) {
    setError('')
    const picked = Array.from(list ?? [])
    const tooBig = maxBytes ? picked.filter((f) => f.size > maxBytes) : []
    if (tooBig.length) setError(`"${tooBig[0].name}" supera los ${formatBytes(maxBytes!)}.`)
    const ok = picked.filter((f) => !maxBytes || f.size <= maxBytes)
    const next = max === 1 ? ok.slice(0, 1) : [...files, ...ok].slice(0, max)
    if (max > 1 && files.length + ok.length > max) setError(`Puedes adjuntar hasta ${max} archivos.`)
    if (ok.length) onChange(next)
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setOver(false)
    add(e.dataTransfer.files)
  }

  return (
    <div className="space-y-2">
      {files.length > 0 && (
        <ul className={cn('grid gap-2', max > 1 ? 'grid-cols-1 sm:grid-cols-2' : '')}>
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`} className="flex items-center gap-3 rounded-xl border border-linea bg-superficie p-2 pr-3">
              <LocalThumb file={f} className="h-12 w-12 shrink-0 rounded-lg" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold">{f.name}</span>
                <span className="text-xs text-texto-suave">{formatBytes(f.size)}</span>
              </span>
              <button type="button" onClick={() => onChange(files.filter((_, j) => j !== i))} className="rounded-md p-1.5 text-texto-suave hover:text-estado-alerta" aria-label={`Quitar ${f.name}`}>
                <X className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {!full && (
        <div
          onDragOver={(e) => { e.preventDefault(); setOver(true) }}
          onDragLeave={() => setOver(false)}
          onDrop={onDrop}
          className={cn(
            'flex flex-col items-center gap-3 rounded-xl border-2 border-dashed px-4 py-6 text-center transition-colors',
            over ? 'border-chispa bg-chispa-100/50' : 'border-linea bg-papel/50',
          )}
        >
          <UploadCloud className={cn('h-8 w-8', over ? 'text-chispa-600' : 'text-texto-suave')} />
          <p className="text-sm text-texto-suave">
            {touch ? 'Elige un archivo o toma una foto' : <>Arrastra {max > 1 ? 'tus archivos' : 'el archivo'} aquí o <b className="text-texto">elígelo</b></>}
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => inputRef.current?.click()}>Elegir archivo</Button>
            {camera && touch && (
              <Button type="button" variant="secondary" size="sm" onClick={() => cameraRef.current?.click()}><Camera className="h-4 w-4" />Tomar foto</Button>
            )}
          </div>
          {hint && <p className="text-xs text-texto-suave">{hint}</p>}
          <input ref={inputRef} type="file" className="sr-only" accept={accept} multiple={max > 1} onChange={(e) => { add(e.target.files); e.target.value = '' }} />
          <input ref={cameraRef} type="file" className="sr-only" accept="image/*" capture="environment" onChange={(e) => { add(e.target.files); e.target.value = '' }} />
        </div>
      )}
      {error && <p role="alert" className="text-sm font-bold text-estado-alerta">{error}</p>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Modo enlaces: pegar enlaces de Drive, Docs, YouTube… en lugar de subir
// ---------------------------------------------------------------------------
function ShareHint() {
  return (
    <p className="text-xs text-texto-suave">
      En Google Drive usa <b className="text-texto">Compartir → Cualquier persona con el enlace</b>; si no, los demás no podrán abrirlo.
      <AyudaLink topic="compartir-drive" label="Ver los pasos" className="ml-1 min-h-9 py-0" />
    </p>
  )
}

/** Un enlace con el tipo detectado y el recordatorio de compartir. */
export function LinkField({ value, onChange, placeholder = 'https://drive.google.com/…', hint, required }: {
  value: string
  onChange: (url: string) => void
  placeholder?: string
  hint?: string
  required?: boolean
}) {
  const trimmed = value.trim()
  return (
    <div className="space-y-1.5">
      <div className="relative">
        <Link2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-texto-suave" />
        <Input type="url" inputMode="url" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} required={required} className="pl-9" aria-label="Enlace" />
      </div>
      {isExternal(trimmed)
        ? <p className="text-xs font-bold text-estado-ok">{linkInfo(trimmed).label}</p>
        : trimmed && <p className="text-xs font-bold text-estado-alerta">El enlace debe empezar con https://</p>}
      {hint && <p className="text-xs text-texto-suave">{hint}</p>}
      <ShareHint />
    </div>
  )
}

/** Lista de hasta `max` enlaces. Se agregan al pegar, con Enter, al salir del campo o con el botón. */
export function LinkListField({ links, onChange, max = 5, hint }: {
  links: string[]
  onChange: (links: string[]) => void
  max?: number
  hint?: string
}) {
  const [draft, setDraft] = useState('')
  const [error, setError] = useState('')
  const full = links.length >= max

  function add(raw: string) {
    if (!raw.trim()) return
    try {
      const url = cleanLink(raw)
      setError('')
      setDraft('')
      if (!links.includes(url)) onChange([...links, url].slice(0, max))
    } catch (err) {
      setDraft(raw)
      setError(toMessage(err))
    }
  }

  return (
    <div className="space-y-2">
      {links.length > 0 && (
        <ul className={cn('grid gap-2', max > 1 ? 'grid-cols-1 sm:grid-cols-2' : '')}>
          {links.map((url) => (
            <StoredFileCard key={url} file={{ bucket: '', path: url, name: linkInfo(url).label }} onRemove={() => onChange(links.filter((l) => l !== url))} />
          ))}
        </ul>
      )}
      {!full && (
        <div className="flex gap-2">
          <div className="relative min-w-0 flex-1">
            <Link2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-texto-suave" />
            <Input
              type="url"
              inputMode="url"
              value={draft}
              placeholder="Pega el enlace (Drive, Docs, YouTube…)"
              className="pl-9"
              onChange={(e) => { setDraft(e.target.value); setError('') }}
              onPaste={(e) => { const text = e.clipboardData.getData('text'); if (text.trim()) { e.preventDefault(); add(text) } }}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(draft) } }}
              onBlur={() => { if (isExternal(draft.trim())) add(draft) }}
              aria-label="Enlace"
            />
          </div>
          <Button type="button" variant="secondary" onClick={() => add(draft)} disabled={!draft.trim()}><Plus className="h-4 w-4" />Agregar</Button>
        </div>
      )}
      {error && <p role="alert" className="text-sm font-bold text-estado-alerta">{error}</p>}
      {hint && <p className="text-xs text-texto-suave">{hint}</p>}
      <ShareHint />
    </div>
  )
}

/** Adjunto único: zona de subida en modo archivos o campo de enlace en modo enlaces. */
export function AttachmentInput({ file, onFile, link, onLink, maxBytes, accept, hint, linkHint }: {
  file: File | null
  onFile: (file: File | null) => void
  link: string
  onLink: (url: string) => void
  maxBytes?: number
  accept?: string
  hint?: string
  linkHint?: string
}) {
  if (!FILE_UPLOADS) return <LinkField value={link} onChange={onLink} hint={linkHint} />
  return <FileDropzone files={file ? [file] : []} onChange={(l) => onFile(l[0] ?? null)} maxBytes={maxBytes} accept={accept} hint={hint} />
}
