'use client'

/**
 * TrackSuggestPicker — modal track parinkimui inbox wizard'e.
 *
 * Naudojimas:
 *   <TrackSuggestPicker
 *     artistId={123}
 *     artistName="The Strokes"
 *     initialQuery="Falling Out of Love"
 *     embedUrls={['https://youtube.com/watch?v=abc']}
 *     onPick={(result) => {
 *       // result: { track_id, title, artist_name, video_url? }
 *       //   - jeigu egzistuojantis DB track'as: track_id iš DB
 *       //   - jeigu naujai sukurtas: track_id grąžintas quick-create endpoint'o
 *     }}
 *     onClose={() => setShow(false)}
 *   />
 *
 * Sekcijos (visada matomos kartu, scrollable single panel):
 *   1. 🎯 DB ir AI: matched fuzzy ILIKE + naujausi 5 + top 5
 *   2. 🎬 Iš YouTube embed'ų: parsina embed_urls
 *   3. 📖 Iš Wikipedia: singles iš artist'o infobox'o
 *   4. ✏️ Įvesti rankiniu: title + YT URL → quick-create
 */

import { useState, useEffect, useCallback } from 'react'
import FullscreenModal from '@/components/ui/FullscreenModal'

type DbTrack = {
  track_id: number
  title: string
  video_url: string | null
  score: number | null
  release_year: number | null
}

type YtEmbedTrack = {
  video_id: string
  title: string
  views: number | null
  uploaded_at: string | null
  thumb: string
  url: string
}

type WikiSingle = {
  title: string
  year: number | null
}

type Suggestions = {
  artist: { id: number; name: string; slug: string }
  q: string
  db_matches: DbTrack[]
  db_recent: DbTrack[]
  db_top: DbTrack[]
  yt_embeds: YtEmbedTrack[]
  wiki_singles: WikiSingle[]
  errors?: { wiki?: string }
}

export type PickResult = {
  track_id: number
  title: string
  artist_name: string
  video_url?: string | null
  already_existed?: boolean
}

