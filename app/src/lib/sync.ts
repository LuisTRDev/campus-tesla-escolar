/**
 * Sincronización en segundo plano.
 *
 * Cada pantalla carga sus datos con useAsync, que se suscribe a este bus.
 * El bus avisa "refresca" en estos momentos:
 *   · cada 2 minutos, si la pestaña está visible y hay internet;
 *   · al volver a la pestaña o a la app (si pasaron más de 30 s);
 *   · al recuperar la conexión.
 * Los datos se recargan en silencio y solo se repinta lo que cambió.
 *
 * También revisa si se publicó una versión nueva del campus y la aplica
 * en el siguiente cambio de pantalla (o con el botón "Actualizar").
 */
import { useEffect, useState } from 'react'

const REFRESH_EVERY = 2 * 60_000
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

  const tick = setInterval(() => {
    if (visible() && navigator.onLine) refreshNow()
  }, REFRESH_EVERY)

  const versionTick = setInterval(() => {
    if (visible()) void checkVersion()
  }, VERSION_EVERY)

  const onVisible = () => {
    if (!visible()) return
    if (Date.now() - lastRefresh > MIN_GAP_ON_FOCUS) refreshNow()
    void checkVersion()
  }
  const onOnline = () => refreshNow()

  document.addEventListener('visibilitychange', onVisible)
  window.addEventListener('focus', onVisible)
  window.addEventListener('online', onOnline)

  return () => {
    clearInterval(tick)
    clearInterval(versionTick)
    document.removeEventListener('visibilitychange', onVisible)
    window.removeEventListener('focus', onVisible)
    window.removeEventListener('online', onOnline)
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
