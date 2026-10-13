const TZ = 'America/Lima'

const dayFmt = new Intl.DateTimeFormat('es-PE', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long' })
const shortFmt = new Intl.DateTimeFormat('es-PE', { timeZone: TZ, day: 'numeric', month: 'short' })
const timeFmt = new Intl.DateTimeFormat('es-PE', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false })
const isoDayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' })

export function limaToday(): string {
  return isoDayFmt.format(new Date())
}

export function isoDay(date: Date): string {
  return isoDayFmt.format(date)
}

export function formatDay(value: string | Date): string {
  const d = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00-05:00`) : new Date(value)
  const text = dayFmt.format(d)
  return text.charAt(0).toUpperCase() + text.slice(1)
}

export function formatShort(value: string | Date): string {
  const d = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00-05:00`) : new Date(value)
  return shortFmt.format(d)
}

export function formatTime(value: string | Date): string {
  return timeFmt.format(new Date(value))
}

export function formatDue(value: string | null): string {
  if (!value) return 'Sin fecha límite'
  return `${formatDay(value)}, ${formatTime(value)}`
}

/** "vence hoy", "vence mañana", "venció hace 2 días", "en 5 días" */
export function relativeDue(value: string | null): { label: string; tone: 'neutral' | 'soon' | 'overdue' } {
  if (!value) return { label: 'Sin fecha límite', tone: 'neutral' }
  const due = new Date(value)
  const now = new Date()
  const dueDay = isoDay(due)
  const today = limaToday()
  const diffDays = Math.round((Date.parse(`${dueDay}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86_400_000)
  if (due.getTime() < now.getTime()) {
    if (diffDays === 0) return { label: `Venció hoy a las ${formatTime(due)}`, tone: 'overdue' }
    const n = Math.abs(diffDays)
    return { label: n === 1 ? 'Venció ayer' : `Venció hace ${n} días`, tone: 'overdue' }
  }
  if (diffDays === 0) return { label: `Vence hoy, ${formatTime(due)}`, tone: 'soon' }
  if (diffDays === 1) return { label: `Vence mañana, ${formatTime(due)}`, tone: 'soon' }
  if (diffDays < 7) return { label: `Vence el ${formatDay(due).split(',')[0].toLowerCase()}`, tone: 'neutral' }
  return { label: `Vence el ${formatShort(due)}`, tone: 'neutral' }
}

export function formatBytes(bytes: number | null | undefined): string {
  if (!bytes && bytes !== 0) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export function formatScore(score: number | null, max: number): string {
  if (score == null) return '—'
  const s = Number(score)
  return `${Number.isInteger(s) ? s : s.toFixed(1)}/${Number(max)}`
}

export function greeting(): string {
  const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', hour12: false }).format(new Date()))
  if (hour < 12) return 'Buenos días'
  if (hour < 19) return 'Buenas tardes'
  return 'Buenas noches'
}

/** Convierte "2026-10-02T18:00" (hora local del input) a ISO con zona Lima. */
export function localInputToIso(value: string): string | null {
  if (!value) return null
  return new Date(`${value}:00-05:00`).toISOString()
}

/** ISO → valor para <input type="datetime-local"> en hora de Lima. */
export function isoToLocalInput(value: string | null): string {
  if (!value) return ''
  const d = new Date(value)
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(d)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00'
  const hour = get('hour') === '24' ? '00' : get('hour')
  return `${get('year')}-${get('month')}-${get('day')}T${hour}:${get('minute')}`
}
