import { useEffect, useId, useMemo, useState, type CSSProperties } from 'react'
import { TrendingDown, TrendingUp, Minus } from 'lucide-react'
import { LevelChip } from '@/components/levels'
import { useCountUp } from '@/components/tesla'
import { formatShort } from '@/lib/format'
import { cn } from '@/lib/utils'
import { bandOf, type AreaGrade, type Band, type Expediente, type ScorePart } from '@/services/expediente'
import type { Level } from '@/types'
import './expediente.css'

/** Verdadero un instante después de montar: dispara las transiciones de entrada. */
export function useEntered(delay = 60): boolean {
  const [on, setOn] = useState(false)
  useEffect(() => {
    const t = window.setTimeout(() => setOn(true), delay)
    return () => window.clearTimeout(t)
  }, [delay])
  return on
}

const bandVars = (b: Band): CSSProperties => ({ ['--b1' as string]: b.from, ['--b2' as string]: b.to, ['--bg' as string]: b.glow })

// ---------------------------------------------------------------------------
// El círculo principal: Índice Tesla
// ---------------------------------------------------------------------------
const R = 84
const C = 2 * Math.PI * R
const TICKS = 48

export function ScoreRing({ value, band: bandProp, onClick, active, preview, compact }: {
  value: number
  band: Band
  onClick?: () => void
  active?: boolean
  /** Índice que se lograría (simulador): se dibuja como un arco fantasma que se extiende. */
  preview?: number | null
  compact?: boolean
}) {
  const id = useId().replace(/:/g, '')
  const entered = useEntered(120)
  const target = preview ?? value
  const band = preview != null ? bandOf(preview) : bandProp
  const shown = useCountUp(target, preview != null ? 700 : 1500)
  const angle = (target / 100) * 2 * Math.PI - Math.PI / 2
  const tip = { x: 100 + R * Math.cos(angle), y: 100 + R * Math.sin(angle) }
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag
      {...(onClick ? { type: 'button' as const, onClick, 'aria-pressed': active, 'aria-label': `Índice Tesla ${value} de 100, ${bandProp.label}. Toca para ver cómo se calculó.` } : { role: 'img', 'aria-label': `Índice Tesla ${value} de 100, ${bandProp.label}${preview != null ? `. Con los cambios sugeridos sería ${preview}` : ''}` })}
      className={cn('exp-ring relative mx-auto block aspect-square w-full rounded-full', compact ? 'max-w-[13rem]' : 'max-w-[19rem]', onClick && 'cursor-pointer')}
      style={bandVars(band)}
    >
      <span className="exp-glow" aria-hidden />
      <svg viewBox="0 0 200 200" className="relative h-full w-full overflow-visible" aria-hidden>
        <defs>
          <linearGradient id={`g${id}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={bandProp.from} />
            <stop offset="100%" stopColor={bandProp.to} />
          </linearGradient>
          <linearGradient id={`p${id}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={band.from} />
            <stop offset="100%" stopColor={band.to} />
          </linearGradient>
        </defs>
        {/* Aro punteado que gira despacio */}
        <circle className="exp-orbit" cx="100" cy="100" r="97" fill="none" stroke={band.from} strokeOpacity="0.45" strokeWidth="1.2" strokeDasharray="2 7" strokeLinecap="round" />
        {/* Marcas que se encienden hasta el valor */}
        {Array.from({ length: TICKS }).map((_, i) => {
          const a = (i / TICKS) * 2 * Math.PI - Math.PI / 2
          const lit = (i / TICKS) * 100 < target
          return (
            <line
              key={i}
              x1={100 + 69 * Math.cos(a)} y1={100 + 69 * Math.sin(a)} x2={100 + 74 * Math.cos(a)} y2={100 + 74 * Math.sin(a)}
              stroke={lit && entered ? `url(#p${id})` : 'currentColor'} strokeOpacity={lit && entered ? 1 : 0.18} strokeWidth="1.6" strokeLinecap="round"
              style={{ transition: 'stroke-opacity .4s', transitionDelay: `${lit ? (preview != null ? i * 6 : 200 + i * 22) : 0}ms` }}
            />
          )
        })}
        <circle cx="100" cy="100" r={R} fill="none" stroke="currentColor" strokeOpacity="0.12" strokeWidth="14" />
        {/* Arco fantasma: hasta donde llegaría con los cambios sugeridos */}
        <circle
          className="exp-ghost" cx="100" cy="100" r={R} fill="none" stroke={`url(#p${id})`} strokeWidth="14" strokeLinecap="round"
          strokeDasharray={C} strokeDashoffset={entered ? C * (1 - target / 100) : C} transform="rotate(-90 100 100)"
          style={{ opacity: preview != null && preview > value ? 0.5 : 0 }}
        />
        <circle
          className="exp-arc" cx="100" cy="100" r={R} fill="none" stroke={`url(#g${id})`} strokeWidth="14" strokeLinecap="round"
          strokeDasharray={C} strokeDashoffset={entered ? C * (1 - value / 100) : C} transform="rotate(-90 100 100)"
        />
        {/* Chispa en la punta del arco */}
        <g className="exp-tip" style={{ opacity: entered ? 1 : 0 }}>
          <circle cx={tip.x} cy={tip.y} r="11" fill={band.to} opacity="0.35" className="exp-tip-pulse" style={{ transition: 'cx .7s, cy .7s' }} />
          <circle cx={tip.x} cy={tip.y} r="5.5" fill="#fff" stroke={band.from} strokeWidth="2" style={{ transition: 'cx .7s, cy .7s' }} />
        </g>
      </svg>
      <span className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className={cn('cifras font-display font-bold leading-none tracking-tight text-texto', compact ? 'text-[2.9rem]' : 'text-[4.2rem] sm:text-[4.6rem]')}>{shown}</span>
        <span className={cn('font-bold uppercase tracking-[0.18em] text-texto-suave', compact ? 'mt-0.5 text-[10px]' : 'mt-1 text-xs')}>de 100</span>
        <span
          key={band.id}
          className={cn('exp-chip rounded-full font-bold text-white', preview != null && 'exp-chip-fast', compact ? 'mt-2 px-2.5 py-0.5 text-[11px]' : 'mt-3 px-3 py-1 text-[13px]')}
          style={{ background: `linear-gradient(90deg, ${band.from}, ${band.to})`, textShadow: '0 1px 1px rgb(0 0 0 / 0.25)' }}
        >
          {band.label}
        </span>
      </span>
    </Tag>
  )
}

