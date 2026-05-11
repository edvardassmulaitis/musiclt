// app/admin/artists/[id]/tracks-debug/page.tsx
//
// Admin debug puslapis — rodo kiekvieno atlikėjo track'o composite
// popularity score breakdown'ą + sortinimo poziciją + PopBar dashes
// lygį. Skirta atsakyti į klausimą „kodėl šitas track'as rodomas
// žemiau už kitą su mažiau dashes?"
//
// Composite formulė (atitinka public artist page'os tracksAllTime sort):
//   sortVal = likes×100 + score + log10(views)×10 + (is_single ? 50 : 0)
//
// PopBar level — relatyvus prie maksimumo per detectPopSignal hierarchy:
//   likes (jei bent vienas track turi >0) → score → log10(views) → none
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase'

interface Props {
  params: Promise<{ id: string }>
}

type TrackRow = {
  id: number
  slug: string
  title: string
  type: string | null
  is_single: boolean | null
  release_year: number | null
  release_month: number | null
  release_day: number | null
  video_url: string | null
  video_views: number | null
  video_uploaded_at: string | null
  spotify_id: string | null
  lyrics: string | null
  score: number | null
  source: string | null
  legacy_id: number | null
  imported_at: string | null
  score_updated_at: string | null
  like_count: number
  comment_count: number
  album_titles: string  // joined album titles
}

async function getArtist(id: number) {
  const sb = createAdminClient()
  const { data } = await sb
    .from('artists')
    .select('id, slug, name, cover_image_url')
    .eq('id', id)
    .single()
  return data
}

async function getTracks(id: number): Promise<TrackRow[]> {
  const sb = createAdminClient()
  const { data } = await sb
    .from('tracks')
    .select('id, slug, title, type, is_single, release_year, release_month, release_day, video_url, video_views, video_uploaded_at, spotify_id, lyrics, score, source, legacy_id, imported_at, score_updated_at')
    .eq('artist_id', id)
    .or('source.is.null,source.neq.legacy_scrape_pending')
    .range(0, 9999)
  const tracks = (data || []) as any[]
  if (tracks.length === 0) return []

  const ids = tracks.map(t => t.id)

  // Like counts iš likes lentelės — PostgREST default limit 1000, todėl
  // didelėms grupėms (Coldplay 3000+ likes) reikia padalinti į mažus chunk'us
  // ir kiekvienam pridėti .range(0, 9999) kad nebūtų truncated'as
  // į pirmus 1000.
  const likeMap = new Map<number, number>()
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50)
    const { data: likes } = await sb
      .from('likes')
      .select('entity_id')
      .eq('entity_type', 'track')
      .in('entity_id', chunk)
      .range(0, 49999)
    for (const l of (likes || []) as any[]) {
      likeMap.set(l.entity_id, (likeMap.get(l.entity_id) || 0) + 1)
    }
  }

  // Album titles per track — JOIN per album_tracks → albums. Vienam track'ui
  // gali būti keli albumai (compilation, soundtrack); rodom comma-separated.
  const albumMap = new Map<number, string[]>()
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200)
    const { data: at } = await sb
      .from('album_tracks')
      .select('track_id, albums(title, year)')
      .in('track_id', chunk)
    for (const r of (at || []) as any[]) {
      const title = r.albums?.title
      if (!title) continue
      const arr = albumMap.get(r.track_id) || []
      if (!arr.includes(title)) arr.push(title)
      albumMap.set(r.track_id, arr)
    }
  }

  // Comment counts iš comments lentelės. Schema turi atskirus FK stulpelius
  // per entity tipą (track_id / album_id / news_id / event_id / discussion_id),
  // NE polymorphic entity_type+entity_id pattern'ą. Filtruojam per track_id.
  const commentMap = new Map<number, number>()
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50)
    const { data: comments } = await sb
      .from('comments')
      .select('track_id')
      .in('track_id', chunk)
      .eq('is_deleted', false)
      .range(0, 49999)
    for (const c of (comments || []) as any[]) {
      if (c.track_id) commentMap.set(c.track_id, (commentMap.get(c.track_id) || 0) + 1)
    }
  }

  for (const t of tracks) {
    t.like_count = likeMap.get(t.id) || 0
    t.comment_count = commentMap.get(t.id) || 0
    t.album_titles = (albumMap.get(t.id) || []).join(', ')
  }
  return tracks
}

