/**
 * Integridad académica: convierte las señales del servidor (script 23) en un
 * riesgo con motivos legibles para el docente. Todo es heurístico: son
 * indicios para revisar, nunca una prueba ni una sanción automática.
 */
import type { QuizSettings } from '@/types'
import type {
  AttemptSignals, CollusionPair, SubmissionSignals, TextFeatures,
} from '@/services/integridad'

export type RiskLevel = 'none' | 'low' | 'medium' | 'high'
export type Reason = { text: string; points: number; tone: 'alert' | 'late' | 'info' }
export type Risk = { score: number; level: RiskLevel; reasons: Reason[] }

export const RISK_LABEL: Record<RiskLevel, string> = { none: 'Sin alertas', low: 'Riesgo bajo', medium: 'Riesgo medio', high: 'Riesgo alto' }

function toRisk(reasons: Reason[]): Risk {
  const score = Math.min(100, reasons.reduce((s, r) => s + r.points, 0))
  const level: RiskLevel = score >= 55 ? 'high' : score >= 25 ? 'medium' : score > 0 ? 'low' : 'none'
  return { score, level, reasons: reasons.sort((a, b) => b.points - a.points) }
}

const veces = (n: number) => `${n} ${n === 1 ? 'vez' : 'veces'}`
export function duration(ms: number): string {
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s} s`
  const m = Math.floor(s / 60)
  return m < 60 ? `${m} min ${s % 60 ? `${s % 60} s` : ''}`.trim() : `${Math.floor(m / 60)} h ${m % 60} min`
}
const pct = (x: number) => `${Math.round(x * 100)} %`

// ---------------------------------------------------------------------------
// Niveles de la evaluación
// ---------------------------------------------------------------------------
export const INTEGRITY_PRESETS: Record<'FREE' | 'STANDARD' | 'STRICT', Partial<QuizSettings>> = {
  FREE: { leave_action: 'LOG', max_leaves: 3, sequential: false, lock_device: false, block_paste: false, watermark: false, fullscreen: false },
  STANDARD: { leave_action: 'WARN', max_leaves: 3, sequential: false, lock_device: false, block_paste: false, watermark: true, fullscreen: false, shuffle_questions: true, shuffle_options: true },
  STRICT: {
    leave_action: 'CLOSE', max_leaves: 3, sequential: true, lock_device: true, block_paste: true, watermark: true, fullscreen: true,
    shuffle_questions: true, shuffle_options: true, show_answers: 'AFTER_DUE',
  },
}

export const PRESET_INFO = {
  FREE: { label: 'Libre', hint: 'Práctica: solo se registra lo que pasa.' },
  STANDARD: { label: 'Estándar', hint: 'Avisa al salir de la app y marca de agua.' },
  STRICT: { label: 'Estricto', hint: 'Una pregunta a la vez, un dispositivo, se envía sola si sale varias veces.' },
} as const

/** Lo que el alumno ve antes de empezar: qué se cuida en esta evaluación. */
export function monitoringNotice(s: QuizSettings): string[] {
  const out = ['Se registra si sales de la evaluación (otra app, otra pestaña o pantalla apagada) y si pegas texto.']
  const action = s.leave_action ?? 'WARN'
  const max = s.max_leaves ?? 3
  if (action === 'CLOSE') out.push(`Si sales ${max} veces, la evaluación se envía sola con lo que respondiste.`)
  else if (action === 'WARN') out.push('Si sales de la evaluación, verás un aviso.')
  if (s.sequential) out.push('Verás una pregunta a la vez y no podrás volver a las anteriores.')
  if (s.lock_device) out.push('Debes terminar en este mismo dispositivo.')
  if (s.block_paste) out.push('No se puede pegar texto en las respuestas.')
  if (s.fullscreen) out.push('Se abre en pantalla completa.')
  if (s.pick_count) out.push('Cada alumno recibe preguntas distintas.')
  return out
}

// ---------------------------------------------------------------------------
// Evaluaciones
// ---------------------------------------------------------------------------
/** ¿La pareja de alumnos merece revisión? */
export function pairLevel(p: CollusionPair): RiskLevel {
  const minWrong = Math.max(1, Math.min(p.wrong_a, p.wrong_b))
  if (p.open_similar > 0) return 'high'
  if (p.shared_wrong >= 3 && p.shared_wrong / minWrong >= 0.6) return 'high'
  if (p.shared_wrong >= 2 && p.shared_wrong / minWrong >= 0.8 && p.finish_gap_s < 180) return 'medium'
  return 'none'
}

export function pairText(p: CollusionPair, nameA: string, nameB: string): string {
  const parts: string[] = []
  if (p.shared_wrong) parts.push(`${p.shared_wrong} respuesta${p.shared_wrong === 1 ? '' : 's'} incorrecta${p.shared_wrong === 1 ? '' : 's'} idéntica${p.shared_wrong === 1 ? '' : 's'}`)
  if (p.open_similar) parts.push(`${p.open_similar} desarrollo${p.open_similar === 1 ? '' : 's'} casi igual${p.open_similar === 1 ? '' : 'es'}`)
  const gap = p.finish_gap_s < 120 ? `, terminaron con ${duration(p.finish_gap_s * 1000)} de diferencia` : ''
  return `${nameA} y ${nameB}: ${parts.join(' y ')}${gap}.`
}

export function attemptRisk(a: AttemptSignals, pairs: CollusionPair[], nameOf: (studentId: number) => string): Risk {
  const i = a.integrity ?? {}
  const r: Reason[] = []
  const leaves = i.leaves ?? 0
  if (i.closed_by === 'LEAVES') r.push({ text: `Se envió sola por salir ${veces(leaves)} de la evaluación.`, points: 40, tone: 'alert' })
  else if (leaves) r.push({ text: `Salió de la evaluación ${veces(leaves)}${i.leave_ms ? ` (${duration(i.leave_ms)} fuera en total)` : ''}.`, points: Math.min(leaves * 8, 40), tone: leaves >= 3 ? 'alert' : 'late' })
  if ((i.leave_ms ?? 0) >= 60_000 && i.closed_by !== 'LEAVES') r.push({ text: `Estuvo más de un minuto fuera de la evaluación.`, points: 10, tone: 'late' })
  if (i.resumes) r.push({ text: `Cerró y volvió a abrir la evaluación ${veces(i.resumes)}.`, points: Math.min(i.resumes * 5, 15), tone: 'late' })
  if (i.devices) r.push({ text: `Intentó continuar el intento en otro dispositivo.`, points: 25, tone: 'alert' })
  if (i.multitab) r.push({ text: 'Tenía la evaluación abierta en otra pestaña al mismo tiempo.', points: 20, tone: 'alert' })
  if (i.pastes) r.push({ text: `Pegó texto ${veces(i.pastes)} (${i.paste_chars ?? 0} caracteres).`, points: Math.min(i.pastes * 10, 30), tone: 'alert' })
  const copies = (i.copies ?? 0) + (i.context ?? 0)
  if (copies) r.push({ text: `Intentó copiar las preguntas ${veces(copies)}.`, points: Math.min(copies * 5, 15), tone: 'late' })
  if (i.fs_exits) r.push({ text: `Salió de la pantalla completa ${veces(i.fs_exits)}.`, points: Math.min(i.fs_exits * 5, 15), tone: 'late' })
  if (i.resizes) r.push({ text: `Achicó la ventana o dividió la pantalla ${veces(i.resizes)}.`, points: Math.min(i.resizes * 5, 10), tone: 'late' })
  if (i.offline) r.push({ text: `Perdió la conexión ${veces(i.offline)}.`, points: 0, tone: 'info' })
  if (a.fast_correct >= 3 && a.fast_correct >= a.questions * 0.3) r.push({ text: `Acertó ${a.fast_correct} preguntas en menos de 3 segundos cada una.`, points: 15, tone: 'late' })
  if (a.duration_s != null && a.pct != null && a.pct >= 0.8 && a.questions >= 5 && a.duration_s / a.questions < 6) {
    r.push({ text: `Terminó en ${duration(a.duration_s * 1000)} con ${pct(a.pct)} (muy rápido para ${a.questions} preguntas).`, points: 10, tone: 'late' })
  }
  if (a.pct != null && a.course?.avg != null && a.course.n >= 3 && a.pct - a.course.avg >= 0.35) {
    r.push({ text: `Obtuvo ${pct(a.pct)}, muy por encima de su promedio en el curso (${pct(a.course.avg)}).`, points: 15, tone: 'late' })
  }
  for (const p of pairs) {
    if (p.a_attempt !== a.attempt_id && p.b_attempt !== a.attempt_id) continue
    const lvl = pairLevel(p)
    if (lvl === 'none') continue
    const other = nameOf(p.a_attempt === a.attempt_id ? p.b : p.a)
    const bits = [p.shared_wrong ? `${p.shared_wrong} respuestas incorrectas idénticas` : '', p.open_similar ? 'un desarrollo casi igual' : ''].filter(Boolean).join(' y ')
    r.push({ text: `Coincide con ${other}: ${bits}.`, points: lvl === 'high' ? 35 : 15, tone: 'alert' })
  }
  return toRisk(r)
}

// ---------------------------------------------------------------------------
// Entregas de texto
// ---------------------------------------------------------------------------
const CHATBOT_PHRASES = [
  'como modelo de lenguaje', 'como un modelo de lenguaje', 'como IA', 'como inteligencia artificial', 'como asistente',
  'aquí tienes', 'aquí te dejo', 'espero que esto te ayude', 'espero que te sirva', '¡claro!',
  'si necesitas más', 'no dudes en preguntar', 'puedo ayudarte', 'ChatGPT', 'Gemini', 'Copilot',
]
const FORMAL_CONNECTORS = [
  'en conclusión', 'cabe destacar', 'es importante destacar', 'es importante mencionar', 'en resumen', 'asimismo', 'por otro lado',
  'en definitiva', 'desempeña un papel', 'juega un papel', 'en la actualidad', 'a lo largo de', 'no obstante', 'fundamental', 'crucial',
  'en este sentido', 'por consiguiente', 'sin lugar a dudas', 'en el ámbito', 'de manera significativa',
]

export function normalize(text: string): string {
  return text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[¡¿]/g, '')
}

function countHits(norm: string, list: string[]): { n: number; found: string[] } {
  const found: string[] = []
  let n = 0
  for (const p of list) {
    const re = new RegExp(`(^|[^a-z])${normalize(p).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z]|$)`, 'g')
    const m = norm.match(re)
    if (m) { n += m.length; found.push(p) }
  }
  return { n, found }
}

/** Indicios de texto generado por IA (sin servicios externos). */
export function aiIndicators(content: string, f: TextFeatures, baseline: TextFeatures, historyN: number): Reason[] {
  const r: Reason[] = []
  const norm = normalize(content)
  const words = f.words ?? 0
  const bot = countHits(norm, CHATBOT_PHRASES)
  if (bot.n) r.push({ text: `Tiene frases típicas de un chat de IA: «${bot.found.slice(0, 3).join('», «')}».`, points: 35, tone: 'alert' })
  if ((f.hidden ?? 0) > 0) r.push({ text: `Tiene ${f.hidden} caracteres invisibles (suelen quedar al copiar de un chat o una web).`, points: 30, tone: 'alert' })
  if ((f.markdown ?? 0) >= 2) r.push({ text: 'Tiene formato de chatbot: títulos con #, **negritas** o viñetas.', points: 15, tone: 'late' })
  if ((f.dashes ?? 0) >= 2) r.push({ text: `Usa ${f.dashes} rayas largas (—), poco comunes al escribir con teclado.`, points: 8, tone: 'late' })
  if ((f.sentences ?? 0) >= 8 && (f.sentence_cv ?? 1) < 0.3) r.push({ text: 'Las oraciones tienen un largo muy parejo (típico de texto generado).', points: 10, tone: 'late' })
  const conn = countHits(norm, FORMAL_CONNECTORS)
  if (words >= 40 && (conn.n * 100) / words >= 1.2) r.push({ text: `Muchos conectores formales (${conn.n} en ${words} palabras): «${conn.found.slice(0, 3).join('», «')}».`, points: 10, tone: 'late' })

  // Estilo frente a sus entregas anteriores.
  if (historyN >= 3 && words >= 40) {
    const diffs: string[] = []
    const ratio = (a?: number, b?: number) => (a && b ? a / b : 1)
    if (ratio(f.avg_sentence, baseline.avg_sentence) > 1.6) diffs.push('oraciones mucho más largas')
    if ((f.avg_word ?? 0) - (baseline.avg_word ?? 0) > 0.6) diffs.push('palabras más largas')
    if ((f.long_ratio ?? 0) - (baseline.long_ratio ?? 0) > 0.08) diffs.push('más palabras técnicas')
    if ((f.accent_rate ?? 0) - (baseline.accent_rate ?? 0) > 0.06) diffs.push('tildes que antes no usaba')
    if (ratio(f.comma_rate, baseline.comma_rate) > 2 && (f.comma_rate ?? 0) > 4) diffs.push('muchas más comas')
    if ((f.semi_rate ?? 0) - (baseline.semi_rate ?? 0) > 1.5) diffs.push('punto y coma o dos puntos')
    if ((f.inverted_ok ?? 0) >= 0.9 && baseline.inverted_ok != null && baseline.inverted_ok < 0.3) diffs.push('signos de apertura (¿ ¡) que antes no usaba')
    if (diffs.length >= 3) r.push({ text: `El estilo es muy distinto al de sus ${historyN} entregas anteriores: ${diffs.join(', ')}.`, points: 25, tone: 'alert' })
    else if (diffs.length === 2) r.push({ text: `El estilo cambia frente a sus entregas anteriores: ${diffs.join(' y ')}.`, points: 10, tone: 'late' })
  }
  return r
}

export function submissionRisk(s: SubmissionSignals, content: string | null): Risk {
  const r: Reason[] = []
  const best = s.matches[0]
  for (const m of s.matches) {
    const where = m.same_assignment ? 'esta misma tarea' : `«${m.assignment_title}»${m.year ? ` (${m.year})` : ''}`
    const text = `Coincide ${pct(m.ratio)} con la entrega de ${m.student_name || 'otro alumno'} en ${where}.`
    if (m.ratio >= 0.5) r.push({ text, points: m === best ? 45 : 15, tone: 'alert' })
    else if (m.ratio >= 0.25) r.push({ text, points: m === best ? 25 : 10, tone: 'alert' })
    else if (m.ratio >= 0.12 && m.shared >= 8) r.push({ text, points: m === best ? 10 : 5, tone: 'late' })
  }
  for (const d of s.dup_links) {
    r.push({ text: `Entregó el mismo archivo que ${d.student_name || 'otro alumno'}${d.same_assignment ? '' : ` (en «${d.assignment_title}»)`}.`, points: 40, tone: 'alert' })
  }
  const w = s.writing ?? {}
  const typed = w.typed ?? 0
  const pasted = w.pasted ?? 0
  if (s.words >= 40) {
    if (typed + pasted === 0) {
      r.push({ text: 'No hay registro de cómo se escribió (se entregó desde otra versión de la app o se editó en otro equipo).', points: 0, tone: 'info' })
    } else {
      const ratio = pasted / (typed + pasted)
      if (ratio >= 0.7) r.push({ text: `El ${pct(ratio)} del texto se pegó${w.max_paste ? ` (el pegado más grande tuvo ${w.max_paste} caracteres)` : ''}.`, points: 25, tone: 'alert' })
      else if (ratio >= 0.4) r.push({ text: `El ${pct(ratio)} del texto se pegó.`, points: 10, tone: 'late' })
      const minutes = (w.active_ms ?? 0) / 60_000
      if (minutes > 0 && s.words >= 80 && s.words / minutes > 80) r.push({ text: `Se escribió a ${Math.round(s.words / minutes)} palabras por minuto (muy rápido).`, points: 10, tone: 'late' })
    }
  }
  if (content && s.words >= 40) r.push(...aiIndicators(content, s.features ?? {}, s.baseline ?? {}, s.history_n ?? 0))
  if (!content?.trim() && s.words === 0) r.push({ text: 'La entrega es solo un enlace o archivo: el texto no se puede analizar aquí.', points: 0, tone: 'info' })
  return toRisk(r)
}

// ---------------------------------------------------------------------------
// Comparación lado a lado: marca los tramos de 5 palabras en común.
// ---------------------------------------------------------------------------
export type Segment = { text: string; hit: boolean }
type Tok = { start: number; end: number; key: string }

function tokens(text: string): Tok[] {
  const out: Tok[] = []
  const re = /[\p{L}\p{N}]+/gu
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) out.push({ start: m.index, end: m.index + m[0].length, key: normalize(m[0]) })
  return out
}

function grams(t: Tok[], n = 5): Set<string> {
  const s = new Set<string>()
  for (let i = 0; i + n <= t.length; i++) s.add(t.slice(i, i + n).map((x) => x.key).join(' '))
  return s
}

function mark(text: string, mine: Tok[], other: Set<string>, ignore: Set<string>, n = 5): Segment[] {
  const hit = new Array<boolean>(mine.length).fill(false)
  for (let i = 0; i + n <= mine.length; i++) {
    const g = mine.slice(i, i + n).map((x) => x.key).join(' ')
    if (other.has(g) && !ignore.has(g)) for (let j = i; j < i + n; j++) hit[j] = true
  }
  const segs: Segment[] = []
  let pos = 0
  let i = 0
  while (i < mine.length) {
    const on = hit[i]
    let j = i
    while (j + 1 < mine.length && hit[j + 1] === on) j++
    const from = i === 0 ? 0 : mine[i].start
    const to = j + 1 < mine.length ? mine[j + 1].start : text.length
    if (from > pos) segs.push({ text: text.slice(pos, from), hit: false })
    segs.push({ text: text.slice(from, to), hit: on })
    pos = to
    i = j + 1
  }
  if (pos < text.length) segs.push({ text: text.slice(pos), hit: false })
  return segs
}

export function sharedSegments(a: string, b: string, instructions = ''): { a: Segment[]; b: Segment[]; ratio: number } {
  const ta = tokens(a)
  const tb = tokens(b)
  const ignore = grams(tokens(instructions))
  const ga = grams(ta)
  const gb = grams(tb)
  const sa = mark(a, ta, gb, ignore)
  const sb = mark(b, tb, ga, ignore)
  const hitChars = sa.filter((s) => s.hit).reduce((n, s) => n + s.text.length, 0)
  return { a: sa, b: sb, ratio: a.length ? hitChars / a.length : 0 }
}

// ---------------------------------------------------------------------------
// Rasgos de un texto en el navegador: la misma cuenta que campus_text_features
// (script 23), para que el panel anti-trampa pueda mostrar los indicios en vivo.
// ---------------------------------------------------------------------------
export function textFeatures(text: string): TextFeatures {
  const t = text ?? ''
  const words = t.split(/[^\p{L}0-9]+/u).filter(Boolean)
  const sentences = t.split(/[.!?…]+[\s"”»)]*|\n+/).map((s) => s.trim()).filter((s) => /\p{L}/u.test(s))
    .map((s) => s.split(/\s+/).filter((z) => /\p{L}/u.test(z)).length)
  const n = words.length
  const sn = sentences.length
  const avgS = sn ? sentences.reduce((a, b) => a + b, 0) / sn : 0
  const sd = sn ? Math.sqrt(sentences.reduce((a, b) => a + (b - avgS) ** 2, 0) / sn) : 0
  const count = (re: RegExp) => (t.match(re) ?? []).length
  const qmarks = count(/[?!]/g)
  const round = (x: number, d: number) => Math.round(x * 10 ** d) / 10 ** d
  return {
    words: n,
    sentences: sn,
    avg_sentence: round(avgS, 2),
    sentence_cv: avgS > 0 ? round(sd / avgS, 3) : 0,
    avg_word: n ? round(words.reduce((a, w) => a + w.length, 0) / n, 3) : 0,
    long_ratio: n ? round(words.filter((w) => w.length >= 9).length / n, 3) : 0,
    ttr: n ? round(new Set(words.map((w) => w.toLowerCase())).size / n, 3) : 0,
    accent_rate: n ? round(words.filter((w) => /[áéíóúÁÉÍÓÚ]/.test(w)).length / n, 3) : 0,
    comma_rate: n ? round((count(/,/g) * 100) / n, 2) : 0,
    semi_rate: n ? round((count(/[;:]/g) * 100) / n, 2) : 0,
    dashes: count(/—/g),
    curly: count(/[“”‘’«»]/g),
    hidden: count(/[​‌‍⁠﻿­]/g),
    markdown: count(/(^|\n)\s*(#{1,6}\s|[-*•]\s|\d+[.)]\s)|\*\*[^*]+\*\*/g),
    inverted_ok: qmarks ? round(Math.min(count(/[¿¡]/g) / qmarks, 1), 2) : undefined,
  }
}
