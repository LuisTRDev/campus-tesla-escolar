import { useEffect, useState } from 'react'
import { UserError } from '@/lib/errors'
import { cleanSingleLine } from '@/lib/security'
import { supabase } from '@/lib/supabase'

// ---------------------------------------------------------------------------
// Modo de archivos
// ---------------------------------------------------------------------------
/**
 * `false` (por defecto): modo enlaces. Nada se sube a Supabase Storage; los
 * archivos viven en Google Drive, OneDrive, YouTube, etc. y el campus guarda
 * solo el enlace, en las mismas columnas donde iría la ruta del archivo
 * (`attachment_path`, `files[].path`). Una ruta que empieza con https:// es
 * siempre un enlace externo, así que los dos modos conviven sin migrar datos.
 *
 * `true`: modo archivos (subidas a los buckets privados del campus).
 *
 * La dirección lo cambia en Sistema → Archivos; se guarda en la base
 * (`campus_file_uploads()`, script 21) y se lee al abrir el campus y en cada
 * sincronización. Es un `let` exportado: quien lo importa ve siempre el valor
 * actual. `VITE_FILE_UPLOADS` solo se usa si la base todavía no tiene el
 * script 21.
 */
const CACHE_KEY = 'campus-file-uploads'

function cachedMode(): boolean | null {
  try {
    const v = localStorage.getItem(CACHE_KEY)
    return v === 'true' ? true : v === 'false' ? false : null
  } catch {
    return null
  }
}

export let FILE_UPLOADS = cachedMode() ?? import.meta.env.VITE_FILE_UPLOADS === 'true'

const modeListeners = new Set<(v: boolean) => void>()

function applyMode(value: boolean): void {
  try { localStorage.setItem(CACHE_KEY, String(value)) } catch { /* sin almacenamiento */ }
  if (value === FILE_UPLOADS) return
  FILE_UPLOADS = value
  for (const fn of modeListeners) fn(value)
}

/** ¿Ya se leyó el modo alguna vez en este dispositivo? */
export const hasCachedFileMode = () => cachedMode() !== null

/** Lee el modo desde la base. Si falla (sin conexión o sin script 21), deja el que había. */
export async function loadFileMode(): Promise<boolean> {
  const { data, error } = await supabase.rpc('campus_file_uploads')
  if (!error && typeof data === 'boolean') applyMode(data)
  return FILE_UPLOADS
}

/** Cambia el modo para todo el campus (solo ADMIN o MANAGEMENT; lo valida la base). */
export async function setFileMode(enabled: boolean): Promise<void> {
  const { data, error } = await supabase.rpc('set_campus_file_uploads', { p_enabled: enabled })
  if (error) throw error
  applyMode(data === true)
}

/** El modo actual, que se repinta si cambia. */
export function useFileUploads(): boolean {
  const [value, setValue] = useState(FILE_UPLOADS)
  useEffect(() => {
    modeListeners.add(setValue)
    setValue(FILE_UPLOADS)
    return () => { modeListeners.delete(setValue) }
  }, [])
  return value
}

export const UPLOADS_OFF_MESSAGE = 'Por ahora el campus no guarda archivos: sube el archivo a Google Drive y pega el enlace.'

/** Lanza un error amable si se intenta subir un archivo en modo enlaces. */
export function assertUploads(): void {
  if (!FILE_UPLOADS) throw new UserError(UPLOADS_OFF_MESSAGE)
}

/** ¿La ruta guardada es un enlace externo (y no un archivo de Storage)? */
export function isExternal(pathOrUrl: string | null | undefined): pathOrUrl is string {
  return !!pathOrUrl && /^https:\/\//i.test(pathOrUrl)
}

/** Valida y limpia un enlace escrito por el usuario. */
export function cleanLink(raw: string | null | undefined): string {
  const url = cleanSingleLine(raw, 600)
  if (!/^https:\/\/[^\s/]+\.[^\s]+/i.test(url)) throw new UserError('El enlace debe empezar con https:// (cópialo desde la barra del navegador o el botón «Compartir»).')
  try {
    new URL(url)
  } catch {
    throw new UserError('El enlace no es válido.')
  }
  return url
}

// ---------------------------------------------------------------------------
// Proveedores conocidos: nombre amable y versión para ver dentro del campus
// ---------------------------------------------------------------------------
export type LinkProvider = 'drive' | 'docs' | 'sheets' | 'slides' | 'forms' | 'youtube' | 'onedrive' | 'canva' | 'web'

export type LinkInfo = {
  provider: LinkProvider
  /** Nombre del tipo de enlace, por ejemplo «Documento de Google». */
  label: string
  /** URL para un iframe (null si el sitio no permite verlo dentro del campus). */
  embed: string | null
}

const LABEL: Record<LinkProvider, string> = {
  drive: 'Archivo de Google Drive',
  docs: 'Documento de Google',
  sheets: 'Hoja de cálculo de Google',
  slides: 'Presentación de Google',
  forms: 'Formulario de Google',
  youtube: 'Video de YouTube',
  onedrive: 'Archivo de OneDrive',
  canva: 'Diseño de Canva',
  web: 'Enlace',
}

function youtubeVideoId(url: string): string | null {
  const match = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/)
  return match ? match[1] : null
}

export function linkInfo(url: string): LinkInfo {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return { provider: 'web', label: LABEL.web, embed: null }
  }
  const host = u.hostname.toLowerCase()
  const info = (provider: LinkProvider, embed: string | null): LinkInfo => ({ provider, label: LABEL[provider], embed })

  if (host === 'drive.google.com') {
    const id = u.pathname.match(/\/file\/d\/([\w-]+)/)?.[1] ?? u.searchParams.get('id')
    return info('drive', id ? `https://drive.google.com/file/d/${id}/preview` : null)
  }
  if (host === 'docs.google.com') {
    const m = u.pathname.match(/^\/(document|spreadsheets|presentation|forms)\/d\/(e\/)?([\w-]+)/)
    if (m) {
      const [, type, published, id] = m
      const base = `https://docs.google.com/${type}/d/${published ?? ''}${id}`
      if (type === 'document') return info('docs', `${base}/preview`)
      if (type === 'spreadsheets') return info('sheets', `${base}/preview`)
      if (type === 'presentation') return info('slides', `${base}/preview`)
      return info('forms', `${base}/viewform?embedded=true`)
    }
    return info('docs', null)
  }
  if (/(^|\.)youtube\.com$|^youtu\.be$/.test(host)) {
    const id = youtubeVideoId(url)
    return info('youtube', id ? `https://www.youtube-nocookie.com/embed/${id}` : null)
  }
  if (/(^|\.)onedrive\.live\.com$|^1drv\.ms$|\.sharepoint\.com$/.test(host)) return info('onedrive', null)
  if (/(^|\.)canva\.com$/.test(host)) return info('canva', null)
  return info('web', null)
}

/** Nombre para mostrar de un enlace cuando el usuario no escribió uno. */
export function linkName(url: string): string {
  const { provider, label } = linkInfo(url)
  if (provider !== 'web') return label
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return label
  }
}
