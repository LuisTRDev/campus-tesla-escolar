/**
 * Sincronización en segundo plano.
 *
 * Cada pantalla carga sus datos con useAsync, que se suscribe a este bus.
 * El bus avisa "refresca" en estos momentos:
 *   · cada 2 minutos (5 en modo ahorro), si la pestaña está visible, hay
 *     internet y el usuario la está usando: tras 5 minutos sin tocar nada se
 *     pausa y se pone al día con el siguiente toque. No corre durante un examen;
 *   · al volver a la pestaña o a la app (si pasaron más de 30 s);
 *   · al recuperar la conexión.
 * Los datos se recargan en silencio y solo se repinta lo que cambió.
 *
 * También revisa si se publicó una versión nueva del campus y la aplica
 * en el siguiente cambio de pantalla (o con el botón "Actualizar").
 */
import { useEffect, useState } from 'react'
import { isLite } from '@/lib/perf'

const REFRESH_EVERY = 2 * 60_000
const REFRESH_EVERY_LITE = 5 * 60_000
const IDLE_AFTER = 5 * 60_000
const MIN_GAP_ON_FOCUS = 30_000
const VERSION_EVERY = 5 * 60_000

type Listener = () => void
const listeners = new Set<Listener>()
let lastRefresh = Date.now()
let updateAvailable = false
const updateListeners = new Set<(v: boolean) => void>()

export function onRefresh(fn: Listener): () => void {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

export function refreshNow(): void {
  lastRefresh = Date.now()
  for (const fn of listeners) fn()
}

function currentBundle(): string | null {
  const el = document.querySelector<HTMLScriptElement>('script[type="module"][src*="/assets/"]')
  return el?.getAttribute('src') ?? null
}

async function checkVersion(): Promise<void> {
  const mine = currentBundle()
  if (!mine || updateAvailable) return // en desarrollo no hay bundle con hash
  try {
    const html = await (await fetch('/index.html', { cache: 'no-store' })).text()
    const latest = html.match(/src="(\/assets\/[^"]+\.js)"/)?.[1]
    if (latest && latest !== mine) {
      updateAvailable = true
      for (const fn of updateListeners) fn(true)
    }
  } catch {
    /* sin conexión: se reintenta en la próxima vuelta */
  }
}

export function isUpdateAvailable(): boolean {
  return updateAvailable
}

/** true cuando hay una versión nueva del campus publicada. */
export function useUpdateAvailable(): boolean {
  const [value, setValue] = useState(updateAvailable)
  useEffect(() => {
    updateListeners.add(setValue)
    return () => { updateListeners.delete(setValue) }
  }, [])
  return value
}

/** Arranca los temporizadores; devuelve la función para detenerlos. */
export function startBackgroundSync(): () => void {
  const visible = () => document.visibilityState === 'visible'

  let lastInteraction = Date.now()
  const every = () => (isLite() ? REFRESH_EVERY_LITE : REFRESH_EVERY)
  const busy = () => document.documentElement.classList.contains('focus-mode') // rindiendo una evaluación
  const due = () => Date.now() - lastRefresh >= every()

  const tick = setInterval(() => {
    const idle = Date.now() - lastInteraction > IDLE_AFTER
    if (visible() && navigator.onLine && !idle && !busy() && due()) refreshNow()
  }, 30_000)

  // Después de un rato sin uso, el primer toque pone la pantalla al día.
  const onInteract = () => {
    const wasIdle = Date.now() - lastInteraction > IDLE_AFTER
    lastInteraction = Date.now()
    if (wasIdle && navigator.onLine && !busy() && due()) refreshNow()
  }

  const versionTick = setInterval(() => {
    if (visible()) void checkVersion()
  }, VERSION_EVERY)

  const onVisible = () => {
    if (!visible()) return
    lastInteraction = Date.now()
    if (Date.now() - lastRefresh > MIN_GAP_ON_FOCUS && !busy()) refreshNow()
    void checkVersion()
  }
  const onOnline = () => refreshNow()

  document.addEventListener('visibilitychange', onVisible)
  window.addEventListener('focus', onVisible)
  window.addEventListener('online', onOnline)
  window.addEventListener('pointerdown', onInteract, { passive: true })
  window.addEventListener('keydown', onInteract, { passive: true })

  return () => {
    clearInterval(tick)
    clearInterval(versionTick)
    document.removeEventListener('visibilitychange', onVisible)
    window.removeEventListener('focus', onVisible)
    window.removeEventListener('online', onOnline)
    window.removeEventListener('pointerdown', onInteract)
    window.removeEventListener('keydown', onInteract)
  }
}

/** Comparación estable de resultados (soporta Map y Set) para no repintar si nada cambió. */
export function sameData(a: unknown, b: unknown): boolean {
  const replacer = (_key: string, value: unknown) => {
    if (value instanceof Map) return { __map: [...value.entries()] }
    if (value instanceof Set) return { __set: [...value.values()] }
    return value
  }
  try {
    return JSON.stringify(a, replacer) === JSON.stringify(b, replacer)
  } catch {
    return false
  }
}
