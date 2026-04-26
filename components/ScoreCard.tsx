/**
 * Public, read-only score breakdown card for artist / album / track pages.
 *
 * Two breakdown shapes are supported:
 *   ARTIST: { type: 'lt'|'int', categories: { catalog: { points, max, details }, ... }, total, score_override, final_score }
 *   ALBUM/TRACK: { categories: { type: 10, certifications: 0, ... }, inputs: {...} }
 *
 * Renders inline (no modal). Always read-only — admin override/recalc lives
 * in admin-only ScoreModal. This is what a regular visitor sees.
 */

type ArtistCategory = { points: number; max: number; details: string }
type ArtistBreakdown = {
  type?: 'lt' | 'int'
  categories?: Record<string, ArtistCategory>
  total?: number
  score_override?: number
  final_score?: number
}
type FlatBreakdown = {
  categories?: Record<string, number>
  inputs?: Record<string, any>
}

const ARTIST_CATS: Record<string, { label: string; color: string; ltMax?: number; intMax?: number }> = {
  catalog:    { label: 'Diskografija', color: '#3b82f6', ltMax: 18, intMax: 25 },
  media:      { label: 'Turinys',      color: '#8b5cf6', ltMax: 8 },
  community:  { label: 'Bendruomenė',  color: '#f59e0b', ltMax: 12 },
  career:     { label: 'Karjera',      color: '#10b981', ltMax: 8 },
  chart:      { label: 'Pasirodymai topuose',   color: '#ef4444', intMax: 35 },
  commercial: { label: 'Sertifikatai', color: '#f59e0b', intMax: 25 },
  reach:      { label: 'Aprėptis',     color: '#10b981', intMax: 15 },
}

const ALBUM_CATS: Record<string, { label: string; color: string; max: number }> = {
  type:           { label: 'Tipas',           color: '#3b82f6', max: 10 },
  certifications: { label: 'Sertifikatai',    color: '#f59e0b', max: 40 },
  chart:          { label: 'Pasirodymai topuose',      color: '#ef4444', max: 25 },
  track_count:    { label: 'Dainų kiekis',    color: '#8b5cf6', max: 10 },
  year:           { label: 'Metų bonusas',    color: '#10b981', max: 5 },
  artist_score:   { label: 'Atlikėjo balas',  color: '#6366f1', max: 10 },
}

const TRACK_CATS: Record<string, { label: string; color: string; max: number }> = {
  single:         { label: 'Singlas',         color: '#3b82f6', max: 8 },
  certifications: { label: 'Sertifikatai',    color: '#f59e0b', max: 35 },
  chart:          { label: 'Pasirodymai topuose',      color: '#ef4444', max: 25 },
  lyrics:         { label: 'Žodžiai',         color: '#8b5cf6', max: 5 },
  video:          { label: 'Vaizdo klipas',   color: '#06b6d4', max: 8 },
  year:           { label: 'Metų bonusas',    color: '#10b981', max: 3 },
  artist_score:   { label: 'Atlikėjo balas',  color: '#6366f1', max: 8 },
}

const ARTIST_LT_ORDER = ['catalog', 'media', 'community', 'career']
const ARTIST_INT_ORDER = ['catalog', 'chart', 'commercial', 'reach']
const ALBUM_ORDER = ['type', 'certifications', 'chart', 'track_count', 'year', 'artist_score']
const TRACK_ORDER = ['single', 'certifications', 'chart', 'lyrics', 'video', 'year', 'artist_score']

function Bar({ label, value, max, color, details }: {
  label: string; value: number; max: number; color: string; details?: string
}) {
  const pct = max > 0 ? Math.round((Math.max(0, value) / max) * 100) : 0
  return (
    <div className="py-1.5">
      <div className="flex items-center gap-3">
        <span className="text-xs font-semibold text-[var(--text-secondary)] w-28 text-right shrink-0">{label}</span>
        <div className="flex-1 h-2 rounded-full bg-[var(--bg-elevated)] overflow-hidden">
          <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: color }} />
        </div>
        <span className="text-xs font-bold text-[var(--text-secondary)] w-12 tabular-nums text-right">{value}/{max}</span>
      </div>
      {details && (
        <div className="flex items-center gap-3 mt-0.5">
          <span className="w-28 shrink-0" />
          <span className="text-[10px] text-[var(--text-faint)] leading-tight">{details}</span>
        </div>
      )}
    </div>
  )
}

