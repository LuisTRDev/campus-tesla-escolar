import { useSyncExternalStore } from 'react'

export type ThemePref = 'system' | 'light' | 'dark'
const KEY = 'campus_theme'
const media = () => window.matchMedia('(prefers-color-scheme: dark)')

function read(): ThemePref {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'light' || v === 'dark' ? v : 'system'
  } catch {
    return 'system'
  }
}

let current: ThemePref = typeof window === 'undefined' ? 'system' : read()
const listeners = new Set<() => void>()

function apply() {
  const dark = current === 'dark' || (current === 'system' && media().matches)
  document.documentElement.classList.toggle('dark', dark)
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#080F1E' : '#102442')
}

if (typeof window !== 'undefined') {
  apply()
  // Si la preferencia es "sistema", sigue los cambios del celular o la computadora.
  media().addEventListener('change', () => { if (current === 'system') apply() })
}

function setThemePref(next: ThemePref) {
  current = next
  try { localStorage.setItem(KEY, next) } catch { /* sin almacenamiento */ }
  apply()
  for (const fn of listeners) fn()
}

/** Preferencia de tema compartida por toda la app (claro, oscuro o la del sistema). */
export function useTheme() {
  const pref = useSyncExternalStore(
    (fn) => { listeners.add(fn); return () => { listeners.delete(fn) } },
    () => current,
  )
  return { pref, setPref: setThemePref }
}
