/**
 * Piezas de visualización del panel de dirección.
 *
 * Reglas (skill de dataviz):
 *   · Magnitudes con medidores de un solo tono (azul) sobre una pista del mismo tono.
 *   · Niveles AD/A/B/C como barra divergente: azul = logro, rojo = proceso/inicio,
 *     centrada entre A y B. Paleta validada en claro y oscuro (variables --lv-*).
 *   · Las alertas usan los colores de estado SIEMPRE con ícono + texto.
 *   · El texto nunca lleva el color de la serie; la identidad la da la muestra al lado.
 */
import { useRef, useState, type ReactNode } from 'react'
import { AlertTriangle, CheckCircle2, OctagonAlert, Table2, BarChart3 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Tone } from '@/services/panel'

export const pct = (v: number | null | undefined, digits = 0) => (v == null ? '—' : `${(v * 100).toFixed(digits)}%`)

// ---------------------------------------------------------------------------
// Estado (alerta) con ícono + texto
// ---------------------------------------------------------------------------
const TONE = {
  ok: { icon: CheckCircle2, cls: 'text-estado-ok', label: 'Bien' },
  warning: { icon: AlertTriangle, cls: 'text-estado-tarde', label: 'Atención' },
  critical: { icon: OctagonAlert, cls: 'text-estado-alerta', label: 'Crítico' },
}

