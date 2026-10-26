import { useState, type FormEvent } from 'react'
import { Megaphone } from 'lucide-react'
import { useAuth, useFocusStudent } from '@/auth/AuthProvider'
import { Button, Empty, ErrorBox, Field, Input, Loading, PageHeader, Panel, Select, Textarea } from '@/components/ui'
import { AnnouncementItem } from '@/pages/shared/AnnouncementFeed'
import { useAsync } from '@/lib/useAsync'
import { useToast } from '@/lib/toast'
import { toMessage } from '@/lib/errors'
import { supabase } from '@/lib/supabase'
import {
  classroomLabel, createAnnouncement, deleteAnnouncement, getPeopleNames, listClassroomOfferings, listClassrooms,
  listFeed, listTeacherOfferings,
} from '@/services/campus'
import type { Announcement, Classroom, Offering } from '@/types'

export default function AnnouncementsPage() {
  const { profile, isAdmin } = useAuth()
  const student = useFocusStudent()
  const toast = useToast()
  const role = profile?.role
  const isStaff = role === 'ADMIN' || role === 'MANAGEMENT' || role === 'AUXILIARY'

  const { data, loading, error, reload, mutate } = useAsync(async () => {
    let items: Announcement[] = []
    let offerings: Offering[] = []
    let postTargets: Classroom[] = []

    if (isStaff) {
      const res = await supabase.from('announcements').select('*').order('published_at', { ascending: false }).limit(40)
      if (res.error) throw res.error
      items = res.data as Announcement[]
      postTargets = isAdmin ? await listClassrooms() : []
    } else if (role === 'TEACHER') {
      offerings = await listTeacherOfferings(profile!.id)
      const classrooms = await listClassrooms()
      postTargets = classrooms.filter((c) => c.tutor_id === profile!.id)
      const res = await supabase.from('announcements').select('*')
        .or(['scope.eq.SCHOOL', `author_id.eq.${profile!.id}`, ...postTargets.map((c) => `classroom_id.eq.${c.id}`)].join(','))
        .order('published_at', { ascending: false }).limit(40)
      if (res.error) throw res.error
      items = res.data as Announcement[]
    } else if (student?.classroom_id) {
      offerings = await listClassroomOfferings(student.classroom_id)
      items = await listFeed(student.classroom_id, offerings.map((o) => o.id), 40)
    }
    const authors = await getPeopleNames(items.map((i) => i.author_id))
    return { items, offerings, postTargets, authors }
  }, [role, profile?.id, student?.classroom_id, isAdmin, isStaff])

  const canPost = isAdmin || (data?.postTargets.length ?? 0) > 0
  const [target, setTarget] = useState('SCHOOL')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!profile) return
    setBusy(true)
    try {
      const effective = isAdmin ? target : target === 'SCHOOL' ? String(data?.postTargets[0]?.id ?? '') : target
      await createAnnouncement({
        scope: effective === 'SCHOOL' ? 'SCHOOL' : 'CLASSROOM',
        classroomId: effective === 'SCHOOL' ? undefined : Number(effective),
        title,
        body,
        authorId: profile.id,
      })
      setTitle('')
      setBody('')
      toast('Anuncio publicado.')
      void reload(true)
    } catch (err) {
      toast(toMessage(err), 'error')
    } finally {
      setBusy(false)
    }
  }

  async function onDelete(item: Announcement) {
    if (!confirm('¿Eliminar este anuncio? Nadie más podrá verlo.')) return
    const undo = mutate((cur) => cur && { ...cur, items: cur.items.filter((x) => x.id !== item.id) })
    try {
      await deleteAnnouncement(item.id)
      toast('Anuncio eliminado.')
    } catch (err) {
      undo()
      toast(toMessage(err), 'error')
    }
  }

  const byOffering = new Map((data?.offerings ?? []).map((o) => [o.id, o]))

  return (
    <>
      <PageHeader title="Anuncios" subtitle={isAdmin ? 'Avisos para todo el colegio o para un aula.' : role === 'TEACHER' ? 'Avisos del colegio y de las aulas donde eres tutor.' : 'Avisos del colegio, del aula y de tus cursos.'} />
      {error && <ErrorBox message={error} onRetry={() => void reload()} />}
      <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
        {canPost && (
          <Panel title="Nuevo anuncio" className="h-fit">
            <form onSubmit={onSubmit} className="space-y-4">
              <Field label="Para">
                <Select value={target} onChange={(e) => setTarget(e.target.value)}>
                  {isAdmin && <option value="SCHOOL">Todo el colegio</option>}
                  {(data?.postTargets ?? []).map((c) => <option key={c.id} value={c.id}>{classroomLabel(c)}</option>)}
                </Select>
              </Field>
              <Field label="Título"><Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={140} required /></Field>
              <Field label="Mensaje"><Textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={5000} required /></Field>
              <Button type="submit" loading={busy}>Publicar anuncio</Button>
            </form>
          </Panel>
        )}
        <Panel title="Publicados" className={canPost ? '' : 'lg:col-span-2'}>
          {loading ? <Loading /> : !data?.items.length ? (
            <Empty title="Todavía no hay anuncios" art="bell" icon={<Megaphone className="h-5 w-5" />}>{canPost ? 'Escriba un título y un mensaje en el cuadro de al lado y toque «Publicar anuncio».' : 'Cuando el colegio publique un aviso, lo verá aquí.'}</Empty>
          ) : (
            <div className="divide-y divide-linea">
              {data.items.map((item) => (
                <AnnouncementItem
                  key={item.id}
                  item={item}
                  author={data.authors[item.author_id]}
                  offering={item.offering_id ? byOffering.get(item.offering_id) : undefined}
                  onDelete={item.author_id === profile?.id || isAdmin ? () => void onDelete(item) : undefined}
                />
              ))}
            </div>
          )}
        </Panel>
      </div>
    </>
  )
}
