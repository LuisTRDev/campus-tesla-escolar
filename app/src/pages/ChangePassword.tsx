import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Field, Input } from '@/components/ui'
import { useAuth } from '@/auth/AuthProvider'
import { supabase } from '@/lib/supabase'
import { toMessage } from '@/lib/errors'
import { useToast } from '@/lib/toast'
import { markStep } from '@/lib/ayuda'

export default function ChangePassword({ forced }: { forced?: boolean }) {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    if (password.length < 8) return setError('Usa al menos 8 caracteres.')
    if (!/\d/.test(password) || !/[A-Za-zÁÉÍÓÚáéíóúñÑ]/.test(password)) return setError('Combina letras y números.')
    if (password !== confirm) return setError('Las contraseñas no coinciden.')
    setBusy(true)
    const { error: updateError } = await supabase.auth.updateUser({ password, data: { must_change_password: false } })
    setBusy(false)
    if (updateError) return setError(toMessage(updateError, 'No se pudo cambiar la contraseña.'))
    if (profile) markStep(profile.id, 'clave')
    toast('Contraseña actualizada.')
    navigate('/', { replace: true })
  }

  return (
    <div className={forced ? 'flex min-h-dvh items-center justify-center px-6 py-10' : ''}>
      <form onSubmit={onSubmit} className="w-full max-w-sm">
        <h1 className="font-display text-3xl font-bold text-texto">{forced ? `Hola, ${profile?.full_name?.split(' ')[0] ?? ''}` : 'Cambiar contraseña'}</h1>
        <p className="mt-2 text-texto-suave">
          {forced ? 'Antes de empezar, crea una contraseña que solo tú conozcas.' : 'Tu nueva contraseña reemplaza a la anterior en todos tus dispositivos.'}
        </p>
        <div className="mt-6 space-y-4">
          <Field label="Nueva contraseña" hint="Mínimo 8 caracteres, con letras y números.">
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" required />
          </Field>
          <Field label="Repite la contraseña">
            <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" required />
          </Field>
        </div>
        {error && <p role="alert" className="mt-4 text-sm font-bold text-estado-alerta">{error}</p>}
        <Button type="submit" loading={busy} className="mt-6 w-full">Guardar contraseña</Button>
        {forced && <button type="button" onClick={() => void signOut()} className="mt-4 w-full text-sm text-texto-suave underline">Salir</button>}
      </form>
    </div>
  )
}
