import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import { CheckCircle2, AlertCircle } from 'lucide-react'
import { haptic } from '@/lib/ux'

type ToastAction = { label: string; onClick: () => void }
type Toast = { id: number; text: string; tone: 'ok' | 'error'; action?: ToastAction }
type Push = (text: string, tone?: 'ok' | 'error', action?: ToastAction) => void
const ToastContext = createContext<Push>(() => undefined)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), [])
  const push = useCallback<Push>((text, tone = 'ok', action) => {
    const id = Date.now() + Math.random()
    setToasts((t) => [...t, { id, text, tone, action }])
    haptic(tone === 'error' ? 'error' : 'light')
    // Con "Deshacer" se deja más tiempo para alcanzar a tocarlo.
    setTimeout(() => dismiss(id), action ? 7000 : tone === 'error' ? 6000 : 3500)
  }, [dismiss])
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-20 z-[70] flex flex-col items-center gap-2 px-4 lg:bottom-6">
        {toasts.map((t) => (
          <div key={t.id} role="status" className="toast-in pointer-events-auto flex max-w-md items-start gap-2 rounded-xl bg-tinta px-4 py-3 text-sm text-white shadow-lg">
            {t.tone === 'ok' ? <CheckCircle2 className="check-pop mt-0.5 h-4 w-4 shrink-0 text-chispa" /> : <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-300" />}
            <span className="flex-1">{t.text}</span>
            {t.action && (
              <button
                onClick={() => { t.action!.onClick(); dismiss(t.id) }}
                className="-my-1 ml-2 rounded-md px-2 py-1 font-bold text-chispa underline-offset-2 hover:underline"
              >
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  return useContext(ToastContext)
}

/**
 * Borra con opción de deshacer: quita el elemento de la pantalla al instante y
 * solo llama al servidor si nadie tocó "Deshacer" en 6 segundos.
 */
export function useUndoableDelete() {
  const toast = useToast()
  return useCallback((opts: { label: string; hide: () => () => void; commit: () => Promise<unknown>; onError?: (err: unknown) => void }) => {
    const restore = opts.hide()
    let undone = false
    const timer = setTimeout(() => {
      if (undone) return
      opts.commit().catch((err) => { restore(); opts.onError?.(err) })
    }, 6000)
    toast(opts.label, 'ok', { label: 'Deshacer', onClick: () => { undone = true; clearTimeout(timer); restore() } })
  }, [toast])
}
