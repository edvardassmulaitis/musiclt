'use client'
/**
 * AdminQuickAdd — vienas laukas „greitam pridėjimui".
 *
 * Įmesk nuorodą + Enter (arba mygtukas) → procesas pasileidžia:
 *   - YouTube nuoroda  → sukuria dainą (atlikėjo auto-detect, YT įkėlimo data
 *                        kaip išleidimo diena, views/lyrics/spotify enrich)
 *   - Wikipedia nuoroda → sukuria albumą (atlikėjas + tracklist iš Wiki)
 *
 * Jokio papildomo konfigūravimo — vienas POST /api/admin/quick-add.
 */
import { useState } from 'react'
import Link from 'next/link'

type Result = any

function detectKind(url: string): 'track' | 'album' | 'unknown' {
  const u = (url || '').trim().toLowerCase()
  if (!u) return 'unknown'
  if (/youtube\.com|youtu\.be/.test(u)) return 'track'
  if (/wikipedia\.org\/wiki\//.test(u)) return 'album'
  return 'unknown'
}

export default function AdminQuickAdd() {
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<Result | null>(null)
  const [error, setError] = useState<string | null>(null)

  const kind = detectKind(url)

  async function run() {
    const trimmed = url.trim()
    if (!trimmed || loading) return
    setLoading(true)
    setResult(null)
    setError(null)
    try {
      const res = await fetch('/api/admin/quick-add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: trimmed }),
      })
      const json = await res.json().catch(() => null)
      if (!json) {
        setError('Serveris negrąžino atsakymo')
      } else if (json.ok) {
        setResult(json)
        setUrl('')
      } else {
        setError(json.error || 'Nepavyko')
      }
    } catch (e: any) {
      setError(String(e?.message || e))
    } finally {
      setLoading(false)
    }
  }

  const hint =
    kind === 'track' ? '🎵 Daina iš YouTube'
    : kind === 'album' ? '💿 Albumas iš Wikipedia'
    : url.trim() ? '❓ Nepalaikoma nuoroda'
    : 'YouTube → daina · Wikipedia albumas → albumas'

  return (
    <div className="rounded-xl border border-[var(--input-border)] bg-[var(--bg-surface)] p-4">
      <div className="mb-2 flex items-baseline gap-2">
        <span className="text-lg">⚡</span>
        <h2 className="font-['Outfit',sans-serif] text-sm font-extrabold uppercase tracking-[0.12em] text-[var(--text-secondary)]">
          Greitas pridėjimas
        </h2>
        <span className="text-[11px] text-[var(--text-faint)]">— {hint}</span>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          type="url"
          inputMode="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') run() }}
          placeholder="Įmesk YouTube arba Wikipedia albumo nuorodą…"
          disabled={loading}
          className="min-h-[44px] flex-1 rounded-lg border border-[var(--input-border)] bg-[var(--bg-elevated)] px-3 text-[var(--text-primary)] placeholder:text-[var(--text-faint)] focus:border-[var(--border-strong)] focus:outline-none disabled:opacity-60"
        />
        <button
          onClick={run}
          disabled={loading || kind === 'unknown'}
          className="min-h-[44px] shrink-0 rounded-lg bg-music-blue px-5 font-semibold text-white transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? 'Apdorojama…' : 'Pridėti'}
        </button>
      </div>

      {loading && (
        <p className="mt-2 text-[12px] text-[var(--text-muted)]">
          {kind === 'album'
            ? 'Parsinu Wikipedia albumą — atlikėjas, tracklist, viršelis…'
            : 'Tikrinu YouTube — atlikėjas, įkėlimo data, views, lyrics, Spotify…'}
        </p>
      )}

      {error && (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-700">
          {error}
        </div>
      )}

      {result?.ok && <ResultCard result={result} />}
    </div>
  )
}

function Chip({ children, tone = 'default' }: { children: React.ReactNode; tone?: 'default' | 'ok' | 'warn' }) {
  const cls =
    tone === 'ok' ? 'bg-green-100 text-green-700 border-green-200'
    : tone === 'warn' ? 'bg-orange-100 text-orange-700 border-orange-200'
    : 'bg-[var(--bg-elevated)] text-[var(--text-muted)] border-[var(--border-subtle)]'
  return <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${cls}`}>{children}</span>
}

function ResultCard({ result }: { result: Result }) {
  const isTrack = result.kind === 'track'
  const entityHref = isTrack
    ? `/admin/tracks/${result.track.id}`
    : `/admin/albums/${result.album.id}`
  const entityTitle = isTrack ? result.track.title : result.album.title
  const warnings: string[] = result.warnings || []

  return (
    <div className="mt-3 rounded-lg border border-green-200 bg-green-50 px-3 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-base">{isTrack ? '🎵' : '💿'}</span>
        <Link href={entityHref} className="font-semibold text-music-blue hover:underline">
          {entityTitle}
        </Link>
        <span className="text-[13px] text-[var(--text-muted)]">·</span>
        <Link href={`/admin/artists/${result.artist.id}`} className="text-[13px] text-[var(--text-secondary)] hover:underline">
          {result.artist.name}
        </Link>
        {result.artist.created && <Chip tone="warn">naujas atlikėjas</Chip>}
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {isTrack ? (
          <>
            {result.detail.upload_date && (
              <Chip>išleista {String(result.detail.upload_date).slice(0, 10)}</Chip>
            )}
            {result.detail.views != null && (
              <Chip>{Number(result.detail.views).toLocaleString('lt-LT')} views</Chip>
            )}
            <Chip tone={result.detail.lyrics_found ? 'ok' : 'default'}>
              {result.detail.lyrics_found ? 'lyrics ✓' : 'lyrics —'}
            </Chip>
            <Chip tone={result.detail.spotify_found ? 'ok' : 'default'}>
              {result.detail.spotify_found ? 'Spotify ✓' : 'Spotify —'}
            </Chip>
            <Chip tone={result.detail.embeddable === false ? 'warn' : 'default'}>
              {result.detail.embeddable === false ? 'embed blokuotas' : 'embed ✓'}
            </Chip>
            {(result.detail.featuring || []).length > 0 && (
              <Chip tone="ok">feat. {result.detail.featuring.join(', ')}</Chip>
            )}
          </>
        ) : (
          <>
            {result.detail.year && <Chip>{result.detail.year}</Chip>}
            <Chip tone={result.detail.track_count ? 'ok' : 'warn'}>
              {result.detail.track_count} dainos
            </Chip>
            <Chip tone={result.detail.cover_found ? 'ok' : 'default'}>
              {result.detail.cover_found ? 'viršelis ✓' : 'be viršelio'}
            </Chip>
            {(result.detail.genres || []).slice(0, 4).map((g: string) => <Chip key={g}>{g}</Chip>)}
          </>
        )}
      </div>

      {warnings.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-[12px] text-orange-700">
          {warnings.map((w, i) => <li key={i}>⚠ {w}</li>)}
        </ul>
      )}
    </div>
  )
}
