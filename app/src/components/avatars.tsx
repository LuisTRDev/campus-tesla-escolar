import { useId } from 'react'

// ---------------------------------------------------------------------------
// Avatares animados del Perfil Tesla. Se guardan en la base como "anim:<clave>"
// y se dibujan aquí con SVG (sin archivos: funcionan en modo enlaces y con la
// CSP). Las animaciones están en profile.css y se detienen si el dispositivo
// pide reducir el movimiento.
// ---------------------------------------------------------------------------
export const ANIM_AVATARS: { key: string; name: string; emoji: string }[] = [
  { key: 'robot', name: 'Robot Tesla', emoji: '🤖' },
  { key: 'rayo', name: 'Rayo vivo', emoji: '⚡' },
  { key: 'atomo', name: 'Átomo vivo', emoji: '⚛️' },
  { key: 'buho', name: 'Búho sabio', emoji: '🦉' },
  { key: 'cohete', name: 'Cohete turbo', emoji: '🚀' },
  { key: 'planeta', name: 'Planeta', emoji: '🪐' },
  { key: 'bobina', name: 'Bobina viva', emoji: '🌀' },
  { key: 'dragon', name: 'Dragón de fuego', emoji: '🐉' },
]

export const animAvatarKey = (value: string | null | undefined) => (value?.startsWith('anim:') ? value.slice(5) : null)

/** Emoji equivalente (para la tarjeta para compartir y textos). */
export function avatarEmoji(value: string | null | undefined): string {
  const key = animAvatarKey(value)
  if (key) return ANIM_AVATARS.find((a) => a.key === key)?.emoji ?? '⚡'
  return value || '⚡'
}

