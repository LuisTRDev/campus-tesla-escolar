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

export function mount(root: HTMLElement) {
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
