import { installProductionConsoleGuards } from '@/lib/security'
import { registerServiceWorker } from '@/lib/push'
import archivoUrl from '@fontsource-variable/archivo/files/archivo-latin-wdth-normal.woff2?url'

installProductionConsoleGuards()

// La fuente de titulares (Archivo) se pide ya, en paralelo con la app: evita el salto de letra al abrir.
const preload = Object.assign(document.createElement('link'), { rel: 'preload', as: 'font', type: 'font/woff2', href: archivoUrl, crossOrigin: 'anonymous' })
document.head.appendChild(preload)

const root = document.getElementById('root')!
const missing = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'].filter((k) => !import.meta.env[k])

if (missing.length) {
  // Sin configuración no se puede conectar a Supabase: se explica en pantalla
  // en vez de dejarla en blanco. Ocurre si el build se hizo sin las variables.
  root.innerHTML = `
    <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;font-family:system-ui,sans-serif;background:#F4F6F9;color:#1B2433">
      <div style="max-width:460px;background:#fff;border:1px solid #DCE3EC;border-radius:14px;padding:24px">
        <h1 style="margin:0 0 8px;font-size:22px">Falta configurar el campus</h1>
        <p style="margin:0 0 12px;color:#5B6B82">Este sitio se publicó sin las variables de conexión: <b>${missing.join(', ')}</b>.</p>
        <p style="margin:0;color:#5B6B82;font-size:14px">En Netlify agrégalas en <i>Site configuration → Environment variables</i> y vuelve a publicar con <i>Clear cache and deploy site</i>.</p>
      </div>
    </div>`
} else {
  void registerServiceWorker()
  void import('./bootstrap').then(({ mount }) => mount(root))
}