async function getArtistStats(id: number) {
  const sb = createAdminClient()
  // discussions atstovauja artist'o forum threads (discussions.artist_id).
  // Artist-level komentarai = visi comments per artist'o discussions thread'us.
  const [artistRow, artistLikes, discussionRows] = await Promise.all([
    sb.from('artists').select('id, slug, name, country, active_from, active_until, gender, birth_date, death_date, description, source').eq('id', id).single(),
    sb.from('likes').select('id', { count: 'exact', head: true }).eq('entity_type', 'artist').eq('entity_id', id),
    sb.from('discussions').select('id').eq('artist_id', id),
  ])
  const discussionIds = (discussionRows.data || []).map((d: any) => d.id)
  let artistCommentsCount = 0
  if (discussionIds.length > 0) {
    const { count } = await sb
      .from('comments')
      .select('id', { count: 'exact', head: true })
      .in('discussion_id', discussionIds)
      .eq('is_deleted', false)
    artistCommentsCount = count || 0
  }
  return {
    artist: artistRow.data,
    artistLikes: artistLikes.count || 0,
    artistComments: artistCommentsCount,
    discussionCount: discussionIds.length,
  }
}

// Composite formulė — VIEWS-DOMINANT v2 (data-resilient, atitinka
// public artist-profile-client.tsx trackSortVal). Pašalinta:
//   - score × 0.2 (uniform per artist, nedifferencijuoja)
//   - year_recency (penalizuoja klasikus, depend nuo missing year data)

function trackScoreBreakdown(t: TrackRow): {
  viewsLog: number
  likesLog: number
  single: number
  video: number
  total: number
} {
  const viewsLog = Math.log10((t.video_views || 0) + 1) * 50
  const likesLog = Math.log10((t.like_count || 0) + 1) * 10
  const single = t.is_single ? 10 : 0
  const video = t.video_url ? 5 : 0
  return {
    viewsLog, likesLog, single, video,
    total: viewsLog + likesLog + single + video,
  }
}

function trackSortVal(t: TrackRow): number {
  return trackScoreBreakdown(t).total
}

function fmtReleaseDate(t: TrackRow): string {
  const yr = t.release_year
  const mo = t.release_month
  const dy = t.release_day
  if (!yr) return '—'
  const pad = (n: number) => String(n).padStart(2, '0')
  if (mo && dy) return `${yr}-${pad(mo)}-${pad(dy)}`
  if (mo) return `${yr}-${pad(mo)}`
  return String(yr)
}

type PopSignal = 'likes' | 'score' | 'views' | 'none'
function detectPopSignal(tracks: TrackRow[]): { signal: PopSignal; max: number } {
  let maxLikes = 0, maxScore = 0, maxViews = 0
  let likesPresent = 0
  const total = tracks.length
  for (const t of tracks) {
    if ((t.like_count || 0) > 0) likesPresent++
    if ((t.like_count || 0) > maxLikes) maxLikes = t.like_count || 0
    if ((t.score || 0) > maxScore) maxScore = t.score || 0
    if ((t.video_views || 0) > maxViews) maxViews = t.video_views || 0
  }
  // Sparse likes (<50%) → use composite score (matches public client logic).
  const likesCoverage = total > 0 ? likesPresent / total : 0
  if (maxLikes > 0 && likesCoverage >= 0.5) return { signal: 'likes', max: maxLikes }
  if (maxScore > 0) return { signal: 'score', max: maxScore }
  if (maxLikes > 0) return { signal: 'likes', max: maxLikes }
  if (maxViews > 0) return { signal: 'views', max: Math.log10(maxViews + 1) }
  return { signal: 'none', max: 0 }
}

