import { cleanSingleLine, reportError } from '@/lib/security'

type MaybeDbError = { message?: unknown; code?: unknown; status?: unknown }

/**
 * Convierte cualquier error (Supabase, red, validación) en un mensaje claro
 * para mostrar en pantalla. Los mensajes de las reglas del campus (RAISE
 * EXCEPTION en la base de datos, código P0001) ya vienen en español.
 */
export function toMessage(error: unknown, fallback = 'No se pudo completar la acción. Inténtalo de nuevo.'): string {
  reportError('ui', error)
  if (!error) return fallback
  const e = error as MaybeDbError
  const message = typeof e.message === 'string' ? e.message : ''
  const code = typeof e.code === 'string' ? e.code : ''
  const lower = message.toLowerCase()

  if (code === 'P0001' && message) return cleanSingleLine(message, 240)
  if (code === '42501' || lower.includes('row-level security')) return 'No tienes permiso para hacer esto.'
  if (lower.includes('invalid login credentials')) return 'Usuario o contraseña incorrectos.'
  if (lower.includes('jwt') || lower.includes('refresh token')) return 'Tu sesión expiró. Vuelve a iniciar sesión.'
  if (lower.includes('failed to fetch') || lower.includes('network')) return 'Sin conexión con el servidor. Revisa tu internet.'
  if (lower.includes('payload too large') || lower.includes('exceeded the maximum')) return 'El archivo es demasiado grande.'
  if (lower.includes('mime type') || lower.includes('not supported')) return 'Ese tipo de archivo no está permitido.'
  if (error instanceof Error && message.startsWith('⚠')) return cleanSingleLine(message.slice(1), 240)
  return fallback
}

/** Error de validación propio: su mensaje siempre se muestra tal cual. */
export class UserError extends Error {
  constructor(message: string) {
    super(`⚠${message}`)
  }
}
