import { Link } from 'react-router-dom'
import { LevelBadge, RankPin } from '@/components/tesla'
import { useAsync } from '@/lib/useAsync'
import { getProfile, rankOf } from '@/services/tesla'

/**
 * Rango Tesla del alumno en el menú lateral (nivel y Estrella).
 * Se carga de forma diferida para no sumar el Perfil Tesla al primer arranque.
 */
export function SidebarRank({ studentId }: { studentId: number }) {
  const { data } = useAsync(() => getProfile(studentId).catch(() => null), [studentId])
  if (!data) return null
  const rank = rankOf(data.level, data.pin_levels)
  return (
    <Link to="/perfil-tesla" className="mt-1.5 flex items-center gap-2 rounded-lg bg-white/[0.07] px-2 py-1.5 text-xs text-white/80 transition duration-rapido hover:bg-white/[0.12] hover:text-white">
      <LevelBadge level={data.level} size={22} />
      {/* Versión corta del rango ("Bronce II"); el nombre completo queda en el título. */}
      <span className="min-w-0 flex-1 truncate" title={rank.fullName}><b className="text-white">Nivel {data.level}</b> · {rank.fullName.replace(/^Estrella de /, '')}</span>
      {rank.tier > 0 && <RankPin tier={rank.tier} stars={rank.stars} size={20} />}
    </Link>
  )
}