export function StatusTag({ tone, label, hideOk = true }: { tone: Tone | null; label?: string; hideOk?: boolean }) {
  if (!tone || (hideOk && tone === 'ok')) return null
  const t = TONE[tone]
  return (
    <span className={cn('inline-flex items-center gap-1 whitespace-nowrap text-xs font-bold', t.cls)}>
      <t.icon className="h-3.5 w-3.5" aria-hidden />
      {label ?? t.label}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Indicador (stat tile)
// ---------------------------------------------------------------------------
export function StatTile({ label, value, detail, tone, meter }: {
  label: string
  value: string
  detail?: ReactNode
  tone?: Tone | null
  meter?: number | null
}) {
  return (
    <div className="flex flex-col rounded-xl border border-linea bg-superficie p-4">
      <p className="flex items-center gap-2 text-sm text-texto-suave"><span className="franja-tick" aria-hidden />{label}</p>
      <p className="cifras mt-1 font-display text-[2rem] font-bold leading-none tracking-tight text-texto">{value}</p>
      {meter != null && <Meter value={meter} className="mt-3" label={label} />}
      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-texto-suave">
        {tone && tone !== 'ok' && <StatusTag tone={tone} />}
        {detail}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Medidor: relleno azul sobre pista del mismo tono, extremo redondeado
// ---------------------------------------------------------------------------
export function Meter({ value, className, label }: { value: number | null; className?: string; label?: string }) {
  const v = value == null ? 0 : Math.max(0, Math.min(1, value))
  return (
    <span
      role="meter"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value == null ? undefined : Math.round(v * 100)}
      aria-label={label}
      title={value == null ? 'Sin datos' : pct(value)}
      className={cn('block h-2 w-full overflow-hidden rounded-full', className)}
      style={{ background: 'var(--meter-track)' }}
    >
      {value != null && <span className="bar-grow-x block h-full rounded-full transition-[width] duration-500" style={{ width: `${v * 100}%`, background: 'var(--meter-fill)' }} />}
    </span>
  )
}

/** Celda de tabla: porcentaje + medidor + alerta. */
export function MeterCell({ value, tone, sub }: { value: number | null; tone: Tone | null; sub?: string }) {
  return (
    <div className="min-w-[7.5rem]">
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-bold tabular-nums">{pct(value)}</span>
        <StatusTag tone={tone} />
      </div>
      <Meter value={value} className="mt-1" />
      {sub && <span className="mt-0.5 block text-[11px] text-texto-suave tabular-nums">{sub}</span>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Niveles de logro: barra divergente
// ---------------------------------------------------------------------------
export type LevelRow = { key: string | number; label: string; group?: string | null; ad: number; a: number; b: number; c: number }

const LEVEL_KEYS = [
  { k: 'c', name: 'C · En inicio', color: 'var(--lv-c)' },
  { k: 'b', name: 'B · En proceso', color: 'var(--lv-b)' },
  { k: 'a', name: 'A · Logro esperado', color: 'var(--lv-a)' },
  { k: 'ad', name: 'AD · Logro destacado', color: 'var(--lv-ad)' },
] as const

export function LevelLegend() {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-texto-suave">
      {LEVEL_KEYS.map((l) => (
        <span key={l.k} className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: l.color }} aria-hidden />{l.name}
        </span>
      ))}
    </div>
  )
}

export function LevelDivergingChart({ rows, emptyText = 'Aún no hay notas registradas en este bimestre.' }: { rows: LevelRow[]; emptyText?: string }) {
  const [view, setView] = useState<'chart' | 'table'>('chart')
  const [hover, setHover] = useState<{ row: LevelRow; x: number; y: number } | null>(null)
  const box = useRef<HTMLDivElement>(null)

  if (!rows.length) return <p className="py-6 text-center text-sm text-texto-suave">{emptyText}</p>

  let lastGroup: string | null | undefined = undefined
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <LevelLegend />
        <button
          type="button"
          onClick={() => setView((v) => (v === 'chart' ? 'table' : 'chart'))}
          className="inline-flex items-center gap-1.5 text-sm font-bold text-tinta-500 hover:underline"
        >
          {view === 'chart' ? <><Table2 className="h-4 w-4" />Ver tabla</> : <><BarChart3 className="h-4 w-4" />Ver gráfico</>}
        </button>
      </div>

      {view === 'table' ? (
        <div className="overflow-x-auto">
          <table className="tabla-colegio w-full min-w-[32rem] text-sm">
            <thead className="text-left text-texto-suave">
              <tr><th className="py-2 pr-3">Área</th><th className="px-2 text-right">AD</th><th className="px-2 text-right">A</th><th className="px-2 text-right">B</th><th className="px-2 text-right">C</th><th className="pl-2 text-right">A o AD</th></tr>
            </thead>
            <tbody className="divide-y divide-linea tabular-nums">
              {rows.map((r) => {
                const total = r.ad + r.a + r.b + r.c
                return (
                  <tr key={r.key}>
                    <td className="py-2 pr-3 font-bold">{r.label}{r.group && <span className="ml-1 font-normal text-texto-suave">· {r.group}</span>}</td>
                    <td className="px-2 text-right">{r.ad}</td><td className="px-2 text-right">{r.a}</td>
                    <td className="px-2 text-right">{r.b}</td><td className="px-2 text-right">{r.c}</td>
                    <td className="pl-2 text-right font-bold">{pct(total ? (r.ad + r.a) / total : null)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div ref={box} className="relative" onMouseLeave={() => setHover(null)}>
          <div className="mb-1 grid grid-cols-[1fr_1fr_3rem] gap-x-0 text-[11px] text-texto-suave sm:grid-cols-[minmax(7rem,11rem)_1fr_1fr_3.5rem]">
            <span className="hidden sm:block" />
            <span className="pr-2 text-right">← B y C</span>
            <span className="pl-2">A y AD →</span>
            <span />
          </div>
          <ul className="space-y-1.5">
            {rows.map((r) => {
              const total = r.ad + r.a + r.b + r.c || 1
              const showGroup = r.group !== undefined && r.group !== lastGroup
              lastGroup = r.group
              const seg = (n: number) => `${(n / total) * 100}%`
              const achieved = (r.ad + r.a) / total
              return (
                <li key={r.key}>
                  {showGroup && r.group && <p className="mb-1 mt-3 text-[11px] font-bold uppercase tracking-wide text-texto-suave first:mt-0">{r.group}</p>}
                  <div
                    className="grid cursor-default grid-cols-[1fr_1fr_3rem] items-center gap-y-1 rounded-md py-1 hover:bg-papel sm:grid-cols-[minmax(7rem,11rem)_1fr_1fr_3.5rem]"
                    onMouseMove={(e) => {
                      const rect = box.current!.getBoundingClientRect()
                      setHover({ row: r, x: e.clientX - rect.left, y: e.clientY - rect.top })
                    }}
                    onFocus={() => setHover({ row: r, x: 160, y: 0 })}
                    onBlur={() => setHover(null)}
                    tabIndex={0}
                    aria-label={`${r.label}: AD ${r.ad}, A ${r.a}, B ${r.b}, C ${r.c}`}
                  >
                    <span className="col-span-3 truncate pr-3 text-sm font-bold sm:col-span-1">{r.label}</span>
                    {/* Lado izquierdo: B junto al centro, C hacia afuera */}
                    <span className="flex h-5 justify-end gap-[2px] border-r border-texto-suave/40 pr-[2px]"><span className="bar-grow-left flex h-full w-full justify-end gap-[2px]">
                      {r.c > 0 && <span className="h-full rounded-l" style={{ width: seg(r.c), background: 'var(--lv-c)' }} />}
                      {r.b > 0 && <span className={cn('h-full', r.c === 0 && 'rounded-l')} style={{ width: seg(r.b), background: 'var(--lv-b)' }} />}
                    </span></span>
                    {/* Lado derecho: A junto al centro, AD hacia afuera */}
                    <span className="flex h-5 gap-[2px] pl-[2px]"><span className="bar-grow-x flex h-full w-full gap-[2px]">
                      {r.a > 0 && <span className={cn('h-full', r.ad === 0 && 'rounded-r')} style={{ width: seg(r.a), background: 'var(--lv-a)' }} />}
                      {r.ad > 0 && <span className="h-full rounded-r" style={{ width: seg(r.ad), background: 'var(--lv-ad)' }} />}
                    </span></span>
                    <span className="pl-2 text-right text-sm font-bold tabular-nums">{pct(achieved)}</span>
                  </div>
                </li>
              )
            })}
          </ul>
          <p className="mt-2 text-right text-[11px] text-texto-suave">% a la derecha: competencias con A o AD</p>

          {hover && (() => {
            const r = hover.row
            const total = r.ad + r.a + r.b + r.c || 1
            const w = box.current?.clientWidth ?? 600
            return (
              <div
                className="pointer-events-none absolute z-10 w-56 rounded-lg border border-linea bg-superficie p-3 text-xs shadow-lg"
                style={{ left: Math.min(hover.x + 14, w - 230), top: hover.y + 14 }}
                role="tooltip"
              >
                <p className="mb-1.5 text-sm font-bold text-texto">{r.label}</p>
                {[...LEVEL_KEYS].reverse().map((l) => {
                  const n = r[l.k]
                  return (
                    <p key={l.k} className="flex items-center justify-between gap-3 py-0.5 text-texto-suave">
                      <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: l.color }} />{l.name}</span>
                      <span className="font-bold text-texto tabular-nums">{n} · {pct(n / total)}</span>
                    </p>
                  )
                })}
              </div>
            )
          })()}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Encabezado ordenable de tabla
// ---------------------------------------------------------------------------
export function SortTh<K extends string>({ k, sort, onSort, children, className }: {
  k: K
  sort: { key: K; dir: 1 | -1 }
  onSort: (k: K) => void
  children: ReactNode
  className?: string
}) {
  const active = sort.key === k
  return (
    <th className={cn('px-3 py-2.5 font-bold', className)} aria-sort={active ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
      <button type="button" onClick={() => onSort(k)} className={cn('inline-flex items-center gap-1 hover:text-texto', active ? 'text-texto' : 'text-texto-suave')}>
        {children}
        <span aria-hidden className="text-[10px]">{active ? (sort.dir === 1 ? '▲' : '▼') : '↕'}</span>
      </button>
    </th>
  )
}

export function useSort<K extends string>(initial: K, dir: 1 | -1 = -1) {
  const [sort, setSort] = useState<{ key: K; dir: 1 | -1 }>({ key: initial, dir })
  const onSort = (k: K) => setSort((s) => (s.key === k ? { key: k, dir: (s.dir * -1) as 1 | -1 } : { key: k, dir: -1 }))
  const compare = <T,>(get: (row: T, key: K) => number | string | null) => (a: T, b: T) => {
    const x = get(a, sort.key), y = get(b, sort.key)
    if (x == null && y == null) return 0
    if (x == null) return 1
    if (y == null) return -1
    return (x < y ? -1 : x > y ? 1 : 0) * sort.dir
  }
  return { sort, onSort, compare }
}
