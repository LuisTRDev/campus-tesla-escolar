import { forwardRef, useEffect, useRef, useState, type ButtonHTMLAttributes, type PointerEvent, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { Loader2, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Illustration, type ArtName } from '@/components/illustrations'

// ---------------------------------------------------------------------------
// Botón
// ---------------------------------------------------------------------------
type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'md' | 'sm'
  loading?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = 'primary', size = 'md', loading, disabled, children, ...props },
  ref,
) {
  const variants = {
    primary: 'bg-tinta text-white hover:bg-tinta-700',
    secondary: 'border border-linea bg-superficie text-texto hover:border-tinta-500',
    ghost: 'text-texto-suave hover:bg-tinta/5 hover:text-texto',
    danger: 'border border-estado-alerta/30 bg-superficie text-estado-alerta hover:bg-estado-alerta/5',
  }
  const sizes = { md: 'min-h-11 px-4 text-sm', sm: 'min-h-9 px-3 text-sm' }
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition-colors active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50',
        variants[variant], sizes[size], className,
      )}
      {...props}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
      {children}
    </button>
  )
})

// ---------------------------------------------------------------------------
// Campos de formulario
// ---------------------------------------------------------------------------
const fieldBase = 'w-full rounded-lg border border-linea bg-superficie px-3 py-2.5 text-[15px] text-texto placeholder:text-texto-suave/70 focus:border-tinta-500 focus:outline-none focus:ring-2 focus:ring-chispa/50'

export function Field({ label, hint, children, className }: { label: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <label className={cn('block', className)}>
      <span className="mb-1.5 block text-sm font-bold text-texto">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-texto-suave">{hint}</span>}
    </label>
  )
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...props }, ref) {
  return <input ref={ref} className={cn(fieldBase, className)} {...props} />
})

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...props }, ref) {
  return <textarea ref={ref} className={cn(fieldBase, 'min-h-28 resize-y leading-relaxed', className)} {...props} />
})

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, ...props }, ref) {
  return <select ref={ref} className={cn(fieldBase, 'pr-8', className)} {...props} />
})

// ---------------------------------------------------------------------------
// Contenedores
// ---------------------------------------------------------------------------
export function Panel({ title, action, children, className, bodyClassName }: {
  title?: ReactNode
  action?: ReactNode
  children: ReactNode
  className?: string
  bodyClassName?: string
}) {
  return (
    <section className={cn('rounded-xl border border-linea bg-superficie', className)}>
      {(title || action) && (
        <header className="flex items-center justify-between gap-3 border-b border-linea px-5 py-3.5">
          {title && <h2 className="font-display text-lg font-semibold text-texto">{title}</h2>}
          {action}
        </header>
      )}
      <div className={cn('p-5', bodyClassName)}>{children}</div>
    </section>
  )
}

