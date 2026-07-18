'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import InboxTabs from '@/components/InboxTabs'
import { useInboxCounts } from '@/components/useInboxCounts'

type MatchedArtist = { id: number; name: string; slug: string; cover_image_url: string | null }

type WikiAlbumCandidate = {
  id: number
  source_url: string | null
  artist_raw: string
  album_title: string
  album_wiki_link: string | null
  release_year: number
  release_month: number
  release_day: number
  genres_raw: string[]
  label_raw: string | null
  matched_artist_id: number | null
  match_score: number | null
  status: string
  created_at: string
  matched_artist: MatchedArtist | null
}

type Enrichment = {
  source: 'musicbrainz' | 'apple' | 'none'
  cover_url: string | null
  year: number | null; month: number | null; day: number | null
  tracks: { position: number; title: string }[]
  track_count: number
  mb_release_id: string | null
  primary_type: string | null
  is_upcoming: boolean
  confidence: 'high' | 'medium' | 'low'
}

type EnrichState = { loading: boolean; data: Enrichment | null }

function formatDate(y: number, m: number, d: number) {
  try {
    return new Date(Date.UTC(y, (m || 1) - 1, d || 1)).toLocaleDateString('lt-LT', { year: 'numeric', month: 'long', day: 'numeric' })
  } catch {
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  }
}

const SOURCE_BADGE: Record<string, { label: string; cls: string }> = {
  musicbrainz: { label: 'MusicBrainz', cls: 'bg-emerald-100 text-emerald-700' },
  apple: { label: 'Apple Music', cls: 'bg-blue-100 text-blue-700' },
  none: { label: 'MB/Apple nerado', cls: 'bg-amber-100 text-amber-700' },
}