function popLevel(idx: number, total: number, hasSignal: boolean): number {
  // Percentile-based (rank): sąrašas atrūšiuotas pagal composite desc,
  // idx yra rank'as. Top 20% → 5/5, kvintiliai po 20% kiekvienam level'iui.
  // Garantuoja uniform distribuciją (anksčiau value/max → bias top'ui).
  if (!hasSignal || total <= 0) return 0
  if (total <= 1) return 3
  const p = idx / total
  if (p < 0.20) return 5
  if (p < 0.40) return 4
  if (p < 0.60) return 3
  if (p < 0.80) return 2
  return 1
}

function trackPopValue(t: TrackRow, signal: PopSignal): number {
  if (signal === 'likes') return t.like_count || 0
  if (signal === 'score') return t.score || 0
  if (signal === 'views') return Math.log10((t.video_views || 0) + 1)
  return 0
}

export default async function TracksDebugPage({ params }: Props) {
  const { id: idStr } = await params
  const id = Number(idStr)
  if (!Number.isFinite(id)) notFound()
  const artist = await getArtist(id)
  if (!artist) notFound()
  const [tracks, stats] = await Promise.all([getTracks(id), getArtistStats(id)])

  // Sort like public artist page (with-video first, then rest, each by trackSortVal desc)
  const yt = (url: string | null) => !!url && /youtu/.test(url)
  const withVideo = tracks.filter(t => yt(t.video_url)).slice().sort((a, b) => trackSortVal(b) - trackSortVal(a))
  const rest = tracks.filter(t => !yt(t.video_url)).slice().sort((a, b) => trackSortVal(b) - trackSortVal(a))
  const sorted = [...withVideo, ...rest]

  const popInfo = detectPopSignal(sorted)
  const totalSingles = tracks.filter(t => t.is_single).length
  const totalComments = tracks.reduce((s, t) => s + (t.comment_count || 0), 0)
  const totalTrackLikes = tracks.reduce((s, t) => s + (t.like_count || 0), 0)

  const a = stats.artist
  const fmtArtistDates = (() => {
    if (a?.active_from || a?.active_until) {
      return `${a.active_from ?? '?'}–${a.active_until ?? 'dabar'}`
    }
    if (a?.birth_date) {
      const bd = String(a.birth_date).slice(0, 10)
      const dd = a.death_date ? String(a.death_date).slice(0, 10) : null
      return dd ? `${bd} → ${dd}` : `Gimė: ${bd}`
    }
    return '—'
  })()

  return (
    <div className="mx-auto max-w-[1800px] px-4 py-8">
      <div className="mb-6 flex items-center gap-4">
        <Link href={`/admin/artists/${id}`} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]">
          ← Atlikėjas
        </Link>
        <h1 className="text-2xl font-black text-[var(--text-primary)]">
          Track scoring debug — {artist.name}
        </h1>
      </div>

      {/* ARTIST-LEVEL INFO — bendra grupės/atlikėjo info: aktyvumo metai,
          likes/komentarai/diskusijos prie pačio artist'o, source. Padeda
          debug'inti ar Wiki + scrape importavimas pilnai užfilling'ino
          visą metadatos sluoksnį. */}
      <div className="mb-4 grid grid-cols-2 gap-3 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] p-4 text-[12px] md:grid-cols-4">
        <div>
          <div className="text-[10px] uppercase tracking-wide text-[var(--text-faint)]">Aktyvumas</div>
          <div className="font-bold text-[var(--text-primary)]">{fmtArtistDates}</div>
          {a?.country && <div className="text-[var(--text-muted)]">{a.country}</div>}
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wide text-[var(--text-faint)]">Artist likes</div>
          <div className={`font-bold ${stats.artistLikes > 0 ? 'text-emerald-400' : 'text-red-400'}`}>{stats.artistLikes}</div>
          <div className="text-[var(--text-muted)]">Track likes total: {totalTrackLikes}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wide text-[var(--text-faint)]">Komentarai</div>
          <div className={`font-bold ${stats.artistComments > 0 ? 'text-emerald-400' : 'text-red-400'}`}>{stats.artistComments} artist</div>
          <div className="text-[var(--text-muted)]">{totalComments} track</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wide text-[var(--text-faint)]">Diskusijos</div>
          <div className={`font-bold ${stats.discussionCount > 0 ? 'text-emerald-400' : 'text-red-400'}`}>{stats.discussionCount}</div>
          <div className="text-[var(--text-muted)]">source: {a?.source || '—'}</div>
        </div>
      </div>

      <div className="mb-6 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] p-4 text-[13px] text-[var(--text-muted)]">
        <p className="mb-2">
          <strong className="text-[var(--text-primary)]">Composite formulė (views-dominant v2, 2026-05-10):</strong>{' '}
          <code className="rounded bg-[var(--bg-elevated)] px-1.5 py-0.5 text-[12px]">
            views_log×50 + likes_log×10 + (single ? 10 : 0) + (video ? 5 : 0)
          </code>
        </p>
        <ul className="mb-2 ml-4 list-disc space-y-0.5 text-[12px]">
          <li><code>views_log</code> = log₁₀(video_views + 1) × 50 — dominantas (1.3B views ≈ 456 pts)</li>
          <li><code>likes_log</code> = log₁₀(like_count + 1) × 10 — small bonus (200 likes ≈ 23 pts)</li>
          <li><code>single</code> = is_single ? +10 : 0</li>
          <li><code>video</code> = video_url ? +5 : 0 (playable bonus)</li>
        </ul>
        <p className="mb-2 text-[12px]">
          <em className="text-[var(--text-faint)]">Pašalinta v2: <code>score × 0.2</code> (uniform per artist)
          ir <code>year_recency</code> (penalizuoja klasikus, depend nuo missing year).</em>
        </p>
        {/* DATA QUALITY SUMMARY — leidžia greit pamatyti, kur trūksta info */}
        {(() => {
          const totalTracks = tracks.length
          const withLikes = tracks.filter(t => t.like_count > 0).length
          const withComments = tracks.filter(t => t.comment_count > 0).length
          const withYear = tracks.filter(t => t.release_year).length
          const withFullDate = tracks.filter(t => t.release_year && t.release_month && t.release_day).length
          const withScore = tracks.filter(t => (t.score || 0) > 0).length
          const withVideo = tracks.filter(t => yt(t.video_url)).length
          const withViews = tracks.filter(t => (t.video_views || 0) > 0).length
          const withLyrics = tracks.filter(t => t.lyrics && t.lyrics.trim().length > 10).length
          const withLegacy = tracks.filter(t => !!t.legacy_id).length
          const stat = (n: number) => {
            const pct = totalTracks ? Math.round((n / totalTracks) * 100) : 0
            const color = pct >= 70 ? 'text-emerald-400' : pct >= 40 ? 'text-yellow-400' : 'text-red-400'
            return <span className={`tabular-nums font-bold ${color}`}>{n}/{totalTracks} ({pct}%)</span>
          }
          return (
            <div className="mt-3 rounded border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3 text-[12px]">
              <div className="mb-1.5 font-extrabold uppercase tracking-wide text-[var(--text-primary)]">Data quality:</div>
              <div className="grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-3">
                <div>Su likes: {stat(withLikes)}</div>
                <div>Su komentarais: {stat(withComments)}</div>
                <div>Su YT views: {stat(withViews)}</div>
                <div>Su video: {stat(withVideo)}</div>
                <div>Su year: {stat(withYear)}</div>
                <div>Su pilna data (Y-M-D): {stat(withFullDate)}</div>
                <div>Singlai pažymėti: {stat(totalSingles)}</div>
                <div>Su lyrics: {stat(withLyrics)}</div>
                <div>Su music.lt legacy_id: {stat(withLegacy)}</div>
                <div>Su Wiki score: {stat(withScore)}</div>
              </div>
            </div>
          )
        })()}
        <p className="mt-3 mb-1">
          <strong className="text-[var(--text-primary)]">PopBar signal:</strong>{' '}
          <span className="rounded bg-[var(--bg-elevated)] px-1.5 py-0.5 font-bold text-[var(--accent-orange)]">
            {popInfo.signal}
          </span>{' '}
          (max =<span className="tabular-nums"> {popInfo.max.toFixed(2)}</span>)
        </p>
      </div>

      <div className="overflow-x-auto rounded-lg border border-[var(--border-default)]">
        <table className="w-full text-[12.5px]">
          <thead className="sticky top-0 bg-[var(--bg-elevated)] text-left text-[11px] uppercase tracking-wider text-[var(--text-faint)]">
            <tr>
              <th className="px-3 py-2.5">#</th>
              <th className="px-3 py-2.5">Track</th>
              <th className="px-3 py-2.5" title="Album'as (-ai) iš album_tracks JOIN'o">Album</th>
              <th className="px-3 py-2.5 text-right">Views</th>
              <th className="px-3 py-2.5 text-right" title="log10(views+1) × 50">+views×50</th>
              <th className="px-3 py-2.5 text-right">Likes</th>
              <th className="px-3 py-2.5 text-right" title="log10(likes+1) × 10">+likes×10</th>
              <th className="px-3 py-2.5 text-right" title="Komentarų kiekis prie track'o (iš music.lt scrape arba native)">Kom.</th>
              <th className="px-3 py-2.5 text-center" title="is_single ? +10 : 0">+Single</th>
              <th className="px-3 py-2.5 text-center" title="video_url ? +5 : 0">+Video</th>
              <th className="px-3 py-2.5 text-center" title="Release date (Y-M-D arba tik Y jei tik metai)">Date</th>
              <th className="px-3 py-2.5 text-center" title="YT video upload date (iš YouTube Data API snippet.publishedAt)">YT date</th>
              <th className="px-3 py-2.5 text-center" title="Spotify ID iš music.lt iframe embed'o">Spotify</th>
              <th className="px-3 py-2.5 text-center" title="Lyrics (žodžiai) ilgis. Iš music.lt body arba LRCLib backfill'o">Lyrics</th>
              <th className="px-3 py-2.5 text-center" title="music.lt legacy ID (matched per match_legacy_overlay)">LT id</th>
              <th className="px-3 py-2.5 text-center" title="Track source: wikipedia, legacy_scrape_v1, legacy+wikipedia, etc.">Source</th>
              <th className="px-3 py-2.5 text-right font-extrabold text-[var(--accent-orange)]">Σ Composite</th>
              <th className="px-3 py-2.5 text-center">PopBar</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-subtle)]">
            {sorted.map((t, i) => {
              const bd = trackScoreBreakdown(t)
              const popVal = trackPopValue(t, popInfo.signal) // displayed in table
              const level = popLevel(i, sorted.length, popInfo.signal !== 'none')
              const hasVideo = yt(t.video_url)
              const ytDate = t.video_uploaded_at ? new Date(t.video_uploaded_at).toISOString().slice(0, 10) : '—'
              const hasLyrics = !!(t.lyrics && t.lyrics.trim().length > 10)
              const hasSpotify = !!t.spotify_id
              const sourceLabel = (t.source || 'unknown')
                .replace('legacy+wikipedia', 'wiki+lt')
                .replace('legacy_scrape_v1', 'lt')
                .replace('wikipedia', 'wiki')
              return (
                <tr key={t.id} className="hover:bg-[var(--bg-hover)]">
                  <td className="px-3 py-2 tabular-nums text-[var(--text-faint)]">{i + 1}</td>
                  <td className="px-3 py-2 font-bold text-[var(--text-primary)]">
                    <Link href={`/admin/tracks/${t.id}`} className="hover:text-[var(--accent-orange)]">
                      {t.title}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-[11px] text-[var(--text-muted)] max-w-[180px] truncate" title={t.album_titles}>
                    {t.album_titles || '—'}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {t.video_views != null ? t.video_views.toLocaleString('lt-LT') : '—'}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-[var(--text-muted)]">
                    {bd.viewsLog.toFixed(1)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{t.like_count}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-[var(--text-muted)]">
                    {bd.likesLog.toFixed(1)}
                  </td>
                  <td className={`px-3 py-2 text-right tabular-nums ${t.comment_count > 0 ? 'text-[var(--text-secondary)]' : 'text-[var(--text-faint)]'}`}>
                    {t.comment_count || '—'}
                  </td>
                  <td className="px-3 py-2 text-center tabular-nums">
                    {t.is_single ? (
                      <span className="rounded bg-[rgba(59,130,246,0.16)] px-1.5 py-0.5 text-[10px] font-bold text-[#60a5fa]">
                        +10
                      </span>
                    ) : (
                      <span className="text-[var(--text-faint)]">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-center tabular-nums">
                    {hasVideo ? (
                      <span className="rounded bg-[rgba(249,115,22,0.16)] px-1.5 py-0.5 text-[10px] font-bold text-[var(--accent-orange)]">
                        +5
                      </span>
                    ) : (
                      <span className="text-[var(--text-faint)]">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-center tabular-nums text-[var(--text-muted)]" title={t.release_year ? `release_year=${t.release_year} release_month=${t.release_month ?? 'null'} release_day=${t.release_day ?? 'null'}` : 'release_year=null'}>
                    {fmtReleaseDate(t)}
                  </td>
                  <td className="px-3 py-2 text-center tabular-nums text-[10px] text-[var(--text-muted)]">
                    {ytDate}
                  </td>
                  <td className="px-3 py-2 text-center" title={t.spotify_id ? `spotify_id=${t.spotify_id}` : 'null'}>
                    {hasSpotify ? (
                      <a href={`https://open.spotify.com/track/${t.spotify_id}`} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center w-5 h-5 rounded bg-emerald-500/15 text-emerald-400 text-[11px] font-bold hover:bg-emerald-500/30">✓</a>
                    ) : (
                      <span className="text-[var(--text-faint)] text-[11px]">×</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-center text-[10px] tabular-nums" title={hasLyrics ? `${t.lyrics?.length || 0} chars` : 'no lyrics'}>
                    {hasLyrics ? (
                      <span className="rounded bg-blue-500/15 px-1.5 py-0.5 text-blue-400 font-bold">{Math.round((t.lyrics?.length || 0) / 100) / 10}k</span>
                    ) : (
                      <span className="text-[var(--text-faint)]">×</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-center text-[10px] tabular-nums" title={t.legacy_id ? `music.lt legacy_id=${t.legacy_id}` : 'no music.lt mapping'}>
                    {t.legacy_id ? (
                      <span className="text-amber-500">#{t.legacy_id}</span>
                    ) : (
                      <span className="text-[var(--text-faint)]">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-center text-[10px] text-[var(--text-muted)]" title={`source=${t.source || 'null'}, imported_at=${t.imported_at || 'null'}`}>
                    {sourceLabel}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums font-extrabold text-[var(--accent-orange)]">
                    {bd.total.toFixed(1)}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <div className="inline-flex gap-[2px]">
                      {Array.from({ length: 5 }).map((_, j) => (
                        <span
                          key={j}
                          className={[
                            'h-[3px] w-[10px] rounded-[2px]',
                            j < level ? 'bg-[var(--accent-orange)]' : 'bg-[var(--border-default)]',
                          ].join(' ')}
                        />
                      ))}
                    </div>
                    <div className="text-[10px] text-[var(--text-faint)] tabular-nums">{level}/5</div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-6 text-[12px] text-[var(--text-muted)]">
        Public artist page'as naudoja same composite sort. PopBar dashes
        prikabinami pagal popInfo signal'ą (likes prioritetu, jei bent
        vienas track turi like; kitaip score; kitaip log10(views)).
      </div>
    </div>
  )
}
