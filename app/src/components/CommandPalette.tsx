import { useEffect, useMemo, useRef, useState, type ComponentType } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, BookOpen, CalendarCheck, CornerDownLeft, Search, UserRound } from 'lucide-react'
import { useAuth } from '@/auth/AuthProvider'
import { Skeleton } from '@/components/ui'
import { Illustration } from '@/components/illustrations'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import { relativeDue } from '@/lib/format'
import { classroomLabel, listClassrooms, listTeacherOfferings } from '@/services/campus'
import type { Classroom, Offering } from '@/types'

export type PaletteCommand = { to: string; label: string; icon: ComponentType<{ className?: string }> }

type Item = {
  key: string
  group: 'Ir a' | 'Alumnos' | 'Cursos' | 'Tareas'
  title: string
  subtitle?: string
  to: string
  icon: ComponentType<{ className?: string }>
  color?: string
  haystack: string
}

const OFFERING_SELECT = 'id, classroom_id, subject_id, teacher_id, description, is_active, subject:subjects(id, name, short_name, color, level), classroom:classrooms(id, grade, section, level, tutor_id)'

/** Minúsculas y sin tildes: "Pérez" se encuentra escribiendo "perez". */
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

let cache: { at: number; userId: string; items: Item[] } | null = null

async function buildIndex(profileId: string, isTeacher: boolean, tutorRooms: Classroom[]): Promise<Item[]> {
  let offerings: Offering[]
  let classrooms: Classroom[]
  if (isTeacher) {
    offerings = await listTeacherOfferings(profileId)
    const map = new Map<number, Classroom>()
    for (const o of offerings) map.set(o.classroom.id, o.classroom)
    for (const c of tutorRooms) map.set(c.id, c)
    classrooms = [...map.values()]
  } else {
    const [res, rooms] = await Promise.all([
      supabase.from('course_offerings').select(OFFERING_SELECT).eq('is_active', true),
      listClassrooms(),
    ])
    if (res.error) throw res.error
    offerings = (res.data ?? []) as unknown as Offering[]
    classrooms = rooms
  }
  const roomIds = classrooms.map((c) => c.id)
  const roomById = new Map(classrooms.map((c) => [c.id, c]))

  const [studentsRes, assignmentsRes] = await Promise.all([
    roomIds.length
      ? supabase.from('students').select('id, first_name, last_name, dni, classroom_id').in('classroom_id', roomIds).limit(4000)
      : Promise.resolve({ data: [], error: null }),
    offerings.length
      ? supabase.from('assignments').select('id, title, offering_id, due_at, status').in('offering_id', offerings.map((o) => o.id)).order('created_at', { ascending: false }).limit(400)
      : Promise.resolve({ data: [], error: null }),
  ])
  if (studentsRes.error) throw studentsRes.error
  if (assignmentsRes.error) throw assignmentsRes.error
  const offeringById = new Map(offerings.map((o) => [o.id, o]))

  const items: Item[] = []
  for (const s of (studentsRes.data ?? []) as { id: number; first_name: string | null; last_name: string | null; dni: string | null; classroom_id: number | null }[]) {
    const name = `${s.last_name ?? ''}, ${s.first_name ?? ''}`
    const room = classroomLabel(roomById.get(s.classroom_id ?? 0))
    items.push({
      key: `s${s.id}`, group: 'Alumnos', title: name, subtitle: [room, s.dni ? `DNI ${s.dni}` : ''].filter(Boolean).join(' · '),
      to: `/libreta/${s.id}`, icon: UserRound, haystack: norm(`${s.first_name} ${s.last_name} ${s.dni ?? ''} ${room}`),
    })
  }
  for (const o of offerings) {
    items.push({
      key: `o${o.id}`, group: 'Cursos', title: o.subject.name, subtitle: classroomLabel(o.classroom), to: `/curso/${o.id}`,
      icon: BookOpen, color: o.subject.color, haystack: norm(`${o.subject.name} ${o.subject.short_name ?? ''} ${classroomLabel(o.classroom)}`),
    })
  }
  for (const a of (assignmentsRes.data ?? []) as { id: number; title: string; offering_id: number; due_at: string | null; status: string }[]) {
    const o = offeringById.get(a.offering_id)
    items.push({
      key: `a${a.id}`, group: 'Tareas', title: a.title,
      subtitle: [o?.subject.name, o ? classroomLabel(o.classroom) : '', a.status === 'DRAFT' ? 'Borrador' : relativeDue(a.due_at).label].filter(Boolean).join(' · '),
      to: `/tarea/${a.id}`, icon: CalendarCheck, color: o?.subject.color, haystack: norm(`${a.title} ${o?.subject.name ?? ''} ${o ? classroomLabel(o.classroom) : ''}`),
    })
  }
  return items
}

function score(item: Item, terms: string[]): number {
  let s = 0
  for (const t of terms) {
    const i = item.haystack.indexOf(t)
    if (i < 0) return -1
    s += i === 0 || item.haystack[i - 1] === ' ' ? 3 : 1
  }
  return s
}

