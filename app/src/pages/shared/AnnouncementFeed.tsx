import { useState } from 'react'
import { CheckCheck, Eye, Megaphone, Pin, Trash2 } from 'lucide-react'
import { useAuth } from '@/auth/AuthProvider'
import { Button, Empty, ErrorBox, Loading, Modal } from '@/components/ui'
import { CourseTag } from '@/components/course'
import { LinkifiedText } from '@/components/LinkifiedText'
import { useAsync } from '@/lib/useAsync'
import { formatShort, formatTime } from '@/lib/format'
import { cn } from '@/lib/utils'
import { getPeopleNames, listFeed } from '@/services/campus'
import { REACTIONS, ackAnnouncement, announcementReaders, announcementSocial, toggleReaction, type Reaction } from '@/services/comunicacion'
import { useToast } from '@/lib/toast'
import { toMessage } from '@/lib/errors'
import { haptic } from '@/lib/ux'
import type { Announcement, Offering } from '@/types'

export function AnnouncementItem({ item, author, offering, compact, onDelete }: {
  item: Announcement
  author?: string
  offering?: Offering
  compact?: boolean
  onDelete?: () => void
}) {
  const source = item.scope === 'SCHOOL' ? 'Todo el colegio' : item.scope === 'CLASSROOM' ? 'Aviso del aula' : null
  return (
    <article className={cn('py-4 first:pt-0 last:pb-0', item.pinned && !compact && 'rounded-lg bg-chispa-100/60 px-4 first:pt-4 last:pb-4')}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {offering ? <CourseTag offering={offering} /> : source && <span className="text-xs font-bold text-texto-suave">{source}</span>}
        {item.pinned && <span className="inline-flex items-center gap-1 text-xs font-bold text-tinta"><Pin className="h-3 w-3" />Fijado</span>}
      </div>
      <h3 className="mt-1 font-bold text-texto">{item.title}</h3>
      <p className={cn('mt-1 whitespace-pre-line text-[15px] leading-relaxed text-texto', compact && 'line-clamp-3 text-sm text-texto-suave')}><LinkifiedText text={item.body} /></p>
      <div className="mt-2 flex items-center gap-3 text-xs text-texto-suave">
        <span>{author ?? 'Colegio'}, {formatShort(item.published_at)} a las {formatTime(item.published_at)}</span>
        {onDelete && (
          <button onClick={onDelete} className="inline-flex items-center gap-1 font-bold hover:text-estado-alerta">
            <Trash2 className="h-3.5 w-3.5" />Eliminar
          </button>
        )}
      </div>
      {item.id > 0 && !compact && <SocialBar item={item} />}
    </article>
  )
}

/** Avisos del colegio, del aula y de los cursos del alumno. */
export function AnnouncementFeed({ classroomId, offerings, limit = 10, compact }: {
  classroomId: number | null
  offerings: Offering[]
  limit?: number
  compact?: boolean
}) {
  const { profile } = useAuth()
  const ids = offerings.map((o) => o.id).join(',')
  const { data, loading, error, reload } = useAsync(async () => {
    const items = await listFeed(classroomId, offerings.map((o) => o.id), limit)
    const authors = await getPeopleNames(items.map((i) => i.author_id))
    return { items, authors }
  }, [classroomId, ids, limit, profile?.id])

  if (loading) return <Loading />
  if (error) return <ErrorBox message={error} onRetry={() => void reload()} />
  if (!data?.items.length) {
    return <Empty title="Sin avisos por ahora" art="bell" compact icon={<Megaphone className="h-5 w-5" />} />
  }
  const byId = new Map(offerings.map((o) => [o.id, o]))
  return (
    <div className="divide-y divide-linea">
      {data.items.map((item) => (
        <AnnouncementItem
          key={item.id}
          item={item}
          compact={compact}
          author={data.authors[item.author_id]}
          offering={item.offering_id ? byId.get(item.offering_id) : undefined}
        />
      ))}
    </div>
  )
}

/** Reacciones (👍 ❤️ …) y confirmación de lectura de un anuncio. */
function SocialBar({ item }: { item: Announcement }) {
  const toast = useToast()
  const { profile } = useAuth()
  const { data, mutate, reload } = useAsync(() => announcementSocial([item.id]).then((r) => r[String(item.id)] ?? null).catch(() => null), [item.id])
  const [readers, setReaders] = useState<{ name: string; role: string; read_at: string }[] | null>(null)
  if (!data) return null
  const isAuthor = item.author_id === profile?.id

  async function react(e: Reaction) {
    const on = !data!.mine.includes(e)
    haptic()
    mutate((cur) => cur && {
      ...cur,
      mine: on ? [...cur.mine, e] : cur.mine.filter((x) => x !== e),
      reactions: { ...cur.reactions, [e]: Math.max(0, (cur.reactions[e] ?? 0) + (on ? 1 : -1)) },
    })
    try { await toggleReaction(item.id, e, on) } catch (err) { toast(toMessage(err), 'error'); void reload(true) }
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      {REACTIONS.map((e) => {
        const n = data.reactions[e] ?? 0
        const mine = data.mine.includes(e)
        return (
          <button key={e} onClick={() => void react(e)} aria-pressed={mine}
            className={cn('rounded-full border px-2 py-0.5 text-sm transition-transform active:scale-90', mine ? 'border-tinta bg-chispa-100' : 'border-linea hover:border-tinta-500', !n && !mine && 'opacity-60')}>
            {e}{n > 0 && <span className="ml-1 text-xs font-bold">{n}</span>}
          </button>
        )
      })}
      {item.require_ack && !isAuthor && (
        data.acked
          ? <span className="ml-1 inline-flex items-center gap-1 text-xs font-bold text-estado-ok"><CheckCheck className="h-4 w-4" />Leído</span>
          : <Button size="sm" className="ml-1" onClick={async () => {
              try { await ackAnnouncement(item.id); haptic('success'); mutate((cur) => cur && { ...cur, acked: true }) } catch (err) { toast(toMessage(err), 'error') }
            }}><CheckCheck className="h-4 w-4" />Confirmo que leí</Button>
      )}
      {data.reads != null && (isAuthor || item.require_ack) && (
        <button onClick={() => void announcementReaders(item.id).then(setReaders)} className="ml-auto inline-flex items-center gap-1 text-xs font-bold text-texto-suave hover:text-texto">
          <Eye className="h-3.5 w-3.5" />{data.reads} confirmaron
        </button>
      )}
      <Modal open={!!readers} onClose={() => setReaders(null)} title="Confirmaron la lectura">
        {!readers?.length ? <p className="text-sm text-texto-suave">Nadie todavía.</p> : (
          <ul className="divide-y divide-linea">
            {readers.map((r, i) => <li key={i} className="flex justify-between py-2 text-sm"><span className="font-bold">{r.name}</span><span className="text-texto-suave">{formatShort(r.read_at)} {formatTime(r.read_at)}</span></li>)}
          </ul>
        )}
      </Modal>
    </div>
  )
}
