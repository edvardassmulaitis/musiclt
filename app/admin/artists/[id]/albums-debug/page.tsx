// app/admin/artists/[id]/albums-debug/page.tsx
//
// Albums debug puslapis — parallel'as tracks-debug'ui, bet album lygio.
// Rodom kiekvieną atlikėjo albumą su:
//   - track count + singles count + lyrics coverage
//   - release year, type flags (studio/ep/single/compilation/live/...)
//   - music.lt legacy_id + likes + comments
//   - source (wiki / wiki+lt / lt)
//   - Spotify ID
//   - cover image presence
// Padeda atsakyti į „kodėl šitas albumas neturi nieko, o kitas turi viską?"
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase'

interface Props {
  params: Promise<{ id: string }>
}

type AlbumRow = {
  id: number
  slug: string
  title: string
  year: number | null
  month: number | null
  day: number | null
  cover_image_url: string | null
  spotify_id: string | null
  video_url: string | null
  type_studio: boolean
  type_ep: boolean
  type_single: boolean
  type_compilation: boolean
  type_live: boolean
  type_remix: boolean
  type_covers: boolean
  type_holiday: boolean
  type_soundtrack: boolean
  type_demo: boolean
  source: string | null
  legacy_id: number | null
  peak_chart_position: number | null
  // Computed:
  track_count: number
  singles_count: number
  lyrics_count: number
  album_likes: number
  album_comments: number
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

async function getAlbums(id: number): Promise<AlbumRow[]> {
  const sb = createAdminClient()
  const { data } = await sb
    .from('albums')
    .select('id, slug, title, year, month, day, cover_image_url, spotify_id, video_url, type_studio, type_ep, type_single, type_compilation, type_live, type_remix, type_covers, type_holiday, type_soundtrack, type_demo, source, legacy_id, peak_chart_position')
    .eq('artist_id', id)
    .order('year', { ascending: false })
    .range(0, 9999)
  const albums = (data || []) as any[]
  if (albums.length === 0) return []

  const ids = albums.map(a => a.id)

  // Track counts + singles + lyrics coverage per album, via album_tracks JOIN.
  // PostgREST'as db-max-rows default'inai 1000, ir .range(0, 49999) NEPRADURIA
  // šito limito — server'is grąžins tik 1000. Paginuojam tikrą while loop'ą,
  // kad nebūtų silent truncation.
  const PAGE = 1000
  const tcMap = new Map<number, { tracks: number; singles: number; lyrics: number }>()
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50)
    let offset = 0
    while (true) {
      const { data: at } = await sb
        .from('album_tracks')
        .select('album_id, tracks(is_single, lyrics)')
        .in('album_id', chunk)
        .range(offset, offset + PAGE - 1)
      const rows = (at || []) as any[]
      for (const r of rows) {
        const m = tcMap.get(r.album_id) || { tracks: 0, singles: 0, lyrics: 0 }
        m.tracks++
        if (r.tracks?.is_single) m.singles++
        if (r.tracks?.lyrics && r.tracks.lyrics.trim().length > 10) m.lyrics++
        tcMap.set(r.album_id, m)
      }
      if (rows.length < PAGE) break
      offset += PAGE
    }
  }

  // Album likes — tas pats db-max-rows pagination'as
  const likeMap = new Map<number, number>()
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50)
    let offset = 0
    while (true) {
      const { data: likes } = await sb
        .from('likes')
        .select('entity_id')
        .eq('entity_type', 'album')
        .in('entity_id', chunk)
        .range(offset, offset + PAGE - 1)
      const rows = (likes || []) as any[]
      for (const l of rows) {
        likeMap.set(l.entity_id, (likeMap.get(l.entity_id) || 0) + 1)
      }
      if (rows.length < PAGE) break
      offset += PAGE
    }
  }

  // Album comments (denormalized FK)
  const commentMap = new Map<number, number>()
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50)
    let offset = 0
    while (true) {
      const { data: comments } = await sb
        .from('comments')
        .select('album_id')
        .in('album_id', chunk)
        .eq('is_deleted', false)
        .range(offset, offset + PAGE - 1)
      const rows = (comments || []) as any[]
      for (const c of rows) {
        if (c.album_id) commentMap.set(c.album_id, (commentMap.get(c.album_id) || 0) + 1)
      }
      if (rows.length < PAGE) break
      offset += PAGE
    }
  }

  for (const a of albums) {
    const tc = tcMap.get(a.id) || { tracks: 0, singles: 0, lyrics: 0 }
    a.track_count = tc.tracks
    a.singles_count = tc.singles
    a.lyrics_count = tc.lyrics
    a.album_likes = likeMap.get(a.id) || 0
    a.album_comments = commentMap.get(a.id) || 0
  }
  return albums
}