export function CommandPalette({ open, onClose, commands }: { open: boolean; onClose: () => void; commands: PaletteCommand[] }) {
  const { profile, tutorClassrooms } = useAuth()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [items, setItems] = useState<Item[] | null>(null)
  const [error, setError] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  useEffect(() => {
    if (!open || !profile) return
    setQuery('')
    setActive(0)
    setTimeout(() => inputRef.current?.focus(), 10)
    if (cache && cache.userId === profile.id && Date.now() - cache.at < 5 * 60_000) { setItems(cache.items); return }
    setItems(null)
    buildIndex(profile.id, profile.role === 'TEACHER', tutorClassrooms)
      .then((list) => { cache = { at: Date.now(), userId: profile.id, items: list }; setItems(list) })
      .catch(() => setError('No se pudo cargar la búsqueda.'))
  }, [open, profile, tutorClassrooms])

  const results = useMemo(() => {
    const terms = norm(query).split(/\s+/).filter(Boolean)
    const nav: Item[] = commands.map((c) => ({ key: `n${c.to}${c.label}`, group: 'Ir a', title: c.label, to: c.to, icon: c.icon, haystack: norm(c.label) }))
    if (!terms.length) return nav
    const scored = [...nav, ...(items ?? [])]
      .map((it) => ({ it, s: score(it, terms) }))
      .filter((x) => x.s >= 0)
      .sort((a, b) => b.s - a.s)
    const out: Item[] = []
    for (const g of ['Ir a', 'Alumnos', 'Cursos', 'Tareas'] as const) out.push(...scored.filter((x) => x.it.group === g).slice(0, g === 'Ir a' ? 3 : 6).map((x) => x.it))
    return out
  }, [query, items, commands])

  useEffect(() => setActive(0), [query])
  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [active])

  function go(item: Item | undefined) {
    if (!item) return
    onClose()
    navigate(item.to)
  }

  if (!open) return null
  let lastGroup = ''

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-3 pt-[8vh] sm:pt-[12vh]" role="dialog" aria-modal="true" aria-label="Búsqueda rápida">
      <button className="backdrop-in absolute inset-0 bg-tinta/50" onClick={onClose} aria-label="Cerrar búsqueda" />
      <div className="modal-in relative flex max-h-[75vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-linea bg-superficie shadow-2xl" style={{ animation: 'modal-in .18s ease-out' }}>
        <div className="flex items-center gap-3 border-b border-linea px-4">
          <Search className="h-5 w-5 shrink-0 text-texto-suave" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(i + 1, results.length - 1)) }
              if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)) }
              if (e.key === 'Enter') { e.preventDefault(); go(results[active]) }
              if (e.key === 'Escape') { e.preventDefault(); onClose() }
            }}
            placeholder="Busca un alumno, DNI, curso o tarea…"
            className="min-h-14 flex-1 bg-transparent text-[16px] text-texto placeholder:text-texto-suave/70 focus:outline-none"
            aria-controls="palette-results"
            aria-activedescendant={results[active] ? `pal-${results[active].key}` : undefined}
          />
          <kbd className="hidden rounded border border-linea px-1.5 py-0.5 text-[11px] font-bold text-texto-suave sm:block">Esc</kbd>
        </div>

        <ul id="palette-results" ref={listRef} role="listbox" className="flex-1 overflow-y-auto p-2">
          {error && <li className="p-4 text-sm text-estado-alerta">{error}</li>}
          {!items && query && !error && <li className="space-y-2 p-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-10 w-full" />)}</li>}
          {items && query && results.length === 0 && (
            <li className="flex flex-col items-center gap-1 p-6 text-center">
              <Illustration name="search" className="h-20 w-20" />
              <p className="font-bold">Sin resultados para “{query}”</p>
              <p className="text-sm text-texto-suave">Prueba con el apellido, el DNI o el nombre del curso.</p>
            </li>
          )}
          {results.map((it, i) => {
            const header = it.group !== lastGroup
            lastGroup = it.group
            return (
              <li key={it.key} role="presentation">
                {header && <p className="px-3 pb-1 pt-3 text-[11px] font-bold uppercase tracking-wide text-texto-suave">{it.group}</p>}
                <button
                  id={`pal-${it.key}`}
                  role="option"
                  aria-selected={i === active}
                  data-index={i}
                  onMouseMove={() => setActive(i)}
                  onClick={() => go(it)}
                  className={cn('flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left', i === active ? 'bg-chispa-100' : 'hover:bg-papel')}
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-papel" style={it.color ? { background: it.color, color: '#fff' } : undefined}>
                    <it.icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-bold">{it.title}</span>
                    {it.subtitle && <span className="block truncate text-xs text-texto-suave">{it.subtitle}</span>}
                  </span>
                  {i === active ? <CornerDownLeft className="h-4 w-4 shrink-0 text-texto-suave" /> : <ArrowRight className="h-4 w-4 shrink-0 text-transparent" />}
                </button>
              </li>
            )
          })}
        </ul>
        <div className="hidden items-center gap-4 border-t border-linea px-4 py-2 text-[11px] text-texto-suave sm:flex">
          <span><kbd className="font-bold">↑ ↓</kbd> moverse</span>
          <span><kbd className="font-bold">Enter</kbd> abrir</span>
          <span className="ml-auto">{items ? `${items.length} elementos` : 'Cargando índice…'}</span>
        </div>
      </div>
    </div>
  )
}
