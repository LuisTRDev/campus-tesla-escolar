import { useState, type ReactNode } from 'react'
import {
  ClipboardCopy, Clock, Copy, Eye, EyeOff, FileSearch, Fingerprint, KeyRound, Keyboard, Link2, ListOrdered, Maximize,
  MonitorSmartphone, PanelsLeftRight, Shuffle, Sparkles, Split, Timer, Users, WifiOff, Zap, type LucideIcon,
} from 'lucide-react'
import { Escudo } from '@/components/brand'
import { StatTile } from '@/components/charts'
import { Badge, ErrorBox, Loading, PageHeader, Segmented } from '@/components/ui'
import { useAsync } from '@/lib/useAsync'
import { duration } from '@/lib/integrity'
import { formatShort, formatTime } from '@/lib/format'
import { cn } from '@/lib/utils'
import { integrityOverview, type IntegrityOverview } from '@/services/integridad'
import { Laboratorio } from '@/pages/integridad/Laboratorio'

type Lab = 'examen' | 'escritura' | 'similitud'
type Capa = 'acceso' | 'monitoreo' | 'analisis' | 'originalidad'

type Sistema = {
  capa: Capa
  icon: LucideIcon
  nombre: string
  que: string
  /** Siempre activo, o cuántas evaluaciones lo tienen encendido. */
  estado: (o: IntegrityOverview | null) => { on: boolean; texto: string }
  /** Lo que hizo en el periodo (null si no aplica). */
  dato?: (o: IntegrityOverview) => string | null
  lab?: Lab
}

const plural = (n: number, uno: string, varios: string) => `${n.toLocaleString('es-PE')} ${n === 1 ? uno : varios}`
const siempre = () => ({ on: true, texto: 'Siempre activo' })
const enEvaluaciones = (k: keyof IntegrityOverview['quizzes']) => (o: IntegrityOverview | null) => {
  if (!o) return { on: true, texto: 'Se activa por evaluación' }
  const n = o.quizzes[k]
  return n ? { on: true, texto: `Activo en ${plural(n, 'evaluación', 'evaluaciones')}` } : { on: false, texto: 'Listo · se activa al configurar una evaluación' }
}
const detecto = (n: number, uno: string, varios: string) => (n ? `Detectó ${plural(n, uno, varios)}` : `Sin ${varios} en el periodo`)