export function PageHeader({ title, subtitle, action, accent }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode; accent?: string }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {accent && <div className="mb-3 h-1.5 w-14 rounded-full" style={{ background: accent }} />}
        <h1 className="font-display text-[2rem] font-bold leading-tight tracking-tight text-texto sm:text-[2.4rem]">{title}</h1>
        {subtitle && <p className="mt-1.5 text-[15px] text-texto-suave">{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Estados
// ---------------------------------------------------------------------------
/** Bloque gris con brillo que se desliza: marca dónde aparecerá el contenido. */
export function Skeleton({ className }: { className?: string }) {
  return (
    <span className={cn('relative block overflow-hidden rounded-md bg-linea/60', className)} aria-hidden>
      <span className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-superficie/60 to-transparent" />
    </span>
  )
}

type LoadingShape = 'list' | 'cards' | 'table' | 'page' | 'chat'

/** Esqueleto de carga con la forma aproximada de lo que viene. */
export function Loading({ label = 'Cargando…', shape = 'list', rows = 3 }: { label?: string; shape?: LoadingShape; rows?: number }) {
  return (
    <div role="status" aria-live="polite" className="py-4">
      <span className="sr-only">{label}</span>
      {shape === 'cards' && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: Math.max(rows, 3) }).map((_, i) => (
            <div key={i} className="flex overflow-hidden rounded-2xl border border-linea bg-superficie">
              <Skeleton className="h-32 w-20 rounded-none" />
              <div className="flex-1 space-y-2.5 p-4"><Skeleton className="h-5 w-3/4" /><Skeleton className="h-4 w-1/2" /><Skeleton className="mt-4 h-4 w-2/3" /></div>
            </div>
          ))}
        </div>
      )}
      {shape === 'table' && (
        <div className="space-y-2">
          <Skeleton className="h-9 w-full" />
          {Array.from({ length: rows + 3 }).map((_, i) => <Skeleton key={i} className="h-8 w-full opacity-70" />)}
        </div>
      )}
      {shape === 'page' && (
        <div className="space-y-6">
          <div className="space-y-2"><Skeleton className="h-9 w-2/3 max-w-md" /><Skeleton className="h-4 w-1/3 max-w-xs" /></div>
          <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
            <div className="space-y-3 rounded-xl border border-linea bg-superficie p-5">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
            <div className="space-y-3 rounded-xl border border-linea bg-superficie p-5">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          </div>
        </div>
      )}
      {shape === 'chat' && (
        <div className="space-y-3 px-2">
          {[60, 45, 70, 35].map((w, i) => (
            <div key={i} className={cn('flex', i % 2 ? 'justify-end' : 'justify-start')}>
              <span style={{ width: `${w}%` }}><Skeleton className="h-12 rounded-2xl" /></span>
            </div>
          ))}
        </div>
      )}
      {shape === 'list' && (
        <div className="space-y-4">
          {Array.from({ length: rows }).map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="h-10 w-1.5 rounded-full" />
              <div className="flex-1 space-y-2"><Skeleton className="h-3 w-24" /><Skeleton className="h-4 w-3/4" /></div>
              <Skeleton className="h-6 w-16" />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="rounded-xl border border-estado-alerta/30 bg-estado-alerta/5 px-4 py-3 text-sm text-estado-alerta">
      <p>{message}</p>
      {onRetry && <button onClick={onRetry} className="mt-1 font-bold underline">Reintentar</button>}
    </div>
  )
}

/** Pantalla vacía con ilustración del colegio. `icon` se acepta por compatibilidad. */
export function Empty({ title, children, art = 'coil', compact }: { title: string; children?: ReactNode; icon?: ReactNode; art?: ArtName; compact?: boolean }) {
  return (
    <div className={cn('flex flex-col items-center gap-1 rounded-2xl border border-dashed border-linea text-center', compact ? 'px-4 py-5' : 'px-6 py-10')}>
      <Illustration name={art} className={compact ? 'mb-1 h-16 w-16' : 'mb-2 h-28 w-28'} />
      <p className="font-display text-lg font-semibold text-texto">{title}</p>
      {children && <div className="max-w-sm text-sm text-texto-suave">{children}</div>}
    </div>
  )
}

export function Badge({ tone = 'neutral', children, className }: { tone?: 'neutral' | 'ok' | 'late' | 'alert' | 'info' | 'spark'; children: ReactNode; className?: string }) {
  const tones = {
    neutral: 'bg-papel text-texto-suave',
    ok: 'bg-estado-ok/10 text-estado-ok',
    late: 'bg-estado-tarde/10 text-estado-tarde',
    alert: 'bg-estado-alerta/10 text-estado-alerta',
    info: 'bg-estado-info/10 text-estado-info',
    spark: 'bg-chispa-100 text-tinta',
  }
  return <span className={cn('inline-flex items-center gap-1 whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-bold', tones[tone], className)}>{children}</span>
}

// ---------------------------------------------------------------------------
// Modal: ventana centrada en escritorio; en el celular, panel que sube desde
// abajo y se cierra deslizándolo hacia abajo. Usa <dialog> (accesible, Escape).
// ---------------------------------------------------------------------------
const MOBILE_QUERY = '(max-width: 639px)'

export function useIsMobile() {
  const [mobile, setMobile] = useState(() => typeof window !== 'undefined' && window.matchMedia(MOBILE_QUERY).matches)
  useEffect(() => {
    const m = window.matchMedia(MOBILE_QUERY)
    const on = () => setMobile(m.matches)
    m.addEventListener('change', on)
    return () => m.removeEventListener('change', on)
  }, [])
  return mobile
}

/** Arrastrar hacia abajo para cerrar (paneles inferiores en el celular). */
export function useSwipeDown(onClose: () => void, enabled = true) {
  const drag = useRef<{ startY: number; dy: number } | null>(null)
  const [dy, setDy] = useState(0)
  const handlers = {
    onPointerDown: (e: PointerEvent<HTMLElement>) => {
      if (!enabled) return
      drag.current = { startY: e.clientY, dy: 0 }
      e.currentTarget.setPointerCapture(e.pointerId)
    },
    onPointerMove: (e: PointerEvent<HTMLElement>) => {
      if (!drag.current) return
      drag.current.dy = Math.max(0, e.clientY - drag.current.startY)
      setDy(drag.current.dy)
    },
    onPointerUp: () => {
      if (!drag.current) return
      const close = drag.current.dy > 110
      drag.current = null
      setDy(0)
      if (close) onClose()
    },
  }
  return { dy, handlers: { ...handlers, onPointerCancel: handlers.onPointerUp } }
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null)
  const mobile = useIsMobile()
  const { dy, handlers } = useSwipeDown(onClose, mobile)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={(e) => { e.preventDefault(); onClose() }}
      onClick={(e) => { if (e.target === ref.current) onClose() }}
      style={dy ? { transform: `translateY(${dy}px)` } : undefined}
      className={cn(
        'border border-linea bg-superficie p-0 text-texto backdrop:bg-tinta/50',
        mobile
          ? 'sheet-in mb-0 mt-auto w-full max-w-none rounded-t-2xl border-b-0'
          : cn('modal-in m-auto w-[calc(100%-1.5rem)] rounded-xl', wide ? 'max-w-3xl' : 'max-w-lg'),
      )}
    >
      {open && (
        <div className={cn('flex flex-col', mobile ? 'max-h-[92dvh]' : 'max-h-[88vh]')}>
          <header className={cn('flex items-start justify-between gap-3 border-b border-linea px-5', mobile ? 'cursor-grab touch-none pb-3 pt-2' : 'py-4')} {...handlers}>
            <div className="min-w-0 flex-1">
              {mobile && <span className="mx-auto mb-2 block h-1.5 w-10 rounded-full bg-linea" aria-hidden />}
              <h2 className="font-display text-xl font-semibold">{title}</h2>
            </div>
            <button onClick={onClose} onPointerDown={(e) => e.stopPropagation()} className="rounded-md p-2 text-texto-suave hover:bg-papel" aria-label="Cerrar">
              <X className="h-5 w-5" />
            </button>
          </header>
          <div className="overflow-y-auto overscroll-contain px-5 py-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">{children}</div>
        </div>
      )}
    </dialog>
  )
}

export function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[] }) {
  return (
    <div role="tablist" className="inline-flex rounded-lg border border-linea bg-superficie p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn('min-h-9 rounded-md px-3 text-sm font-bold transition-colors', value === o.value ? 'bg-tinta text-white' : 'text-texto-suave hover:text-texto')}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
