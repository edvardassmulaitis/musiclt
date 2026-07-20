'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import InboxTabs from '@/components/InboxTabs'
import { useInboxCounts } from '@/components/useInboxCounts'

type MatchedArtist = { id: number; name: string; slug: string; cover_image_url: string | null; score: number | null }

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
  preview_payload?: Enrichment | null
  preview_at?: string | null
  /** Jei albumas JAU yra kataloge, bet kaip „skeletas" (0 dainų) — pridėjus bus
   *  papildytas, ne dublikuotas. (Realūs dublikatai su dainom išfiltruojami serveryje.) */
  existing_album?: { id: number; empty: boolean } | null
}

type Enrichment = {
  source: 'wikipedia' | 'musicbrainz' | 'apple' | 'none'
  source_url: string | null
  cover_url: string | null
  year: number | null; month: number | null; day: number | null
  tracks: { position: number; title: string }[]
  track_count: number
  mb_release_id: string | null
  primary_type: string | null
  types: string[]
  is_upcoming: boolean
  confidence: 'high' | 'medium' | 'low'
  artist_signal?: { article: string | null; pageviews_monthly: number | null; description: string | null } | null
}

type EnrichState = { loading: boolean; data: Enrichment | null }

function formatDate(y: number, m: number, d: number) {
  try {
    return new Date(Date.UTC(y, (m || 1) - 1, d || 1)).toLocaleDateString('lt-LT', { year: 'numeric', month: 'long', day: 'numeric' })
  } catch {
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  }
}

function wikiUrl(title: string) {
  return `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`
}

const SOURCE_BADGE: Record<string, { label: string; cls: string }> = {
  wikipedia: { label: 'Wikipedia', cls: 'bg-emerald-100 text-emerald-700' },
  musicbrainz: { label: 'MusicBrainz', cls: 'bg-emerald-100 text-emerald-700' },
  apple: { label: 'Apple Music', cls: 'bg-blue-100 text-blue-700' },
  none: { label: 'nerasta šaltinio', cls: 'bg-amber-100 text-amber-700' },
}