const SISTEMAS: Sistema[] = [
  // Antes de empezar
  { capa: 'acceso', icon: KeyRound, nombre: 'Código de acceso', que: 'Solo entra quien recibe el código del docente en el aula.', estado: enEvaluaciones('with_code') },
  { capa: 'acceso', icon: MonitorSmartphone, nombre: 'Un solo dispositivo', que: 'El intento queda atado al celular o computadora donde se empezó; el docente puede liberarlo.', estado: enEvaluaciones('lock_device'), dato: (o) => (o.attempts.devices ? `Bloqueó ${plural(o.attempts.devices, 'intento', 'intentos')} de seguir en otro equipo` : 'Nadie intentó cambiar de equipo') },
  { capa: 'acceso', icon: Timer, nombre: 'Tiempo y hora límite', que: 'Cuenta regresiva y hora máxima para empezar; al terminar el tiempo se envía sola.', estado: enEvaluaciones('time_limit') },
  { capa: 'acceso', icon: Shuffle, nombre: 'Preguntas y opciones al azar', que: 'Cada alumno ve otro orden; con un banco, cada uno recibe preguntas distintas.', estado: (o) => (o ? (o.quizzes.shuffle || o.quizzes.pick ? { on: true, texto: `Activo en ${plural(o.quizzes.shuffle + o.quizzes.pick, 'evaluación', 'evaluaciones')}` } : { on: false, texto: 'Listo · se activa al configurar una evaluación' }) : { on: true, texto: 'Se activa por evaluación' }) },
  { capa: 'acceso', icon: EyeOff, nombre: 'Respuestas ocultas hasta el cierre', que: 'Las respuestas correctas no salen del servidor hasta que la evaluación cierra: no se pueden pasar.', estado: siempre },

  // Durante el examen
  { capa: 'monitoreo', icon: Eye, nombre: 'Detección de salidas', que: 'Registra cuando el alumno cambia de app, de pestaña o apaga la pantalla, y cuánto tiempo estuvo fuera.', estado: siempre, dato: (o) => (o.attempts.leaves ? `${detecto(o.attempts.leaves, 'salida', 'salidas')} · ${duration(o.attempts.leave_ms)} fuera en total` : detecto(0, 'salida', 'salidas')), lab: 'examen' },
  { capa: 'monitoreo', icon: Zap, nombre: 'Envío automático al salir', que: 'Si sale más veces de las permitidas, la evaluación se envía sola con lo respondido.', estado: enEvaluaciones('close_on_leave'), dato: (o) => (o.attempts.auto_closed ? `Envió solas ${plural(o.attempts.auto_closed, 'evaluación', 'evaluaciones')}` : 'Ninguna se envió sola'), lab: 'examen' },
  { capa: 'monitoreo', icon: ClipboardCopy, nombre: 'Bloqueo y registro de pegado', que: 'Registra cada texto pegado y su largo; en modo estricto no deja pegar.', estado: siempre, dato: (o) => detecto(o.attempts.pastes, 'pegado', 'pegados'), lab: 'examen' },
  { capa: 'monitoreo', icon: Copy, nombre: 'Bloqueo de copia y clic derecho', que: 'Impide copiar las preguntas para pasarlas o buscarlas.', estado: siempre, dato: (o) => detecto(o.attempts.copies, 'intento de copia', 'intentos de copia'), lab: 'examen' },
  { capa: 'monitoreo', icon: Maximize, nombre: 'Pantalla completa', que: 'Abre el examen a pantalla completa y avisa si el alumno sale de ella.', estado: enEvaluaciones('fullscreen'), dato: (o) => detecto(o.attempts.fs_exits, 'salida de pantalla completa', 'salidas de pantalla completa'), lab: 'examen' },
  { capa: 'monitoreo', icon: PanelsLeftRight, nombre: 'Pantalla dividida', que: 'Detecta si se achica la ventana para tener otra cosa al lado (girar el celular no cuenta).', estado: siempre, dato: (o) => detecto(o.attempts.resizes, 'pantalla dividida', 'pantallas divididas'), lab: 'examen' },
  { capa: 'monitoreo', icon: Split, nombre: 'Otra pestaña con el mismo examen', que: 'Avisa si el mismo intento está abierto en dos pestañas a la vez.', estado: siempre, dato: (o) => detecto(o.attempts.multitab, 'examen en dos pestañas', 'exámenes en dos pestañas'), lab: 'examen' },
  { capa: 'monitoreo', icon: ListOrdered, nombre: 'Una pregunta a la vez', que: 'El alumno solo recibe la pregunta actual y no puede volver atrás.', estado: enEvaluaciones('sequential') },
  { capa: 'monitoreo', icon: Fingerprint, nombre: 'Marca de agua', que: 'El nombre del alumno aparece de fondo: una foto del examen delata quién la tomó.', estado: enEvaluaciones('watermark'), lab: 'examen' },
  { capa: 'monitoreo', icon: WifiOff, nombre: 'Registro sin conexión', que: 'Lo detectado se guarda en el equipo y se envía al volver internet: apagar el wifi no borra nada.', estado: siempre, dato: (o) => detecto(o.attempts.offline, 'desconexión', 'desconexiones'), lab: 'examen' },

  // Después: análisis de la evaluación
  { capa: 'analisis', icon: Users, nombre: 'Errores idénticos entre alumnos', que: 'Compara cada par de alumnos: muchas respuestas incorrectas iguales indican que se pasaron las respuestas.', estado: siempre },
  { capa: 'analisis', icon: FileSearch, nombre: 'Desarrollos casi iguales', que: 'Las respuestas abiertas se comparan entre todos los alumnos de la evaluación.', estado: siempre, lab: 'similitud' },
  { capa: 'analisis', icon: Clock, nombre: 'Aciertos demasiado rápidos', que: 'Marca preguntas acertadas en menos de 3 segundos o exámenes terminados muy rápido.', estado: siempre },
  { capa: 'analisis', icon: Sparkles, nombre: 'Saltos de nota', que: 'Avisa si la nota está muy por encima del promedio del alumno en el curso.', estado: siempre },

  // Tareas escritas
  { capa: 'originalidad', icon: Fingerprint, nombre: 'Huella digital del texto', que: 'Cada entrega se compara con todas las del colegio, también de años anteriores.', estado: siempre, dato: (o) => `${plural(o.submissions.analyzed, 'entrega analizada', 'entregas analizadas')}`, lab: 'similitud' },
  { capa: 'originalidad', icon: Link2, nombre: 'Enlaces repetidos', que: 'Detecta si dos alumnos entregan el mismo archivo de Drive o Docs.', estado: siempre },
  { capa: 'originalidad', icon: Keyboard, nombre: 'Tecleado frente a pegado', que: 'Mide cuánto del texto se escribió y cuánto se pegó, y a qué velocidad.', estado: siempre, dato: (o) => (o.submissions.writing_logged ? `${plural(o.submissions.writing_logged, 'entrega medida', 'entregas medidas')} · ${plural(o.submissions.mostly_pasted, 'casi todo pegado', 'casi todo pegadas')}` : 'Aún sin entregas medidas'), lab: 'escritura' },
  { capa: 'originalidad', icon: Sparkles, nombre: 'Indicios de IA', que: 'Frases de chatbot, caracteres invisibles, formato de chat y cambios bruscos de estilo frente a sus entregas anteriores.', estado: siempre, lab: 'escritura' },
]

