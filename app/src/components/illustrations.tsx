/**
 * Ilustraciones del campus para pantallas vacías y el recorrido inicial.
 * Hechas con la identidad del colegio: cuadernos forrados, la bobina de Tesla
 * y el dorado "chispa". Usan currentColor y variables, así funcionan en modo oscuro.
 */
export type ArtName = 'notebook' | 'tasks' | 'mail' | 'chat' | 'calendar' | 'grades' | 'bell' | 'coil' | 'search'

const ink = 'rgb(var(--tinta-ink))'
const soft = 'rgb(var(--texto-suave) / 0.35)'
const paper = 'rgb(var(--superficie))'
const line = 'rgb(var(--linea))'
const gold = '#F0B429'

function Notebook() {
  return (
    <>
      <rect x="44" y="18" width="62" height="80" rx="6" fill="#2563EB" transform="rotate(8 75 58)" />
      <rect x="30" y="22" width="62" height="80" rx="6" fill="#DC2626" transform="rotate(-6 61 62)" />
      <g transform="rotate(-6 61 62)">
        <rect x="30" y="22" width="12" height="80" rx="3" fill="rgba(0,0,0,.18)" />
        <rect x="50" y="40" width="34" height="14" rx="3" fill={paper} />
        <rect x="54" y="45" width="22" height="3" rx="1.5" fill={soft} />
      </g>
      <circle cx="104" cy="92" r="11" fill={gold} />
      <path d="M99 92l3.5 3.5L109 88" stroke="#0B1D33" strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </>
  )
}

function Tasks() {
  return (
    <>
      <rect x="32" y="16" width="70" height="88" rx="8" fill={paper} stroke={line} strokeWidth="2" />
      <rect x="54" y="10" width="26" height="12" rx="4" fill={ink} />
      {[36, 56, 76].map((y, i) => (
        <g key={y}>
          <rect x="42" y={y} width="12" height="12" rx="3" fill={i < 2 ? gold : 'none'} stroke={i < 2 ? gold : soft} strokeWidth="2" />
          {i < 2 && <path d={`M45 ${y + 6}l2.5 2.5L52 ${y + 3.5}`} stroke="#0B1D33" strokeWidth="2" fill="none" strokeLinecap="round" />}
          <rect x="60" y={y + 3} width={i === 2 ? 22 : 32} height="5" rx="2.5" fill={soft} />
        </g>
      ))}
    </>
  )
}

function Mail() {
  return (
    <>
      <rect x="20" y="34" width="88" height="60" rx="8" fill={paper} stroke={line} strokeWidth="2" />
      <path d="M22 38l42 30 42-30" stroke={ink} strokeWidth="3" fill="none" strokeLinejoin="round" />
      <circle cx="100" cy="34" r="12" fill={gold} />
      <path d="M95 34h10M100 29v10" stroke="#0B1D33" strokeWidth="2.6" strokeLinecap="round" />
    </>
  )
}

function Chat() {
  return (
    <>
      <rect x="16" y="22" width="64" height="42" rx="14" fill={ink} />
      <path d="M30 64l-6 12 16-12z" fill={ink} />
      <rect x="28" y="36" width="34" height="5" rx="2.5" fill={paper} opacity=".75" />
      <rect x="28" y="46" width="22" height="5" rx="2.5" fill={paper} opacity=".5" />
      <rect x="50" y="56" width="62" height="38" rx="14" fill={paper} stroke={line} strokeWidth="2" />
      <path d="M98 94l6 10-16-10z" fill={paper} stroke={line} strokeWidth="2" strokeLinejoin="round" />
      <circle cx="68" cy="75" r="3.5" fill={gold} /><circle cx="81" cy="75" r="3.5" fill={gold} /><circle cx="94" cy="75" r="3.5" fill={gold} />
    </>
  )
}

function Calendar() {
  return (
    <>
      <rect x="24" y="24" width="80" height="76" rx="10" fill={paper} stroke={line} strokeWidth="2" />
      <path d="M24 34a10 10 0 0 1 10-10h60a10 10 0 0 1 10 10v10H24z" fill={ink} />
      <rect x="40" y="16" width="6" height="16" rx="3" fill={gold} /><rect x="82" y="16" width="6" height="16" rx="3" fill={gold} />
      {[0, 1, 2, 3].map((c) => [0, 1, 2].map((r) => (
        <rect key={`${c}${r}`} x={36 + c * 16} y={54 + r * 14} width="10" height="8" rx="2" fill={c === 2 && r === 1 ? gold : soft} />
      )))}
    </>
  )
}

function Grades() {
  return (
    <>
      <rect x="28" y="18" width="72" height="88" rx="6" fill={paper} stroke={line} strokeWidth="2" />
      <rect x="28" y="18" width="72" height="16" rx="6" fill={ink} />
      {['AD', 'A', 'B'].map((l, i) => (
        <g key={l}>
          <rect x="38" y={44 + i * 18} width="30" height="5" rx="2.5" fill={soft} />
          <rect x="74" y={40 + i * 18} width="18" height="12" rx="3" fill={i === 0 ? '#1E8E5A' : i === 1 ? 'rgba(30,142,90,.25)' : 'rgba(184,114,15,.25)'} />
        </g>
      ))}
      <path d="M86 92l10-26 6 4-10 26-7 2z" fill={gold} />
    </>
  )
}

function Bell() {
  return (
    <>
      <path d="M64 22c-15 0-26 12-26 28v18l-8 12h68l-8-12V50c0-16-11-28-26-28z" fill={ink} />
      <circle cx="64" cy="88" r="8" fill={gold} />
      <path d="M96 30c6 5 9 12 9 20M32 30c-6 5-9 12-9 20" stroke={gold} strokeWidth="3.5" fill="none" strokeLinecap="round" />
    </>
  )
}

/** Bobina de Tesla: el motivo del colegio (anillos que irradian). */
function Coil() {
  return (
    <>
      {[44, 34, 24].map((r, i) => <circle key={r} cx="64" cy="60" r={r} fill="none" stroke={gold} strokeOpacity={0.25 + i * 0.25} strokeWidth="2.5" />)}
      <rect x="54" y="48" width="20" height="40" rx="4" fill={ink} />
      {[54, 62, 70, 78].map((y) => <rect key={y} x="52" y={y} width="24" height="3" rx="1.5" fill={gold} />)}
      <circle cx="64" cy="42" r="9" fill={ink} stroke={gold} strokeWidth="3" />
      <path d="M86 26l-6 10h7l-6 10" stroke={gold} strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </>
  )
}

function Search() {
  return (
    <>
      <circle cx="56" cy="54" r="26" fill={paper} stroke={ink} strokeWidth="6" />
      <path d="M75 73l20 20" stroke={ink} strokeWidth="9" strokeLinecap="round" />
      <path d="M46 50a12 12 0 0 1 12-10" stroke={gold} strokeWidth="4" fill="none" strokeLinecap="round" />
    </>
  )
}

const ART = { notebook: Notebook, tasks: Tasks, mail: Mail, chat: Chat, calendar: Calendar, grades: Grades, bell: Bell, coil: Coil, search: Search }

export function Illustration({ name, className }: { name: ArtName; className?: string }) {
  const Art = ART[name] ?? Coil
  return (
    <svg viewBox="0 0 128 120" className={className} aria-hidden fill="none">
      <ellipse cx="64" cy="112" rx="40" ry="5" fill={soft} opacity=".5" />
      <Art />
    </svg>
  )
}