export default function ScoreCard({
  entityType,
  score,
  breakdown,
  className = '',
  compact = false,
}: {
  entityType: 'artist' | 'album' | 'track'
  score: number | null | undefined
  breakdown: any
  className?: string
  compact?: boolean
}) {
  if (score === null || score === undefined) {
    return null
  }

  const titleByType = { artist: 'Atlikėjo balas', album: 'Albumo balas', track: 'Dainos balas' }
  const formulaTag = entityType === 'artist'
    ? (breakdown?.type === 'int' ? 'INT formulė' : 'LT formulė')
    : null

  const rows: { key: string; label: string; value: number; max: number; color: string; details?: string }[] = []

  if (entityType === 'artist' && breakdown?.categories) {
    const ab = breakdown as ArtistBreakdown
    const isInt = ab.type === 'int'
    const order = isInt ? ARTIST_INT_ORDER : ARTIST_LT_ORDER
    for (const key of order) {
      const cat = ab.categories?.[key]
      if (!cat) continue
      const meta = ARTIST_CATS[key]
      if (!meta) continue
      const max = cat.max ?? (isInt ? meta.intMax : meta.ltMax) ?? 0
      rows.push({ key, label: meta.label, value: cat.points || 0, max, color: meta.color, details: cat.details })
    }
  } else if (entityType === 'album' && breakdown?.categories) {
    const fb = breakdown as FlatBreakdown
    for (const key of ALBUM_ORDER) {
      const v = fb.categories?.[key]
      if (v === undefined || v === null) continue
      const meta = ALBUM_CATS[key]
      if (!meta) continue
      rows.push({ key, label: meta.label, value: Number(v) || 0, max: meta.max, color: meta.color })
    }
  } else if (entityType === 'track' && breakdown?.categories) {
    const fb = breakdown as FlatBreakdown
    for (const key of TRACK_ORDER) {
      const v = fb.categories?.[key]
      if (v === undefined || v === null) continue
      const meta = TRACK_CATS[key]
      if (!meta) continue
      rows.push({ key, label: meta.label, value: Number(v) || 0, max: meta.max, color: meta.color })
    }
  }

  // Compute overall max for the bar (cap 100). Used for the totals line below.
  const totalMax = rows.reduce((s, r) => s + r.max, 0)

  return (
    <div className={`rounded-xl border border-[var(--border-default)] bg-[var(--card-bg)] p-4 ${className}`}>
      <div className="flex items-baseline justify-between mb-3">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-bold text-[var(--text-primary)]">{titleByType[entityType]}</h3>
          {formulaTag && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--bg-elevated)] text-[var(--text-faint)] font-medium uppercase">
              {formulaTag}
            </span>
          )}
        </div>
        <div className="flex items-baseline gap-1">
          <span className="text-2xl font-black text-[var(--text-primary)] tabular-nums">{score}</span>
          <span className="text-xs text-[var(--text-faint)]">/100</span>
        </div>
      </div>

      {rows.length === 0 && (
        <p className="text-xs text-[var(--text-faint)] py-2">
          Sudedamųjų dalių dar nėra. Importavus iš Wikipedia jos atsiras automatiškai.
        </p>
      )}

      {rows.length > 0 && !compact && (
        <div className="space-y-0">
          {rows.map(r => (
            <Bar key={r.key} label={r.label} value={r.value} max={r.max} color={r.color} details={r.details} />
          ))}
          {totalMax > 0 && (
            <div className="flex items-center gap-3 py-1.5 mt-2 border-t border-[var(--border-subtle)]">
              <span className="text-xs font-semibold text-[var(--text-secondary)] w-28 text-right shrink-0">Bazė</span>
              <div className="flex-1" />
              <span className="text-xs font-bold text-[var(--text-primary)] w-12 tabular-nums text-right">
                {breakdown?.total ?? rows.reduce((s, r) => s + r.value, 0)}
              </span>
            </div>
          )}
          {entityType === 'artist' && typeof breakdown?.score_override === 'number' && breakdown.score_override !== 0 && (
            <div className="flex items-center gap-3 py-1.5">
              <span className="text-xs font-semibold text-[var(--text-secondary)] w-28 text-right shrink-0">Koregavimas</span>
              <div className="flex-1" />
              <span className={`text-xs font-bold tabular-nums w-12 text-right ${
                breakdown.score_override > 0 ? 'text-green-600' : 'text-red-500'
              }`}>
                {breakdown.score_override > 0 ? '+' : ''}{breakdown.score_override}
              </span>
            </div>
          )}
        </div>
      )}

      {rows.length > 0 && compact && (
        <div className="flex flex-wrap gap-1.5">
          {rows.map(r => (
            <span
              key={r.key}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold tabular-nums"
              style={{ background: `${r.color}15`, color: r.color }}
              title={r.details || `${r.label}: ${r.value}/${r.max}`}
            >
              {r.label}: {r.value}/{r.max}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