const CAPAS: { key: Capa; titulo: string; sub: string }[] = [
  { key: 'acceso', titulo: 'Antes de empezar', sub: 'Quién entra y qué ve cada alumno' },
  { key: 'monitoreo', titulo: 'Durante el examen', sub: 'Lo que se detecta en el celular o la computadora' },
  { key: 'analisis', titulo: 'Al corregir', sub: 'Lo que el servidor compara entre alumnos' },
  { key: 'originalidad', titulo: 'Tareas escritas', sub: 'Originalidad de cada entrega' },
]

const DIAS = { '7': 7, '30': 30, '90': 90 } as const

export default function AntitrampaPage() {
  const [dias, setDias] = useState<keyof typeof DIAS>('30')
  const [lab, setLab] = useState<Lab>('examen')
  const { data, loading, error, reload } = useAsync(() => integrityOverview(DIAS[dias]), [dias])
  const o = data ?? null

  // Todos los sistemas están listos; los que dependen de la configuración de cada evaluación
  // cuentan como "en uso" solo si alguna los tiene encendidos.
  const siempreActivos = SISTEMAS.filter((s) => s.estado(null).texto === 'Siempre activo').length
  const porEvaluacion = SISTEMAS.length - siempreActivos
  const enUso = SISTEMAS.filter((s) => s.estado(o).texto !== 'Siempre activo' && s.estado(o).on).length
  const probar = (l: Lab) => {
    setLab(l)
    document.getElementById('laboratorio')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <>
      <PageHeader
        title="Sistema anti-trampa"
        subtitle={o?.scope === 'MINE' ? 'Cómo se cuidan tus evaluaciones y tareas.' : 'Cómo el campus cuida la honestidad en evaluaciones y tareas de todo el colegio.'}
        action={<Segmented value={dias} onChange={setDias} options={[{ value: '7', label: '7 días' }, { value: '30', label: '30 días' }, { value: '90', label: '90 días' }]} />}
      />

      {/* Estado general */}
      <section className="relative mb-6 overflow-hidden rounded-2xl bg-[#102442] p-5 text-white sm:p-6">
        <span className="celosia pointer-events-none absolute inset-0 opacity-60" aria-hidden />
        <span className="franja-h absolute inset-x-0 bottom-0 h-[6px]" aria-hidden />
        <div className="relative flex flex-wrap items-center gap-5">
          <span className="relative flex h-20 w-[4.4rem] shrink-0 items-center justify-center">
            <span className="radar absolute inset-[-14px] rounded-full" aria-hidden />
            <Escudo className="relative h-20 w-[4.4rem] drop-shadow-[0_6px_12px_rgba(0,0,0,0.4)]" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="lema flex items-center gap-2 text-[11px] text-chispa"><span className="rec-dot h-2 w-2 rounded-full bg-[#40c480]" aria-hidden />Protección activa</p>
            <p className="font-display text-2xl font-bold sm:text-3xl"><span className="cifras">{SISTEMAS.length}</span> sistemas listos y funcionando</p>
            <p className="mt-1 text-sm text-white/85">
              {siempreActivos} siempre activos · {o ? `${enUso} de ${porEvaluacion}` : porEvaluacion} que se eligen en cada evaluación{o ? ' están en uso' : ''}.
            </p>
            <p className="mt-0.5 text-sm text-white/65">
              {o?.attempts.last_event
                ? `Última detección: ${formatShort(o.attempts.last_event)} a las ${formatTime(o.attempts.last_event)}.`
                : o ? 'Sin detecciones en el periodo.' : 'Los detectores funcionan en cada evaluación y tarea.'}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => probar('examen')} className="btn-accion inline-flex min-h-11 items-center gap-2 rounded-lg bg-rojo px-4 text-sm font-bold text-white"><Zap className="h-4 w-4" />Probar en vivo</button>
          </div>
        </div>
      </section>

      {error && <div className="mb-6"><ErrorBox message={error} onRetry={() => void reload()} /></div>}
      {loading ? <Loading shape="cards" rows={4} /> : !o ? (
        <p className="mb-6 rounded-xl border border-dashed border-linea bg-superficie px-4 py-3 text-sm text-texto-suave">
          Los sistemas ya funcionan. Para ver cuántas veces actuó cada uno, ejecuta el script <b>campus_24_panel_antitrampa.sql</b> en Supabase.
        </p>
      ) : (
        <div className="mb-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatTile label="Evaluaciones protegidas" value={o.quizzes.total.toLocaleString('es-PE')} detail={`${o.quizzes.strict} estrictas · ${o.quizzes.standard} estándar`} />
          <StatTile label="Intentos monitoreados" value={o.attempts.total.toLocaleString('es-PE')} detail={`${o.attempts.with_events} con algún evento · ${o.attempts.events} eventos`} />
          <StatTile label="Salidas detectadas" value={o.attempts.leaves.toLocaleString('es-PE')} detail={o.attempts.leave_ms ? `${duration(o.attempts.leave_ms)} fuera en total` : 'Nadie salió del examen'} tone={o.attempts.leaves ? 'warning' : null} />
          <StatTile label="Pegados detectados" value={o.attempts.pastes.toLocaleString('es-PE')} detail={`${o.attempts.copies} intentos de copiar`} tone={o.attempts.pastes ? 'warning' : null} />
          <StatTile label="Envíos automáticos" value={o.attempts.auto_closed.toLocaleString('es-PE')} detail="Por salir más de lo permitido" tone={o.attempts.auto_closed ? 'critical' : null} />
          <StatTile label="Otro dispositivo" value={o.attempts.devices.toLocaleString('es-PE')} detail={`${o.attempts.resumes} reaperturas del examen`} tone={o.attempts.devices ? 'critical' : null} />
          <StatTile label="Entregas analizadas" value={o.submissions.analyzed.toLocaleString('es-PE')} detail={`${o.submissions.mostly_pasted} con el texto casi todo pegado`} tone={o.submissions.mostly_pasted ? 'warning' : null} />
          <StatTile label="Alertas revisadas" value={(o.reviews.reviewed + o.reviews.false_positive + o.reviews.confirmed).toLocaleString('es-PE')} detail={`${o.reviews.confirmed} confirmadas · ${o.reviews.false_positive} falsas alarmas`} />
        </div>
      )}

      {/* Los sistemas, por capas */}
      <div className="mb-10 grid gap-6 lg:grid-cols-2">
        {CAPAS.map((c, ci) => (
          <section key={c.key} className="overflow-hidden rounded-2xl border border-linea bg-superficie">
            <header className="flex items-center gap-3 border-b border-linea px-5 py-3.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#102442] font-slab text-sm font-extrabold text-chispa">{ci + 1}</span>
              <div>
                <h2 className="font-display text-lg font-semibold leading-tight">{c.titulo}</h2>
                <p className="text-xs text-texto-suave">{c.sub}</p>
              </div>
            </header>
            <ul className="divide-y divide-linea">
              {SISTEMAS.filter((s) => s.capa === c.key).map((s) => {
                const st = s.estado(o)
                const dato = o && s.dato ? s.dato(o) : null
                return (
                  <li key={s.nombre} className="flex gap-3 px-5 py-3.5">
                    <span className={cn('mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl', st.on ? 'bg-estado-ok/10 text-estado-ok' : 'bg-papel text-texto-suave')}>
                      <s.icon className="h-[18px] w-[18px]" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <p className="font-bold leading-tight">{s.nombre}</p>
                        <Estado on={st.on}>{st.texto}</Estado>
                      </div>
                      <p className="mt-0.5 text-sm text-texto-suave">{s.que}</p>
                      {(dato || s.lab) && (
                        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                          {dato && <span className="cifras font-bold text-texto">{dato}</span>}
                          {s.lab && <button onClick={() => probar(s.lab!)} className="font-bold text-tinta-500 hover:underline">Probar →</button>}
                        </p>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          </section>
        ))}
      </div>

      <Laboratorio initial={lab} />

      <p className="mt-8 rounded-xl bg-papel px-4 py-3 text-sm text-texto-suave">
        Todo lo que detecta el campus son <b>indicios para revisar</b>, nunca una sanción automática. El docente ve los motivos, conversa con el alumno y marca si fue una falsa alarma o si se confirmó.
      </p>
    </>
  )
}

function Estado({ on, children }: { on: boolean; children: ReactNode }) {
  return (
    <Badge tone={on ? 'ok' : 'neutral'}>
      {on && <span className="rec-dot h-1.5 w-1.5 rounded-full bg-current" aria-hidden />}
      {children}
    </Badge>
  )
}
