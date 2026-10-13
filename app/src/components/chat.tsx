import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Camera, FileText, Send } from 'lucide-react'
import { Button, Textarea } from '@/components/ui'
import { signedUrl } from '@/components/files'
import { AudioRecorder, StoredAudio } from '@/pages/course/GradingTools'
import { supabase } from '@/lib/supabase'
import { useToast } from '@/lib/toast'
import { toMessage } from '@/lib/errors'
import { cn } from '@/lib/utils'
import { BUCKET_MESSAGES, type AttachmentKind } from '@/services/comunicacion'

// ---------------------------------------------------------------------------
// Adjunto dentro de una burbuja (foto, nota de voz o archivo)
// ---------------------------------------------------------------------------
export function ChatAttachment({ path, kind, name }: { path: string; kind: AttachmentKind; name?: string | null }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    if (kind === 'AUDIO') return
    let alive = true
    signedUrl(BUCKET_MESSAGES, path).then((u) => { if (alive) setUrl(u) }).catch(() => undefined)
    return () => { alive = false }
  }, [path, kind])
  if (kind === 'AUDIO') return <StoredAudio bucket={BUCKET_MESSAGES} path={path} className="my-1 max-w-[16rem]" />
  if (kind === 'IMAGE') {
    return url
      ? <a href={url} target="_blank" rel="noopener noreferrer"><img src={url} alt={name ?? 'Foto'} className="my-1 max-h-64 rounded-xl object-cover" loading="lazy" /></a>
      : <span className="my-1 block h-40 w-56 animate-pulse rounded-xl bg-black/10" />
  }
  return (
    <a href={url ?? undefined} target="_blank" rel="noopener noreferrer" className="my-1 inline-flex items-center gap-2 rounded-lg bg-black/10 px-3 py-2 text-sm font-bold">
      <FileText className="h-4 w-4" />{name ?? 'Archivo'}
    </a>
  )
}

// ---------------------------------------------------------------------------
// «Está escribiendo…» con Supabase Realtime (broadcast, no se guarda nada)
// ---------------------------------------------------------------------------
export function useTyping(room: string | null, myName: string | null | undefined) {
  const [typing, setTyping] = useState<string[]>([])
  const channel = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const timers = useRef(new Map<string, number>())
  const lastSent = useRef(0)

  useEffect(() => {
    if (!room) return
    const ch = supabase.channel(`typing:${room}`, { config: { broadcast: { self: false } } })
    ch.on('broadcast', { event: 'typing' }, ({ payload }) => {
      const name = String((payload as { name?: string }).name ?? 'Alguien')
      setTyping((t) => (t.includes(name) ? t : [...t, name]))
      window.clearTimeout(timers.current.get(name))
      timers.current.set(name, window.setTimeout(() => setTyping((t) => t.filter((x) => x !== name)), 3500))
    }).subscribe()
    channel.current = ch
    const map = timers.current
    return () => {
      map.forEach((t) => window.clearTimeout(t))
      void supabase.removeChannel(ch)
      channel.current = null
    }
  }, [room])

  function notify() {
    if (!channel.current || Date.now() - lastSent.current < 2000) return
    lastSent.current = Date.now()
    void channel.current.send({ type: 'broadcast', event: 'typing', payload: { name: (myName ?? '').split(' ')[0] || 'Alguien' } })
  }

  return { typing, notify }
}

export function TypingIndicator({ names }: { names: string[] }) {
  if (!names.length) return null
  return (
    <p className="flex items-center gap-2 px-4 pb-1 text-xs text-texto-suave">
      <span className="typing-dots text-tinta-500"><span /><span /><span /></span>
      {names.join(', ')} {names.length === 1 ? 'está' : 'están'} escribiendo…
    </p>
  )
}

// ---------------------------------------------------------------------------
// Caja para escribir con foto y nota de voz
// ---------------------------------------------------------------------------
export function ChatComposer({ onSend, onFile, onTyping, disabled, placeholder = 'Escribe un mensaje…' }: {
  onSend: (text: string) => void
  onFile: (blob: Blob, name: string) => Promise<void>
  onTyping?: () => void
  disabled?: boolean
  placeholder?: string
}) {
  const toast = useToast()
  const [text, setText] = useState('')
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  function submit(e: FormEvent) {
    e.preventDefault()
    const body = text.trim()
    if (!body) return
    onSend(body)
    setText('')
  }

  async function sendFile(file: File | undefined) {
    if (!file) return
    setUploading(true)
    try {
      await onFile(file, file.name)
    } catch (err) {
      toast(toMessage(err), 'error')
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  if (disabled) return null
  return (
    <form onSubmit={submit} className="flex items-end gap-2 border-t border-linea bg-superficie p-3">
      <input ref={fileRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => void sendFile(e.target.files?.[0])} />
      <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
        className={cn('flex min-h-11 min-w-11 items-center justify-center rounded-lg text-texto-suave hover:bg-papel hover:text-texto', uploading && 'animate-pulse')} aria-label="Enviar foto o archivo">
        <Camera className="h-5 w-5" />
      </button>
      <Textarea
        value={text}
        onChange={(e) => { setText(e.target.value); onTyping?.() }}
        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && window.matchMedia('(min-width: 1024px)').matches) { e.preventDefault(); e.currentTarget.form?.requestSubmit() } }}
        maxLength={2000}
        placeholder={placeholder}
        className="min-h-11 flex-1 py-2.5"
        rows={1}
      />
      {text.trim() ? (
        <Button type="submit" aria-label="Enviar" className="min-h-11 min-w-11"><Send className="h-4 w-4" /></Button>
      ) : (
        <AudioRecorder maxSeconds={120} onDone={(blob) => onFile(blob, `voz.${blob.type.includes('mp4') ? 'm4a' : 'webm'}`)} />
      )}
    </form>
  )
}
