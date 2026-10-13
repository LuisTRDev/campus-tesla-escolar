import { Component, type ErrorInfo, type ReactNode } from 'react'
import { reportError } from '@/lib/ux'

/**
 * Si una pantalla falla al dibujarse, muestra un mensaje amable en vez de una
 * página en blanco y lo registra en Sistema → Errores.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    reportError(error.message, `${error.stack ?? ''}\n${info.componentStack ?? ''}`)
  }

  render() {
    if (!this.state.error) return this.props.children
    const chunk = /Loading chunk|dynamically imported module|Importing a module script failed/i.test(this.state.error.message)
    return (
      <div className="flex min-h-[70vh] items-center justify-center p-6">
        <div className="max-w-md rounded-2xl border border-linea bg-superficie p-6 text-center">
          <p className="text-4xl" aria-hidden>⚡</p>
          <h1 className="mt-2 font-display text-2xl font-bold">{chunk ? 'Hay una versión nueva del campus' : 'Algo no salió bien'}</h1>
          <p className="mt-2 text-texto-suave">
            {chunk ? 'Recarga la página para usar la última versión.' : 'Ya avisamos al equipo del colegio. Tus datos están a salvo: puedes volver a intentarlo.'}
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <button onClick={() => window.location.reload()} className="rounded-lg bg-tinta px-4 py-2.5 font-semibold text-white">Recargar</button>
            <button onClick={() => { this.setState({ error: null }); window.location.assign('/') }} className="rounded-lg border border-linea px-4 py-2.5 font-semibold">Ir al inicio</button>
          </div>
        </div>
      </div>
    )
  }
}