function fmtDate(a: AlbumRow): string {
  if (!a.year) return '—'
  const pad = (n: number) => String(n).padStart(2, '0')
  if (a.month && a.day) return `${a.year}-${pad(a.month)}-${pad(a.day)}`
  if (a.month) return `${a.year}-${pad(a.month)}`
  return String(a.year)
}

function albumTypeBadges(a: AlbumRow): string {
  const types: string[] = []
  if (a.type_studio) types.push('studio')
  if (a.type_ep) types.push('ep')
  if (a.type_single) types.push('single')
  if (a.type_compilation) types.push('compilation')
  if (a.type_live) types.push('live')
  if (a.type_remix) types.push('remix')
  if (a.type_covers) types.push('covers')
  if (a.type_holiday) types.push('holiday')
  if (a.type_soundtrack) types.push('soundtrack')
  if (a.type_demo) types.push('demo')
  return types.join(', ') || 'other'
}

export default async function AlbumsDebugPage({ params }: Props) {
  const { id: idStr } = await params
  const id = Number(idStr)
  if (!Number.isFinite(id)) notFound()
  const artist = await getArtist(id)
  if (!artist) notFound()
  const albums = await getAlbums(id)

  const totalTracks = albums.reduce((s, a) => s + a.track_count, 0)
  const totalSingles = albums.reduce((s, a) => s + a.singles_count, 0)
  const totalLyrics = albums.reduce((s, a) => s + a.lyrics_count, 0)
  const totalLikes = albums.reduce((s, a) => s + a.album_likes, 0)
  const totalComments = albums.reduce((s, a) => s + a.album_comments, 0)
  const withCover = albums.filter(a => !!a.cover_image_url).length
  const withSpotify = albums.filter(a => !!a.spotify_id).length
  const withYear = albums.filter(a => !!a.year).length
  const withFullDate = albums.filter(a => !!a.year && !!a.month && !!a.day).length
  const withLegacy = albums.filter(a => !!a.legacy_id).length

  const stat = (n: number) => {
    const pct = albums.length ? Math.round((n / albums.length) * 100) : 0
    const color = pct >= 70 ? 'text-emerald-400' : pct >= 40 ? 'text-yellow-400' : 'text-red-400'
    return <span className={`tabular-nums font-bold ${color}`}>{n}/{albums.length} ({pct}%)</span>
  }

  return (
    <div className="mx-auto max-w-[1800px] px-4 py-8">
      <div className="mb-6 flex items-center gap-4">
        <Link href={`/admin/artists/${id}`} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]">
          ← Atlikėjas
        </Link>
        <Link href={`/admin/artists/${id}/tracks-debug`} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]">
          Tracks debug
        </Link>
        <h1 className="text-2xl font-black text-[var(--text-primary)]">
          Albums debug — {artist.name}
        </h1>
      </div>

      {/* Pending warning — jei yra music.lt-only albumų be Wiki canonical layer'io */}
      {albums.some(a => a.source === 'legacy_scrape_pending') && (
        <div className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 text-[13px]">
          <div className="font-extrabold text-amber-600 mb-1">⚠ Pending review albumai</div>
          <p className="text-[var(--text-secondary)]">
            Albumai su <code className="rounded bg-amber-500/15 px-1 text-amber-600">legacy_scrape_pending</code> šaltinį atėjo iš music.lt scrape, bet
            Wiki nepateikė canonical track listing'o. Šie albumai <strong>nematomi viešai</strong>. Pasirinkimai:
          </p>
          <ul className="ml-4 list-disc text-[12px] text-[var(--text-muted)] space-y-0.5 mt-1.5">
            <li><strong>Aktyvuoti</strong>: per /admin/albums/[id] atviro album'ą, pridėti tracks rankiniu būdu / iš Wikipedia (jei yra atskiras albumo Wiki page'as) → pakeisti source į <code>legacy+wikipedia</code></li>
            <li><strong>Ištrinti</strong>: jei tai dublikatas (pvz. remix'ų albumas to paties pavadinimo) — /admin/albums/[id] → Trinti</li>
          </ul>
        </div>
      )}
      <div className="mb-4 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] p-4 text-[13px]">
        <div className="mb-1.5 font-extrabold uppercase tracking-wide text-[var(--text-primary)]">Data quality:</div>
        <div className="grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-3 text-[12px]">
          <div>Su year: {stat(withYear)}</div>
          <div>Su pilna data (Y-M-D): {stat(withFullDate)}</div>
          <div>Su viršeliu: {stat(withCover)}</div>
          <div>Su Spotify ID: {stat(withSpotify)}</div>
          <div>Su music.lt legacy: {stat(withLegacy)}</div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-5 text-[12px] text-[var(--text-muted)]">
          <div><strong className="text-[var(--text-primary)]">{albums.length}</strong> albumų</div>
          <div><strong className="text-[var(--text-primary)]">{totalTracks}</strong> total tracks</div>
          <div><strong className="text-[var(--text-primary)]">{totalSingles}</strong> singles</div>
          <div><strong className="text-[var(--text-primary)]">{totalLyrics}</strong> tracks su lyrics</div>
          <div><strong className="text-[var(--text-primary)]">{totalLikes}</strong> album likes / <strong>{totalComments}</strong> kom.</div>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-[var(--border-default)]">
        <table className="w-full text-[12.5px]">
          <thead className="sticky top-0 bg-[var(--bg-elevated)] text-left text-[11px] uppercase tracking-wider text-[var(--text-faint)]">
            <tr>
              <th className="px-3 py-2.5">#</th>
              <th className="px-3 py-2.5">Album</th>
              <th className="px-3 py-2.5 text-center">Date</th>
              <th className="px-3 py-2.5">Type</th>
              <th className="px-3 py-2.5 text-right" title="Dainų kiekis per album_tracks JOIN">Tracks</th>
              <th className="px-3 py-2.5 text-right" title="Tracks su is_single=true">Singles</th>
              <th className="px-3 py-2.5 text-right" title="Tracks su lyrics > 10 chars">Lyrics</th>
              <th className="px-3 py-2.5 text-right" title="Album likes (entity_type=album)">Likes</th>
              <th className="px-3 py-2.5 text-right" title="Album komentarai">Kom.</th>
              <th className="px-3 py-2.5 text-center" title="cover_image_url">Cover</th>
              <th className="px-3 py-2.5 text-center" title="Spotify album ID iš music.lt iframe embed'o">Spotify</th>
              <th className="px-3 py-2.5 text-center" title="music.lt legacy ID">LT id</th>
              <th className="px-3 py-2.5 text-center" title="Source: wiki / wiki+lt / lt">Source</th>
              <th className="px-3 py-2.5 text-right" title="Peak chart position (Wiki infobox)">Peak</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-subtle)]">
            {albums.map((a, i) => {
              const hasCover = !!a.cover_image_url
              const hasSpotify = !!a.spotify_id
              const isPending = a.source === 'legacy_scrape_pending'
              const sourceLabel = (a.source || 'unknown')
                .replace('legacy+wikipedia', 'wiki+lt')
                .replace('legacy_scrape_v1', 'lt')
                .replace('wikipedia', 'wiki')
              return (
                <tr key={a.id} className={`${isPending ? 'bg-amber-500/5 hover:bg-amber-500/10 border-l-2 border-l-amber-500' : 'hover:bg-[var(--bg-hover)]'}`}>
                  <td className="px-3 py-2 tabular-nums text-[var(--text-faint)]">{i + 1}</td>
                  <td className="px-3 py-2 font-bold text-[var(--text-primary)]">
                    <Link href={`/admin/albums/${a.id}`} className="hover:text-[var(--accent-orange)]">
                      {a.title}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-center tabular-nums text-[var(--text-muted)]" title={`year=${a.year} month=${a.month} day=${a.day}`}>
                    {fmtDate(a)}
                  </td>
                  <td className="px-3 py-2 text-[10px] text-[var(--text-muted)]">{albumTypeBadges(a)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{a.track_count || '—'}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{a.singles_count || '—'}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{a.lyrics_count || '—'}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{a.album_likes || '—'}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{a.album_comments || '—'}</td>
                  <td className="px-3 py-2 text-center" title={hasCover ? a.cover_image_url || '' : 'no cover'}>
                    {hasCover ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={a.cover_image_url || ''} alt="" className="inline-block w-6 h-6 rounded object-cover" />
                    ) : (
                      <span className="text-[var(--text-faint)] text-[11px]">×</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-center" title={a.spotify_id ? `spotify_id=${a.spotify_id}` : 'null'}>
                    {hasSpotify ? (
                      <a href={`https://open.spotify.com/album/${a.spotify_id}`} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center w-5 h-5 rounded bg-emerald-500/15 text-emerald-400 text-[11px] font-bold hover:bg-emerald-500/30">✓</a>
                    ) : (
                      <span className="text-[var(--text-faint)] text-[11px]">×</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-center text-[10px] tabular-nums" title={a.legacy_id ? `music.lt legacy_id=${a.legacy_id}` : 'no music.lt mapping'}>
                    {a.legacy_id ? <span className="text-amber-500">#{a.legacy_id}</span> : <span className="text-[var(--text-faint)]">—</span>}
                  </td>
                  <td className="px-3 py-2 text-center text-[10px]">
                    {isPending ? (
                      <span className="rounded bg-amber-500/20 px-1.5 py-0.5 font-bold text-amber-600" title="Music.lt only — nematomas viešai. Aktyvuoti per /admin/albums/[id] arba trinti.">
                        pending
                      </span>
                    ) : (
                      <span className="text-[var(--text-muted)]">{sourceLabel}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-[var(--text-muted)]" title={a.peak_chart_position ? `Peak chart #${a.peak_chart_position}` : 'no chart data'}>
                    {a.peak_chart_position ? `#${a.peak_chart_position}` : '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
