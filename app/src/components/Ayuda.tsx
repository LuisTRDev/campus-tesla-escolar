import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, ArrowRight, ChevronRight, ExternalLink, PlayCircle, RotateCcw } from 'lucide-react'
import { useAuth } from '@/auth/AuthProvider'
import { Button, Modal } from '@/components/ui'
import { linkInfo } from '@/lib/links'
import { helpGroup, markStep, replayTour, useHelpVideos } from '@/lib/ayuda'
import { topicById, topicsFor, type HelpTopic } from '@/lib/ayudaTemas'

function Video({ url }: { url: string }) {
  const info = linkInfo(url)
  return (
    <div className="mb-5">
      {info.embed ? (
        <div className="aspect-video overflow-hidden rounded-xl border border-linea bg-tinta">
          <iframe src={info.embed} title="Video de ayuda" className="h-full w-full" allow="fullscreen" loading="lazy" referrerPolicy="no-referrer" />
        </div>
      ) : null}
      <a href={url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex min-h-11 items-center gap-1.5 text-sm font-bold text-tinta-500 underline">
        <ExternalLink className="h-4 w-4" />{info.embed ? 'Abrir el video en otra pestaña' : 'Ver el video'}
      </a>
    </div>
  )
}

function TopicView({ topic, onBack, onGo }: { topic: HelpTopic; onBack: () => void; onGo: (path: string) => void }) {
  const videos = useHelpVideos()
  const video = videos[topic.id]
  return (
    <div>
      <button onClick={onBack} className="mb-3 inline-flex min-h-11 items-center gap-1.5 text-sm font-bold text-texto-suave hover:text-texto">
        <ArrowLeft className="h-4 w-4" />Todos los temas
      </button>
      <h3 className="font-display text-2xl font-bold leading-tight">{topic.title}</h3>
      <p className="mt-1 text-texto-suave">{topic.summary}</p>
      {video && <div className="mt-4"><Video url={video} /></div>}
      <ol className="mt-4 space-y-3">
        {topic.steps.map((s, i) => (
          <li key={i} className="flex gap-3">
            <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-tinta text-sm font-bold text-white" aria-hidden>{i + 1}</span>
            <p className="text-[16px] leading-relaxed"><span className="sr-only">Paso {i + 1}: </span>{s}</p>
          </li>
        ))}
      </ol>
      {topic.tip && <p className="mt-5 rounded-xl bg-chispa-100 px-4 py-3 text-sm text-tinta"><b>Dato útil:</b> {topic.tip}</p>}
      {topic.to && <Button className="mt-5 w-full sm:w-auto" onClick={() => onGo(topic.to!.path)}>{topic.to.label}<ArrowRight className="h-4 w-4" /></Button>}
    </div>
  )
}

/** Panel de ayuda: lista de temas del rol y, al tocar uno, sus pasos (y el video del colegio si lo hay). */
export function Ayuda({ open, topic: initial, onClose }: { open: boolean; topic: string | null; onClose: () => void }) {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const videos = useHelpVideos()
  const [topicId, setTopicId] = useState<string | null>(initial)

  useEffect(() => {
    if (!open) return
    setTopicId(initial)
    if (profile) markStep(profile.id, 'ayuda')
  }, [open, initial, profile])

  if (!profile) return null
  const group = helpGroup(profile.role)
  const list = topicsFor(group)
  // Un tema que no es del rol (enlace viejo) se ignora y se muestra la lista.
  const current = topicId ? topicById(topicId) : undefined
  const shown = current && current.groups.includes(group) ? current : undefined

  function go(path: string) {
    onClose()
    navigate(path)
  }

  return (
    <Modal open={open} onClose={onClose} title={shown ? 'Ayuda' : '¿En qué le ayudamos?'}>
      {shown ? <TopicView topic={shown} onBack={() => setTopicId(null)} onGo={go} /> : (
        <div>
          <ul className="space-y-2">
            {list.map((t) => (
              <li key={t.id}>
                <button onClick={() => setTopicId(t.id)} className="flex min-h-14 w-full items-center gap-3 rounded-xl border border-linea px-4 py-3 text-left transition-colors hover:bg-papel">
                  <span className="min-w-0 flex-1">
                    <span className="block font-bold">{t.title}</span>
                    <span className="block text-sm text-texto-suave">{t.summary}</span>
                  </span>
                  {videos[t.id] && <PlayCircle className="h-5 w-5 shrink-0 text-chispa-600" aria-label="Tiene video" />}
                  <ChevronRight className="h-5 w-5 shrink-0 text-texto-suave" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
          <button
            onClick={() => { onClose(); replayTour() }}
            className="mt-4 inline-flex min-h-11 items-center gap-2 text-sm font-bold text-tinta-500 underline"
          >
            <RotateCcw className="h-4 w-4" />Ver otra vez el recorrido de bienvenida
          </button>
        </div>
      )}
    </Modal>
  )
}
