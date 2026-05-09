// app/admin/import/pending/page.tsx
//
// Pending review queue — tracks/albums sukurti per match_legacy_overlay.py
// scriptą su source='legacy_scrape_pending'. Wiki SPARQL discography šito
// įrašo neturėjo, bet music.lt'as taip — admin'as turi nuspręsti, ar tai
// teisėtas release'as (Approve), ar duplicate/junk (Reject/Delete).
//
// Approve → SET source='legacy_scrape', tampa matomas viešai per default
// page filter (`source != 'legacy_scrape_pending'`).
// Reject → DELETE row + cascading delete music.lt likes/comments
// (priklauso CASCADE FK constraint).
import { Suspense } from 'react'
import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase'
import PendingActions from './pending-actions'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Pending review — Admin' }

type PendingEntry = {
  id: number
  title: string
  artist_name: string
  artist_id: number
  artist_slug: string | null
  legacy_id: number | null
  source_url: string | null
  year?: number | null
  imported_at: string | null
  like_count: number
  comment_count: number
}

async function getPendingAlbums(artistId?: number): Promise<PendingEntry[]> {
  const sb = createAdminClient()
  let q = sb
    .from('albums')
    .select('id, title, year, legacy_id, source_url, imported_at, artist_id, artists!albums_artist_id_fkey(id, name, slug)')
    .eq('source', 'legacy_scrape_pending')
    .order('imported_at', { ascending: false })
    .limit(500)
  if (artistId) q = q.eq('artist_id', artistId)
  const { data: albums } = await q
  const rows = (albums || []) as any[]
  if (!rows.length) return []
  const albumIds = rows.map(r => r.id)
  // Like counts
  const { data: likeRows } = await sb
    .from('likes').select('entity_id')
    .eq('entity_type', 'album').in('entity_id', albumIds)
  const likeMap = new Map<number, number>()
  for (const l of (likeRows || []) as any[]) {
    likeMap.set(l.entity_id, (likeMap.get(l.entity_id) || 0) + 1)
  }
  // Comment counts
  const { data: cmtRows } = await sb
    .from('comments').select('album_id').in('album_id', albumIds)
  const cmtMap = new Map<number, number>()
  for (const c of (cmtRows || []) as any[]) {
    cmtMap.set(c.album_id, (cmtMap.get(c.album_id) || 0) + 1)
  }
  return rows.map(r => ({
    id: r.id,
    title: r.title,
    artist_name: r.artists?.name || '?',
    artist_id: r.artists?.id || r.artist_id,
    artist_slug: r.artists?.slug || null,
    legacy_id: r.legacy_id,
    source_url: r.source_url,
    year: r.year,
    imported_at: r.imported_at,
    like_count: likeMap.get(r.id) || 0,
    comment_count: cmtMap.get(r.id) || 0,
  }))
}

async function getPendingTracks(artistId?: number): Promise<PendingEntry[]> {
  const sb = createAdminClient()
  let q = sb
    .from('tracks')
    .select('id, title, release_year, legacy_id, source_url, imported_at, artist_id, artists!tracks_artist_id_fkey(id, name, slug)')
    .eq('source', 'legacy_scrape_pending')
    .order('imported_at', { ascending: false })
    .limit(500)
  if (artistId) q = q.eq('artist_id', artistId)
  const { data: tracks } = await q
  const rows = (tracks || []) as any[]
  if (!rows.length) return []
  const trackIds = rows.map(r => r.id)
  const { data: likeRows } = await sb
    .from('likes').select('entity_id')
    .eq('entity_type', 'track').in('entity_id', trackIds)
  const likeMap = new Map<number, number>()
  for (const l of (likeRows || []) as any[]) {
    likeMap.set(l.entity_id, (likeMap.get(l.entity_id) || 0) + 1)
  }
  const { data: cmtRows } = await sb
    .from('comments').select('track_id').in('track_id', trackIds)
  const cmtMap = new Map<number, number>()
  for (const c of (cmtRows || []) as any[]) {
    cmtMap.set(c.track_id, (cmtMap.get(c.track_id) || 0) + 1)
  }
  return rows.map(r => ({
    id: r.id,
    title: r.title,
    artist_name: r.artists?.name || '?',
    artist_id: r.artists?.id || r.artist_id,
    artist_slug: r.artists?.slug || null,
    legacy_id: r.legacy_id,
    source_url: r.source_url,
    year: r.release_year,
    imported_at: r.imported_at,
    like_count: likeMap.get(r.id) || 0,
    comment_count: cmtMap.get(r.id) || 0,
  }))
}

function Row({ entity, kind }: { entity: PendingEntry; kind: 'album' | 'track' }) {
  return (
    <tr className="border-b border-[var(--border-subtle)] hover:bg-[var(--bg-hover)]">
      <td className="px-3 py-2 text-[12px] text-[var(--text-muted)] tabular-nums">
        {entity.id}
      </td>
      <td className="px-3 py-2">
        <div className="font-['Outfit',sans-serif] text-[13px] font-bold text-[var(--text-primary)]">
          {entity.title}
        </div>
        <div className="text-[10.5px] text-[var(--text-faint)]">
          {entity.artist_slug ? (
            <Link href={`/atlikejai/${entity.artist_slug}`} className="text-[var(--accent-orange)] hover:underline">
              {entity.artist_name}
            </Link>
          ) : entity.artist_name}
          {entity.year && <span> · {entity.year}</span>}
        </div>
      </td>
      <td className="px-3 py-2 text-[12px] tabular-nums text-[var(--text-muted)]">
        {entity.legacy_id ?? '—'}
      </td>
      <td className="px-3 py-2 text-[12px] tabular-nums">
        <span className={entity.like_count > 0 ? 'text-green-600 font-bold' : 'text-[var(--text-faint)]'}>
          {entity.like_count}
        </span>
      </td>
      <td className="px-3 py-2 text-[12px] tabular-nums">
        <span className={entity.comment_count > 0 ? 'text-blue-600 font-bold' : 'text-[var(--text-faint)]'}>
          {entity.comment_count}
        </span>
      </td>
      <td className="px-3 py-2 text-[10.5px]">
        {entity.source_url ? (
          <a href={entity.source_url} target="_blank" rel="noopener" className="text-[var(--accent-orange)] hover:underline">
            music.lt ↗
          </a>
        ) : '—'}
      </td>
      <td className="px-3 py-2">
        <PendingActions kind={kind} id={entity.id} />
      </td>
    </tr>
  )
}

