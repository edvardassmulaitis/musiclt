'use client'
// app/mano-muzika/importas/ImportClient.tsx
// ───────────────────────────────────────────────────────────────────────────
// Muzikos importo įrankis. Šaltinis (Last.fm / Spotify failas / YouTube) →
// match preview (matched/unmatched, checkbox'ai) → importuoti pasirinktus.
// ───────────────────────────────────────────────────────────────────────────

import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { proxyImg } from '@/lib/img-proxy'

type Job = { id: string; status: string; phase: string; total: number; processed: number; matched: number; reported: number; error: string | null; finished_at: string | null; batch_id?: string | null; batch_status?: string | null }
type ReviewHit = { itemId: number; id: number; name: string; slug: string | null; cover: string | null; artist: string | null; artistSlug: string | null; pop: number }

type Hit = {
  raw: string; rawArtist?: string; matched: boolean; confidence: 'high' | 'low'
  id?: number; name?: string; slug?: string; cover?: string | null; artist?: string | null; artistSlug?: string | null; pop?: number
}
type Staged = { artists: Hit[]; tracks: Hit[]; albums: Hit[]; counts: { matched: number; unmatched: number; total: number }; reported?: number }
type Source = 'lastfm' | 'spotify' | 'youtube'

const SOURCES: { key: Source; label: string; emoji: string; blurb: string }[] = [
  { key: 'lastfm', label: 'Last.fm', emoji: '🎧', blurb: 'Įvesk vartotojo vardą — perkelsim mėgstamus ir dažniausiai klausomus.' },
  { key: 'spotify', label: 'Spotify', emoji: '🟢', blurb: 'Įkelk „Download your data" failą (YourLibrary.json).' },
  { key: 'youtube', label: 'YouTube', emoji: '▶️', blurb: 'Įklijuok viešo playlisto nuorodą.' },
]

