import { useId } from 'react'
import { TrendingDown, TrendingUp, Minus } from 'lucide-react'
import { Panel } from '@/components/ui'
import { formatShort } from '@/lib/format'
import { cn } from '@/lib/utils'
import { BANDS, bandOf, type Snapshot } from '@/services/expediente'
import { useEntered } from './widgets'

const W = 360
const H = 170
const PAD_X = 30
const TOP = 14
const BOTTOM = 30

/** El recorrido del Índice Tesla semana a semana, con las franjas de cada rango de fondo. */
export function IndexHistory({ history }: { history: Snapshot[] }) {
  const entered = useEntered(250)
  const id = useId().replace(/:/g, '')
  const pts = history.slice(-12)
  const n = pts.length
  const x = (i: number) => (n === 1 ? W / 2 : PAD_X + (i * (W - PAD_X * 2)) / (n - 1))
  const y = (v: number) => TOP + (H - TOP - BOTTOM) * (1 - Math.min(100, Math.max(0, v)) / 100)
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.score).toFixed(1)}`).join(' ')
  const area = `${line} L${x(n - 1).toFixed(1)},${H - BOTTOM} L${x(0).toFixed(1)},${H - BOTTOM} Z`
  const last = pts[n - 1]
  const prev = n > 1 ? pts[n - 2] : null
  const delta = prev ? last.score - prev.score : 0
  const best = Math.max(...pts.map((p) => p.score))
  const Icon = delta > 0 ? TrendingUp : delta < 0 ? TrendingDown : Minus

  return (
    <Panel title="Evolución del índice">
      <div className="space-y-3">
        {prev ? (
          <p className={cn('inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold', delta > 0 ? 'bg-estado-ok/10 text-estado-ok' : delta < 0 ? 'bg-estado-tarde/10 text-estado-tarde' : 'bg-papel text-texto-suave')}>
            <Icon className="h-4 w-4" aria-hidden />
            {delta > 0 ? `Subió ${delta} ${delta === 1 ? 'punto' : 'puntos'} desde la semana pasada` : delta < 0 ? `Bajó ${-delta} ${delta === -1 ? 'punto' : 'puntos'} desde la semana pasada` : 'Se mantiene igual que la semana pasada'}
          </p>
        ) : (
          <p className="text-sm text-texto-suave">Desde esta semana guardamos el recorrido del índice. La línea irá creciendo cada semana.</p>
        )}

        <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`Índice por semana: ${pts.map((p) => `${formatShort(p.week)} ${p.score}`).join(', ')}`}>
          <defs>
            <linearGradient id={`h${id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#2563EB" stopOpacity="0.28" />
              <stop offset="100%" stopColor="#2563EB" stopOpacity="0" />
            </linearGradient>
          </defs>
          {/* Franjas de los rangos */}
          {BANDS.map((b, i) => {
            const top = i === 0 ? 100 : BANDS[i - 1].min
            return <rect key={b.id} x={PAD_X - 14} width={W - PAD_X * 2 + 28} y={y(top)} height={y(b.min) - y(top)} fill={b.from} opacity="0.09" />
          })}
          {BANDS.slice(0, 4).map((b) => (
            <g key={b.id}>
              <line x1={PAD_X - 14} x2={W - PAD_X + 14} y1={y(b.min)} y2={y(b.min)} stroke="currentColor" strokeOpacity="0.12" strokeDasharray="3 5" />
              <text x={W - PAD_X + 16} y={y(b.min) + 3} className="fill-current text-[9px] font-bold" style={{ color: 'rgb(var(--texto-suave))' }}>{b.min}</text>
            </g>
          ))}
          {n > 1 && <path d={area} fill={`url(#h${id})`} style={{ opacity: entered ? 1 : 0, transition: 'opacity 1s .5s' }} />}
          {n > 1 && (
            <path d={line} fill="none" stroke="#2563EB" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" pathLength={1}
              strokeDasharray="1" strokeDashoffset={entered ? 0 : 1} style={{ transition: 'stroke-dashoffset 1.3s var(--ease-out)' }} />
          )}
          {pts.map((p, i) => {
            const isLast = i === n - 1
            const b = bandOf(p.score)
            return (
              <g key={p.week} style={{ opacity: entered ? 1 : 0, transition: `opacity .4s ${300 + i * 90}ms` }}>
                <title>{`${formatShort(p.week)}: ${p.score} · ${b.label}`}</title>
                {isLast && <circle cx={x(i)} cy={y(p.score)} r="11" fill={b.to} opacity="0.35" className="exp-tip-pulse" />}
                <circle cx={x(i)} cy={y(p.score)} r={isLast ? 6.5 : 4.5} fill={b.from} stroke="#fff" strokeWidth="2.2" />
                {(isLast || p.score === best) && <text x={x(i)} y={y(p.score) - 12} textAnchor="middle" className="fill-current text-[11px] font-bold" style={{ color: 'rgb(var(--texto))' }}>{p.score}</text>}
                {(n <= 6 || i % 2 === n % 2 || isLast) && <text x={x(i)} y={H - 10} textAnchor="middle" className="fill-current text-[10px] font-semibold" style={{ color: 'rgb(var(--texto-suave))' }}>{formatShort(p.week)}</text>}
              </g>
            )
          })}
        </svg>
        <p className="text-xs text-texto-suave">Cada punto es una semana. Solo se compara {n > 1 ? 'consigo mismo' : 'con el propio recorrido'}, nunca con otros alumnos.</p>
      </div>
    </Panel>
  )
}