export default function TrackSuggestPicker({
  artistId, artistName, initialQuery, embedUrls = [],
  onPick, onClose,
}: {
  artistId: number
  artistName: string
  initialQuery?: string
  embedUrls?: string[]
  onPick: (r: PickResult) => void
  onClose: () => void
}) {
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<Suggestions | null>(null)
  const [creating, setCreating] = useState<string | null>(null)
  const [manualTitle, setManualTitle] = useState(initialQuery || '')
  const [manualYtUrl, setManualYtUrl] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (initialQuery) params.set('q', initialQuery)
      for (const u of embedUrls) params.append('embed_url', u)
      const res = await fetch(`/api/admin/artists/${artistId}/track-suggestions?${params}`)
      if (res.ok) {
        const d = await res.json()
        setData(d)
      }
    } finally {
      setLoading(false)
    }
  }, [artistId, initialQuery, embedUrls])

  useEffect(() => { load() }, [load])

  const pickExisting = (t: DbTrack) => {
    onPick({
      track_id: t.track_id,
      title: t.title,
      artist_name: artistName,
      video_url: t.video_url,
      already_existed: true,
    })
  }

  const createNew = async (title: string, ytUrl: string | null, sourceLabel: string) => {
    if (!title.trim()) return
    setCreating(sourceLabel)
    try {
      const res = await fetch('/api/admin/tracks/quick-create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          artist_id: artistId,
          youtube_url: ytUrl,
        }),
      })
      const d = await res.json()
      if (!res.ok) {
        alert(`Klaida: ${d.error || 'Nežinoma'}`)
        return
      }
      onPick({
        track_id: d.track_id,
        title: d.title,
        artist_name: artistName,
        video_url: d.youtube_url || ytUrl,
        already_existed: !!d.already_existed,
      })
    } finally {
      setCreating(null)
    }
  }

  return (
    <FullscreenModal
      onClose={onClose}
      title={`🎵 ${artistName}: dainos pasirinkimas`}
      maxWidth="max-w-2xl"
      noPadding
    >
      {/* Header su quick search */}
      <div className="px-4 py-3 border-b border-gray-200 shrink-0 bg-white">
        <p className="text-xs text-gray-500 mb-2">
          Pasirink iš DB, YouTube embed'ų, Wikipedia, arba sukurk naują.
        </p>
        <input
          type="text"
          value={manualTitle}
          onChange={e => setManualTitle(e.target.value)}
          placeholder="Dainos pavadinimas..."
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white text-gray-800 focus:outline-none focus:border-blue-400"
        />
      </div>

      {/* Scrollable sections */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4 bg-gray-50">
        {loading && (
          <div className="flex justify-center py-8">
            <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {/* DB matches (jei q + jei radom) */}
        {!loading && data && (data.db_matches.length > 0) && (
          <Section title={`🎯 Mūsų bazėje atitinka „${data.q}"`} count={data.db_matches.length}>
            {data.db_matches.map(t => (
              <DbTrackRow key={t.track_id} t={t} onPick={() => pickExisting(t)} />
            ))}
          </Section>
        )}

        {/* YT embeds */}
        {!loading && data && data.yt_embeds.length > 0 && (
          <Section title="🎬 Straipsnyje rasti YouTube video" count={data.yt_embeds.length}>
            {data.yt_embeds.map(yt => (
              <YtRow
                key={yt.video_id}
                yt={yt}
                isCreating={creating === `yt-${yt.video_id}`}
                onCreate={() => createNew(yt.title, yt.url, `yt-${yt.video_id}`)}
              />
            ))}
          </Section>
        )}

        {/* Wiki recent singles */}
        {!loading && data && data.wiki_singles.length > 0 && (
          <Section title="📖 Wikipedia naujausi singlai" count={data.wiki_singles.length}>
            {data.wiki_singles.map((ws, i) => (
              <WikiRow
                key={`${ws.title}-${i}`}
                w={ws}
                isCreating={creating === `wiki-${ws.title}`}
                onCreate={() => createNew(ws.title, null, `wiki-${ws.title}`)}
              />
            ))}
          </Section>
        )}

        {/* DB recent */}
        {!loading && data && data.db_recent.length > 0 && (
          <Section title="🆕 Naujausios atlikėjo dainos" count={data.db_recent.length}>
            {data.db_recent.map(t => (
              <DbTrackRow key={t.track_id} t={t} onPick={() => pickExisting(t)} />
            ))}
          </Section>
        )}

        {/* DB top */}
        {!loading && data && data.db_top.length > 0 && (
          <Section title="⭐ Top atlikėjo dainos" count={data.db_top.length}>
            {data.db_top.map(t => (
              <DbTrackRow key={t.track_id} t={t} onPick={() => pickExisting(t)} />
            ))}
          </Section>
        )}

        {/* Manual create */}
        <Section title="✏️ Sukurti rankiniu būdu" count={null}>
          <div className="space-y-2">
            <input
              type="text"
              value={manualTitle}
              onChange={e => setManualTitle(e.target.value)}
              placeholder="Pavadinimas..."
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white text-gray-800"
            />
            <input
              type="url"
              value={manualYtUrl}
              onChange={e => setManualYtUrl(e.target.value)}
              placeholder="YouTube URL (neprivaloma)"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white text-gray-800"
            />
            <button
              type="button"
              onClick={() => createNew(manualTitle, manualYtUrl || null, 'manual')}
              disabled={!manualTitle.trim() || creating !== null}
              className="w-full px-3 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg text-sm font-bold">
              {creating === 'manual' ? '...' : '+ Sukurti'}
            </button>
          </div>
        </Section>

        {!loading && data && data.errors?.wiki && (
          <p className="text-xs text-gray-400 italic">
            (Wiki: {data.errors.wiki})
          </p>
        )}
      </div>
    </FullscreenModal>
  )
}

// ─── Helpers ────────────────────────────────────────────────────

function Section({ title, count, children }: { title: string; count: number | null; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-3 py-2 text-xs font-semibold text-gray-600 uppercase tracking-wide bg-gray-50 border-b border-gray-100">
        {title}{count !== null && <span className="ml-1 opacity-60">({count})</span>}
      </div>
      <div className="p-2 space-y-1.5">
        {children}
      </div>
    </div>
  )
}

function DbTrackRow({ t, onPick }: { t: DbTrack; onPick: () => void }) {
  return (
    <button
      type="button"
      onClick={onPick}
      className="w-full text-left flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-blue-50 transition-colors">
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-gray-800 truncate">{t.title}</div>
        <div className="text-[10px] text-gray-500">
          {t.release_year || '—'} · score {t.score ?? '—'} · {t.video_url ? '🎬 YT' : 'no YT'}
        </div>
      </div>
      <span className="text-xs text-blue-600 font-semibold whitespace-nowrap">Pridėti →</span>
    </button>
  )
}

function YtRow({ yt, isCreating, onCreate }: { yt: YtEmbedTrack; isCreating: boolean; onCreate: () => void }) {
  const views = yt.views ? formatViews(yt.views) : null
  const uploaded = yt.uploaded_at ? new Date(yt.uploaded_at).getFullYear() : null
  return (
    <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-amber-50">
      <img src={yt.thumb} alt="" className="w-14 h-10 object-cover rounded shrink-0 bg-gray-200" />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-gray-800 truncate">{yt.title}</div>
        <div className="text-[10px] text-gray-500 truncate">
          {views && `👁 ${views}`}{views && uploaded && ' · '}{uploaded || ''}
        </div>
      </div>
      <button
        type="button"
        onClick={onCreate}
        disabled={isCreating}
        className="px-2 py-1 bg-amber-100 hover:bg-amber-200 disabled:opacity-50 text-amber-800 rounded text-xs font-medium whitespace-nowrap">
        {isCreating ? '...' : '+ Sukurti'}
      </button>
    </div>
  )
}

function formatViews(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`
  return String(n)
}

function WikiRow({ w, isCreating, onCreate }: { w: WikiSingle; isCreating: boolean; onCreate: () => void }) {
  return (
    <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-purple-50">
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-gray-800 truncate">{w.title}</div>
        <div className="text-[10px] text-gray-500">
          {w.year || '—'}
        </div>
      </div>
      <button
        type="button"
        onClick={onCreate}
        disabled={isCreating}
        className="px-2 py-1 bg-purple-100 hover:bg-purple-200 disabled:opacity-50 text-purple-800 rounded text-xs font-medium whitespace-nowrap">
        {isCreating ? '...' : '+ Sukurti'}
      </button>
    </div>
  )
}