export default function WikiAlbumInboxPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [candidates, setCandidates] = useState<WikiAlbumCandidate[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<number | null>(null)
  const [errorMsg, setErrorMsg] = useState<Record<number, string>>({})
  const [enrich, setEnrich] = useState<Record<number, EnrichState>>({})
  const [scanning, setScanning] = useState(false)
  const [scanSummary, setScanSummary] = useState<any | null>(null)
  const [scanError, setScanError] = useState('')

  const isAdmin = ['editor', 'admin', 'super_admin'].includes(session?.user?.role || '')

  const { counts } = useInboxCounts()
  const grandTotal = counts ? (counts.total - counts.albums + total) : total

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/wiki-album-candidates?status=pending&limit=40')
      const j = await res.json()
      setCandidates(j.candidates || [])
      setTotal(j.total || 0)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (status === 'loading') return
    if (!isAdmin) { router.replace('/admin'); return }
    load()
  }, [status, isAdmin, router, load])

  // ── Praturtinimo eilė (concurrency-limited) — kad neapkrautume MusicBrainz ──
  // MB serverio pusėje throttle'inamas (500ms/call), tad ~3 lygiagretūs klientai
  // praktiškai serializuojasi; kortelės atsinaujina po vieną, kai atsakymai ateina.
  const enrichRef = useRef(enrich)
  enrichRef.current = enrich
  useEffect(() => {
    if (candidates.length === 0) return
    let cancelled = false
    const CONCURRENCY = 3
    const queue = candidates.map(c => c.id).filter(id => !enrichRef.current[id])
    if (queue.length === 0) return
    // Pažymim kaip loading iškart (kad nedubliuotume).
    setEnrich(prev => {
      const next = { ...prev }
      for (const id of queue) if (!next[id]) next[id] = { loading: true, data: null }
      return next
    })
    let idx = 0
    async function worker() {
      while (!cancelled && idx < queue.length) {
        const id = queue[idx++]
        try {
          const res = await fetch(`/api/admin/wiki-album-candidates/${id}/preview`)
          const j = await res.json()
          if (!cancelled) setEnrich(prev => ({ ...prev, [id]: { loading: false, data: j.enrichment || null } }))
        } catch {
          if (!cancelled) setEnrich(prev => ({ ...prev, [id]: { loading: false, data: null } }))
        }
      }
    }
    const workers = Array.from({ length: Math.min(CONCURRENCY, queue.length) }, () => worker())
    Promise.all(workers)
    return () => { cancelled = true }
  }, [candidates])

  async function runScanNow(dryRun: boolean) {
    setScanning(true); setScanError(''); setScanSummary(null)
    try {
      const res = await fetch('/api/admin/wiki-album-scout/trigger', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dry_run: dryRun }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) setScanError(j.error || `Klaida (HTTP ${res.status})`)
      else { setScanSummary(j.summary || j); if (!dryRun) await load() }
    } catch (e: any) {
      setScanError(e.message || 'Klaida')
    } finally {
      setScanning(false)
    }
  }

  async function reject(id: number) {
    setBusy(id)
    try {
      const res = await fetch(`/api/admin/wiki-album-candidates/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reject' }),
      })
      if (res.ok) setCandidates(prev => prev.filter(c => c.id !== id))
      else { const j = await res.json().catch(() => ({})); setErrorMsg(p => ({ ...p, [id]: j.error || 'Klaida' })) }
    } finally { setBusy(null) }
  }

  // Vieno-click „Pridėti" — naudoja praturtinimo rezultatą (MB pilnas / shell).
  async function addOneClick(c: WikiAlbumCandidate) {
    setBusy(c.id); setErrorMsg(p => ({ ...p, [c.id]: '' }))
    const e = enrich[c.id]?.data
    const useFull = !!(e && e.mb_release_id && e.track_count > 0)
    const body: any = {
      action: 'add',
      mode: useFull ? 'full' : 'shell',
      mb_release_id: e?.mb_release_id || null,
      cover_url: e?.cover_url || null,
      year: e?.year ?? undefined, month: e?.month ?? undefined, day: e?.day ?? undefined,
      primary_type: e?.primary_type || null,
    }
    try {
      const res = await fetch(`/api/admin/wiki-album-candidates/${c.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      const j = await res.json().catch(() => ({}))
      if (res.ok) { setCandidates(prev => prev.filter(x => x.id !== c.id)); setTotal(t => Math.max(0, t - 1)) }
      else setErrorMsg(p => ({ ...p, [c.id]: j.error || 'Klaida' }))
    } finally { setBusy(null) }
  }

  if (status === 'loading' || !isAdmin) return null

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <h1 className="text-base font-bold text-[var(--text-primary)] mb-3">
        📥 Inbox <span className="text-xs font-normal text-[var(--text-muted)]" title="Iš viso laukia: naujienos + renginiai + albumai">({grandTotal})</span>
      </h1>
      <InboxTabs />

      <p className="text-sm text-[var(--text-muted)] mb-3">
        Būsimi / nauji albumai (atlikėjai jau kataloge). Kiekvienam bandome rasti tracklist’ą, viršelį ir datą
        iš MusicBrainz / Apple Music — <strong>net jei Wikipedia straipsnio dar nėra</strong>. Peržiūrėk ir pridėk vienu paspaudimu.
      </p>

      <div className="mb-4 p-3 rounded-lg border border-[var(--input-border)] bg-[var(--surface-secondary)]">
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => runScanNow(false)} disabled={scanning}
            className="text-sm px-3 py-1.5 rounded bg-blue-600 text-white disabled:opacity-40">
            {scanning ? 'Skenuojama…' : '🔎 Paleisti scan\'ą dabar'}
          </button>
          <button onClick={() => runScanNow(true)} disabled={scanning}
            className="text-sm px-3 py-1.5 rounded border border-[var(--input-border)] disabled:opacity-40">
            Dry run (be rašymo)
          </button>
          <span className="text-xs text-[var(--text-muted)]">Automatiškai 1x/parą — mygtukas paleidžia iš karto.</span>
        </div>
        {scanError && <div className="text-xs text-red-600 mt-2">{scanError}</div>}
        {scanSummary && (
          <div className="text-xs text-[var(--text-muted)] mt-2 flex flex-wrap gap-x-4 gap-y-1">
            <span>naujai patikrinta: <strong>{scanSummary.total_fresh_checked}</strong></span>
            <span>auto-sukurta: <strong>{scanSummary.total_auto_committed}</strong></span>
            <span>į eilę: <strong>{scanSummary.total_queued_pending}</strong></span>
            {scanSummary.total_errors > 0 && <span className="text-red-600">klaidų: <strong>{scanSummary.total_errors}</strong></span>}
            {scanSummary.dry_run && <span className="text-amber-600">(dry run)</span>}
          </div>
        )}
      </div>

      {loading ? (
        <p className="text-sm text-[var(--text-muted)]">Kraunama…</p>
      ) : candidates.length === 0 ? (
        <p className="text-sm text-[var(--text-muted)]">Tuščia — nieko laukiančio.</p>
      ) : (
        <div className="space-y-2.5">
          {candidates.map((c) => {
            const es = enrich[c.id]
            const e = es?.data
            const enriching = es?.loading
            const badge = SOURCE_BADGE[e?.source || 'none']
            // Data: praturtinta (tikslesnė) arba kandidato.
            const dy = e?.year ?? c.release_year
            const dm = e?.month ?? c.release_month
            const dd = e?.day ?? c.release_day
            const cover = e?.cover_url || c.matched_artist?.cover_image_url || null
            const full = !!(e && e.mb_release_id && e.track_count > 0)
            return (
              <div key={c.id} className="border border-[var(--input-border)] rounded-lg p-2.5 flex gap-3">
                {/* Cover */}
                <div className="shrink-0 w-16 h-16 rounded-md overflow-hidden bg-[var(--bg-elevated)] flex items-center justify-center">
                  {cover ? (
                    <img src={cover} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  ) : (
                    <span className="text-2xl opacity-50">💿</span>
                  )}
                </div>

                {/* Info */}
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] text-[var(--text-muted)] flex items-center gap-1.5 flex-wrap">
                    <span>{formatDate(dy, dm, dd)}</span>
                    {e?.is_upcoming && <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700 font-medium">būsimas</span>}
                  </div>
                  <div className="font-medium leading-tight">
                    {c.matched_artist ? (
                      <span title="Atlikėjas jau kataloge">
                        <span className="text-emerald-600 mr-0.5" aria-label="kataloge">✅</span>
                        <Link href={`/atlikejai/${c.matched_artist.slug}`} className="text-blue-700 hover:underline" target="_blank">{c.matched_artist.name}</Link>
                      </span>
                    ) : (
                      <span title="Atlikėjo dar nėra kataloge — reikės sukurti">
                        <span className="text-amber-600 mr-0.5" aria-label="reikia sukurti">➕</span>
                        {c.artist_raw}
                      </span>
                    )}
                    {' — '}{c.album_title}
                  </div>
                  <div className="text-[12px] mt-1 flex items-center gap-1.5 flex-wrap">
                    {enriching ? (
                      <span className="text-[var(--text-muted)] inline-flex items-center gap-1">
                        <span className="w-3 h-3 border-2 border-[var(--text-muted)] border-t-transparent rounded-full animate-spin" /> Tikrinama…
                      </span>
                    ) : e ? (
                      <>
                        <span className={`px-1.5 py-0.5 rounded-full font-medium ${badge.cls}`}>{badge.label}</span>
                        {full ? (
                          <span className="text-emerald-700">🎵 {e.track_count} dainos</span>
                        ) : (
                          <span className="text-amber-600">be tracklist’o (skeletas)</span>
                        )}
                        {e.primary_type === 'EP' && <span className="text-[var(--text-muted)]">EP</span>}
                      </>
                    ) : (
                      <span className="text-amber-600">nerasta MB/Apple — pridės kaip skeletą</span>
                    )}
                  </div>

                  {errorMsg[c.id] && <div className="text-xs text-red-600 mt-1">{errorMsg[c.id]}</div>}

                  {/* Veiksmai */}
                  <div className="flex gap-2 mt-2 items-center flex-wrap">
                    <button onClick={() => addOneClick(c)} disabled={busy === c.id || enriching}
                      className="text-sm px-3 py-1 rounded bg-emerald-600 text-white disabled:opacity-40 font-medium">
                      {busy === c.id ? '…' : full ? `＋ Pridėti (${e!.track_count} d.)` : '＋ Pridėti (skeletas)'}
                    </button>
                    <button onClick={() => reject(c.id)} disabled={busy === c.id}
                      className="text-sm px-3 py-1 rounded border border-[var(--input-border)]">Atmesti</button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