// ---------------------------------------------------------------------------
// Anillos pequeños: un componente del índice cada uno
// ---------------------------------------------------------------------------
const MR = 34
const MC = 2 * Math.PI * MR

export function MiniRing({ part, selected, onClick, index }: { part: ScorePart; selected: boolean; onClick: () => void; index: number }) {
  const id = useId().replace(/:/g, '')
  const band = bandOf(part.value)
  const entered = useEntered(250 + index * 140)
  const shown = useCountUp(part.value, 1100)
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        'exp-mini group relative flex flex-col items-center rounded-2xl border bg-superficie px-2 pb-3 pt-4 text-center transition-all',
        selected ? 'border-transparent shadow-lg' : 'border-linea hover:-translate-y-0.5 hover:shadow-md',
      )}
      style={{ ...bandVars(band), ...(selected ? { boxShadow: `0 0 0 2px ${band.from}, 0 10px 28px -10px ${band.glow}` } : null) }}
    >
      <span className="relative block h-[5.2rem] w-[5.2rem]">
        <svg viewBox="0 0 80 80" className="h-full w-full" aria-hidden>
          <defs>
            <linearGradient id={`m${id}`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor={band.from} />
              <stop offset="100%" stopColor={band.to} />
            </linearGradient>
          </defs>
          <circle cx="40" cy="40" r={MR} fill="none" stroke="currentColor" strokeOpacity="0.12" strokeWidth="7" />
          <circle
            cx="40" cy="40" r={MR} fill="none" stroke={`url(#m${id})`} strokeWidth="7" strokeLinecap="round" transform="rotate(-90 40 40)"
            strokeDasharray={MC} strokeDashoffset={entered ? MC * (1 - part.value / 100) : MC}
            style={{ transition: 'stroke-dashoffset 1.2s var(--ease-out)' }}
          />
        </svg>
        <span className="cifras absolute inset-0 flex items-center justify-center font-display text-[1.45rem] font-bold text-texto">{shown}</span>
      </span>
      <span className="mt-2 text-sm font-bold text-texto">{part.label}</span>
      <span className="text-[11px] font-semibold" style={{ color: 'rgb(var(--texto-suave))' }}>{band.label}</span>
    </button>
  )
}

