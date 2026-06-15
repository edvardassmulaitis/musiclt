'use client'
// app/mano-muzika/importas/ImportClient.tsx
// ───────────────────────────────────────────────────────────────────────────
// Muzikos importo įrankis. Šaltinis (Last.fm / Spotify failas / YouTube) →
// match preview (matched/unmatched, checkbox'ai) → importuoti pasirinktus.
// ───────────────────────────────────────────────────────────────────────────

import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { proxyImg } from '@/lib/img-proxy'

type Job = { id: string; status: string; phase: string; total: number; processed: number; matched: number; reported: number; error: string | null; finished_at: string | null }

type Hit = {
  raw: string; rawArtist?: string; matched: boolean; confidence: 'high' | 'low'
  id?: number; name?: string; slug?: string; cover?: string | null; artist?: string | null
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
  const [done, setDone] = useState<{ artists: number; albums: number; tracks: number } | null>(null)
  const [enqueued, setEnqueued] = useState<'new' | 'existing' | null>(null)
  const [job, setJob] = useState<Job | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

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

  function onResult(staged: Staged) {
    setResult(staged)
    // default — pažymim visas atitiktis
    const sel = new Set<string>()
    for (const k of ['artists', 'albums', 'tracks'] as const)
      for (const h of staged[k]) if (h.matched && h.id) sel.add(`${k}:${h.id}`)
    setSelected(sel)
  }

  async function runLastfm() {
    if (lastfmFull) return enqueueFull()
    setLoading(true); setError(null); setResult(null); setDone(null); setEnqueued(null)
    try { onResult(await postJSON('/import/lastfm', { username: lastfmUser, mode: 'best' })) }
    catch (e: any) { setError(e.message) } finally { setLoading(false) }
  }
  // „Visa biblioteka" — deep importas vykdomas FONE (gali būti tūkstančiai įrašų).
  async function enqueueFull() {
    setLoading(true); setError(null); setResult(null); setDone(null); setEnqueued(null)
    try {
      const d = await postJSON('/import/job', { source: 'lastfm', username: lastfmUser, mode: 'full' })
      setEnqueued(d.existing ? 'existing' : 'new')
      await refreshJob()
    } catch (e: any) { setError(e.message) } finally { setLoading(false) }
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

  async function commit() {
    if (!result) return
    setCommitting(true); setError(null)
    const pick = (kind: 'artists' | 'albums' | 'tracks') => result[kind].filter(h => h.matched && h.id && selected.has(`${kind}:${h.id}`)).map(h => h.id!) as number[]
    try {
      const res = await postJSON('/import/commit', { artists: pick('artists'), albums: pick('albums'), tracks: pick('tracks') })
      setDone(res.added)
    } catch (e: any) { setError(e.message) } finally { setCommitting(false) }
  }

  return (
    <div className="page-shell" style={{ color: 'var(--text-primary)' }}>
      <div className="page-head">
        <div className="flex items-center gap-2 text-[12.5px] mb-1.5" style={{ color: 'var(--text-muted)' }}>
          <Link href="/mano-muzika" className="hover:underline">Mano muzika</Link><span>›</span><span>Perkelti</span>
        </div>
        <h1>Perkelti muziką</h1>
        <p>Atsinešk mėgstamą muziką iš Last.fm, Spotify ar YouTube — sumesime su music.lt baze ir įdėsime į tavo kolekciją.</p>
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
            <RunBtn onClick={runLastfm} loading={loading} disabled={!lastfmUser.trim()} label={lastfmFull ? 'Importuoti fone' : 'Ieškoti'} />
          </div>
          <label className="mt-3 flex items-start gap-2.5 cursor-pointer select-none">
            <input type="checkbox" checked={lastfmFull} onChange={e => setLastfmFull(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-orange-500" />
            <span className="text-[12px] leading-snug" style={{ color: 'var(--text-muted)' }}>
              <b style={{ color: 'var(--text-primary)' }}>Importuoti visą biblioteką</b> — įtraukti ir visą klausymų istoriją (gali būti tūkstančiai įrašų). Vyksta <b>fone</b>: patvirtini ir gali eiti — kai baigsim, atsiųsim pranešimą, o muzika atsiras tavo profilyje.
            </span>
          </label>
          <Hint>Profilis turi būti viešas. Numatytai imame tavo <b>mėgstamiausius ir dažniausiai klausomus</b> atlikėjus, dainas ir albumus. Vardą rasi savo Last.fm adrese: last.fm/user/<b>vardas</b>.</Hint>
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
          <Hint>Playlistas turi būti viešas arba „neįtrauktas į sąrašą" (unlisted). Iš video pavadinimų atpažinsim atlikėją ir dainą.</Hint>
        </InputPanel>
      )}

      {error && <div className="mb-4 rounded-xl px-4 py-3 text-[13px]" style={{ background: 'rgba(244,63,94,0.10)', border: '1px solid rgba(244,63,94,0.3)', color: '#f43f5e' }}>{error}</div>}

      {/* FONINIO IMPORTO BŪSENA */}
      {(enqueued || (job && (job.status === 'queued' || job.status === 'running'))) && (
        <div className="mb-4 rounded-2xl p-5" style={{ background: 'linear-gradient(135deg, rgba(167,139,250,0.14), transparent)', border: '1px solid rgba(167,139,250,0.4)' }}>
          <div className="flex items-center gap-2 text-[15px] font-black">
            <span className="inline-block h-2 w-2 rounded-full animate-pulse" style={{ background: '#a78bfa' }} />
            {enqueued === 'existing' ? 'Importas jau vyksta' : 'Pradėjome pilną importą'}
          </div>
          <p className="text-[12.5px] mt-1.5 leading-relaxed" style={{ color: 'var(--text-muted)' }}>
            Apdorojame visą tavo Last.fm biblioteką <b>fone</b> — tau nieko daryti nereikia ir lango uždaryti gali.
            Atpažinta muzika po truputį atsiranda tavo „Mano muzikoje", o ko dar nėra music.lt bazėje — užregistruosim ir pridėsim vėliau.
            Kai baigsim, <b>atsiųsim pranešimą</b>.
          </p>
          {job && (job.status === 'running' || job.status === 'queued') && job.processed > 0 && (
            <div className="text-[11.5px] mt-2" style={{ color: 'var(--text-faint)' }}>
              Apdorota {job.processed}{job.total ? ` iš ${job.total}` : ''} · pridėta {job.matched} · laukia įkėlimo {job.reported}
            </div>
          )}
        </div>
      )}
      {job && job.status === 'done' && !enqueued && (
        <div className="mb-4 rounded-2xl p-5" style={{ background: 'linear-gradient(135deg, rgba(52,211,153,0.14), transparent)', border: '1px solid rgba(52,211,153,0.4)' }}>
          <div className="text-[15px] font-black">✅ Pilnas importas baigtas</div>
          <p className="text-[12.5px] mt-1" style={{ color: 'var(--text-muted)' }}>
            Į tavo muziką pridėjome <b>{job.matched}</b> įrašų{job.reported > 0 ? <>, dar <b>{job.reported}</b> laukia įkėlimo ir atsiras vėliau</> : null}.{' '}
            <Link href="/mano-muzika" className="underline" style={{ color: 'var(--accent-orange)' }}>Eiti į Mano muziką →</Link>
          </p>
        </div>
      )}

      {/* DONE */}
      {done && (
        <div className="rounded-2xl p-6 text-center" style={{ background: 'linear-gradient(135deg, rgba(52,211,153,0.14), transparent)', border: '1px solid rgba(52,211,153,0.4)' }}>
          <div className="text-4xl mb-2">✅</div>
          <div className="text-[16px] font-black">Perkelta!</div>
          <div className="text-[13px] mt-1" style={{ color: 'var(--text-muted)' }}>
            Pridėta: {done.artists} atlikėjai · {done.albums} albumai · {done.tracks} dainos
          </div>
          <Link href="/mano-muzika" className="inline-block mt-4 rounded-full px-6 py-2.5 text-[13px] font-black text-white" style={{ background: 'var(--accent-orange)' }}>
            Eiti į Mano muziką →
          </Link>
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

function Group({ title, kind, hits, selected, toggle, toggleGroup }: {
  title: string; kind: 'artists' | 'albums' | 'tracks'; hits: Hit[]
  selected: Set<string>; toggle: (k: string) => void; toggleGroup: (kind: 'artists' | 'albums' | 'tracks', on: boolean) => void
}) {
  const [showUnmatched, setShowUnmatched] = useState(false)
  const matched = useMemo(() => hits.filter(h => h.matched && h.id), [hits])
  const unmatched = useMemo(() => hits.filter(h => !h.matched), [hits])
  if (hits.length === 0) return null
  const allSel = matched.every(h => selected.has(`${kind}:${h.id}`))
  return (
    <div className="mb-5">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-[15px] font-black">{title} <span className="text-[12px] font-bold" style={{ color: 'var(--text-faint)' }}>· {matched.length}</span></h2>
        {matched.length > 0 && (
          <button onClick={() => toggleGroup(kind, !allSel)} className="text-[12px] font-bold" style={{ color: 'var(--accent-orange)' }}>
            {allSel ? 'Atžymėti visus' : 'Pažymėti visus'}
          </button>
        )}
      </div>
      <ul className="flex flex-col gap-1.5">
        {matched.map(h => {
          const key = `${kind}:${h.id}`; const on = selected.has(key)
          return (
            <li key={key}>
              <button onClick={() => toggle(key)} className="w-full flex items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors"
                style={{ background: on ? 'var(--bg-elevated)' : 'var(--bg-surface)', border: `1px solid ${on ? 'rgba(249,115,22,0.4)' : 'var(--border-default)'}` }}>
                <span className="shrink-0 h-5 w-5 rounded-md flex items-center justify-center text-[11px] font-black"
                  style={{ background: on ? 'var(--accent-orange)' : 'transparent', border: on ? 'none' : '1.5px solid var(--border-default)', color: '#fff' }}>{on ? '✓' : ''}</span>
                <div className="h-9 w-9 shrink-0 overflow-hidden rounded-md" style={{ background: 'var(--bg-elevated)' }}>
                  {h.cover ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={proxyImg(h.cover)} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
                  ) : <div className="flex h-full w-full items-center justify-center text-[13px] opacity-50">{kind === 'artists' ? '👤' : kind === 'albums' ? '💿' : '🎵'}</div>}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-bold">{h.name}{h.artist ? <span className="font-normal" style={{ color: 'var(--text-muted)' }}> — {h.artist}</span> : null}</div>
                  {h.confidence === 'low' && <div className="text-[10.5px]" style={{ color: '#f59e0b' }}>≈ panaši atitiktis („{h.raw}")</div>}
                </div>
              </button>
            </li>
          )
        })}
      </ul>
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
