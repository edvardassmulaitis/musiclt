'use client'

// components/HomeListContent.tsx
//
// Praturtintas pilno sąrašo turinys homepage'o „Visi" modalams (HomeListModal
// viduje). Fetch'ina VISĄ filtruotą rinkinį per /api/home/list (tracks/albums/
// upcoming) arba /api/events (events).
//   • tracks/albums/upcoming: rūšiavimas (naujausi / populiariausi) + žanro chip'ai,
//     „hot" popbar pagal YouTube peržiūras, like'ai, data, „Rodyti daugiau".
//   • events: miesto chip'ų filtras (Edvardo prašymu), data + vieta.
// Toolbar'as vienoje eilėje desktop'e; mobile'e chip'ai horizontaliai scroll'inami
// (taupo vertikalią vietą).

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { proxyImg } from '@/lib/img-proxy'

type Sort = 'new' | 'liked'
type Facet = { name: string; count: number }

type Props = {
  type: 'tracks' | 'albums' | 'upcoming' | 'events'
  lane?: 'lt' | 'world'
  onOpenTrack?: (t: any) => void
  onOpenAlbum?: (a: any) => void
  onClose: () => void
}

const MONTHS_LT = ['Sau', 'Vas', 'Kov', 'Bal', 'Geg', 'Bir', 'Lie', 'Rgp', 'Rgs', 'Spa', 'Lap', 'Gru']
const LIMIT = 100

const LT_COUNTRIES = new Set(['Lietuva', 'LT', 'Lithuania'])
function eventIsLT(ev: any): boolean {
  const ea = (ev.event_artists || []).map((a: any) => a.artists).filter(Boolean)
  if (ea.length > 0) return ea.some((a: any) => { const c = a?.country; return !c || LT_COUNTRIES.has(c) })
  return true
}
function eventCity(ev: any): string {
  return (ev.city || ev.venues?.city || '').trim()
}

function sanitizeTitle(raw: string): string {
  return (raw || '').replace(/<[^>]*>/g, '').replace(/&[^;]+;/g, ' ').replace(/\s+/g, ' ').trim()
}
function ytId(url: string | null | undefined): string | null {
  if (!url) return null
  const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([^&?\s]{11})/)
  return m?.[1] || null
}
/** Savaitėmis ribotas „Prieš X" (atitinka homepage formatRelativeDateLT v2). */
function relDateLT(input: string | null | undefined): { label: string | null; hot: boolean } {
  if (!input) return { label: null, hot: false }
  const d = new Date(input)
  if (isNaN(d.getTime())) return { label: null, hot: false }
  const diff = Math.floor((Date.now() - d.getTime()) / 86_400_000)
  if (diff < 0) return { label: null, hot: false }
  const hot = diff <= 14
  if (diff === 0) return { label: 'Šiandien', hot }
  if (diff === 1) return { label: 'Vakar', hot }
  if (diff < 7) return { label: `Prieš ${diff} d.`, hot }
  if (diff < 30) return { label: `Prieš ${Math.round(diff / 7)} sav.`, hot }
  const months = Math.floor(diff / 30)
  if (months < 12) return { label: `Prieš ${months} mėn.`, hot: false }
  return { label: `Prieš ${Math.floor(diff / 365)} m.`, hot: false }
}

function PopBar({ level }: { level: number }) {
  if (!level) return null
  return (
    <span
      className="inline-flex items-end gap-[2px]"
      title="Populiarumas pagal YouTube peržiūras"
      aria-label={`Populiarumas ${level}/5`}
    >
      {[1, 2, 3, 4, 5].map(i => (
        <span
          key={i}
          style={{
            width: 3,
            height: 4 + i * 2,
            borderRadius: 1,
            background: i <= level ? 'var(--accent-orange)' : 'var(--border-default)',
          }}
        />
      ))}
    </span>
  )
}

