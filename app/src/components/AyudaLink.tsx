import { CircleHelp } from 'lucide-react'
import { openHelp } from '@/lib/ayuda'
import { cn } from '@/lib/utils'

/** Botón «¿Cómo se hace?» que abre la ayuda directo en un tema. */
export function AyudaLink({ topic, label = '¿Cómo se hace?', className }: { topic: string; label?: string; className?: string }) {
  return (
    <button
      type="button"
      onClick={() => openHelp(topic)}
      className={cn('inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-sm font-bold text-tinta-500 underline decoration-dotted underline-offset-4 hover:bg-papel print:hidden', className)}
    >
      <CircleHelp className="h-4 w-4 shrink-0" aria-hidden />{label}
    </button>
  )
}