export function AnimatedAvatar({ name }: { name: string }) {
  const id = useId().replace(/:/g, '')
  const g = (n: string) => `${id}${n}`
  return (
    <svg viewBox="0 0 100 100" className={`anim-avatar anim-${name} h-full w-full`} aria-hidden>
      <defs>
        <radialGradient id={g('bg')} cx="0.5" cy="0.4" r="0.7">
          <stop offset="0" stopColor="#1e3a8a" /><stop offset="1" stopColor="#0b1d33" />
        </radialGradient>
        <linearGradient id={g('gold')} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff1bf" /><stop offset="0.5" stopColor="#f5c451" /><stop offset="1" stopColor="#c99319" />
        </linearGradient>
        <linearGradient id={g('steel')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#e2e8f0" /><stop offset="1" stopColor="#64748b" />
        </linearGradient>
        <radialGradient id={g('glow')} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#7dd3fc" stopOpacity="0.9" /><stop offset="1" stopColor="#7dd3fc" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="50" cy="50" r="50" fill={`url(#${g('bg')})`} />
      {name === 'robot' && (
        <g>
          <line x1="50" y1="14" x2="50" y2="24" stroke="#94a3b8" strokeWidth="3" />
          <circle className="aa-blink-led" cx="50" cy="12" r="4.5" fill="#f43f5e" />
          <rect x="24" y="24" width="52" height="44" rx="12" fill={`url(#${g('steel')})`} stroke="#334155" strokeWidth="2" />
          <rect x="31" y="33" width="38" height="20" rx="8" fill="#0f172a" />
          <g className="aa-eyes">
            <circle cx="41" cy="43" r="5" fill="#22d3ee" /><circle cx="59" cy="43" r="5" fill="#22d3ee" />
          </g>
          <rect className="aa-mouth" x="40" y="58" width="20" height="4" rx="2" fill="#334155" />
          <rect x="34" y="70" width="32" height="18" rx="6" fill="#475569" />
          <circle className="aa-blink-led" cx="50" cy="79" r="3" fill="#facc15" />
        </g>
      )}
      {name === 'rayo' && (
        <g>
          <circle className="aa-pulse" cx="50" cy="50" r="34" fill={`url(#${g('glow')})`} />
          <path className="aa-zap" d="M57 12 L28 56 H46 L40 88 L72 42 H54 Z" fill={`url(#${g('gold')})`} stroke="#6b4906" strokeWidth="2" strokeLinejoin="round" />
          <circle className="aa-spark aa-s1" cx="24" cy="30" r="2.5" fill="#fde047" />
          <circle className="aa-spark aa-s2" cx="78" cy="68" r="2.5" fill="#fde047" />
          <circle className="aa-spark aa-s3" cx="76" cy="24" r="2" fill="#bae6fd" />
        </g>
      )}
      {name === 'atomo' && (
        <g>
          <g className="aa-spin-slow" style={{ transformOrigin: '50px 50px' }}>
            <ellipse cx="50" cy="50" rx="36" ry="13" fill="none" stroke="#67e8f9" strokeWidth="2.5" />
            <ellipse cx="50" cy="50" rx="36" ry="13" fill="none" stroke="#a78bfa" strokeWidth="2.5" transform="rotate(60 50 50)" />
            <ellipse cx="50" cy="50" rx="36" ry="13" fill="none" stroke="#f472b6" strokeWidth="2.5" transform="rotate(-60 50 50)" />
            <circle cx="86" cy="50" r="4" fill="#67e8f9" />
            <circle cx="32" cy="81" r="4" fill="#a78bfa" />
            <circle cx="32" cy="19" r="4" fill="#f472b6" />
          </g>
          <circle className="aa-pulse" cx="50" cy="50" r="10" fill={`url(#${g('gold')})`} />
        </g>
      )}
      {name === 'buho' && (
        <g>
          <path d="M22 30 L32 18 L40 30 M78 30 L68 18 L60 30" fill="#92400e" />
          <ellipse cx="50" cy="56" rx="30" ry="32" fill="#b45309" />
          <ellipse cx="50" cy="66" rx="18" ry="20" fill="#fde68a" opacity="0.9" />
          <g className="aa-eyes">
            <circle cx="38" cy="44" r="11" fill="#fff" /><circle cx="62" cy="44" r="11" fill="#fff" />
            <circle className="aa-look" cx="38" cy="45" r="5" fill="#0f172a" /><circle className="aa-look" cx="62" cy="45" r="5" fill="#0f172a" />
          </g>
          <path d="M46 54 L50 62 L54 54 Z" fill="#f59e0b" />
          <rect x="30" y="20" width="40" height="7" rx="1.5" fill="#0f172a" />
          <path d="M50 14 L74 22 L50 30 L26 22 Z" fill="#1e293b" />
          <line className="aa-tassel" x1="70" y1="22" x2="72" y2="34" stroke="#facc15" strokeWidth="2.5" style={{ transformOrigin: '70px 22px' }} />
        </g>
      )}
      {name === 'cohete' && (
        <g>
          <g className="aa-stars">
            {[[18, 22], [80, 18], [72, 80], [22, 76], [86, 48]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r="1.6" fill="#fff" />)}
          </g>
          <g className="aa-float">
            <path className="aa-flame" d="M42 72 Q50 96 58 72 Z" fill="#f97316" style={{ transformOrigin: '50px 72px' }} />
            <path className="aa-flame aa-flame2" d="M45 72 Q50 88 55 72 Z" fill="#fde047" style={{ transformOrigin: '50px 72px' }} />
            <path d="M50 12 Q68 30 64 66 H36 Q32 30 50 12 Z" fill={`url(#${g('steel')})`} stroke="#334155" strokeWidth="2" />
            <circle cx="50" cy="38" r="8" fill="#38bdf8" stroke="#1e3a8a" strokeWidth="2.5" />
            <path d="M36 52 L24 70 L36 66 Z M64 52 L76 70 L64 66 Z" fill="#ef4444" />
          </g>
        </g>
      )}
      {name === 'planeta' && (
        <g>
          <g className="aa-stars">
            {[[16, 30], [84, 26], [80, 82], [20, 80]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r="1.5" fill="#fff" />)}
          </g>
          <circle cx="50" cy="50" r="24" fill="#8b5cf6" />
          <path d="M28 44 Q50 36 72 46" stroke="#c4b5fd" strokeWidth="5" fill="none" opacity="0.7" />
          <path d="M27 56 Q50 62 73 54" stroke="#6d28d9" strokeWidth="5" fill="none" opacity="0.6" />
          <g className="aa-spin-slow" style={{ transformOrigin: '50px 50px' }}>
            <ellipse cx="50" cy="50" rx="42" ry="10" fill="none" stroke="#fde68a" strokeWidth="3" transform="rotate(-18 50 50)" />
            <circle cx="91" cy="38" r="3.5" fill="#67e8f9" />
          </g>
        </g>
      )}
      {name === 'bobina' && (
        <g>
          <rect x="40" y="58" width="20" height="30" rx="3" fill="#475569" />
          {[62, 68, 74, 80].map((y) => <rect key={y} x="38" y={y} width="24" height="3" rx="1.5" fill="#d08a4e" />)}
          <ellipse cx="50" cy="40" rx="20" ry="11" fill={`url(#${g('steel')})`} stroke="#334155" strokeWidth="2" />
          <circle className="aa-pulse" cx="50" cy="40" r="26" fill={`url(#${g('glow')})`} />
          <g className="aa-arcs">
            <path className="aa-arc aa-a1" d="M32 36 L20 28 L24 20 L12 12" stroke="#bae6fd" strokeWidth="2.2" fill="none" strokeLinejoin="round" />
            <path className="aa-arc aa-a2" d="M68 36 L80 26 L76 18 L90 12" stroke="#bae6fd" strokeWidth="2.2" fill="none" strokeLinejoin="round" />
            <path className="aa-arc aa-a3" d="M50 29 L46 18 L54 12 L50 2" stroke="#fde047" strokeWidth="2" fill="none" strokeLinejoin="round" />
          </g>
        </g>
      )}
      {name === 'dragon' && (
        <g>
          <path className="aa-wing" d="M30 50 Q8 30 14 14 Q26 30 38 36 Z" fill="#047857" style={{ transformOrigin: '34px 44px' }} />
          <path className="aa-wing aa-wing2" d="M70 50 Q92 30 86 14 Q74 30 62 36 Z" fill="#047857" style={{ transformOrigin: '66px 44px' }} />
          <ellipse cx="50" cy="56" rx="22" ry="24" fill="#10b981" />
          <path d="M36 34 L32 20 L42 30 M64 34 L68 20 L58 30" fill="#fde68a" />
          <ellipse cx="50" cy="64" rx="12" ry="9" fill="#6ee7b7" />
          <g className="aa-eyes">
            <ellipse cx="41" cy="48" rx="5" ry="6" fill="#fef3c7" /><ellipse cx="59" cy="48" rx="5" ry="6" fill="#fef3c7" />
            <ellipse cx="41" cy="49" rx="2" ry="4" fill="#0f172a" /><ellipse cx="59" cy="49" rx="2" ry="4" fill="#0f172a" />
          </g>
          <circle cx="46" cy="64" r="1.6" fill="#065f46" /><circle cx="54" cy="64" r="1.6" fill="#065f46" />
          <g className="aa-smoke">
            <circle cx="46" cy="76" r="3" fill="#cbd5e1" opacity="0.8" /><circle cx="54" cy="78" r="2.4" fill="#cbd5e1" opacity="0.7" />
          </g>
        </g>
      )}
    </svg>
  )
}
