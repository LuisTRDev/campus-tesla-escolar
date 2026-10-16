import { Component, type ErrorInfo, type ReactNode } from 'react'
import { reportError } from '@/lib/ux'
import { Escudo } from '@/components/brand'

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
        <div className="relative max-w-md overflow-hidden rounded-2xl border border-linea bg-superficie p-6 pb-8 text-center">
          <span className="franja-h absolute inset-x-0 bottom-0 h-[6px]" aria-hidden />
          <Escudo className="mx-auto h-16 w-14" />
          <p className="lema mt-3 text-[11px] text-rojo">{chunk ? 'Actualización' : 'Un tropiezo'}</p>
          <h1 className="mt-1 font-display text-2xl font-bold">{chunk ? 'Hay una versión nueva del campus' : 'Algo no salió bien'}</h1>
          <p className="mt-2 text-texto-suave">
            {chunk ? 'Recarga la página para usar la última versión.' : 'Ya avisamos al equipo del colegio. Tus datos están a salvo: puedes volver a intentarlo.'}
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <button onClick={() => window.location.reload()} className="btn-parche rounded-lg bg-tinta px-4 py-2.5 font-bold text-white">Recargar</button>
            <button onClick={() => { this.setState({ error: null }); window.location.assign('/') }} className="rounded-lg border border-linea px-4 py-2.5 font-bold">Ir al inicio</button>
          </div>
        </div>
      </div>
    )
  }
}
