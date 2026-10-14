/**
 * Rendimiento en el celular.
 *
 * Modo ahorro (clase `lite` en <html>): sin desenfoques, mezclas ni
 * animaciones infinitas, y sincronización menos frecuente. Se activa solo con
 * "Ahorro de datos", red 2G/3G o un celular con poca memoria, o a mano desde
 * Ajustes. public/theme-init.js aplica la misma regla antes de pintar.
 *
 * Precarga: en un momento libre, con buena conexión, descarga las pantallas
 * que el rol más usa para que se abran al instante.
 */
import { lazy, useEffect, useState, type ComponentType, type LazyExoticComponent } from 'react'

export type LitePref = 'auto' | 'on' | 'off'
const KEY = 'campus-lite'

type NetInfo = { saveData?: boolean; effectiveType?: string }
const connection = (): NetInfo | undefined => (navigator as Navigator & { connection?: NetInfo }).connection

/** ¿El dispositivo o la red piden ahorrar? */
export function constrainedDevice(): boolean {
  const c = connection()
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory
  return !!c?.saveData || ['slow-2g', '2g', '3g'].includes(c?.effectiveType ?? '') || (memory != null && memory <= 2)
}

export function readLitePref(): LitePref {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'on' || v === 'off' ? v : 'auto'
  } catch {
    return 'auto'
  }
}

export function isLite(): boolean {
  return document.documentElement.classList.contains('lite')
}

export function applyLite(pref: LitePref = readLitePref()): void {
  const on = pref === 'on' || (pref === 'auto' && constrainedDevice())
  document.documentElement.classList.toggle('lite', on)
}

export function useLitePref(): [LitePref, (p: LitePref) => void, boolean] {
  const [pref, setPref] = useState<LitePref>(readLitePref)
  const update = (p: LitePref) => {
    try { if (p === 'auto') localStorage.removeItem(KEY); else localStorage.setItem(KEY, p) } catch { /* sin almacenamiento */ }
    applyLite(p)
    setPref(p)
  }
  return [pref, update, isLite()]
}

/** Si cambia la red (por ejemplo, de wifi a 3G), se reevalúa el modo automático. */
export function watchConnection(): () => void {
  const c = connection() as (NetInfo & EventTarget) | undefined
  if (!c?.addEventListener) return () => undefined
  const onChange = () => { if (readLitePref() === 'auto') applyLite('auto') }
  c.addEventListener('change', onChange)
  return () => c.removeEventListener('change', onChange)
}

// ---------------------------------------------------------------------------
// Pantallas con precarga
// ---------------------------------------------------------------------------
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type PreloadableComponent<T extends ComponentType<any>> = LazyExoticComponent<T> & { preload: () => Promise<unknown> }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function lazyPage<T extends ComponentType<any>>(factory: () => Promise<{ default: T }>): PreloadableComponent<T> {
  return Object.assign(lazy(factory), { preload: factory })
}

/** Descarga en segundo plano las pantallas indicadas, una por una y sin apuro. */
export function usePrefetch(pages: { preload: () => Promise<unknown> }[], enabled = true): void {
  useEffect(() => {
    if (!enabled || !pages.length || constrainedDevice() || isLite()) return
    let cancelled = false
    const idle = (fn: () => void) => {
      if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(fn, { timeout: 4000 })
      else setTimeout(fn, 1500)
    }
    const run = async () => {
      for (const p of pages) {
        if (cancelled || document.hidden || !navigator.onLine) return
        await p.preload().catch(() => undefined)
        await new Promise<void>((r) => idle(() => r()))
      }
    }
    const t = window.setTimeout(() => idle(() => void run()), 3000)
    return () => { cancelled = true; window.clearTimeout(t) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled])
}
