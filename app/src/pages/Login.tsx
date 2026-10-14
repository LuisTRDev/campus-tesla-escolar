import { useState, type FormEvent } from 'react'
import { Button, Field, Input, Segmented } from '@/components/ui'
import { LOGIN_DOMAIN, supabase } from '@/lib/supabase'
import { toMessage } from '@/lib/errors'
import { cleanSingleLine } from '@/lib/security'

type Who = 'alumno' | 'familia' | 'personal'

export default function Login({ notice }: { notice?: string }) {
  const [who, setWho] = useState<Who>('alumno')
  const [user, setUser] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    let id = cleanSingleLine(user, 120)
    let email = id.toLowerCase()
    if (who !== 'personal') {
      // Tolera que peguen el correo interno completo (alumno.a0000024@campus…) o pongan espacios y guiones.
      id = id.split('@')[0].replace(/^(alumno|familia)\./i, '').replace(/[\s.-]/g, '')
      if (!/^[A-Za-z0-9]{8,12}$/.test(id)) {
        setError('Escribe solo el DNI (8 dígitos) o el código que te dio el colegio, por ejemplo A0000024.')
        return
      }
      email = `${who}.${id.toLowerCase()}@${LOGIN_DOMAIN}`
    } else if (!email.includes('@')) {
      setError('Escribe tu correo institucional.')
      return
    }
    setBusy(true)
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password })
    setBusy(false)
    if (authError) setError(toMessage(authError, 'No se pudo iniciar sesión.'))
  }

  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      <section className="relative flex flex-col justify-between overflow-hidden bg-tinta px-6 py-8 text-white sm:px-10 lg:px-14 lg:py-12">
        <div className="flex items-center gap-3">
          <img src="/images/logo-nikola-tesla.png" alt="" className="h-11 w-11 rounded-lg bg-white object-contain p-1" />
          <p className="text-sm font-bold text-white/80">I.E.P. Nikola Tesla</p>
        </div>
        <div className="relative z-10 py-10 lg:py-0">
          <h1 className="font-display text-[3.2rem] font-bold leading-[0.95] tracking-tight sm:text-[4.5rem] lg:text-[5.5rem]">
            Campus<br />Tesla
          </h1>
          <p className="mt-5 max-w-sm text-lg leading-relaxed text-white/75">
            Tus cursos, tareas y avisos del colegio en un solo lugar.
          </p>
        </div>
        <div className="login-coils pointer-events-none absolute -right-24 -top-10 hidden h-[34rem] w-[34rem] lg:block" aria-hidden />
        <p className="relative z-10 hidden text-sm text-white/50 lg:block">¿Olvidaste tu contraseña? Pídela en secretaría o a tu tutor.</p>
      </section>

      <section className="flex items-center justify-center px-6 py-10 sm:px-10">
        <form onSubmit={onSubmit} className="w-full max-w-sm">
          <h2 className="font-display text-3xl font-bold text-texto">Ingresar</h2>
          <p className="mt-1 text-texto-suave">Elige quién eres para continuar.</p>

          {notice && <p className="mt-5 rounded-lg bg-chispa-100 px-4 py-3 text-sm text-tinta">{notice}</p>}

          <div className="mt-6">
            <Segmented<Who>
              value={who}
              onChange={(v) => { setWho(v); setUser(''); setError('') }}
              options={[
                { value: 'alumno', label: 'Alumno' },
                { value: 'familia', label: 'Familia' },
                { value: 'personal', label: 'Docente' },
              ]}
            />
          </div>

          <div className="mt-6 space-y-4">
            <Field
              label={who === 'personal' ? 'Correo' : who === 'alumno' ? 'DNI o código del alumno' : 'DNI del padre, madre o apoderado'}
              hint={who === 'personal' ? 'También para dirección y administración.' : who === 'alumno' ? 'Si aún no tienes DNI registrado, usa el código que te dio el colegio (ej. A0000024).' : undefined}
            >
              <Input
                value={user}
                onChange={(e) => setUser(e.target.value)}
                inputMode={who === 'personal' ? 'email' : 'text'}
                autoComplete="username"
                placeholder={who === 'personal' ? 'nombre@colegio.edu.pe' : '12345678'}
                required
              />
            </Field>
            <Field label="Contraseña">
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
            </Field>
          </div>

          {error && <p role="alert" className="mt-4 text-sm font-bold text-estado-alerta">{error}</p>}

          <Button type="submit" loading={busy} className="mt-6 w-full">Ingresar</Button>
          <p className="mt-6 text-sm text-texto-suave lg:hidden">¿Olvidaste tu contraseña? Pídela en secretaría o a tu tutor.</p>
        </form>
      </section>
    </div>
  )
}
