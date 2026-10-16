import { useEffect, useRef, useState } from 'react'

/**
 * Deslizar hacia abajo desde el tope de la página para actualizar (pantallas táctiles).
 * Devuelve cuánto se jaló (px, ya amortiguado) y el estado para dibujar el rayo.
 * No actúa durante un examen (`focus-mode`) ni con un panel o ventana abiertos.
 */
export type PullState = 'idle' | 'pulling' | 'ready' | 'refreshing'

const THRESHOLD = 72
const MAX = 110

export function usePullRefresh(onRefresh: () => void) {
  const [dy, setDy] = useState(0)
  const [state, setState] = useState<PullState>('idle')
  const start = useRef<number | null>(null)
  const ready = useRef(false)
  const cb = useRef(onRefresh)
  cb.current = onRefresh

  useEffect(() => {
    if (!window.matchMedia?.('(pointer: coarse)').matches) return
    const blocked = () =>
      document.documentElement.classList.contains('focus-mode') || !!document.querySelector('dialog[open], [aria-modal="true"]')
    const onStart = (e: TouchEvent) => {
      start.current = window.scrollY <= 0 && e.touches.length === 1 && !blocked() ? e.touches[0].clientY : null
    }
    const onMove = (e: TouchEvent) => {
      if (start.current == null) return
      const raw = e.touches[0].clientY - start.current
      if (raw <= 0) { ready.current = false; setDy(0); setState('idle'); return }
      const d = Math.min(MAX, raw * 0.5)
      ready.current = d >= THRESHOLD
      setDy(d)
      setState(ready.current ? 'ready' : 'pulling')
    }
    const onEnd = () => {
      if (start.current == null) return
      start.current = null
      if (ready.current) {
        ready.current = false
        cb.current()
        setState('refreshing')
        setDy(THRESHOLD * 0.75)
        window.setTimeout(() => { setDy(0); setState('idle') }, 900)
      } else {
        setDy(0)
        setState('idle')
      }
    }
    window.addEventListener('touchstart', onStart, { passive: true })
    window.addEventListener('touchmove', onMove, { passive: true })
    window.addEventListener('touchend', onEnd)
    window.addEventListener('touchcancel', onEnd)
    return () => {
      window.removeEventListener('touchstart', onStart)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onEnd)
      window.removeEventListener('touchcancel', onEnd)
    }
  }, [])

  return { dy, state }
}