async function postJSON(path: string, body: any) {
  const res = await fetch(`/api/mano-muzika${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || 'Klaida')
  return data
}

export default function ImportClient({ lastfmOk, youtubeOk, initialSource }: { lastfmOk: boolean; youtubeOk: boolean; initialSource: string | null }) {
  const [source, setSource] = useState<Source | null>((initialSource as Source) || null)
  const [lastfmUser, setLastfmUser] = useState('')
  const [lastfmFull, setLastfmFull] = useState(false)
  const [ytUrl, setYtUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<Staged | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [committing, setCommitting] = useState(false)
  const [done, setDone] = useState<{ artists: number; albums: number; tracks: number; total?: number } | null>(null)
  const [batchId, setBatchId] = useState<string | null>(null)
  const [reverting, setReverting] = useState(false)
  const [reverted, setReverted] = useState(false)
  const [enqueued, setEnqueued] = useState<'new' | 'existing' | null>(null)
  const [job, setJob] = useState<Job | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  // Full importo apimtis (scope) — po greito skenavimo
  const [scan, setScan] = useState<{ artists: number; albums: number; lovedTracks: number; topTracks: number; recentTracks: number } | null>(null)
  const [scanning, setScanning] = useState(false)
  const [scKinds, setScKinds] = useState<Set<string>>(new Set(['artist', 'album', 'track']))
  const [scHistory, setScHistory] = useState<'best' | 'all'>('best')
  const [scMin, setScMin] = useState(0)
  // Peržiūra po importo (status='ready')
  const [review, setReview] = useState<{ matched: number; missing: number; items: { artists: ReviewHit[]; albums: ReviewHit[]; tracks: ReviewHit[] } } | null>(null)
  const [deselected, setDeselected] = useState<Set<number>>(new Set())
  const [confirming, setConfirming] = useState(false)

  // Foninio importo job'o būsena — kad pamatytume „vyksta / baigta" be progress baro.
  const refreshJob = useCallback(async () => {
    try {
      const res = await fetch('/api/mano-muzika/import/job')
      const data = await res.json().catch(() => ({}))
      if (res.ok) setJob(data.job || null)
    } catch {}
  }, [])
  useEffect(() => { refreshJob() }, [refreshJob])
  useEffect(() => {
    if (job && (job.status === 'queued' || job.status === 'running')) {
      const t = setInterval(refreshJob, 15000)
      return () => clearInterval(t)
    }
  }, [job, refreshJob])

  function onResult(raw: Staged) {
    // Apsauga: jei atsakymas neturi masyvų (timeout/klaida) — nemeskim render klaidos.
    const staged: Staged = {
      artists: Array.isArray(raw?.artists) ? raw.artists : [],
      albums: Array.isArray(raw?.albums) ? raw.albums : [],
      tracks: Array.isArray(raw?.tracks) ? raw.tracks : [],
      counts: raw?.counts || { matched: 0, unmatched: 0, total: 0 },
      reported: raw?.reported || 0,
    }
    setResult(staged)
    // default — pažymim visas atitiktis
    const sel = new Set<string>()
    for (const k of ['artists', 'albums', 'tracks'] as const)
      for (const h of staged[k]) if (h.matched && h.id) sel.add(`${k}:${h.id}`)
    setSelected(sel)
  }

  async function runLastfm() {
    if (lastfmFull) return doScan()
    setLoading(true); setError(null); setResult(null); setDone(null); setEnqueued(null)
    try { onResult(await postJSON('/import/lastfm', { username: lastfmUser, mode: 'best' })) }
    catch (e: any) { setError(e.message) } finally { setLoading(false) }
  }
  // „Visa biblioteka": 1) greitas skenavimas → 2) apimties pasirinkimas → 3) fonas → 4) peržiūra.
  async function doScan() {
    setScanning(true); setError(null); setScan(null); setResult(null); setDone(null); setEnqueued(null)
    try { const d = await postJSON('/import/lastfm/scan', { username: lastfmUser }); setScan(d.counts) }
    catch (e: any) { setError(e.message) } finally { setScanning(false) }
  }
  async function startFull() {
    setLoading(true); setError(null)
    try {
      const d = await postJSON('/import/job', { source: 'lastfm', username: lastfmUser, scope: { kinds: [...scKinds], historyMode: scHistory, minPlaycount: scMin } })
      setEnqueued(d.existing ? 'existing' : 'new'); setScan(null); await refreshJob()
    } catch (e: any) { setError(e.message) } finally { setLoading(false) }
  }
  const loadReview = useCallback(async (jobId: string) => {
    try { const res = await fetch(`/api/mano-muzika/import/job/review?jobId=${jobId}`); const d = await res.json().catch(() => ({})); if (res.ok) { setReview({ matched: d.matched, missing: d.missing, items: d.items }); setDeselected(new Set()) } } catch {}
  }, [])
  useEffect(() => { if (job?.status === 'ready' && job.id && !review) loadReview(job.id) }, [job, review, loadReview])
  function toggleReview(itemId: number) { setDeselected(s => { const n = new Set(s); n.has(itemId) ? n.delete(itemId) : n.add(itemId); return n }) }
  function toggleReviewGroup(hits: ReviewHit[], on: boolean) { setDeselected(s => { const n = new Set(s); for (const h of hits) { on ? n.delete(h.itemId) : n.add(h.itemId) } return n }) }
  async function confirmReview() {
    if (!job?.id) return
    setConfirming(true); setError(null)
    try { const r = await postJSON('/import/job/confirm', { jobId: job.id, deselect: [...deselected] }); setDone({ artists: 0, albums: 0, tracks: 0, total: r.added }); setReview(null); await refreshJob() }
    catch (e: any) { setError(e.message) } finally { setConfirming(false) }
  }
  async function runYoutube() {
    setLoading(true); setError(null); setResult(null); setDone(null)
    try { onResult(await postJSON('/import/youtube', { url: ytUrl })) }
    catch (e: any) { setError(e.message) } finally { setLoading(false) }
  }
  async function onSpotifyFile(file: File) {
    setLoading(true); setError(null); setResult(null); setDone(null)
    try {
      const text = await file.text()
      const json = JSON.parse(text)
      const artists = (json.artists || []).map((a: any) => ({ name: a.name || a.artistName })).filter((x: any) => x.name)
      const tracks = (json.tracks || []).map((t: any) => ({ artist: t.artist || t.artistName, title: t.track || t.trackName })).filter((x: any) => x.artist && x.title)
      const albums = (json.albums || []).map((a: any) => ({ artist: a.artist || a.artistName, title: a.album || a.albumName })).filter((x: any) => x.artist && x.title)
      if (!artists.length && !tracks.length && !albums.length) throw new Error('Tai nepanašu į YourLibrary.json (nerasta artists/tracks/albums).')
      onResult(await postJSON('/import/match', { artists, tracks, albums }))
    } catch (e: any) { setError(e.message?.includes('JSON') ? 'Failas nėra teisingas JSON' : e.message) } finally { setLoading(false) }
  }

  const selCount = selected.size
  function toggle(key: string) { setSelected(s => { const n = new Set(s); n.has(key) ? n.delete(key) : n.add(key); return n }) }
  function toggleGroup(kind: 'artists' | 'albums' | 'tracks', on: boolean) {
    if (!result) return
    setSelected(s => { const n = new Set(s); for (const h of result[kind]) if (h.matched && h.id) { const k = `${kind}:${h.id}`; on ? n.add(k) : n.delete(k) } return n })
  }

  const SING: Record<'artists' | 'albums' | 'tracks', string> = { artists: 'artist', albums: 'album', tracks: 'track' }
  async function commit() {
    if (!result) return
    setCommitting(true); setError(null)
    const pick = (kind: 'artists' | 'albums' | 'tracks') => result[kind].filter(h => h.matched && h.id && selected.has(`${kind}:${h.id}`)).map(h => h.id!) as number[]
    // populiarumas (Last.fm playcount) — kad „Mano muzika" sustotų pagal populiarumą
    const weights: Record<string, number> = {}
    for (const kind of ['artists', 'albums', 'tracks'] as const)
      for (const h of result[kind]) if (h.matched && h.id && selected.has(`${kind}:${h.id}`)) weights[`${SING[kind]}:${h.id}`] = h.pop || 0
    try {
      const res = await postJSON('/import/commit', { artists: pick('artists'), albums: pick('albums'), tracks: pick('tracks'), weights })
      setDone(res.added); setBatchId(res.batchId || null); setReverted(false)
    } catch (e: any) { setError(e.message) } finally { setCommitting(false) }
  }
  async function revert(opts: { batchId?: string | null; jobId?: string | null }) {
    if (!opts.batchId && !opts.jobId) return
    if (!confirm('Atšaukti šį importą? Bus pašalinta tai, ką šis importas pridėjo į tavo muziką.')) return
    setReverting(true); setError(null)
    try {
      await postJSON('/import/revert', { batchId: opts.batchId || undefined, jobId: opts.jobId || undefined })
      setReverted(true); await refreshJob()
    } catch (e: any) { setError(e.message) } finally { setReverting(false) }
  }

  return (
    <div className="page-shell" style={{ color: 'var(--text-primary)' }}>
      <div className="page-head">
        <div className="flex items-center gap-2 text-[12.5px] mb-1.5" style={{ color: 'var(--text-muted)' }}>
          <Link href="/mano-muzika" className="hover:underline">Mano muzika</Link><span>›</span><span>Perkelti</span>
        </div>
        <h1>Perkelti muziką</h1>
        <p>Perkelk savo mėgstamą muziką iš Last.fm, Spotify ar YouTube — sujungsime viską tavo bendroje music.lt kolekcijoje.</p>
      </div>

      {/* SOURCE PICKER */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
        {SOURCES.map(s => {
          const active = source === s.key
          const disabled = (s.key === 'lastfm' && !lastfmOk) || (s.key === 'youtube' && !youtubeOk)
          return (
            <button key={s.key} onClick={() => { setSource(s.key); setResult(null); setError(null); setDone(null) }}
              className="text-left rounded-2xl p-4 transition-all"
              style={{ background: active ? 'linear-gradient(135deg, rgba(249,115,22,0.14), rgba(167,139,250,0.10))' : 'var(--bg-surface)',
                border: `1px solid ${active ? 'rgba(249,115,22,0.5)' : 'var(--border-default)'}`, opacity: disabled ? 0.55 : 1 }}>
              <div className="text-2xl mb-1.5">{s.emoji}</div>
              <div className="text-[14.5px] font-black">{s.label}{disabled && <span className="ml-1.5 text-[10px] font-bold align-middle" style={{ color: 'var(--text-faint)' }}>(netrukus)</span>}</div>
              <div className="text-[11.5px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{s.blurb}</div>
            </button>
          )
        })}
      </div>

      {/* INPUT PANELS */}
      {source === 'lastfm' && (
        <InputPanel disabled={!lastfmOk}
          notConfigured={!lastfmOk ? 'Last.fm importas dar nesukonfigūruotas (administratoriui: pridėk LASTFM_API_KEY).' : null}>
          <div className="flex gap-2">
            <input value={lastfmUser} onChange={e => setLastfmUser(e.target.value)} onKeyDown={e => e.key === 'Enter' && runLastfm()}
              placeholder="Last.fm vartotojo vardas" className={inputCls} />
            <RunBtn onClick={runLastfm} loading={loading || scanning} disabled={!lastfmUser.trim()} label={lastfmFull ? 'Peržiūrėti biblioteką' : 'Ieškoti populiariausių'} />
          </div>
          {loading && !lastfmFull && <LoadingBar label="Ieškome tavo populiariausios muzikos ir lyginame su music.lt baze…" />}
          {scanning && <LoadingBar label="Skaitome tavo Last.fm biblioteką…" />}
          <label className="mt-3 flex items-start gap-2.5 cursor-pointer select-none">
            <input type="checkbox" checked={lastfmFull} onChange={e => { setLastfmFull(e.target.checked); setScan(null) }} className="mt-0.5 h-4 w-4 shrink-0 accent-orange-500" />
            <span className="text-[12px] leading-snug" style={{ color: 'var(--text-muted)' }}>
              <b style={{ color: 'var(--text-primary)' }}>Importuoti visą biblioteką</b> — pirma parodysim, kiek ko turi, leisim pasirinkti apimtį, o tada fone surinksim ir <b>duosim peržiūrėti prieš pridedant</b> (nieko nepridėsim be tavo patvirtinimo).
            </span>
          </label>
          <Hint>Profilis turi būti viešas. Numatytai imame tavo <b>mėgstamiausius ir dažniausiai klausomus</b> atlikėjus, dainas ir albumus. Vardą rasi savo Last.fm adrese: last.fm/user/<b>vardas</b>.</Hint>

          {/* APIMTIES PASIRINKIMAS (po skenavimo) */}
          {scan && lastfmFull && (
            <div className="mt-4 rounded-xl p-4" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)' }}>
              <div className="text-[13px] font-black mb-1">Tavo Last.fm bibliotekoje:</div>
              <div className="text-[12px] mb-3" style={{ color: 'var(--text-muted)' }}>
                {scan.artists} atlikėjų · {scan.albums} albumų · {scan.topTracks} dažniausių dainų · {scan.lovedTracks} pamėgtų · {scan.recentTracks.toLocaleString('lt')} scrobble istorijoje
              </div>
              <div className="text-[12px] font-bold mb-1.5">Ką kelti?</div>
              <div className="flex flex-wrap gap-2 mb-3">
                {([['artist', 'Atlikėjai'], ['album', 'Albumai'], ['track', 'Dainos']] as const).map(([k, lbl]) => {
                  const on = scKinds.has(k)
                  return <button key={k} onClick={() => setScKinds(s => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n })}
                    className="rounded-full px-3 py-1.5 text-[12px] font-bold" style={{ background: on ? 'rgba(249,115,22,0.15)' : 'var(--bg-surface)', border: `1px solid ${on ? 'rgba(249,115,22,0.5)' : 'var(--border-default)'}`, color: on ? '#f97316' : 'var(--text-muted)' }}>{on ? '✓ ' : ''}{lbl}</button>
                })}
              </div>
              <div className="text-[12px] font-bold mb-1.5">Kiek giliai?</div>
              <div className="flex flex-wrap gap-2 mb-3">
                {([['best', 'Tik mėgstami ir dažni'], ['all', 'Visa klausymų istorija']] as const).map(([k, lbl]) => (
                  <button key={k} onClick={() => setScHistory(k)} className="rounded-full px-3 py-1.5 text-[12px] font-bold" style={{ background: scHistory === k ? 'rgba(249,115,22,0.15)' : 'var(--bg-surface)', border: `1px solid ${scHistory === k ? 'rgba(249,115,22,0.5)' : 'var(--border-default)'}`, color: scHistory === k ? '#f97316' : 'var(--text-muted)' }}>{lbl}</button>
                ))}
              </div>
              <label className="flex items-center gap-2 text-[12px] mb-3" style={{ color: 'var(--text-muted)' }}>
                Min. klausymų skaičius:
                <input type="number" min={0} value={scMin} onChange={e => setScMin(Math.max(0, Number(e.target.value) || 0))} className="w-20 rounded-lg px-2 py-1 text-[12px] outline-none" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)', color: 'var(--text-primary)' }} />
                <span style={{ color: 'var(--text-faint)' }}>(0 = visi)</span>
              </label>
              <button onClick={startFull} disabled={loading || scKinds.size === 0}
                className="rounded-full px-6 py-2.5 text-[13px] font-black text-white disabled:opacity-40" style={{ background: 'var(--accent-orange)' }}>
                {loading ? 'Pradedama…' : 'Pradėti importą fone'}
              </button>
            </div>
          )}
        </InputPanel>
      )}
      {source === 'spotify' && (
        <InputPanel>
          <input ref={fileRef} type="file" accept=".json,application/json" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) onSpotifyFile(f) }} />
          <button onClick={() => fileRef.current?.click()} className="w-full rounded-xl border-2 border-dashed py-7 text-center transition-colors"
            style={{ borderColor: 'var(--border-default)', background: 'var(--bg-elevated)' }}>
            <div className="text-2xl mb-1">📂</div>
            <div className="text-[13.5px] font-bold">{loading ? 'Apdorojama…' : 'Spustelėk ir pasirink YourLibrary.json'}</div>
            <div className="text-[11.5px] mt-0.5" style={{ color: 'var(--text-muted)' }}>arba nutempk failą čia</div>
          </button>
          <Hint>
            Spotify → Account → Privacy → „Download your data" → <b>Account data</b>. Po ~1 paros gausi ZIP su <b>YourLibrary.json</b> — įkelk jį čia.
            {' '}<Link href="/perkelti#spotify" className="underline" style={{ color: 'var(--accent-orange)' }}>Detali instrukcija</Link>
          </Hint>
        </InputPanel>
      )}
      {source === 'youtube' && (
        <InputPanel disabled={!youtubeOk} notConfigured={!youtubeOk ? 'YouTube importas dar nesukonfigūruotas.' : null}>
          <div className="flex gap-2">
            <input value={ytUrl} onChange={e => setYtUrl(e.target.value)} onKeyDown={e => e.key === 'Enter' && runYoutube()}
              placeholder="https://www.youtube.com/playlist?list=..." className={inputCls} />
            <RunBtn onClick={runYoutube} loading={loading} disabled={!ytUrl.trim()} />
          </div>
          {loading && <LoadingBar label="Skaitome playlistą ir lyginame su music.lt baze…" />}
          <Hint>Playlistas turi būti viešas arba „neįtrauktas į sąrašą" (unlisted). Iš video pavadinimų atpažinsim atlikėją ir dainą.</Hint>
        </InputPanel>
      )}

      {error && <div className="mb-4 rounded-xl px-4 py-3 text-[13px]" style={{ background: 'rgba(244,63,94,0.10)', border: '1px solid rgba(244,63,94,0.3)', color: '#f43f5e' }}>{error}</div>}

      {/* FONINIO IMPORTO BŪSENA */}
      {(job ? (job.status === 'queued' || job.status === 'running') : !!enqueued) && (
        <div className="mb-4 rounded-2xl p-5" style={{ background: 'linear-gradient(135deg, rgba(167,139,250,0.14), transparent)', border: '1px solid rgba(167,139,250,0.4)' }}>
          <div className="flex items-center gap-2 text-[15px] font-black">
            <span className="inline-block h-2 w-2 rounded-full animate-pulse" style={{ background: '#a78bfa' }} />
            {enqueued === 'existing' ? 'Importas jau vyksta' : 'Pradėjome pilną importą'}
          </div>
          <p className="text-[12.5px] mt-1.5 leading-relaxed" style={{ color: 'var(--text-muted)' }}>
            Apdorojame tavo Last.fm biblioteką <b>fone</b> — tau nieko daryti nereikia ir langą uždaryti gali.
            Kai baigsim, <b>duosim peržiūrėti</b> rastas atitiktis ir patvirtinsi, ką pridėti — nieko nepridėsim be tavo sutikimo.
            Atsiųsim pranešimą.
          </p>
          {job && (job.status === 'running' || job.status === 'queued') && job.processed > 0 && (
            <div className="text-[11.5px] mt-2" style={{ color: 'var(--text-faint)' }}>
              Apdorota {job.processed}{job.total ? ` iš ${job.total}` : ''} · rasta atitikčių {job.matched}
            </div>
          )}
          {job && (job.status === 'running' || job.status === 'queued') && job.batch_status !== 'reverted' && (
            <button onClick={() => revert({ jobId: job.id })} disabled={reverting}
              className="mt-3 text-[12px] font-bold underline disabled:opacity-40" style={{ color: 'var(--text-muted)' }}>
              {reverting ? 'Atšaukiama…' : 'Sustabdyti ir atšaukti importą'}
            </button>
          )}
        </div>
      )}
      {job && job.status === 'error' && (
        <div className="mb-4 rounded-2xl p-5" style={{ background: 'rgba(244,63,94,0.10)', border: '1px solid rgba(244,63,94,0.3)' }}>
          <div className="text-[15px] font-black" style={{ color: '#f43f5e' }}>Importas nepavyko</div>
          <p className="text-[12.5px] mt-1" style={{ color: 'var(--text-muted)' }}>{job.error || 'Nežinoma klaida.'} Pabandyk dar kartą arba pranešk administratoriui.</p>
        </div>
      )}
      {job && job.status === 'done' && !enqueued && (
        <div className="mb-4 rounded-2xl p-5" style={{ background: 'linear-gradient(135deg, rgba(52,211,153,0.14), transparent)', border: '1px solid rgba(52,211,153,0.4)' }}>
          <div className="text-[15px] font-black">✅ Pilnas importas baigtas</div>
          <p className="text-[12.5px] mt-1" style={{ color: 'var(--text-muted)' }}>
            Į tavo muziką pridėjome <b>{job.matched}</b> įrašų{job.reported > 0 ? <>, dar <b>{job.reported}</b> laukia įkėlimo ir atsiras vėliau</> : null}.{' '}
            <Link href="/mano-muzika" className="underline" style={{ color: 'var(--accent-orange)' }}>Eiti į Mano muziką →</Link>
          </p>
          {(job.batch_status === 'reverted' || reverted)
            ? <div className="mt-2 text-[12px] font-bold" style={{ color: 'var(--text-faint)' }}>Importas atšauktas.</div>
            : (job.batch_id && <button onClick={() => revert({ batchId: job.batch_id })} disabled={reverting}
                className="mt-2 text-[12px] font-bold underline disabled:opacity-40" style={{ color: 'var(--text-muted)' }}>
                {reverting ? 'Atšaukiama…' : 'Atšaukti šį importą'}
              </button>)}
        </div>
      )}

      {/* PERŽIŪRA — full importas paruoštas, laukiam patvirtinimo */}
      {job && job.status === 'ready' && review && !done && (
        <div className="mb-4">
          <div className="rounded-2xl p-5 mb-4" style={{ background: 'linear-gradient(135deg, rgba(167,139,250,0.14), transparent)', border: '1px solid rgba(167,139,250,0.4)' }}>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <div className="text-[15px] font-black">Peržiūrėk importą prieš pridedant</div>
                <p className="text-[12.5px] mt-1" style={{ color: 'var(--text-muted)' }}>
                  Radome <b>{review.matched}</b> atitikčių{review.missing > 0 ? <>, dar <b>{review.missing}</b> neatpažinta (jas persiųsim į trūkstamą muziką)</> : null}. Viskas pažymėta — atžymėk, ko nenori, ir patvirtink.
                </p>
              </div>
              <button onClick={confirmReview} disabled={confirming || review.matched - deselected.size === 0}
                className="rounded-full px-6 py-2.5 text-[13px] font-black text-white disabled:opacity-40" style={{ background: 'var(--accent-orange)' }}>
                {confirming ? 'Pridedama…' : `Pridėti pasirinktus (${review.matched - deselected.size})`}
              </button>
            </div>
          </div>
          <ReviewGroup title="Atlikėjai" kind="artists" hits={review.items.artists} deselected={deselected} toggle={toggleReview} toggleGroup={toggleReviewGroup} />
          <ReviewGroup title="Dainos" kind="tracks" hits={review.items.tracks} deselected={deselected} toggle={toggleReview} toggleGroup={toggleReviewGroup} />
          <ReviewGroup title="Albumai" kind="albums" hits={review.items.albums} deselected={deselected} toggle={toggleReview} toggleGroup={toggleReviewGroup} />
        </div>
      )}

      {/* DONE */}
      {done && (
        <div className="rounded-2xl p-6 text-center" style={{ background: 'linear-gradient(135deg, rgba(52,211,153,0.14), transparent)', border: '1px solid rgba(52,211,153,0.4)' }}>
          <div className="text-4xl mb-2">✅</div>
          <div className="text-[16px] font-black">Perkelta!</div>
          <div className="text-[13px] mt-1" style={{ color: 'var(--text-muted)' }}>
            {done.total != null
              ? <>Į tavo muziką pridėta <b>{done.total}</b> įrašų</>
              : <>Pridėta: {done.artists} atlikėjai · {done.albums} albumai · {done.tracks} dainos</>}
          </div>
          <div className="mt-4 flex items-center justify-center gap-4">
            <Link href="/mano-muzika" className="inline-block rounded-full px-6 py-2.5 text-[13px] font-black text-white" style={{ background: 'var(--accent-orange)' }}>
              Eiti į Mano muziką →
            </Link>
            {reverted
              ? <span className="text-[12px] font-bold" style={{ color: 'var(--text-faint)' }}>Atšaukta</span>
              : (batchId && <button onClick={() => revert({ batchId })} disabled={reverting}
                  className="text-[12px] font-bold underline disabled:opacity-40" style={{ color: 'var(--text-muted)' }}>
                  {reverting ? 'Atšaukiama…' : 'Atšaukti importą'}
                </button>)}
          </div>
        </div>
      )}

      {/* PREVIEW */}
      {result && !done && (
        <div>
          {!!result.reported && result.reported > 0 && (
            <div className="mb-4 rounded-xl px-4 py-3 text-[12.5px] leading-relaxed" style={{ background: 'rgba(167,139,250,0.10)', border: '1px solid rgba(167,139,250,0.32)', color: 'var(--text-secondary)' }}>
              🔎 <b style={{ color: 'var(--text-primary)' }}>{result.reported}</b> neatpažintų įrašų persiuntėme į music.lt trūkstamos muzikos sąrašą. Kai tik jie bus įkelti, <b>automatiškai atsiras tavo „Mano muzikoje"</b> — nieko daryti nereikia.
            </div>
          )}
          <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
            <div className="text-[13px]" style={{ color: 'var(--text-muted)' }}>
              Rasta atitikčių: <b style={{ color: 'var(--text-primary)' }}>{result.counts.matched}</b> iš {result.counts.total}
              {result.counts.unmatched > 0 && <> · neatpažinta {result.counts.unmatched}</>}
            </div>
            <button onClick={commit} disabled={committing || selCount === 0}
              className="rounded-full px-6 py-2.5 text-[13px] font-black text-white transition-transform enabled:hover:scale-[1.03] disabled:opacity-40"
              style={{ background: 'var(--accent-orange)' }}>
              {committing ? 'Importuojama…' : `Importuoti pasirinktus (${selCount})`}
            </button>
          </div>
          <Group title="Atlikėjai" kind="artists" hits={result.artists} selected={selected} toggle={toggle} toggleGroup={toggleGroup} />
          <Group title="Dainos" kind="tracks" hits={result.tracks} selected={selected} toggle={toggle} toggleGroup={toggleGroup} />
          <Group title="Albumai" kind="albums" hits={result.albums} selected={selected} toggle={toggle} toggleGroup={toggleGroup} />
        </div>
      )}
    </div>
  )
}

const inputCls = 'flex-1 min-w-0 rounded-lg px-3 py-2.5 text-[13.5px] outline-none'

function InputPanel({ children, disabled, notConfigured }: { children: React.ReactNode; disabled?: boolean; notConfigured?: string | null }) {
  return (
    <div className="mb-5 rounded-2xl p-4 sm:p-5" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)' }}>
      {notConfigured ? <div className="text-[13px]" style={{ color: 'var(--text-muted)' }}>{notConfigured}</div> : (
        <div style={{ opacity: disabled ? 0.5 : 1, pointerEvents: disabled ? 'none' : 'auto' }}>{children}</div>
      )}
      <style jsx global>{`.page-shell input[type=text],.page-shell input:not([type]){background:var(--bg-elevated);border:1px solid var(--border-default);color:var(--text-primary)}`}</style>
    </div>
  )
}
function Hint({ children }: { children: React.ReactNode }) {
  return <p className="mt-2.5 text-[11.5px] leading-relaxed" style={{ color: 'var(--text-faint)' }}>{children}</p>
}
function RunBtn({ onClick, loading, disabled, label }: { onClick: () => void; loading: boolean; disabled: boolean; label?: string }) {
  return (
    <button onClick={onClick} disabled={loading || disabled}
      className="shrink-0 rounded-lg px-5 py-2.5 text-[13px] font-black text-white transition-opacity disabled:opacity-40" style={{ background: 'var(--accent-orange)' }}>
      {loading ? '…' : (label || 'Ieškoti')}
    </button>
  )
}

// Neapibrėžtas (indeterminate) progreso indikatorius — kol vyksta paieška.
function LoadingBar({ label }: { label: string }) {
  return (
    <div className="mt-3">
      <div className="h-1.5 w-full overflow-hidden rounded-full" style={{ background: 'var(--bg-elevated)' }}>
        <div className="h-full w-1/3 rounded-full mz-impbar" style={{ background: 'var(--accent-orange)' }} />
      </div>
      <div className="mt-1.5 text-[11.5px]" style={{ color: 'var(--text-faint)' }}>{label}</div>
      <style jsx>{`.mz-impbar{animation:mzimp 1.1s ease-in-out infinite}@keyframes mzimp{0%{transform:translateX(-110%)}100%{transform:translateX(330%)}}`}</style>
    </div>
  )
}

// Vieša nuoroda į entity (open-in-new-tab).
function hrefForHit(kind: 'artists' | 'albums' | 'tracks', h: { id?: number; slug?: string | null; artistSlug?: string | null }): string | null {
  if (!h.id) return null
  if (kind === 'artists') return h.slug ? `/atlikejai/${h.slug}` : null
  if (kind === 'tracks') return h.slug ? `/dainos/${h.slug}-${h.id}` : null
  const parts = [h.artistSlug, h.slug].filter(Boolean).join('-')
  return parts ? `/albumai/${parts}-${h.id}` : null
}
function OpenExt({ href, overlay }: { href: string; overlay?: boolean }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} title="Atidaryti naujame skirtuke"
      className={overlay
        ? 'absolute top-1.5 right-1.5 flex h-6 w-6 items-center justify-center rounded-md opacity-80 hover:opacity-100'
        : 'shrink-0 opacity-60 hover:opacity-100'}
      style={overlay ? { background: 'rgba(0,0,0,0.45)', color: '#fff' } : { color: 'var(--text-muted)' }}>
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
      </svg>
    </a>
  )
}

// Peržiūros grupė — kaip Group, bet pažymėjimas per „deselected" (viskas iš pradžių pažymėta).
function ReviewGroup({ title, kind, hits, deselected, toggle, toggleGroup }: {
  title: string; kind: 'artists' | 'albums' | 'tracks'; hits: ReviewHit[]
  deselected: Set<number>; toggle: (itemId: number) => void; toggleGroup: (hits: ReviewHit[], on: boolean) => void
}) {
  const [limit, setLimit] = useState(120)
  if (!hits.length) return null
  const selectedCount = hits.filter(h => !deselected.has(h.itemId)).length
  const allSel = selectedCount === hits.length
  const emoji = kind === 'artists' ? '👤' : kind === 'albums' ? '💿' : '🎵'
  const isGrid = kind !== 'tracks'
  const shown = hits.slice(0, limit)
  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-2.5">
        <h2 className="text-[15px] font-black">{title} <span className="text-[12px] font-bold" style={{ color: 'var(--text-faint)' }}>· {selectedCount}/{hits.length}</span></h2>
        <button onClick={() => toggleGroup(hits, !allSel)} className="text-[12px] font-bold" style={{ color: 'var(--accent-orange)' }}>{allSel ? 'Atžymėti visus' : 'Pažymėti visus'}</button>
      </div>
      <div className={isGrid ? 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2' : 'grid grid-cols-1 lg:grid-cols-2 gap-1.5'}>
        {shown.map(h => {
          const on = !deselected.has(h.itemId); const href = hrefForHit(kind, h)
          return isGrid ? (
            <button key={h.itemId} onClick={() => toggle(h.itemId)} className="text-left rounded-xl overflow-hidden transition-colors"
              style={{ background: on ? 'var(--bg-elevated)' : 'var(--bg-surface)', border: `1px solid ${on ? 'rgba(249,115,22,0.55)' : 'var(--border-default)'}`, opacity: on ? 1 : 0.55 }}>
              <div className="relative aspect-square w-full" style={{ background: 'var(--bg-elevated)' }}>
                {h.cover
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={proxyImg(h.cover)} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
                  : <div className="flex h-full w-full items-center justify-center text-2xl opacity-40">{emoji}</div>}
                <span className="absolute top-1.5 left-1.5 h-5 w-5 rounded-md flex items-center justify-center text-[11px] font-black" style={{ background: on ? 'var(--accent-orange)' : 'rgba(0,0,0,0.45)', color: '#fff', border: on ? 'none' : '1px solid rgba(255,255,255,0.5)' }}>{on ? '✓' : ''}</span>
                {href && <OpenExt href={href} overlay />}
              </div>
              <div className="px-2 py-1.5"><div className="truncate text-[12.5px] font-bold">{h.name}</div>{h.artist && <div className="truncate text-[11px]" style={{ color: 'var(--text-muted)' }}>{h.artist}</div>}</div>
            </button>
          ) : (
            <button key={h.itemId} onClick={() => toggle(h.itemId)} className="w-full flex items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors"
              style={{ background: on ? 'var(--bg-elevated)' : 'var(--bg-surface)', border: `1px solid ${on ? 'rgba(249,115,22,0.4)' : 'var(--border-default)'}`, opacity: on ? 1 : 0.55 }}>
              <span className="shrink-0 h-5 w-5 rounded-md flex items-center justify-center text-[11px] font-black" style={{ background: on ? 'var(--accent-orange)' : 'transparent', border: on ? 'none' : '1.5px solid var(--border-default)', color: '#fff' }}>{on ? '✓' : ''}</span>
              <div className="h-9 w-9 shrink-0 overflow-hidden rounded-md" style={{ background: 'var(--bg-elevated)' }}>
                {h.cover
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={proxyImg(h.cover)} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
                  : <div className="flex h-full w-full items-center justify-center text-[13px] opacity-50">{emoji}</div>}
              </div>
              <div className="min-w-0 flex-1"><div className="truncate text-[13px] font-bold">{h.name}</div>{h.artist && <div className="truncate text-[11px]" style={{ color: 'var(--text-muted)' }}>{h.artist}</div>}</div>
              {href && <OpenExt href={href} />}
            </button>
          )
        })}
      </div>
      {hits.length > limit && <div className="mt-2 flex justify-center gap-2"><button onClick={() => setLimit(l => l + 200)} className="rounded-full px-5 py-2 text-[12.5px] font-bold" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', color: 'var(--text-secondary)' }}>Rodyti daugiau ({hits.length - limit})</button><button onClick={() => setLimit(hits.length)} className="rounded-full px-4 py-2 text-[12.5px] font-bold" style={{ background: 'transparent', border: '1px solid var(--border-default)', color: 'var(--text-muted)' }}>Visus</button></div>}
    </div>
  )
}

function Group({ title, kind, hits, selected, toggle, toggleGroup }: {
  title: string; kind: 'artists' | 'albums' | 'tracks'; hits: Hit[]
  selected: Set<string>; toggle: (k: string) => void; toggleGroup: (kind: 'artists' | 'albums' | 'tracks', on: boolean) => void
}) {
  const [showUnmatched, setShowUnmatched] = useState(false)
  const matched = useMemo(() => hits.filter(h => h.matched && h.id), [hits])
  const unmatched = useMemo(() => hits.filter(h => !h.matched), [hits])
  if (hits.length === 0) return null
  const allSel = matched.every(h => selected.has(`${kind}:${h.id}`))
  const emoji = kind === 'artists' ? '👤' : kind === 'albums' ? '💿' : '🎵'
  const isGrid = kind !== 'tracks'   // atlikėjai/albumai — kortelės; dainos — 2 stulpelių sąrašas
  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-2.5">
        <h2 className="text-[15px] font-black">{title} <span className="text-[12px] font-bold" style={{ color: 'var(--text-faint)' }}>· {matched.length}</span></h2>
        {matched.length > 0 && (
          <button onClick={() => toggleGroup(kind, !allSel)} className="text-[12px] font-bold" style={{ color: 'var(--accent-orange)' }}>
            {allSel ? 'Atžymėti visus' : 'Pažymėti visus'}
          </button>
        )}
      </div>

      {isGrid ? (
        // KORTELĖS — atlikėjams ir albumams
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
          {matched.map(h => {
            const key = `${kind}:${h.id}`; const on = selected.has(key); const href = hrefForHit(kind, h)
            return (
              <button key={key} onClick={() => toggle(key)} className="text-left rounded-xl overflow-hidden transition-colors"
                style={{ background: on ? 'var(--bg-elevated)' : 'var(--bg-surface)', border: `1px solid ${on ? 'rgba(249,115,22,0.55)' : 'var(--border-default)'}` }}>
                <div className="relative aspect-square w-full" style={{ background: 'var(--bg-elevated)' }}>
                  {h.cover
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={proxyImg(h.cover)} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
                    : <div className="flex h-full w-full items-center justify-center text-2xl opacity-40">{emoji}</div>}
                  <span className="absolute top-1.5 left-1.5 h-5 w-5 rounded-md flex items-center justify-center text-[11px] font-black"
                    style={{ background: on ? 'var(--accent-orange)' : 'rgba(0,0,0,0.45)', color: '#fff', border: on ? 'none' : '1px solid rgba(255,255,255,0.5)' }}>{on ? '✓' : ''}</span>
                  {href && <OpenExt href={href} overlay />}
                </div>
                <div className="px-2 py-1.5">
                  <div className="truncate text-[12.5px] font-bold">{h.name}</div>
                  {h.artist && <div className="truncate text-[11px]" style={{ color: 'var(--text-muted)' }}>{h.artist}</div>}
                </div>
              </button>
            )
          })}
        </div>
      ) : (
        // 2 STULPELIŲ SĄRAŠAS — dainoms
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-1.5">
          {matched.map(h => {
            const key = `${kind}:${h.id}`; const on = selected.has(key); const href = hrefForHit(kind, h)
            return (
              <button key={key} onClick={() => toggle(key)} className="w-full flex items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors"
                style={{ background: on ? 'var(--bg-elevated)' : 'var(--bg-surface)', border: `1px solid ${on ? 'rgba(249,115,22,0.4)' : 'var(--border-default)'}` }}>
                <span className="shrink-0 h-5 w-5 rounded-md flex items-center justify-center text-[11px] font-black"
                  style={{ background: on ? 'var(--accent-orange)' : 'transparent', border: on ? 'none' : '1.5px solid var(--border-default)', color: '#fff' }}>{on ? '✓' : ''}</span>
                <div className="h-9 w-9 shrink-0 overflow-hidden rounded-md" style={{ background: 'var(--bg-elevated)' }}>
                  {h.cover
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={proxyImg(h.cover)} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
                    : <div className="flex h-full w-full items-center justify-center text-[13px] opacity-50">{emoji}</div>}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-bold">{h.name}</div>
                  {h.artist && <div className="truncate text-[11px]" style={{ color: 'var(--text-muted)' }}>{h.artist}</div>}
                </div>
                {href && <OpenExt href={href} />}
              </button>
            )
          })}
        </div>
      )}

      {unmatched.length > 0 && (
        <div className="mt-2">
          <button onClick={() => setShowUnmatched(v => !v)} className="text-[11.5px] font-bold" style={{ color: 'var(--text-faint)' }}>
            {showUnmatched ? '▾' : '▸'} Neatpažinta ({unmatched.length})
          </button>
          {showUnmatched && (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {unmatched.map((h, i) => (
                <span key={i} className="rounded-full px-2.5 py-1 text-[11px]" style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)' }}>
                  {h.raw}{h.rawArtist ? ` — ${h.rawArtist}` : ''}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
