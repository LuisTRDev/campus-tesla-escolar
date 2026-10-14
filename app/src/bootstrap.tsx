import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import '@fontsource-variable/bricolage-grotesque'
import '@fontsource/atkinson-hyperlegible/400.css'
import '@fontsource/atkinson-hyperlegible/700.css'
import './index.css'
import App from './App'
import { AuthProvider } from '@/auth/AuthProvider'
import { ToastProvider } from '@/lib/toast'
import { PreviewProvider } from '@/components/files'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { hasCachedFileMode, loadFileMode } from '@/lib/links'
import { onRefresh } from '@/lib/sync'
import { watchConnection } from '@/lib/perf'

export async function mount(root: HTMLElement) {
  // Modo enlaces o archivos (lo elige la dirección en Sistema → Archivos).
  // La primera vez en el dispositivo se espera a la base (máx. 3 s); después
  // se usa el último valor y se actualiza en segundo plano.
  const mode = loadFileMode().catch(() => false)
  if (!hasCachedFileMode()) await Promise.race([mode, new Promise((r) => setTimeout(r, 3000))])
  onRefresh(() => void loadFileMode().catch(() => undefined))
  watchConnection() // si la red pasa a 3G o se activa el ahorro de datos, se aligera la app

  ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <PreviewProvider>
            <ErrorBoundary>
              <App />
            </ErrorBoundary>
          </PreviewProvider>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  </React.StrictMode>,
  )
}
