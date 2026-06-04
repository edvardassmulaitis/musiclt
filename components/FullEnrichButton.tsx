'use client'

// Pilnas atlikėjo enrich — vienu mygtuku per esamus endpoint'us:
//   1) YouTube (video_url + view counts) — /api/admin/yt/artist/[id]/enrich
//   2) Tekstai (LRCLib) — /api/admin/lyrics/lrclib per kiekvieną track be teksto
// Viršeliai ateina importo metu (Spotify oEmbed) + YT thumbnail fallback display'e.
//
// Orkestruojama client'e (kiekvienas call atskiras request) — išvengiam Vercel
// function timeout'ų dideliems diskografijoms.

import { useState } from 'react'

interface EnrichProgress {
  phase: 'idle' | 'yt' | 'lyrics' | 'done' | 'error'
  ytFoundNew?: number
  ytViews?: number
  lyricsTotal?: number
  lyricsDone?: number
  lyricsFound?: number
  error?: string
}

async function runPool<T>(items: T[], concurrency: number, worker: (item: T) => Promise<void>) {
  let i = 0
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++
      try { await worker(items[idx]) } catch { /* ignore single failure */ }
    }
  })
  await Promise.all(runners)
}

export default function FullEnrichButton({ artistId, onDone, compact }: { artistId: string | number; onDone?: () => void; compact?: boolean }) {
  const [p, setP] = useState<EnrichProgress>({ phase: 'idle' })
  const running = p.phase === 'yt' || p.phase === 'lyrics'

  async function run() {
    setP({ phase: 'yt' })
    try {
      // 1) YouTube — videos + view counts
      let ytFoundNew = 0, ytViews = 0
      try {
        const r = await fetch(`/api/admin/yt/artist/${artistId}/enrich`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshViews: true, refreshAfterDays: 30 }),
        })
        const j = await r.json()
        if (r.ok && j.ok) { ytFoundNew = j.foundNew ?? 0; ytViews = j.viewsUpdated ?? 0 }
      } catch { /* tęsiam su lyrics net jei YT krito */ }

      // 2) Lyrics — tracks be teksto
      setP({ phase: 'lyrics', ytFoundNew, ytViews, lyricsTotal: 0, lyricsDone: 0, lyricsFound: 0 })
      const tr = await fetch(`/api/tracks?artist_id=${artistId}&limit=2000`)
      const td = await tr.json()
      const candidates = (td.tracks || []).filter((t: any) => !t.has_lyrics && t.type !== 'instrumental')

      let done = 0, found = 0
      setP(s => ({ ...s, lyricsTotal: candidates.length }))
      await runPool(candidates, 3, async (t: any) => {
        try {
          const r = await fetch('/api/admin/lyrics/lrclib', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ track_id: t.id }),
          })
          const j = await r.json()
          if (j?.found) found++
        } finally {
          done++
          setP(s => ({ ...s, lyricsDone: done, lyricsFound: found }))
        }
      })

      setP({ phase: 'done', ytFoundNew, ytViews, lyricsTotal: candidates.length, lyricsDone: done, lyricsFound: found })
      onDone?.()
    } catch (e: any) {
      setP({ phase: 'error', error: e?.message || 'fail' })
    }
  }

  const label = (() => {
    if (p.phase === 'yt') return 'YouTube…'
    if (p.phase === 'lyrics') return `Tekstai ${p.lyricsDone ?? 0}/${p.lyricsTotal ?? 0}…`
    if (p.phase === 'done') return `✓ YT +${p.ytFoundNew} · 👁${p.ytViews} · 📝 +${p.lyricsFound}`
    if (p.phase === 'error') return '✗ Klaida'
    return '🚀 Pilnas enrich'
  })()

  return (
    <div className={compact ? '' : 'inline-flex flex-col gap-1'}>
      <button
        type="button"
        onClick={run}
        disabled={running}
        className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-purple-700 disabled:opacity-60"
        title="YouTube video + peržiūros + dainų tekstai (LRCLib). Viršeliai ateina importo metu."
      >
        {label}
      </button>
      {p.phase === 'done' && (
        <span className="text-[11px] text-[var(--text-muted)]">
          YouTube: {p.ytFoundNew} nauji video, {p.ytViews} peržiūrų atnaujinta · Tekstai: {p.lyricsFound} rasta iš {p.lyricsTotal}
        </span>
      )}
      {p.phase === 'error' && <span className="text-[11px] text-red-500">{p.error}</span>}
    </div>
  )
}
