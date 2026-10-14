/**
 * Cómo se escribe una entrega: cuánto se tecleó y cuánto se pegó, el tiempo
 * activo y en cuántas sesiones. Se acumula en el dispositivo (sobrevive a
 * cerrar la app, igual que el borrador) y se envía al entregar.
 * Funciona con los teclados del celular: mide cuánto crece el texto, no las teclas.
 */
import { useCallback, useRef, type ClipboardEvent } from 'react'
import type { WritingMetrics } from '@/services/integridad'

const IDLE_MS = 30_000

function read(key: string): Required<WritingMetrics> {
  const empty = { typed: 0, pasted: 0, pastes: 0, max_paste: 0, active_ms: 0, sessions: 0 }
  try { return { ...empty, ...(JSON.parse(localStorage.getItem(key) || '{}') as WritingMetrics) } } catch { return empty }
}

export function useWritingMetrics(id: string | null) {
  const key = id ? `writing:${id}` : ''
  const metrics = useRef<Required<WritingMetrics> | null>(null)
  const pendingPaste = useRef(0)
  const lastInput = useRef(0)
  const session = useRef(false)

  const get = useCallback(() => {
    if (!metrics.current) metrics.current = read(key)
    return metrics.current
  }, [key])

  const save = useCallback(() => {
    if (!key || !metrics.current) return
    try { localStorage.setItem(key, JSON.stringify(metrics.current)) } catch { /* sin almacenamiento */ }
  }, [key])

  const onPaste = useCallback((e: ClipboardEvent<HTMLTextAreaElement | HTMLInputElement>) => {
    const len = e.clipboardData.getData('text').length
    const m = get()
    m.pastes += 1
    m.max_paste = Math.max(m.max_paste, len)
    pendingPaste.current = len
  }, [get])

  /** Llamar en cada cambio con el texto anterior y el nuevo. */
  const track = useCallback((prev: string, next: string) => {
    if (!key) return
    const m = get()
    const delta = next.length - prev.length
    if (delta > 0) {
      if (pendingPaste.current > 0) {
        m.pasted += Math.min(delta, pendingPaste.current)
        m.typed += Math.max(0, delta - pendingPaste.current)
        pendingPaste.current = 0
      } else m.typed += delta
    }
    const now = Date.now()
    if (lastInput.current && now - lastInput.current < IDLE_MS) m.active_ms += now - lastInput.current
    lastInput.current = now
    if (!session.current) { m.sessions += 1; session.current = true }
    save()
  }, [key, get, save])

  /** Devuelve lo acumulado y lo borra (al entregar). */
  const take = useCallback((): WritingMetrics | null => {
    const m = get()
    metrics.current = null
    session.current = false
    try { localStorage.removeItem(key) } catch { /* nada */ }
    return m.typed + m.pasted > 0 ? m : null
  }, [key, get])

  return { onPaste, track, take }
}