export function HomeListContent({ type, lane = 'lt', onOpenTrack, onOpenAlbum, onClose }: Props) {
  const isEvents = type === 'events'
  const isTracks = type === 'tracks'
  const isAlbumLike = type === 'albums' || type === 'upcoming'

  const [items, setItems] = useState<any[]>([])
  const [genres, setGenres] = useState<Facet[]>([])
  const [cities, setCities] = useState<Facet[]>([])
  const [total, setTotal] = useState(0)
  const [activeGenre, setActiveGenre] = useState('')
  const [activeCity, setActiveCity] = useState('')
  const [sort, setSort] = useState<Sort>('new')
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)

  const fetchPage = useCallback(async (offset: number): Promise<{ items: any[]; total: number; genres?: Facet[] }> => {
    if (isEvents) {
      const r = await fetch('/api/events?limit=200').then(res => res.json()).catch(() => ({ events: [] }))
      let evs = (r.events || []).filter((ev: any) => (lane === 'world' ? !eventIsLT(ev) : eventIsLT(ev)))
      evs = evs.sort((a: any, b: any) => {
        const da = new Date(a.start_date || a.event_date || 0).getTime()
        const db = new Date(b.start_date || b.event_date || 0).getTime()
        return da - db
      })
      return { items: evs, total: evs.length }
    }
    const qs = new URLSearchParams({
      type, lane, genre: activeGenre, sort, offset: String(offset), limit: String(LIMIT),
    })
    const r = await fetch(`/api/home/list?${qs}`).then(res => res.json()).catch(() => ({ items: [], total: 0, genres: [] }))
    return { items: r.items || [], total: r.total || 0, genres: r.genres || [] }
  }, [type, lane, activeGenre, sort, isEvents])

  // Reset + fetch kai keičiasi filtras/rūšiavimas.
  useEffect(() => {
    let alive = true
    setLoading(true)
    fetchPage(0).then(res => {
      if (!alive) return
      setItems(res.items)
      setTotal(res.total)
      if (res.genres) setGenres(res.genres)
      if (isEvents) {
        const m = new Map<string, number>()
        for (const ev of res.items) { const c = eventCity(ev); if (c) m.set(c, (m.get(c) || 0) + 1) }
        setCities(Array.from(m.entries()).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'lt')))
      }
      setLoading(false)
    })
    return () => { alive = false }
  }, [fetchPage, isEvents])

  const loadMore = async () => {
    if (loadingMore || isEvents) return
    setLoadingMore(true)
    const res = await fetchPage(items.length)
    setItems(prev => [...prev, ...res.items])
    setTotal(res.total)
    setLoadingMore(false)
  }

  const shown = isEvents && activeCity ? items.filter(ev => eventCity(ev) === activeCity) : items
  const hasMore = !isEvents && items.length < total

  const chipCls = (active: boolean) =>
    `shrink-0 whitespace-nowrap rounded-full border px-2.5 py-1 font-['Outfit',sans-serif] text-[11.5px] font-bold transition-colors ${
      active
        ? 'border-[var(--accent-orange)] bg-[var(--accent-orange)]/12 text-[var(--accent-orange)]'
        : 'border-[var(--border-default)] text-[var(--text-muted)] hover:border-[var(--border-strong)]'
    }`

  return (
    <div>
      {/* Toolbar — viena eilė desktop'e; mobile'e chip'ai horizontaliai scroll'inami. */}
      <div className="mb-4 flex flex-col gap-2.5 sm:flex-row sm:items-center sm:gap-3">
        {!isEvents && (
          <div className="flex shrink-0 items-center gap-1.5">
            {([['new', type === 'upcoming' ? 'Artimiausi' : 'Naujausi'], ['liked', 'Populiariausi']] as const).map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setSort(k)}
                className={`rounded-full px-3 py-1.5 font-['Outfit',sans-serif] text-[12px] font-bold transition-colors ${
                  sort === k ? 'bg-[var(--accent-orange)] text-white' : 'bg-[var(--bg-active)] text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}
        {!isEvents && genres.length > 0 && (
          <div className="hp-scroll flex min-w-0 items-center gap-1.5 overflow-x-auto pb-0.5 sm:flex-wrap sm:overflow-visible sm:pb-0">
            <button type="button" onClick={() => setActiveGenre('')} className={chipCls(activeGenre === '')}>Visi žanrai</button>
            {genres.map(g => (
              <button key={g.name} type="button" onClick={() => setActiveGenre(g.name)} className={chipCls(activeGenre === g.name)}>
                {g.name} <span className="opacity-60">{g.count}</span>
              </button>
            ))}
          </div>
        )}
        {isEvents && cities.length > 0 && (
          <div className="hp-scroll flex min-w-0 items-center gap-1.5 overflow-x-auto pb-0.5 sm:flex-wrap sm:overflow-visible sm:pb-0">
            <button type="button" onClick={() => setActiveCity('')} className={chipCls(activeCity === '')}>Visi miestai</button>
            {cities.map(c => (
              <button key={c.name} type="button" onClick={() => setActiveCity(c.name)} className={chipCls(activeCity === c.name)}>
                {c.name} <span className="opacity-60">{c.count}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Grid */}
      {loading ? (
        <div className={`grid gap-3 ${isTracks ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3' : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5'}`}>
          {Array(10).fill(null).map((_, i) => (
            <div key={i}>
              <div className={`hp-skel rounded-xl ${isTracks ? 'aspect-video' : 'aspect-square'}`} />
              <div className="hp-skel mt-2 h-3 w-4/5 rounded" />
              <div className="hp-skel mt-1 h-2.5 w-3/5 rounded" />
            </div>
          ))}
        </div>
      ) : shown.length === 0 ? (
        <div className="py-12 text-center text-[13px] text-[var(--text-muted)]">Nieko nerasta</div>
      ) : (
        <>
          <div className={`grid gap-3 ${isTracks ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3' : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5'}`}>
            {shown.map((it: any) => {
              const title = sanitizeTitle(it.title || '')
              const artistName = it.artists?.name || it.artist_name || ''
              if (isEvents) {
                const dateRaw = it.start_date || it.event_date
                const d = dateRaw ? new Date(dateRaw) : null
                const validDate = d && !isNaN(d.getTime())
                const img = it.image_small_url || it.cover_image_url || null
                const artistList = (it.event_artists || []).filter((ea: any) => ea.artists?.name).map((ea: any) => ea.artists.name)
                const label = artistList.length > 0 ? artistList.slice(0, 2).join(', ') + (artistList.length > 2 ? ` +${artistList.length - 2}` : '') : title
                const venue = [eventCity(it), it.venue_name || it.venues?.name || it.venue_custom || ''].filter(Boolean).join(', ')
                return (
                  <Link key={it.id} href={`/renginiai/${it.slug}`} onClick={onClose} className="group block no-underline text-left">
                    <div className="relative aspect-square overflow-hidden rounded-xl border border-[var(--border-default)] bg-[var(--cover-placeholder)] transition-all duration-300 group-hover:-translate-y-0.5 group-hover:border-[rgba(249,115,22,0.5)]">
                      {img ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={proxyImg(img)} alt={label} loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.06]" />
                      ) : <div className="flex h-full w-full items-center justify-center text-2xl text-[var(--text-faint)]">🎵</div>}
                    </div>
                    <div className="mt-2 px-0.5">
                      {validDate && (
                        <p className="m-0 mb-0.5 font-['Outfit',sans-serif] text-[11px] font-extrabold uppercase tracking-[0.03em] text-[var(--accent-orange)]">
                          {d!.getDate()} {MONTHS_LT[d!.getMonth()]}. {d!.getFullYear()}
                        </p>
                      )}
                      <p className="m-0 line-clamp-2 font-['Outfit',sans-serif] text-[13px] font-extrabold leading-snug text-[var(--text-primary)] transition-colors group-hover:text-[var(--accent-orange)]">{label}</p>
                      {venue && <p className="m-0 mt-1 truncate text-[11.5px] text-[var(--text-muted)]">{venue}</p>}
                    </div>
                  </Link>
                )
              }
              const v = ytId(it.video_url)
              const ytThumb = v ? `https://img.youtube.com/vi/${v}/mqdefault.jpg` : null
              const img = isAlbumLike
                ? (it.cover_image_url || it.cover_url || it.artists?.cover_image_url || null)
                : (it.cover_url || ytThumb || it.artists?.cover_image_url || null)
              const dateRaw = isAlbumLike ? (it.release_date || (it.year ? `${it.year}-01-01` : null)) : (it.video_uploaded_at || it.release_date)
              const rel = relDateLT(dateRaw)
              const likes = it.like_count || 0
              const pop = it.pop || 0
              return (
                <button
                  key={it.id}
                  type="button"
                  onClick={() => {
                    onClose()
                    setTimeout(() => { if (isAlbumLike) onOpenAlbum?.(it); else onOpenTrack?.(it) }, 40)
                  }}
                  className="group block w-full cursor-pointer border-0 bg-transparent p-0 text-left no-underline"
                >
                  <div className={`relative overflow-hidden rounded-xl border border-[var(--border-default)] bg-[var(--cover-placeholder)] transition-all duration-300 group-hover:-translate-y-0.5 group-hover:border-[rgba(249,115,22,0.5)] ${isTracks ? 'aspect-video' : 'aspect-square'}`}>
                    {img ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={proxyImg(img)} alt={title} loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.06]" />
                    ) : <div className="flex h-full w-full items-center justify-center text-2xl text-[var(--text-faint)]">{isAlbumLike ? '💿' : '🎵'}</div>}
                    {isTracks && (
                      <div className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--accent-orange)] shadow-[0_4px_16px_rgba(249,115,22,0.5)]">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="white"><path d="M8 5v14l11-7z" /></svg>
                        </span>
                      </div>
                    )}
                    {rel.label && (
                      <span className={`absolute bottom-1.5 right-1.5 rounded px-1.5 py-0.5 font-['Outfit',sans-serif] text-[9px] font-bold backdrop-blur-sm ${rel.hot ? 'bg-[var(--accent-orange)] text-white' : 'bg-black/70 text-white'}`}>{rel.label}</span>
                    )}
                  </div>
                  <div className="mt-2 px-0.5">
                    <p className="m-0 truncate font-['Outfit',sans-serif] text-[13px] font-extrabold text-[var(--text-primary)] transition-colors group-hover:text-[var(--accent-orange)]">{title}</p>
                    <div className="mt-1 flex items-center gap-2">
                      <p className="m-0 min-w-0 flex-1 truncate text-[11.5px] text-[var(--text-muted)]">{artistName}</p>
                      <PopBar level={pop} />
                      {likes > 0 && (
                        <span className="flex shrink-0 items-center gap-0.5 text-[10.5px] font-bold text-[var(--text-muted)]">
                          <span className="text-[var(--accent-orange)]">♥</span>{likes}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>

          {hasMore && (
            <div className="mt-5 flex justify-center">
              <button
                type="button"
                onClick={loadMore}
                disabled={loadingMore}
                className="rounded-full border border-[var(--border-default)] bg-[var(--bg-surface)] px-5 py-2 font-['Outfit',sans-serif] text-[13px] font-bold text-[var(--text-primary)] transition-colors hover:border-[var(--accent-orange)] hover:text-[var(--accent-orange)] disabled:opacity-50"
              >
                {loadingMore ? 'Kraunama…' : `Rodyti daugiau (${total - items.length})`}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