// ---------------------------------------------------------------------------
// Radar de áreas
// ---------------------------------------------------------------------------
const LEVEL_COLOR: Record<Level, string> = { AD: '#1E8E5A', A: '#2563EB', B: '#D99A1E', C: '#E0572F' }

function shortLabel(a: AreaGrade): string {
  const s = a.short_name?.trim()
  if (s) return s
  const w = a.name.replace(/^(Desarrollo|Educación|Ciencia|Ciencias)\s+/i, '').trim()
  return w.length > 12 ? `${w.slice(0, 11)}…` : w
}

export function AreaRadar({ areas }: { areas: AreaGrade[] }) {
  const entered = useEntered(200)
  const id = useId().replace(/:/g, '')
  const latest = useMemo(() => areas.map((a) => ({ a, p: a.periods[a.periods.length - 1] })), [areas])
  const n = latest.length
  const cx = 150, cy = 150, rad = 100
  const pt = (i: number, v: number) => {
    const ang = (i / n) * 2 * Math.PI - Math.PI / 2
    return { x: cx + (rad * v / 100) * Math.cos(ang), y: cy + (rad * v / 100) * Math.sin(ang) }
  }
  const poly = latest.map((x, i) => pt(i, x.p.points)).map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
  return (
    <svg viewBox="0 0 300 300" className="mx-auto h-auto w-full max-w-[22rem]" role="img" aria-label={`Radar de niveles por área: ${latest.map((x) => `${x.a.name} ${x.p.level}`).join(', ')}`}>
      <defs>
        <radialGradient id={`r${id}`} cx="50%" cy="50%" r="60%">
          <stop offset="0%" stopColor="#2563EB" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#7DB4FF" stopOpacity="0.25" />
        </radialGradient>
      </defs>
      {[25, 50, 75, 100].map((lv) => (
        <polygon key={lv} points={Array.from({ length: n }, (_, i) => pt(i, lv)).map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')} fill="none" stroke="currentColor" strokeOpacity={lv === 100 ? 0.28 : 0.13} strokeWidth="1" />
      ))}
      {latest.map((_, i) => {
        const p = pt(i, 100)
        return <line key={i} x1={cx} y1={cy} x2={p.x} y2={p.y} stroke="currentColor" strokeOpacity="0.13" />
      })}
      <polygon
        points={poly} fill={`url(#r${id})`} stroke="#2563EB" strokeWidth="2.4" strokeLinejoin="round"
        style={{ transformBox: 'view-box', transformOrigin: 'center', transform: entered ? 'scale(1)' : 'scale(0.05)', opacity: entered ? 1 : 0, transition: 'transform 1.1s var(--ease-spring), opacity .5s' }}
      />
      {latest.map((x, i) => {
        const p = pt(i, x.p.points)
        const l = pt(i, 100 + 17)
        const anchor = l.x < cx - 8 ? 'end' : l.x > cx + 8 ? 'start' : 'middle'
        return (
          <g key={x.a.subject_id}>
            <circle
              cx={p.x} cy={p.y} r="5.5" fill={LEVEL_COLOR[x.p.level]} stroke="#fff" strokeWidth="2"
              style={{ opacity: entered ? 1 : 0, transition: `opacity .4s ${500 + i * 90}ms` }}
            />
            <text x={l.x} y={l.y + 4} textAnchor={anchor} className="fill-current text-[11px] font-bold" style={{ color: 'rgb(var(--texto))' }}>{shortLabel(x.a)}</text>
          </g>
        )
      })}
    </svg>
  )
}

/** Con menos de 3 áreas el radar no se lee: se muestran barras. */
export function AreaBars({ areas }: { areas: AreaGrade[] }) {
  const entered = useEntered(150)
  return (
    <ul className="space-y-3">
      {areas.map((a) => {
        const p = a.periods[a.periods.length - 1]
        return (
          <li key={a.subject_id}>
            <div className="flex items-center justify-between text-sm"><span className="font-semibold text-texto">{a.name}</span><LevelChip level={p.level} /></div>
            <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-papel">
              <div className="h-full rounded-full" style={{ width: entered ? `${p.points}%` : '0%', background: LEVEL_COLOR[p.level], transition: 'width 1s var(--ease-out)' }} />
            </div>
          </li>
        )
      })}
    </ul>
  )
}

/** Cada área con su nivel en cada bimestre publicado. */
export function AreaTable({ areas, periodNumbers }: { areas: AreaGrade[]; periodNumbers: number[] }) {
  const roman = ['I', 'II', 'III', 'IV']
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[20rem] text-sm">
        <thead>
          <tr className="text-left text-xs font-bold uppercase tracking-wide text-texto-suave">
            <th className="py-2 pr-3">Área</th>
            {periodNumbers.map((n) => <th key={n} className="px-2 py-2 text-center">{roman[n - 1] ?? n}</th>)}
          </tr>
        </thead>
        <tbody>
          {areas.map((a) => (
            <tr key={a.subject_id} className="border-t border-linea">
              <td className="py-2 pr-3 font-semibold text-texto"><span className="mr-2 inline-block h-2.5 w-2.5 rounded-full align-middle" style={{ background: a.color }} />{a.name}</td>
              {periodNumbers.map((n) => <td key={n} className="px-2 py-2 text-center"><LevelChip level={a.periods.find((p) => p.number === n)?.level} /></td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Evolución por bimestre (solo contra sí mismo)
// ---------------------------------------------------------------------------
export function TrendChart({ periods }: { periods: { number: number; points: number; level: Level }[] }) {
  const entered = useEntered(200)
  const id = useId().replace(/:/g, '')
  const roman = ['I', 'II', 'III', 'IV']
  const W = 320, H = 150, padX = 34, top = 18, bottom = 30
  const x = (i: number) => (periods.length === 1 ? W / 2 : padX + (i * (W - padX * 2)) / (periods.length - 1))
  const y = (v: number) => top + (H - top - bottom) * (1 - (Math.max(30, Math.min(100, v)) - 30) / 70)
  const line = periods.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.points).toFixed(1)}`).join(' ')
  const area = `${line} L${x(periods.length - 1).toFixed(1)},${H - bottom} L${x(0).toFixed(1)},${H - bottom} Z`
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`Evolución: ${periods.map((p) => `bimestre ${roman[p.number - 1]} nivel ${p.level}`).join(', ')}`}>
      <defs>
        <linearGradient id={`t${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2563EB" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#2563EB" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[40, 65, 85, 100].map((v) => <line key={v} x1={padX - 10} x2={W - padX + 10} y1={y(v)} y2={y(v)} stroke="currentColor" strokeOpacity="0.1" strokeDasharray="3 5" />)}
      {periods.length > 1 && <path d={area} fill={`url(#t${id})`} style={{ opacity: entered ? 1 : 0, transition: 'opacity 1s .4s' }} />}
      {periods.length > 1 && (
        <path d={line} fill="none" stroke="#2563EB" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" pathLength={1}
          strokeDasharray="1" strokeDashoffset={entered ? 0 : 1} style={{ transition: 'stroke-dashoffset 1.2s var(--ease-out)' }} />
      )}
      {periods.map((p, i) => (
        <g key={p.number} style={{ opacity: entered ? 1 : 0, transition: `opacity .4s ${300 + i * 200}ms` }}>
          <circle cx={x(i)} cy={y(p.points)} r="7" fill={LEVEL_COLOR[p.level]} stroke="#fff" strokeWidth="2.5" />
          <text x={x(i)} y={y(p.points) - 13} textAnchor="middle" className="fill-current text-[11px] font-bold" style={{ color: 'rgb(var(--texto))' }}>{p.level}</text>
          <text x={x(i)} y={H - 10} textAnchor="middle" className="fill-current text-[11px] font-bold" style={{ color: 'rgb(var(--texto-suave))' }}>{roman[p.number - 1] ?? p.number} bim.</text>
        </g>
      ))}
    </svg>
  )
}

export function TrendNote({ dir, text }: { dir: 'up' | 'down' | 'same'; text: string }) {
  const Icon = dir === 'up' ? TrendingUp : dir === 'down' ? TrendingDown : Minus
  return (
    <p className={cn('inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold', dir === 'up' ? 'bg-estado-ok/10 text-estado-ok' : dir === 'down' ? 'bg-estado-tarde/10 text-estado-tarde' : 'bg-papel text-texto-suave')}>
      <Icon className="h-4 w-4" aria-hidden />{text}
    </p>
  )
}

// ---------------------------------------------------------------------------
// Calendario de asistencia del año
// ---------------------------------------------------------------------------
const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Setiembre', 'Octubre', 'Noviembre', 'Diciembre']

type DayCell = { date: string; dow: number }

function monthsBetween(from: string, to: string): { y: number; m: number }[] {
  const out: { y: number; m: number }[] = []
  let [y, m] = from.split('-').map(Number)
  const [ey, em] = to.split('-').map(Number)
  while (y < ey || (y === ey && m <= em)) {
    out.push({ y, m })
    m++
    if (m > 12) { m = 1; y++ }
  }
  return out
}

export function AttendanceYear({ data, today }: { data: Expediente['attendance']; today: string }) {
  const [all, setAll] = useState(false)
  const status = useMemo(() => new Map(data.days.map((d) => [d.d, d.s])), [data.days])
  const holidays = useMemo(() => new Set(data.holidays), [data.holidays])
  const months = monthsBetween(data.from, today)
  const shown = all ? months : months.slice(-3)
  return (
    <div>
      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {shown.map(({ y, m }, mi) => {
          const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
          const cells: DayCell[] = []
          for (let d = 1; d <= last; d++) {
            const date = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
            const dow = (new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7
            if (dow < 5) cells.push({ date, dow })
          }
          const lead = cells[0]?.dow ?? 0
          return (
            <div key={`${y}-${m}`} className="exp-rise" style={{ animationDelay: `${mi * 90}ms` }}>
              <p className="mb-1.5 text-sm font-bold text-texto">{MONTHS[m - 1]} <span className="font-normal text-texto-suave">{y}</span></p>
              <div className="grid grid-cols-5 gap-1">
                {['L', 'M', 'M', 'J', 'V'].map((d, i) => <span key={i} className="text-center text-[10px] font-bold text-texto-suave">{d}</span>)}
                {Array.from({ length: lead }).map((_, i) => <span key={`e${i}`} />)}
                {cells.map(({ date }) => {
                  const s = status.get(date)
                  const future = date > today
                  const holiday = holidays.has(date)
                  const label = s ? `${formatShort(date)}: ${s === 'LATE' ? 'tardanza' : 'puntual'}` : holiday ? `${formatShort(date)}: feriado` : future ? formatShort(date) : `${formatShort(date)}: sin registro de ingreso`
                  return (
                    <span
                      key={date} title={label} aria-label={label}
                      className={cn(
                        'flex h-7 items-center justify-center rounded-md text-[11px] font-bold',
                        s === 'ON_TIME' && 'bg-estado-ok text-white',
                        s === 'LATE' && 'bg-estado-tarde text-white',
                        !s && holiday && 'bg-chispa/25 text-chispa-ink',
                        !s && !holiday && !future && 'border border-dashed border-texto-suave/40 text-texto-suave',
                        !s && !holiday && future && 'text-texto-suave/40',
                        date === today && 'ring-2 ring-chispa ring-offset-1',
                      )}
                    >
                      {Number(date.slice(8))}
                    </span>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
      {months.length > 3 && (
        <button type="button" onClick={() => setAll((v) => !v)} className="mt-4 text-sm font-bold text-tinta underline dark:text-tinta-ink print:hidden">
          {all ? 'Ver solo los últimos 3 meses' : `Ver todo el año (${months.length} meses)`}
        </button>
      )}
      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-sm">
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-estado-ok" />Puntual</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-estado-tarde" />Tardanza</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-chispa/40" />Feriado</span>
        <span className="inline-flex items-center gap-1.5 text-texto-suave"><span className="h-2.5 w-2.5 rounded-sm border border-dashed border-texto-suave/60" />Sin registro de ingreso</span>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Confeti de celebración (índice sobresaliente); usa las piezas de effects.css
// ---------------------------------------------------------------------------
export function Sparkles({ band }: { band: Band }) {
  const pieces = useMemo(() => Array.from({ length: 26 }, (_, i) => ({
    left: `${(i * 37) % 100}%`,
    delay: `${(i % 9) * 0.35}s`,
    dur: `${4.5 + (i % 5) * 0.8}s`,
    color: [band.from, band.to, '#ffffff', '#5b8fd6', '#D63620'][i % 5],
    drift: `${((i % 7) - 3) * 14}px`,
    spin: `${(i % 2 ? 1 : -1) * (360 + (i % 4) * 180)}deg`,
  })), [band])
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {pieces.map((p, i) => (
        <span
          key={i} className="confetti"
          style={{ left: p.left, background: p.color, animationDuration: p.dur, animationDelay: p.delay, ['--drift' as string]: p.drift, ['--spin' as string]: p.spin, top: '-14px', opacity: 0.85, animationIterationCount: 'infinite' }}
        />
      ))}
    </div>
  )
}
