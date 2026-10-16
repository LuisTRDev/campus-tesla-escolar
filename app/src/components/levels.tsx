import { cn } from '@/lib/utils'
import type { Level } from '@/types'

// Cada nivel es un sello de tinta (doble aro); AD va relleno, como un sello de excelencia.
export const LEVEL_STYLES: Record<Level, string> = {
  AD: 'sello-lleno bg-estado-ok text-white',
  A: 'sello bg-estado-ok/10 text-estado-ok',
  B: 'sello bg-estado-tarde/10 text-estado-tarde',
  C: 'sello bg-estado-alerta/10 text-estado-alerta',
}

/** Nivel de logro como chip de color (vacío = guion). */
export function LevelChip({ level, className }: { level: Level | null | undefined; className?: string }) {
  if (!level) return <span className={cn('inline-flex h-7 min-w-9 items-center justify-center rounded-md text-sm text-texto-suave/60', className)}>–</span>
  return (
    <span className={cn('inline-flex h-7 min-w-9 items-center justify-center rounded-md px-1.5 font-slab text-sm font-extrabold tracking-wide', LEVEL_STYLES[level], className)}>
      {level}
    </span>
  )
}

/** Selector compacto de nivel: cuatro botones AD · A · B · C. */
export function LevelPicker({ value, onChange, disabled }: { value: Level | null; onChange: (v: Level | null) => void; disabled?: boolean }) {
  const levels: Level[] = ['AD', 'A', 'B', 'C']
  return (
    <div className="inline-flex gap-1" role="radiogroup">
      {levels.map((l) => (
        <button
          key={l}
          type="button"
          role="radio"
          aria-checked={value === l}
          disabled={disabled}
          onClick={() => onChange(value === l ? null : l)}
          className={cn(
            'h-9 min-w-10 rounded-md border font-slab text-sm font-extrabold transition duration-rapido active:scale-95 disabled:cursor-not-allowed disabled:opacity-60',
            value === l ? cn(LEVEL_STYLES[l], 'border-transparent') : 'border-linea bg-superficie text-texto-suave hover:border-tinta-500',
          )}
        >
          {l}
        </button>
      ))}
    </div>
  )
}