async function PendingTable({ artistId }: { artistId?: number }) {
  const [albums, tracks] = await Promise.all([getPendingAlbums(artistId), getPendingTracks(artistId)])

  // Jei filtruojam pagal atlikėją — pasiimame jo info badge'ui
  let artistInfo: { name: string; slug: string | null } | null = null
  if (artistId) {
    const sb = createAdminClient()
    const { data: a } = await sb
      .from('artists').select('name, slug').eq('id', artistId).maybeSingle()
    if (a) artistInfo = { name: (a as any).name, slug: (a as any).slug }
  }

  return (
    <div className="space-y-8 p-6">
      <div>
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="font-['Outfit',sans-serif] text-2xl font-extrabold text-[var(--text-primary)]">
            Pending review
          </h1>
          {artistInfo && (
            <span className="inline-flex items-center gap-2 rounded-full bg-[var(--bg-elevated)] px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-[var(--accent-orange)] border border-[var(--border-subtle)]">
              {artistInfo.name}
              <Link
                href="/admin/import/pending"
                className="text-[10px] underline opacity-70 hover:opacity-100"
              >
                clear
              </Link>
            </span>
          )}
        </div>
        <p className="mt-1 text-[12px] text-[var(--text-muted)]">
          Albums + tracks sukurti per match_legacy_overlay scriptą — Wiki canonical jų neturėjo,
          bet music.lt'as taip. Patvirtink (Approve), jei tai teisėtas release'as, arba
          atmesk (Reject), jei tai duplicate/junk. Approved → matomi viešai. Rejected → ištrinti.
        </p>
        <div className="mt-3 flex gap-3 text-[11px] text-[var(--text-muted)]">
          <span><strong className="text-[var(--text-primary)]">{albums.length}</strong> albums</span>
          <span><strong className="text-[var(--text-primary)]">{tracks.length}</strong> tracks</span>
          {artistId && (
            <Link
              href={`/admin/import/${artistId}`}
              className="text-[var(--accent-orange)] hover:underline"
            >
              ← grįžti į import dashboard
            </Link>
          )}
        </div>
      </div>

      {albums.length > 0 && (
        <section>
          <h2 className="mb-2 font-['Outfit',sans-serif] text-sm font-bold uppercase tracking-wider text-[var(--text-muted)]">
            Albumai ({albums.length})
          </h2>
          <div className="overflow-x-auto rounded-xl border border-[var(--border-subtle)]">
            <table className="w-full">
              <thead className="bg-[var(--bg-elevated)]">
                <tr>
                  <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">ID</th>
                  <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Title / Artist</th>
                  <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Legacy</th>
                  <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Likes</th>
                  <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Cmts</th>
                  <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Source</th>
                  <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Actions</th>
                </tr>
              </thead>
              <tbody>
                {albums.map(a => <Row key={a.id} entity={a} kind="album" />)}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {tracks.length > 0 && (
        <section>
          <h2 className="mb-2 font-['Outfit',sans-serif] text-sm font-bold uppercase tracking-wider text-[var(--text-muted)]">
            Dainos ({tracks.length})
          </h2>
          <div className="overflow-x-auto rounded-xl border border-[var(--border-subtle)]">
            <table className="w-full">
              <thead className="bg-[var(--bg-elevated)]">
                <tr>
                  <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">ID</th>
                  <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Title / Artist</th>
                  <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Legacy</th>
                  <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Likes</th>
                  <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Cmts</th>
                  <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Source</th>
                  <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Actions</th>
                </tr>
              </thead>
              <tbody>
                {tracks.map(t => <Row key={t.id} entity={t} kind="track" />)}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {albums.length === 0 && tracks.length === 0 && (
        <div className="rounded-xl border border-dashed border-[var(--border-subtle)] bg-[var(--bg-elevated)] py-12 text-center text-[13px] text-[var(--text-muted)]">
          Nėra pending review entries. Paleisk{' '}
          <code className="rounded bg-[var(--card-bg)] px-1.5 py-0.5 text-[11px] text-[var(--accent-orange)]">
            python3 match_legacy_overlay.py --artist-id N
          </code>
          {' '}scriptą, kad sugeneruotum.
        </div>
      )}
    </div>
  )
}

export default function PendingReviewPage({
  searchParams,
}: {
  searchParams?: { artist?: string }
}) {
  const raw = searchParams?.artist
  const artistId = raw && /^\d+$/.test(raw) ? Number(raw) : undefined
  return (
    <Suspense fallback={<div className="p-8 text-[var(--text-muted)]">Kraunama…</div>}>
      <PendingTable artistId={artistId} />
    </Suspense>
  )
}
