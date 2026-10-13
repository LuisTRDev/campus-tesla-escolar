import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bell, BellOff, BellRing, Share, Smartphone, X } from 'lucide-react'
import { useAuth } from '@/auth/AuthProvider'
import { Button, Loading, PageHeader, Panel } from '@/components/ui'
import { useToast } from '@/lib/toast'
import { toMessage } from '@/lib/errors'
import { disablePush, enablePush, isIos, pushStatus, sendTestPush, type PushStatus } from '@/lib/push'

const DISMISS_KEY = 'campus_push_prompt_dismissed'

function usePushStatus() {
  const [status, setStatus] = useState<PushStatus | null>(null)
  const refresh = () => { void pushStatus().then(setStatus).catch(() => setStatus('unsupported')) }
  useEffect(refresh, [])
  return { status, refresh }
}

function whatYouGet(role: string | undefined): string[] {
  switch (role) {
    case 'GUARDIAN': return ['Tardanzas registradas en la puerta del colegio', 'Comunicados nuevos y autorizaciones', 'Tareas nuevas y notas publicadas', 'Mensajes de los docentes', 'El resumen de la semana cada viernes']
    case 'STUDENT': return ['Tareas nuevas', 'Notas publicadas']
    case 'TEACHER': return ['Mensajes de las familias (solo en tu horario de atención)']
    default: return ['Mensajes de las familias']
  }
}

/** Instrucciones para instalar la app en iPhone (requisito para recibir avisos). */
function IosInstallSteps() {
  return (
    <ol className="list-decimal space-y-2 pl-5 text-sm">
      <li>Abre el campus en <b>Safari</b>.</li>
      <li>Toca el botón <b>Compartir</b> <Share className="inline h-4 w-4" /> en la barra de abajo.</li>
      <li>Elige <b>“Agregar a inicio”</b> y confirma.</li>
      <li>Abre el campus desde el ícono nuevo en tu pantalla de inicio y vuelve a esta página.</li>
    </ol>
  )
}

export default function NotificationsPage() {
  const { profile } = useAuth()
  const toast = useToast()
  const { status, refresh } = usePushStatus()
  const [busy, setBusy] = useState(false)

  async function run(action: () => Promise<void>, ok: string) {
    setBusy(true)
    try {
      await action()
      toast(ok)
    } catch (err) {
      toast(toMessage(err), 'error')
    } finally {
      setBusy(false)
      refresh()
    }
  }

  return (
    <>
      <PageHeader title="Notificaciones" subtitle="Avisos en este celular o computadora, aunque el campus esté cerrado." />
      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <Panel title="Este dispositivo">
          {status === null ? <Loading /> : (
            <div className="space-y-4">
              {status === 'on' && (
                <>
                  <p className="flex items-center gap-2 font-bold text-estado-ok"><BellRing className="h-5 w-5" />Activadas en este dispositivo</p>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="secondary" loading={busy} onClick={() => void run(sendTestPush, 'Enviamos un aviso de prueba. Debería llegar en unos segundos.')}>Enviar prueba</Button>
                    <Button variant="ghost" disabled={busy} onClick={() => void run(disablePush, 'Notificaciones desactivadas en este dispositivo.')}><BellOff className="h-4 w-4" />Desactivar</Button>
                  </div>
                </>
              )}
              {status === 'off' && (
                <>
                  <p className="text-texto-suave">Las notificaciones están apagadas en este dispositivo.</p>
                  <Button loading={busy} onClick={() => void run(enablePush, 'Notificaciones activadas.')}><Bell className="h-4 w-4" />Activar notificaciones</Button>
                </>
              )}
              {status === 'needs-install' && (
                <>
                  <p className="flex items-center gap-2 font-bold"><Smartphone className="h-5 w-5" />En iPhone primero instala el campus</p>
                  <IosInstallSteps />
                </>
              )}
              {status === 'denied' && (
                <p className="text-sm">
                  Bloqueaste las notificaciones para este sitio. Para activarlas, abre la configuración del navegador
                  {isIos() ? ' (Configuración › Notificaciones › Campus Tesla)' : ' (ícono del candado junto a la dirección › Notificaciones › Permitir)'} y vuelve aquí.
                </p>
              )}
              {status === 'unsupported' && <p className="text-sm text-texto-suave">Este navegador no admite notificaciones. Prueba con Chrome, Edge o Firefox actualizados.</p>}
              {status === 'not-configured' && <p className="text-sm text-texto-suave">El colegio todavía no terminó de configurar las notificaciones.</p>}
            </div>
          )}
        </Panel>
        <Panel title="Qué te avisaremos">
          <ul className="space-y-2 text-sm">
            {whatYouGet(profile?.role).map((t) => <li key={t} className="flex gap-2"><Bell className="mt-0.5 h-4 w-4 shrink-0 text-chispa-600" />{t}</li>)}
          </ul>
          <p className="mt-4 text-xs text-texto-suave">Actívalas en cada celular o computadora donde quieras recibirlas. Al cerrar sesión, el dispositivo deja de recibirlas.</p>
        </Panel>
      </div>
    </>
  )
}

/** Tarjeta para el inicio: invita a activar las notificaciones una sola vez. */
export function PushPrompt() {
  const { status } = usePushStatus()
  const [hidden, setHidden] = useState(() => {
    try { return localStorage.getItem(DISMISS_KEY) === '1' } catch { return false }
  })
  if (hidden || !status || !['off', 'needs-install'].includes(status)) return null
  return (
    <div className="mb-6 flex items-start gap-3 rounded-xl bg-tinta px-5 py-4 text-white">
      <BellRing className="mt-0.5 h-5 w-5 shrink-0 text-chispa" />
      <div className="flex-1 text-sm">
        <p className="font-bold">{status === 'needs-install' ? 'Instala el campus para recibir avisos' : 'Recibe los avisos del colegio en tu celular'}</p>
        <p className="text-white/75">Tardanzas, comunicados, notas y mensajes al instante.</p>
        <Link to="/notificaciones" className="mt-2 inline-block font-bold text-chispa underline">{status === 'needs-install' ? 'Ver cómo' : 'Activar'}</Link>
      </div>
      <button
        onClick={() => { setHidden(true); try { localStorage.setItem(DISMISS_KEY, '1') } catch { /* sin almacenamiento */ } }}
        className="rounded p-1 text-white/60 hover:text-white"
        aria-label="Ocultar"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}