export default function WikiAlbumInboxPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [candidates, setCandidates] = useState<WikiAlbumCandidate[]>([])
  const [total, setTotal] = useState(0)
  const [years, setYears] = useState<{ year: number; count: number }[]>([])
  const [selectedYear, setSelectedYear] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  // Set — kad KELIS albumus būtų galima kelti vienu metu (kiekvienas savo spinner'į).
  const [busy, setBusy] = useState<Set<number>>(new Set())
  const startBusy = (id: number) => setBusy(prev => { const n = new Set(prev); n.add(id); return n })
  const endBusy = (id: number) => setBusy(prev => { const n = new Set(prev); n.delete(id); return n })
  const [errorMsg, setErrorMsg] = useState<Record<number, string>>({})
  const [enrich, setEnrich] = useState<Record<number, EnrichState>>({})
  const [scanning, setScanning] = useState(false)
  const [scanSummary, setScanSummary] = useState<any | null>(null)
  const [scanError, setScanError] = useState('')

  const isAdmin = ['editor', 'admin', 'super_admin'].includes(session?.user?.role || '')

  const { counts } = useInboxCounts()
  const grandTotal = counts ? (counts.total - counts.albums + total) : total

  const load = useCallback(async (year?: number) => {
    setLoading(true)
    try {
      const qs = year ? `&year=${year}` : ''
      const res = await fetch(`/api/admin/wiki-album-candidates?status=pending&limit=40${qs}`)
      const j = await res.json()
      const cands: WikiAlbumCandidate[] = j.candidates || []
      setCandidates(cands)
      setTotal(j.total || 0)
      if (Array.isArray(j.years)) setYears(j.years)
      if (typeof j.year === 'number') setSelectedYear(j.year)
      // Seed'inam enrichment iš cache (preview_payload) — tie nebus fetch'inami iš naujo.
      const seed: Record<number, EnrichState> = {}
      for (const c of cands) {
        const FRESH = 14 * 24 * 60 * 60 * 1000
        const at = c.preview_at ? Date.parse(c.preview_at) : 0
        if (c.preview_payload && at && (Date.now() - at) < FRESH) seed[c.id] = { loading: false, data: c.preview_payload }
      }
      if (Object.keys(seed).length > 0) setEnrich(prev => ({ ...seed, ...prev }))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (status === 'loading') return
    if (!isAdmin) { router.replace('/admin'); return }
    load()
  }, [status, isAdmin, router, load])

  // ── Praturtinimo eilė: STABILUS ref-based pool (concurrency-limited) ──
  // MB serverio pusėje throttle'inamas; ~3 lygiagretūs klientai serializuojasi.
  // SVARBU: nebekuriam eilės iš naujo, kai `candidates` keičiasi (pridėjus/atmetus).
  // Anksčiau tai nutraukdavo vykstančius fetch'us, o „loading" kortelės būdavo
  // išbrauktos iš naujos eilės (`enrichRef[id]` truthy) → likdavo amžinai „Tikrinama…"
  // ir kartodavo fetch'us be reikalo. Dabar: kiekvienas ID apdorojamas VIENĄ kartą,
  // pool'as savaime pumpuoja likusius, o pridėjimas/atmetimas eilės neliečia.
  const enrichRef = useRef(enrich)
  enrichRef.current = enrich
  const enrichSeenRef = useRef<Set<number>>(new Set())
  const enrichQueueRef = useRef<number[]>([])
  const enrichRunningRef = useRef(0)

  const pumpEnrich = useCallback(() => {
    const CONCURRENCY = 3
    while (enrichRunningRef.current < CONCURRENCY && enrichQueueRef.current.length > 0) {
      const id = enrichQueueRef.current.shift()!
      enrichRunningRef.current++
      fetch(`/api/admin/wiki-album-candidates/${id}/preview`)
        .then(r => r.json())
        .then(j => setEnrich(prev => ({ ...prev, [id]: { loading: false, data: j.enrichment || null } })))
        .catch(() => setEnrich(prev => ({ ...prev, [id]: { loading: false, data: null } })))
        .finally(() => { enrichRunningRef.current--; pumpEnrich() })
    }
  }, [])

  useEffect(() => {
    if (candidates.length === 0) return
    const FRESH = 14 * 24 * 60 * 60 * 1000
    const newIds: number[] = []
    for (const c of candidates) {
      if (enrichSeenRef.current.has(c.id)) continue // jau apdorotas/eilėje — VIENĄ kartą
      enrichSeenRef.current.add(c.id)
      const at = c.preview_at ? Date.parse(c.preview_at) : 0
      const hasFresh = !!enrichRef.current[c.id]?.data || !!(c.preview_payload && at && (Date.now() - at) < FRESH)
      if (hasFresh) continue // jau turi šviežų cache — jokio fetch'o
      enrichQueueRef.current.push(c.id)
      newIds.push(c.id)
    }
    if (newIds.length > 0) {
      setEnrich(prev => {
        const next = { ...prev }
        for (const id of newIds) if (!next[id]) next[id] = { loading: true, data: null }
        return next
      })
      pumpEnrich()
    }
  }, [candidates, pumpEnrich])

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
    startBusy(id)
    try {
      const res = await fetch(`/api/admin/wiki-album-candidates/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reject' }),
      })
      if (res.ok) setCandidates(prev => prev.filter(c => c.id !== id))
      else { const j = await res.json().catch(() => ({})); setErrorMsg(p => ({ ...p, [id]: j.error || 'Klaida' })) }
    } finally { endBusy(id) }
  }

  // Vieno-click „Pridėti" — naudoja praturtinimo rezultatą (MB pilnas / shell).
  async function addOneClick(c: WikiAlbumCandidate) {
    startBusy(c.id); setErrorMsg(p => ({ ...p, [c.id]: '' }))
    const e = enrich[c.id]?.data
    // „full" MB commit'as TIK kai šaltinis realiai musicbrainz (turi tracklistą).
    // Apple metaduomenys kartais neša mb_release_id iš MB release'o BE dainų — tada
    // commitAlbumFromMb mestų „MusicBrainz release be tracklist'o" (Willow atvejis).
    const useFull = !!(e && e.source === 'musicbrainz' && e.mb_release_id && e.track_count > 0)
    const body: any = {
      action: 'add',
      mode: useFull ? 'full' : 'shell',
      mb_release_id: e?.mb_release_id || null,
      cover_url: e?.cover_url || null,
      year: e?.year ?? undefined, month: e?.month ?? undefined, day: e?.day ?? undefined,
      primary_type: e?.primary_type || null,
      types: e?.types || [],
    }
    try {
      const res = await fetch(`/api/admin/wiki-album-candidates/${c.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      const j = await res.json().catch(() => ({}))
      if (res.ok) { setCandidates(prev => prev.filter(x => x.id !== c.id)); setTotal(t => Math.max(0, t - 1)) }
      else setErrorMsg(p => ({ ...p, [c.id]: j.error || 'Klaida' }))
    } finally { endBusy(c.id) }
  }

  if (status === 'loading' || !isAdmin) return null

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between gap-2 mb-3">
        <h1 className="text-base font-bold text-[var(--text-primary)]">
          📥 Inbox <span className="text-xs font-normal text-[var(--text-muted)]" title="Iš viso laukia: naujienos + renginiai + albumai">({grandTotal})</span>
        </h1>
        <button onClick={() => runScanNow(false)} disabled={scanning} title="Paleisti Wikipedia albumų scan'ą"
          className="text-xs px-2.5 py-1 rounded-full border border-[var(--input-border)] text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] disabled:opacity-40 shrink-0">
          {scanning ? '⏳ Skenuoja…' : '🔎 Scan'}
        </button>
      </div>
      <InboxTabs />

      {/* Metų tab'ai — rodom tik metus, kurie turi laukiančių kandidatų */}
      {years.length > 1 && (
        <div className="flex items-center gap-1.5 mt-3 mb-1 flex-wrap">
          {years.map(y => (
            <button key={y.year} onClick={() => load(y.year)}
              className={`text-sm px-3 py-1 rounded-full border transition-colors ${
                selectedYear === y.year
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'border-[var(--input-border)] text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]'
              }`}>
              {y.year} <span className="opacity-70">({y.count})</span>
            </button>
          ))}
        </div>
      )}
      {scanError && <div className="text-xs text-red-600 mt-2">{scanError}</div>}
      <div className="mb-3" />

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
            // TIK realus albumo viršelis (be atlikėjo cover fallback'o — klaidina).
            const cover = e?.cover_url || null
            // „full" = pridedant bus SUKELTAS tikras tracklistas. Wikipedia (wiki
            // straipsnio tracklistas) IR MusicBrainz — taip; Apple — NE (tik metaduomenys,
            // placeholder pavadinimai), tad Apple atveju rodom „(be tracklisto)".
            const full = !!(e && e.track_count > 0 && (e.source === 'wikipedia' || e.source === 'musicbrainz' || (e.source === 'apple' && (e.tracks?.length || 0) > 0)))
            const hasTracks = !!(e && e.track_count > 0)
            // Title nuoroda: Wikipedia (jei yra) arba šaltinis (MusicBrainz/Apple).
            const titleHref = c.album_wiki_link ? wikiUrl(c.album_wiki_link) : (e?.source_url || null)
            const extraTypes = (e?.types || []).filter(t => t && t.toLowerCase() !== 'album')
            return (
              <div key={c.id} className="border border-[var(--input-border)] rounded-lg p-2.5 flex gap-3">
                {/* Cover — rodom TIK jei yra realus albumo viršelis */}
                {cover && (
                  <div className="shrink-0 w-16 h-16 rounded-md overflow-hidden bg-[var(--bg-elevated)]">
                    <img src={cover} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  </div>
                )}

                {/* Info */}
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] text-[var(--text-muted)] flex items-center gap-1.5 flex-wrap">
                    <span>{formatDate(dy, dm, dd)}</span>
                    {e?.is_upcoming && <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700 font-medium">būsimas</span>}
                  </div>
                  <div className="font-medium leading-tight">
                    {c.matched_artist ? (
                      <span title="Atlikėjas jau kataloge" className="inline-flex items-center gap-1 align-baseline">
                        <span className="text-emerald-600" aria-label="kataloge">✅</span>
                        <Link href={`/admin/artists/${c.matched_artist.id}`} className="text-blue-700 hover:underline" target="_blank" rel="noopener noreferrer" title="Redaguoti atlikėją (admin)">{c.matched_artist.name}</Link>
                        <a href={`/atlikejai/${c.matched_artist.slug}`} target="_blank" rel="noopener noreferrer" title="Viešas atlikėjo puslapis" className="text-[11px] opacity-50 hover:opacity-100 no-underline">↗</a>
                        {typeof c.matched_artist.score === 'number' && (
                          <span title="Atlikėjo populiarumo score (0–100)" className="text-[11px] text-[var(--text-muted)] font-medium">🔥 {Math.round(c.matched_artist.score)}</span>
                        )}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 align-baseline" title="Atlikėjo dar nėra kataloge — reikės sukurti">
                        <span className="text-amber-600" aria-label="reikia sukurti">➕</span>
                        {c.artist_raw}
                        {(() => {
                          const sig = e?.artist_signal
                          if (!sig) return null
                          const pv = sig.pageviews_monthly
                          if (typeof pv !== 'number') return sig.article ? (
                            <a href={`https://en.wikipedia.org/wiki/${encodeURIComponent(sig.article.replace(/ /g, '_'))}`} target="_blank" rel="noopener noreferrer" className="text-[11px] opacity-50 hover:opacity-100 no-underline" title="Wikipedia straipsnis">🌐</a>
                          ) : null
                          // Vertingumo spalva pagal Wikipedia peržiūras/mėn (grubus proxy).
                          const cls = pv >= 20000 ? 'bg-emerald-100 text-emerald-700'
                            : pv >= 3000 ? 'bg-sky-100 text-sky-700'
                            : 'bg-[var(--bg-elevated)] text-[var(--text-muted)]'
                          const label = pv >= 1000 ? `${Math.round(pv / 1000)}k` : `${pv}`
                          return (
                            <a href={sig.article ? `https://en.wikipedia.org/wiki/${encodeURIComponent(sig.article.replace(/ /g, '_'))}` : '#'}
                              target="_blank" rel="noopener noreferrer"
                              title={`Wikipedia peržiūros/mėn: ~${pv.toLocaleString()}${sig.description ? ' · ' + sig.description : ''} — populiarumo proxy (vertas/ne)`}
                              className={`text-[11px] px-1.5 py-0.5 rounded-full font-medium no-underline ${cls}`}>
                              👁 {label}/mėn
                            </a>
                          )
                        })()}
                      </span>
                    )}
                    {' — '}
                    {titleHref ? (
                      <a href={titleHref} target="_blank" rel="noopener noreferrer"
                        className="hover:underline decoration-dotted underline-offset-2"
                        title={c.album_wiki_link ? 'Atidaryti Wikipedia straipsnį' : 'Atidaryti šaltinį'}>
                        {c.album_title} <span className="text-[10px] align-super opacity-60">↗</span>
                      </a>
                    ) : c.album_title}
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
                          <span className="text-emerald-700">🎵 {e!.track_count} dainos</span>
                        ) : hasTracks ? (
                          <span className="text-amber-600" title="Apple/šaltinis rodo dainų skaičių, bet tikro tracklisto neturim — pridės kaip skeletą; dainos užsipildys vėliau (MB) arba rankiniu būdu">🎵 {e!.track_count} d. (be tracklisto)</span>
                        ) : (
                          <span className="text-amber-600">be tracklist’o (skeletas)</span>
                        )}
                        {extraTypes.map(t => (
                          <span key={t} className="px-1.5 py-0.5 rounded-full bg-[var(--bg-elevated)] text-[var(--text-secondary)] font-medium">{t}</span>
                        ))}
                      </>
                    ) : (
                      <span className="text-amber-600">nerasta MB/Apple — pridės kaip skeletą</span>
                    )}
                    {c.existing_album && (
                      <a href={`/admin/albums/${c.existing_album.id}`} target="_blank" rel="noopener noreferrer"
                        title="Albumas jau yra kataloge kaip skeletas (0 dainų) — pridėjus bus papildytas, ne dublikuotas"
                        className="px-1.5 py-0.5 rounded-full bg-sky-100 text-sky-700 font-medium no-underline hover:bg-sky-200">
                        📀 jau kataloge (skeletas) — bus papildytas ↗
                      </a>
                    )}
                  </div>

                  {errorMsg[c.id] && <div className="text-xs text-red-600 mt-1">{errorMsg[c.id]}</div>}

                  {/* Veiksmai */}
                  <div className="flex gap-2 mt-2 items-center flex-wrap">
                    <button onClick={() => addOneClick(c)} disabled={busy.has(c.id) || enriching}
                      className="text-sm px-3 py-1 rounded bg-emerald-600 text-white disabled:opacity-40 font-medium">
                      {busy.has(c.id) ? '…' : c.existing_album
                        ? (full ? `↻ Papildyti (${e!.track_count} d.)` : '↻ Papildyti')
                        : (full ? `＋ Pridėti (${e!.track_count} d.)` : '＋ Pridėti (skeletas)')}
                    </button>
                    <button onClick={() => reject(c.id)} disabled={busy.has(c.id)}
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
