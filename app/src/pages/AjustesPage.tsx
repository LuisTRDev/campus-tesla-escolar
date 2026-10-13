import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Bell, Download, Eye, Keyboard, Moon, Save, Type, Zap } from 'lucide-react'
import { Button, Field, Input, Loading, PageHeader, Panel } from '@/components/ui'
import { Kbd } from '@/components/ux'
import { useAsync } from '@/lib/useAsync'
import { useToast } from '@/lib/toast'
import { toMessage } from '@/lib/errors'
import { isStandaloneApp, useInstallPrompt, useReadingPrefs } from '@/lib/ux'
import { useAuth } from '@/auth/AuthProvider'
import { PUSH_KIND_LABEL, getPrefs, savePrefs, type NotificationPrefs, type PushKind } from '@/services/comunicacion'

function kindsFor(role: string | undefined): PushKind[] {
  switch (role) {
    case 'STUDENT': return ['ASSIGNMENT', 'GRADE', 'TESLA', 'FORUM', 'CHANNEL', 'SURVEY']
    case 'GUARDIAN': return ['ASSIGNMENT', 'GRADE', 'LATE', 'CIRCULAR', 'MESSAGE', 'DIGEST', 'TESLA', 'APPOINTMENT', 'JUSTIFICATION', 'CHANNEL', 'SURVEY']
    case 'TEACHER': return ['MESSAGE', 'FORUM', 'APPOINTMENT', 'JUSTIFICATION', 'SURVEY']
    default: return ['MESSAGE', 'JUSTIFICATION', 'SURVEY']
  }
}

function Toggle({ checked, onChange, label, hint, icon }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string; icon?: ReactNode }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-xl p-2 hover:bg-papel">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-1 h-5 w-5 shrink-0 accent-[#0B1D33]" />
      <span>
        <span className="flex items-center gap-1.5 font-bold">{icon}{label}</span>
        {hint && <span className="block text-sm text-texto-suave">{hint}</span>}
      </span>
    </label>
  )
}

function NotificationPrefsPanel() {
  const { profile } = useAuth()
  const toast = useToast()
  const { data, loading } = useAsync(getPrefs, [], { live: false })
  const [p, setP] = useState<NotificationPrefs | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (data) setP(data) }, [data])
  if (loading || !p) return <Panel title="Avisos"><Loading rows={2} /></Panel>
  const set = (patch: Partial<NotificationPrefs>) => setP((x) => x && { ...x, ...patch })

  async function save() {
    setBusy(true)
    try {
      await savePrefs(p!)
      toast('Preferencias de avisos guardadas.')
    } catch (err) {
      toast(toMessage(err), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Panel title="Avisos en el celular" action={<Link to="/notificaciones" className="text-sm font-bold text-tinta-500 hover:underline">Activar en este dispositivo</Link>}>
      <Toggle checked={p.quiet_enabled} onChange={(v) => set({ quiet_enabled: v })} icon={<Moon className="h-4 w-4" />}
        label="Horario de silencio" hint="Los avisos que lleguen en este horario se entregan al terminar." />
      {p.quiet_enabled && (
        <div className="ml-10 mt-1 grid max-w-xs grid-cols-2 gap-3">
          <Field label="Desde"><Input type="time" value={p.quiet_start} onChange={(e) => set({ quiet_start: e.target.value })} /></Field>
          <Field label="Hasta"><Input type="time" value={p.quiet_end} onChange={(e) => set({ quiet_end: e.target.value })} /></Field>
        </div>
      )}
      <Toggle checked={p.quiet_weekends} onChange={(v) => set({ quiet_weekends: v })} label="Silencio los fines de semana" hint="Sábado y domingo no llegan avisos (salen el lunes)." />
      <p className="mb-1 mt-4 text-sm font-bold">Qué avisos recibir</p>
      <div className="grid gap-1 sm:grid-cols-2">
        {kindsFor(profile?.role).map((k) => (
          <Toggle key={k} checked={!p.muted_kinds.includes(k)} label={PUSH_KIND_LABEL[k]}
            onChange={(on) => set({ muted_kinds: on ? p.muted_kinds.filter((x) => x !== k) : [...p.muted_kinds, k] })} />
        ))}
      </div>
      <div className="mt-4 flex justify-end"><Button onClick={() => void save()} loading={busy}><Save className="h-4 w-4" />Guardar</Button></div>
    </Panel>
  )
}

export default function AjustesPage() {
  const [reading, setReading] = useReadingPrefs()
  const { canInstall, ios, install } = useInstallPrompt()
  const installed = isStandaloneApp()

  return (
    <>
      <PageHeader title="Ajustes" subtitle="Avisos, lectura y la app en tu celular." />
      <div className="grid gap-6 lg:grid-cols-2">
        <NotificationPrefsPanel />
        <div className="space-y-6">
          <Panel title="Lectura y accesibilidad">
            <Toggle checked={reading.largeText} onChange={(v) => setReading({ largeText: v })} icon={<Type className="h-4 w-4" />}
              label="Texto más grande" hint="Agranda todo el campus en este dispositivo." />
            <Toggle checked={reading.highContrast} onChange={(v) => setReading({ highContrast: v })} icon={<Eye className="h-4 w-4" />}
              label="Alto contraste" hint="Textos secundarios y bordes más oscuros." />
            <Toggle checked={reading.reduceMotion} onChange={(v) => setReading({ reduceMotion: v })} icon={<Zap className="h-4 w-4" />}
              label="Menos movimiento" hint="Quita animaciones, fondos animados y transiciones." />
          </Panel>
          <Panel title="App en tu celular">
            {installed ? (
              <p className="text-sm text-texto-suave">Ya estás usando el campus como app. 🎉</p>
            ) : canInstall ? (
              <Button onClick={() => void install()}><Download className="h-4 w-4" />Instalar el Campus Tesla</Button>
            ) : ios ? (
              <p className="text-sm">En el iPhone: abre el campus en Safari, toca <b>Compartir</b> y luego <b>Agregar a inicio</b>.</p>
            ) : (
              <p className="text-sm text-texto-suave">Desde Chrome o Edge, usa el menú del navegador y elige <b>Instalar app</b>.</p>
            )}
            <p className="mt-3 text-sm text-texto-suave">
              <Bell className="mr-1 inline h-4 w-4" />Los materiales que abras quedan guardados para verlos sin conexión.
            </p>
          </Panel>
          <Panel title="Atajos de teclado">
            <p className="flex items-center gap-2 text-sm"><Keyboard className="h-4 w-4" />Presiona <Kbd>?</Kbd> en cualquier pantalla para ver todos los atajos.</p>
          </Panel>
        </div>
      </div>
    </>
  )
}
