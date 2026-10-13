import { supabase } from '@/lib/supabase'
import { UserError } from '@/lib/errors'
import { reportError } from '@/lib/security'

const VAPID_PUBLIC_KEY: string = import.meta.env.VITE_VAPID_PUBLIC_KEY || ''

export type PushStatus = 'unsupported' | 'needs-install' | 'not-configured' | 'denied' | 'off' | 'on'

export function isIos(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

export function isStandalone(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true
}

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'))
  const out = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

/** Registra el service worker (se llama una vez al iniciar la app). */
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null
  try {
    return await navigator.serviceWorker.register('/sw.js', { scope: '/' })
  } catch (err) {
    reportError('sw', err)
    return null
  }
}

export async function pushStatus(): Promise<PushStatus> {
  // En iPhone las notificaciones solo funcionan con la app instalada en la pantalla de inicio.
  if (isIos() && !isStandalone()) return 'needs-install'
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported'
  if (!VAPID_PUBLIC_KEY) return 'not-configured'
  if (Notification.permission === 'denied') return 'denied'
  const reg = await navigator.serviceWorker.getRegistration('/')
  const sub = await reg?.pushManager.getSubscription()
  return sub && Notification.permission === 'granted' ? 'on' : 'off'
}

export async function enablePush(): Promise<void> {
  if (!VAPID_PUBLIC_KEY) throw new UserError('Las notificaciones aún no están configuradas en el colegio.')
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') throw new UserError('No diste permiso para mostrar notificaciones.')
  const reg = (await navigator.serviceWorker.getRegistration('/')) ?? (await registerServiceWorker())
  if (!reg) throw new UserError('Este navegador no permite notificaciones.')
  await navigator.serviceWorker.ready
  const sub = (await reg.pushManager.getSubscription())
    ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) }))
  const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } }
  if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) throw new UserError('No se pudo activar en este dispositivo.')
  const { error } = await supabase.from('push_subscriptions').upsert({
    endpoint: json.endpoint,
    p256dh: json.keys.p256dh,
    auth: json.keys.auth,
    user_agent: navigator.userAgent.slice(0, 300),
    last_seen_at: new Date().toISOString(),
  }, { onConflict: 'endpoint' })
  if (error) throw error
}

export async function disablePush(): Promise<void> {
  const reg = await navigator.serviceWorker.getRegistration('/')
  const sub = await reg?.pushManager.getSubscription()
  if (!sub) return
  await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
  await sub.unsubscribe()
}

/** Al cerrar sesión: el dispositivo deja de recibir avisos de esa cuenta. */
export async function forgetDevice(): Promise<void> {
  try {
    await disablePush()
  } catch (err) {
    reportError('push', err)
  }
}

export async function sendTestPush(): Promise<void> {
  const { error } = await supabase.rpc('send_test_push')
  if (error) throw error
}
