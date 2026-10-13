import { useId, useMemo, type CSSProperties, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import './scenes.css'

// ---------------------------------------------------------------------------
// Escenas para banners y fondos del Perfil Tesla.
// Se dibujan con CSS y SVG (sin imágenes externas): pesan poco, se ven nítidas
// en cualquier tamaño y no chocan con la CSP. La clave se guarda en la base
// como "scene:<clave>"; para agregar una escena basta con sumarla aquí.
// ---------------------------------------------------------------------------
export const SCENES: { key: string; name: string; animated: boolean }[] = [
  { key: 'galaxia', name: 'Noche estrellada', animated: true },
  { key: 'aurora', name: 'Aurora', animated: true },
  { key: 'bobina', name: 'Bobina de Tesla', animated: true },
  { key: 'circuito', name: 'Circuito', animated: true },
  { key: 'synthwave', name: 'Synthwave', animated: true },
  { key: 'oceano', name: 'Mar profundo', animated: true },
  { key: 'sakura', name: 'Sakura', animated: true },
  { key: 'academia', name: 'Academia Stella', animated: true },
  { key: 'codigo', name: 'Código', animated: true },
  { key: 'lava', name: 'Volcán', animated: true },
  { key: 'fuegos', name: 'Fuegos artificiales', animated: true },
  { key: 'nieve', name: 'Nevada', animated: true },
  { key: 'andes', name: 'Cordillera', animated: false },
  { key: 'cuaderno', name: 'Cuaderno', animated: false },
]

export const sceneInfo = (key: string) => SCENES.find((s) => s.key === key)

/** Colores de acento de cada escena (barra de XP y tarjeta para compartir). */
export const SCENE_ACCENT: Record<string, [string, string, string]> = {
  galaxia: ['#a855f7', '#38bdf8', '#0b1030'],
  aurora: ['#2dd4bf', '#a3e635', '#052e3a'],
  bobina: ['#60a5fa', '#e0f2fe', '#0b1d33'],
  circuito: ['#14b8a6', '#5eead4', '#021512'],
  synthwave: ['#ec4899', '#fb923c', '#12002b'],
  oceano: ['#0ea5e9', '#67e8f9', '#082f49'],
  sakura: ['#f472b6', '#c084fc', '#831843'],
  academia: ['#d4af37', '#fde68a', '#1d0610'],
  codigo: ['#f59e0b', '#38bdf8', '#050403'],
  lava: ['#f97316', '#fde047', '#3b0a0a'],
  fuegos: ['#f43f5e', '#facc15', '#0f0a24'],
  nieve: ['#93c5fd', '#e0f2fe', '#1e293b'],
  andes: ['#8b5cf6', '#fb923c', '#1e1b4b'],
  cuaderno: ['#3b82f6', '#93c5fd', '#1e3a8a'],
}

type Vars = CSSProperties & Record<`--${string}`, string | number>

/** Números pseudoaleatorios con semilla: cada escena se dibuja siempre igual. */
function rng(seed: number) {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const f1 = (n: number) => n.toFixed(1)

/** Silueta de montañas en un viewBox de 160 × 40. */
function ridge(seed: number, points: number, min: number, max: number) {
  const r = rng(seed)
  let d = 'M0 40'
  for (let i = 0; i <= points; i++) d += ` L${f1((i / points) * 160)} ${f1(min + r() * (max - min))}`
  return `${d} L160 40 Z`
}

/** Estrella de N puntas centrada en (cx, cy). */
export function starPoints(cx: number, cy: number, outer: number, inner: number, tips = 8) {
  return Array.from({ length: tips * 2 }, (_, i) => {
    const a = (Math.PI * i) / tips - Math.PI / 2
    const rad = i % 2 ? inner : outer
    return `${f1(cx + rad * Math.cos(a))},${f1(cy + rad * Math.sin(a))}`
  }).join(' ')
}

function Stars({ count, seed, height = 90 }: { count: number; seed: number; height?: number }) {
  const stars = useMemo(() => {
    const r = rng(seed)
    return Array.from({ length: count }, () => ({
      x: r() * 160, y: r() * height, s: 0.12 + r() * r() * 0.6, d: 2 + r() * 5, delay: -r() * 7,
    }))
  }, [count, seed, height])
  return (
    <svg className="sc-layer" viewBox="0 0 160 90" preserveAspectRatio="xMidYMid slice" aria-hidden>
      {stars.map((s, i) => (
        <circle key={i} cx={f1(s.x)} cy={f1(s.y)} r={s.s.toFixed(2)} fill="#fff" className="sc-twinkle"
          style={{ animationDuration: `${f1(s.d)}s`, animationDelay: `${f1(s.delay)}s` }} />
      ))}
    </svg>
  )
}

/** Partículas que caen (o suben con `rise`) por toda la escena. */
function Particles({ count, seed, rise, min, max, children }: {
  count: number; seed: number; rise?: boolean; min: number; max: number; children: (i: number) => ReactNode
}) {
  const items = useMemo(() => {
    const r = rng(seed)
    return Array.from({ length: count }, () => ({ x: r() * 100, d: min + r() * (max - min), delay: -r() * max, sway: 2 + r() * 4, size: r() }))
  }, [count, seed, min, max])
  return (
    <>
      {items.map((p, i) => (
        <div key={i} className={rise ? 'sc-rise' : 'sc-fall'} style={{ animationDuration: `${f1(p.d)}s`, animationDelay: `${f1(p.delay)}s` } as Vars}>
          <div className="sc-particle" style={{ left: `${f1(p.x)}%`, '--sway': `${f1(p.sway)}s`, '--size': p.size.toFixed(2) } as Vars}>
            {children(i)}
          </div>
        </div>
      ))}
    </>
  )
}

// ---------------------------------------------------------------------------
// Escenas
// ---------------------------------------------------------------------------
function Galaxia() {
  return (
    <div className="scene sc-galaxia">
      <div className="sc-nebula sc-nebula-a" />
      <div className="sc-nebula sc-nebula-b" />
      <Stars count={130} seed={11} />
      <div className="sc-planet"><div className="sc-planet-ring" /></div>
      <span className="sc-shooting" style={{ top: '12%', left: '78%' }} />
      <span className="sc-shooting" style={{ top: '30%', left: '42%', animationDelay: '-4.5s', animationDuration: '11s' }} />
    </div>
  )
}

function Aurora() {
  return (
    <div className="scene sc-aurora">
      <Stars count={70} seed={5} height={60} />
      <div className="sc-aurora-band" />
      <div className="sc-aurora-band" style={{ animationDuration: '19s', animationDelay: '-6s', top: '-4%', filter: 'blur(26px) hue-rotate(60deg)' }} />
      <div className="sc-aurora-band" style={{ animationDuration: '23s', animationDelay: '-12s', top: '14%', opacity: 0.55, filter: 'blur(30px) hue-rotate(-70deg)' }} />
      <svg className="sc-ground h-[34%]" viewBox="0 0 160 40" preserveAspectRatio="none" aria-hidden>
        <path d={ridge(3, 14, 6, 26)} fill="#0b2530" />
        <path d={ridge(8, 22, 18, 34)} fill="#04121a" />
      </svg>
    </div>
  )
}

function Bobina() {
  const bolts = useMemo(() => {
    const r = rng(42)
    return Array.from({ length: 12 }, () => {
      const angle = r() * Math.PI * 2
      const len = 45 + r() * 30
      const steps = 7 + Math.floor(r() * 4)
      let d = 'M50 58'
      for (let s = 1; s <= steps; s++) {
        const t = s / steps
        const jitter = (r() - 0.5) * 9
        const x = 50 + Math.cos(angle) * len * t + Math.cos(angle + Math.PI / 2) * jitter
        const y = 58 + Math.sin(angle) * len * t + Math.sin(angle + Math.PI / 2) * jitter
        d += ` L${f1(x)} ${f1(y)}`
      }
      return { d, dur: 2.4 + r() * 3.5, delay: -r() * 6 }
    })
  }, [])
  return (
    <div className="scene sc-bobina">
      <div className="sc-coil-rings" />
      <svg className="sc-layer sc-bolts" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
        {bolts.map((b, i) => (
          <g key={i} className="sc-bolt" style={{ animationDuration: `${f1(b.dur)}s`, animationDelay: `${f1(b.delay)}s` }}>
            <path d={b.d} className="sc-bolt-glow" />
            <path d={b.d} className="sc-bolt-core" />
          </g>
        ))}
      </svg>
      <div className="sc-orb" />
    </div>
  )
}

function Circuito() {
  const traces = useMemo(() => {
    const r = rng(7)
    return Array.from({ length: 34 }, () => {
      let x = Math.round(r() * 32) * 5
      let y = Math.round(r() * 18) * 5
      let d = `M${x} ${y}`
      let dir = Math.floor(r() * 4)
      const steps = 3 + Math.floor(r() * 4)
      for (let s = 0; s < steps; s++) {
        const len = (1 + Math.floor(r() * 4)) * 5
        if (r() < 0.45) dir = (dir + (r() < 0.5 ? 1 : 3)) % 4
        x += [len, 0, -len, 0][dir]
        y += [0, len, 0, -len][dir]
        d += ` L${x} ${y}`
      }
      return { d, end: [x, y] as const, dur: 2.5 + r() * 4, delay: -r() * 6 }
    })
  }, [])
  return (
    <div className="scene sc-circuito">
      <div className="sc-circuit-grid" />
      <svg className="sc-layer" viewBox="0 0 160 90" preserveAspectRatio="xMidYMid slice" aria-hidden>
        {traces.map((t, i) => <path key={i} d={t.d} className="sc-trace" />)}
        {traces.map((t, i) => <circle key={i} cx={t.end[0]} cy={t.end[1]} r={0.9} className="sc-node" />)}
        <g className="sc-pulses">
          {traces.map((t, i) => (
            <path key={i} d={t.d} pathLength={100} className="sc-pulse" style={{ animationDuration: `${f1(t.dur)}s`, animationDelay: `${f1(t.delay)}s` }} />
          ))}
        </g>
      </svg>
      <div className="sc-chip" />
    </div>
  )
}

function Synthwave() {
  return (
    <div className="scene sc-synthwave">
      <Stars count={50} seed={9} height={45} />
      <div className="sc-sun" />
      <svg className="sc-synth-hills" viewBox="0 0 160 40" preserveAspectRatio="none" aria-hidden>
        <path d={ridge(21, 16, 8, 34)} fill="#2e1065" />
        <path d={ridge(4, 9, 20, 38)} fill="#1e0846" />
      </svg>
      {/* Piso en perspectiva: líneas que convergen al centro y otras que avanzan hacia el frente. */}
      <svg className="sc-floor" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
        {Array.from({ length: 25 }, (_, k) => <line key={k} x1={50 + (k - 12) * 2.5} y1="0" x2={50 + (k - 12) * 26} y2="100" className="sc-gridline" />)}
        {Array.from({ length: 10 }, (_, i) => <line key={`h${i}`} x1="0" y1="0" x2="100" y2="0" className="sc-gridline sc-floorline" style={{ animationDelay: `${-i * 0.4}s` }} />)}
      </svg>
      <div className="sc-horizon" />
    </div>
  )
}

function Oceano() {
  const wave = 'M0 10 Q 25 0 50 10 T 100 10 T 150 10 T 200 10 V 20 H 0 Z'
  return (
    <div className="scene sc-oceano">
      <div className="sc-rays" />
      <Particles count={14} seed={3} rise min={9} max={18}>{() => <span className="sc-bubble" />}</Particles>
      {[
        { h: '46%', d: '22s', fill: 'rgba(14, 116, 144, 0.55)' },
        { h: '34%', d: '15s', fill: 'rgba(8, 81, 120, 0.75)' },
        { h: '22%', d: '10s', fill: 'rgba(4, 47, 73, 0.95)' },
      ].map((w, i) => (
        <div key={i} className="sc-wave" style={{ height: w.h, animationDuration: w.d }}>
          <svg viewBox="0 0 200 20" preserveAspectRatio="none" aria-hidden><path d={wave} fill={w.fill} /></svg>
        </div>
      ))}
    </div>
  )
}

function Sakura() {
  return (
    <div className="scene sc-sakura">
      <div className="sc-sakura-sun" />
      <svg className="sc-ground h-[30%]" viewBox="0 0 160 40" preserveAspectRatio="none" aria-hidden>
        <path d={ridge(14, 6, 14, 26)} fill="rgba(244, 114, 182, 0.25)" />
        <path d={ridge(30, 8, 24, 34)} fill="rgba(219, 39, 119, 0.22)" />
      </svg>
      <svg className="sc-branch" viewBox="0 0 100 60" aria-hidden>
        <path d="M-5 6 C 20 10, 35 4, 55 16 S 80 22, 96 18 M30 8 C 36 18, 42 22, 50 30 M62 18 C 66 26, 72 30, 80 36" stroke="#5b2a35" strokeWidth="2.2" fill="none" strokeLinecap="round" />
        {[[20, 9], [34, 7], [46, 25], [52, 14], [64, 20], [76, 33], [84, 19], [94, 17], [40, 18], [70, 27], [12, 6], [58, 17]].map(([x, y], i) => (
          <g key={i}>
            <circle cx={x} cy={y} r={3.2} fill="#fbcfe8" />
            <circle cx={x} cy={y} r={1.1} fill="#f472b6" />
          </g>
        ))}
      </svg>
      <Particles count={26} seed={19} min={8} max={15}>{() => <span className="sc-petal" />}</Particles>
    </div>
  )
}

function Academia() {
  const glints = useMemo(() => {
    const r = rng(23)
    return Array.from({ length: 10 }, () => ({ x: r() * 100, y: r() * 100, d: 2.5 + r() * 3, delay: -r() * 5 }))
  }, [])
  return (
    <div className="scene sc-academia">
      <div className="sc-lattice" />
      <svg className="sc-emblem" viewBox="0 0 100 100" aria-hidden>
        <polygon points={starPoints(50, 50, 48, 30)} fill="none" stroke="rgba(234, 196, 99, 0.35)" strokeWidth="0.8" />
        <polygon points={starPoints(50, 50, 40, 25)} fill="none" stroke="rgba(234, 196, 99, 0.22)" strokeWidth="0.5" />
        <circle cx="50" cy="50" r="15" fill="none" stroke="rgba(234, 196, 99, 0.3)" strokeWidth="0.6" />
      </svg>
      <div className="sc-gold-rule" style={{ top: '7%' }} />
      <div className="sc-gold-rule" style={{ bottom: '7%' }} />
      <Particles count={14} seed={31} rise min={12} max={22}>
        {() => <svg className="sc-gstar" viewBox="0 0 20 20" aria-hidden><polygon points={starPoints(10, 10, 9.5, 4.2)} /></svg>}
      </Particles>
      {glints.map((g, i) => (
        <span key={i} className="sc-glint" style={{ left: `${f1(g.x)}%`, top: `${f1(g.y)}%`, animationDuration: `${f1(g.d)}s`, animationDelay: `${f1(g.delay)}s` }} />
      ))}
    </div>
  )
}

function Codigo() {
  const cols = useMemo(() => {
    const r = rng(17)
    const chars = '01λΣπΩΔ√∞≈µ⚡TESLA'
    return Array.from({ length: 30 }, (_, i) => ({
      x: (i / 30) * 100 + r() * 2,
      text: Array.from({ length: 14 }, () => chars[Math.floor(r() * chars.length)]).join(''),
      d: 4 + r() * 6, delay: -r() * 10, dim: r() < 0.4,
    }))
  }, [])
  return (
    <div className="scene sc-codigo">
      {cols.map((c, i) => (
        <div key={i} className="sc-code-col" style={{ left: `${f1(c.x)}%`, animationDuration: `${f1(c.d)}s`, animationDelay: `${f1(c.delay)}s` }}>
          <span className={cn('sc-code', c.dim && 'sc-code-dim')}>{c.text}</span>
        </div>
      ))}
      <div className="sc-scanlines" />
    </div>
  )
}

function Lava() {
  return (
    <div className="scene sc-lava">
      <div className="sc-lava-glow" />
      <Particles count={12} seed={13} rise min={10} max={20}>{() => <span className="sc-blob" />}</Particles>
      <Particles count={18} seed={29} rise min={5} max={9}>{() => <span className="sc-ember" />}</Particles>
      <svg className="sc-ground h-[22%]" viewBox="0 0 160 40" preserveAspectRatio="none" aria-hidden>
        <path d={ridge(6, 20, 10, 30)} fill="#1c0503" />
      </svg>
    </div>
  )
}

function Andes() {
  const id = useId().replace(/:/g, '')
  const layers = [
    { d: ridge(2, 9, 4, 24), fill: '#6d5bd0', snow: 10 },
    { d: ridge(12, 12, 14, 30), fill: '#3b2f86', snow: 18 },
    { d: ridge(27, 16, 24, 36), fill: '#1b1546', snow: 0 },
  ]
  return (
    <div className="scene sc-andes">
      <div className="sc-andes-sun" />
      <svg className="sc-ground h-[55%]" viewBox="0 0 160 40" preserveAspectRatio="none" aria-hidden>
        <defs>{layers.map((l, i) => <clipPath key={i} id={`${id}m${i}`}><path d={l.d} /></clipPath>)}</defs>
        {layers.map((l, i) => (
          <g key={i}>
            <path d={l.d} fill={l.fill} />
            {l.snow > 0 && <rect x="0" y="0" width="160" height={l.snow} fill="rgba(255, 255, 255, 0.78)" clipPath={`url(#${id}m${i})`} />}
          </g>
        ))}
      </svg>
      <svg className="sc-condor" viewBox="0 0 24 8" aria-hidden><path d="M0 5 Q 6 0 12 5 Q 18 0 24 5" fill="none" stroke="#1b1546" strokeWidth="1.4" strokeLinecap="round" /></svg>
    </div>
  )
}

function Cuaderno() {
  return (
    <div className="scene sc-cuaderno">
      <svg className="sc-layer" viewBox="0 0 160 90" preserveAspectRatio="xMidYMid slice" aria-hidden>
        <g fill="none" stroke="#2b4a75" strokeWidth="0.45" strokeLinecap="round" strokeLinejoin="round" opacity="0.55">
          <path d="M28 12 l-5 9 h4 l-3 8 l8 -11 h-4 l3 -6 z" />
          <g transform="translate(128 20)">
            <ellipse rx="9" ry="3.4" /><ellipse rx="9" ry="3.4" transform="rotate(60)" /><ellipse rx="9" ry="3.4" transform="rotate(-60)" />
            <circle r="1.2" fill="#2b4a75" />
          </g>
          <polygon points={starPoints(110, 70, 5, 2.2, 5)} />
          <path d="M12 70 q 6 -8 12 0 t 12 0" />
          <path d="M70 18 l4 -4 l4 4 m-4 -4 v12" />
          <circle cx="146" cy="62" r="5" /><path d="M141 62 h10 M146 57 v10" />
        </g>
        <g fill="#2b4a75" opacity="0.5" fontFamily="'Comic Sans MS', 'Segoe Print', cursive">
          <text x="54" y="44" fontSize="7">E = mc²</text>
          <text x="20" y="50" fontSize="9">π</text>
          <text x="92" y="30" fontSize="5">a² + b² = c²</text>
          <text x="128" y="84" fontSize="5">H₂O</text>
          <text x="40" y="82" fontSize="5">∫ f(x) dx</text>
        </g>
      </svg>
    </div>
  )
}

function Fuegos() {
  const bursts = useMemo(() => {
    const r = rng(53)
    const colors = ['#f43f5e', '#facc15', '#38bdf8', '#a3e635', '#e879f9', '#fb923c']
    return Array.from({ length: 7 }, (_, i) => ({
      x: 8 + r() * 84, y: 10 + r() * 42, color: colors[i % colors.length], d: 2.6 + r() * 1.6, delay: -r() * 4, size: 0.7 + r() * 0.6,
    }))
  }, [])
  const skyline = useMemo(() => {
    const r = rng(61)
    let d = 'M0 40'
    let x = 0
    while (x < 160) {
      const w = 4 + r() * 9
      const h = 14 + r() * 22
      d += ` L${f1(x)} ${f1(40 - h)} L${f1(x + w)} ${f1(40 - h)}`
      x += w
    }
    return `${d} L160 40 Z`
  }, [])
  return (
    <div className="scene sc-fuegos">
      <Stars count={60} seed={41} height={50} />
      {bursts.map((b, i) => (
        <div key={i} className="sc-burst" style={{ left: `${f1(b.x)}%`, top: `${f1(b.y)}%`, '--c': b.color, '--k': b.size.toFixed(2), animationDuration: `${f1(b.d)}s`, animationDelay: `${f1(b.delay)}s` } as Vars}>
          {Array.from({ length: 14 }, (_, k) => (
            <span key={k} className="sc-burst-spark" style={{ '--a': `${k * (360 / 14)}deg`, animationDuration: `${f1(b.d)}s`, animationDelay: `${f1(b.delay)}s` } as Vars} />
          ))}
        </div>
      ))}
      <svg className="sc-ground h-[26%]" viewBox="0 0 160 40" preserveAspectRatio="none" aria-hidden>
        <path d={skyline} fill="#0b0716" />
      </svg>
    </div>
  )
}

function Nieve() {
  return (
    <div className="scene sc-nieve">
      <div className="sc-moon" />
      <Stars count={50} seed={77} height={45} />
      <svg className="sc-ground h-[38%]" viewBox="0 0 160 40" preserveAspectRatio="none" aria-hidden>
        <path d={ridge(44, 7, 6, 22)} fill="#cbd5e1" />
        <path d={ridge(45, 10, 18, 32)} fill="#e2e8f0" />
        {[12, 30, 46, 118, 134, 150].map((x, i) => (
          <polygon key={i} points={`${x},${24 + (i % 3) * 3} ${x - 4},${36 + (i % 3) * 2} ${x + 4},${36 + (i % 3) * 2}`} fill="#1e3a5f" />
        ))}
      </svg>
      <Particles count={40} seed={88} min={7} max={16}>{() => <span className="sc-flake" />}</Particles>
    </div>
  )
}

const SCENE_COMPONENTS: Record<string, () => JSX.Element> = {
  galaxia: Galaxia, aurora: Aurora, bobina: Bobina, circuito: Circuito, synthwave: Synthwave, oceano: Oceano,
  sakura: Sakura, academia: Academia, codigo: Codigo, lava: Lava, fuegos: Fuegos, nieve: Nieve, andes: Andes, cuaderno: Cuaderno,
}

export function Scene({ name, className }: { name: string; className?: string }) {
  const Comp = SCENE_COMPONENTS[name] ?? Galaxia
  return <div className={cn('absolute inset-0 overflow-hidden', className)} aria-hidden><Comp /></div>
}
