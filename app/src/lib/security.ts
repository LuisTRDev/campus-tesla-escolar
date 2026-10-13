const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g
const BIDI_CONTROLS = /[\u202A-\u202E\u2066-\u2069]/g

export function cleanText(value: unknown, maxLength = 1000): string {
  return String(value ?? '')
    .replace(CONTROL_CHARS, '')
    .replace(BIDI_CONTROLS, '')
    .replace(/\r\n?/g, '\n')
    .trim()
    .slice(0, maxLength)
}

export function cleanSingleLine(value: unknown, maxLength = 180): string {
  return cleanText(value, maxLength).replace(/\s+/g, ' ').trim()
}

export function safeFileName(value: string): string {
  const cleaned = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\\/]+/g, '-')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, 120)
  return cleaned || 'archivo'
}

export function positiveInteger(value: unknown, field = 'Identificador'): number {
  const number = Number(value)
  if (!Number.isSafeInteger(number) || number <= 0) throw new Error(`${field} inválido.`)
  return number
}

export function validIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T12:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

export function validTime(value: unknown): value is string {
  return typeof value === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(value)
}

export function safeUserMessage(error: unknown, fallback = 'Ocurrió un error. Inténtalo nuevamente.'): string {
  if (error instanceof Error) {
    const text = error.message.toLowerCase()
    if (text.includes('jwt') || text.includes('session') || text.includes('refresh token')) return 'La sesión expiró. Vuelve a iniciar sesión.'
    if (text.includes('network') || text.includes('fetch') || text.includes('conex')) return 'No se pudo conectar con el servidor. Revisa tu conexión.'
    if (text.includes('archivo') || text.includes('file') || text.includes('formato') || text.includes('tamaño')) return cleanSingleLine(error.message, 220)
  }
  return fallback
}

export function reportError(context: string, error?: unknown): void {
  if (import.meta.env.DEV) {
    console.error(`[Campus:${context}]`, error)
  }
}

export function installProductionConsoleGuards(): void {
  if (!import.meta.env.PROD) return
  const noop = () => undefined
  console.log = noop
  console.info = noop
  console.debug = noop
  console.warn = () => undefined
  console.error = () => undefined
}

export function safeJsonRecord(value: Record<string, unknown> | null | undefined, maxKeys = 40): Record<string, unknown> | null {
  if (!value) return null
  const output: Record<string, unknown> = {}
  for (const [key, raw] of Object.entries(value).slice(0, maxKeys)) {
    const safeKey = cleanSingleLine(key, 80)
    if (!safeKey) continue
    if (raw == null || typeof raw === 'boolean' || typeof raw === 'number') output[safeKey] = raw
    else output[safeKey] = cleanText(raw, 500)
  }
  return output
}
