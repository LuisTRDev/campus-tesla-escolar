import { useState, type CSSProperties, type FormEvent } from 'react'
import { Button, Field, Input, Segmented } from '@/components/ui'
import { Cinta, Escudo } from '@/components/brand'

const VALORES = ['Disciplina', 'Liderazgo', 'Excelencia']
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
        setError(who === 'familia'
          ? 'Escriba solo el DNI (8 dígitos) o el código que le dio el colegio.'
          : 'Escribe solo el DNI (8 dígitos) o el código que te dio el colegio, por ejemplo A0000024.')
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
      {/* El patio del colegio: techo de vigas rojas, el letrero de la entrada, el escudo y los valores. */}
      <section className="relative flex flex-col overflow-hidden bg-tinta px-6 pb-10 pt-8 text-white sm:px-10 lg:justify-between lg:px-14 lg:py-12">
        <span className="celosia pointer-events-none absolute inset-x-0 top-0 h-48 [mask-image:linear-gradient(black,transparent)] lg:h-72" aria-hidden />
        <span className="franja-v pointer-events-none absolute inset-y-0 right-0 hidden w-3 lg:block" aria-hidden />
        <span className="franja-h pointer-events-none absolute inset-x-0 bottom-0 h-2 lg:hidden" aria-hidden />

        <div className="relative flex items-center justify-between gap-3">
          <span className="letrero text-[13px] sm:text-sm">Bienvenidos</span>
          <p className="text-right text-xs font-bold leading-tight text-white/70">I.E.P. Nikola Tesla<br /><span className="font-normal text-white/50">Nuevo Imperial · Cañete</span></p>
        </div>

        <div className="relative z-10 mt-8 flex items-center gap-5 sm:gap-7 lg:mt-0 lg:flex-col lg:items-start">
          <Escudo variant="completo" className="escudo-in h-32 w-[6.6rem] shrink-0 drop-shadow-[0_10px_18px_rgba(0,0,0,0.45)] sm:h-40 sm:w-[8.2rem] lg:h-60 lg:w-[12.3rem]" />
          <div>
            <h1 className="font-display text-[2.6rem] font-extrabold uppercase leading-[0.92] tracking-tight sm:text-[3.6rem] lg:text-[5rem]">
              Campus<br />Tesla
            </h1>
            <p className="mt-3 max-w-sm leading-relaxed text-white/75 sm:text-lg">
              Tus cursos, tareas y avisos del colegio en un solo lugar. <span className="font-bold text-chispa">Pasión por educar</span>, también en línea.
            </p>
          </div>
        </div>

        <div className="relative z-10 mt-7 flex flex-wrap items-center gap-y-2 text-[13px] sm:text-sm lg:mt-0">
          {VALORES.map((v, i) => (
            <Cinta key={v} tone={i === 1 ? 'roja' : 'blanca'} className="cinta-in" style={{ '--i': i } as CSSProperties}>{v}</Cinta>
          ))}
        </div>
        <p className="relative z-10 hidden text-sm text-white/50 lg:block">¿Olvidaste tu contraseña? Pídela en secretaría o a tu tutor.</p>
      </section>

      <section className="flex items-center justify-center px-6 py-10 sm:px-10">
        <form onSubmit={onSubmit} className="w-full max-w-sm">
          <p className="lema text-[11px] text-rojo">Campus virtual</p>
          <h2 className="mt-1 font-display text-3xl font-bold text-texto">Ingresar</h2>
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
              hint={who === 'personal' ? 'También para dirección y administración.' : who === 'alumno' ? 'Si aún no tienes DNI registrado, usa el código que te dio el colegio (ej. A0000024).' : 'Use el DNI con el que se registró en el colegio.'}
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
          <p className="mt-6 text-sm text-texto-suave lg:hidden">{who === 'familia' ? '¿Olvidó su contraseña? Solicítela en secretaría.' : '¿Olvidaste tu contraseña? Pídela en secretaría o a tu tutor.'}</p>
        </form>
      </section>
    </div>
  )
}
