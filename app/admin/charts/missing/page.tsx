'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import InboxTabs from '@/components/InboxTabs'
import { openAdminQuickAdd } from '@/components/AdminQuickAddModal'

/* /admin/charts/missing — agreguotos trūkstamos (nesusietos) dainos per visus
 * dainų topus. Sutvarkius vieną kartą, daina susidėlioja į VISUS topus. */

type Missing = { artist: string; title: string; chartCount: number; charts: string[]; videoId?: string | null; artistId?: number | null; artistScore?: number | null; artistSlug?: string | null; views?: number | null; velocity?: number | null; publishedAt?: string | null }

/* YouTube discovery vertės matai — kad būtų galima įsivertinti ar verta pridėti. */
function fmtViews(n?: number | null): string | null {
  if (n == null) return null
  if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + 'M'
  if (n >= 1e3) return (n / 1e3).toFixed(n >= 1e4 ? 0 : 1) + 'k'
  return String(n)
}
function fmtVel(v?: number | null): string | null {
  if (v == null) return null
  if (v >= 1000) return (v / 1000).toFixed(1) + 'k/val'
  if (v >= 1) return Math.round(v) + '/val'
  return v.toFixed(1) + '/val'
}
function fmtAge(iso?: string | null): string | null {
  if (!iso) return null
  const d = Date.parse(iso); if (!Number.isFinite(d)) return null
  const days = Math.floor((Date.now() - d) / 86400000)
  if (days < 1) return 'šiandien'
  if (days < 30) return `prieš ${days} d.`
  if (days < 365) return `prieš ${Math.floor(days / 30)} mėn.`
  return `prieš ${Math.floor(days / 365)} m.`
}
type Hit = { type: string; id: number; slug: string; title: string; artist: string | null; image_url: string | null }

/* Supaprastina netvarkingą topo atlikėjo kreditą iki PIRMO atlikėjo paieškai
 * (mirror lib/chart-resolve primaryArtist): „HUNTR/X: EJAE, Audrey Nuna & REI AMI"
 * → „HUNTR/X". Taip picker'io default query randa dainą be rankinio trynimo. */
function simpleArtist(name: string): string {
  return (name || '').split(/,| & |\bfeaturing\b|\bfeat\.?\b|\bft\.?\b| x |\bvs\.?\b|\bw\/|:/i)[0].trim()
}

/* Nuvalo title paieškai: nuima (...), [...], „ - versija" priesagą ir „feat…"
 * uodegą — „Starboy (w/ Daft Punk)" → „Starboy". Taip picker'is randa be junk'o. */
function cleanTitle(t: string): string {
  return (t || '')
    .replace(/\([^)]*\)/g, '').replace(/\[[^\]]*\]/g, '')
    .replace(/\s[-–—]\s.*$/, '').replace(/\bfeat(uring)?\.?\b.*$/i, '')
    .replace(/\s+/g, ' ').trim()
}

export default function AdminMissingPage() {
  const [list, setList] = useState<Missing[]>([])
  const [loading, setLoading] = useState(true)
  const [onlyWithArtist, setOnlyWithArtist] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const r = await fetch('/api/admin/charts/missing').then(r => r.json()).catch(() => ({ missing: [] }))
    setList(r.missing || [])
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  const onDone = (m: Missing) => setList(prev => prev.filter(x => !(x.artist === m.artist && x.title === m.title)))

  const withArtistCount = list.filter(m => m.artistId != null).length
  const shown = onlyWithArtist ? list.filter(m => m.artistId != null) : list

  return (
    <div className="missing-page mx-auto max-w-[860px] px-4 py-6 sm:px-6">
      {/* iOS: neleidžiam native long-press callout/selection ant mygtukų — jis
          iššaukdavo zoom'ą / teksto meniu telefone. Inputai lieka selectable. */}
      <style>{`
        @media (max-width: 719px) {
          .missing-page button, .missing-page a, .missing-page img {
            -webkit-touch-callout: none; -webkit-user-select: none; user-select: none;
          }
          .missing-page input, .missing-page textarea {
            -webkit-user-select: text; user-select: text; font-size: 16px;
          }
        }
      `}</style>
      <InboxTabs />
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-gray-900">🎵 Dainos</h1>
          <p className="mt-1 text-sm text-gray-500">Trūkstamos dainos iš visų topų. „Sukurti" pirma padaro YouTube paiešką ir, jei toks video jau kataloge — susieja, o ne kuria dublikato.</p>
        </div>
        <a href="/admin/charts" className="shrink-0 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-100">← Topų valdymas</a>
      </div>

      <PlaylistSources />

      {!loading && withArtistCount > 0 && (
        <label className="mb-3 flex cursor-pointer select-none items-center gap-2 text-sm text-gray-600">
          <input type="checkbox" checked={onlyWithArtist} onChange={e => setOnlyWithArtist(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
          <span>Tik su rastu atlikėju <span className="text-gray-400">({withArtistCount})</span></span>
        </label>
      )}

      {loading ? (
        <div className="text-sm text-gray-400">Kraunama…</div>
      ) : shown.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-500">{onlyWithArtist ? 'Nėra dainų su jau esamu atlikėju.' : 'Visos dainos susietos 🎉'}</div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          {shown.map((m, i) => <MissingRow key={`${m.artist}-${m.title}-${i}`} m={m} autoSuggest={i < 10} onDone={() => onDone(m)} />)}
        </div>
      )}
    </div>
  )
}

type Source = { id: number; name: string; feed_url: string; is_active: boolean; last_fetched_at: string | null; last_error: string | null }

function PlaylistSources() {
  const [open, setOpen] = useState(false)
  const [sources, setSources] = useState<Source[]>([])
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [scanMsg, setScanMsg] = useState('')

  const load = useCallback(async () => {
    const r = await fetch('/api/admin/yt-discovery/sources').then(r => r.json()).catch(() => ({ sources: [] }))
    setSources(r.sources || [])
  }, [])
  useEffect(() => { if (open) load() }, [open, load])

  const add = async () => {
    if (!url.trim()) return
    setBusy(true)
    const r = await fetch('/api/admin/yt-discovery/sources', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }) }).then(r => r.json()).catch(() => null)
    setBusy(false)
    if (r?.ok) { setUrl(''); load() } else setScanMsg(r?.error || 'Klaida')
  }
  const toggle = async (s: Source) => {
    await fetch('/api/admin/yt-discovery/sources', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: s.id, is_active: !s.is_active }) })
    load()
  }
  const del = async (s: Source) => {
    await fetch(`/api/admin/yt-discovery/sources?id=${s.id}`, { method: 'DELETE' })
    load()
  }
  const scan = async () => {
    setBusy(true); setScanMsg('Skenuojama…')
    const r = await fetch('/api/admin/yt-discovery/trigger', { method: 'POST' }).then(r => r.json()).catch(() => null)
    setBusy(false)
    setScanMsg(r?.message ? r.message : `Scan: +${r?.fresh ?? 0} naujų, ${r?.skipped_existing ?? 0} jau kataloge, ${r?.matched ?? 0} LT match. Perkrauk puslapį.`)
  }

  return (
    <div className="mb-4 rounded-xl border border-gray-200 bg-white">
      <button onClick={() => setOpen(o => !o)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-semibold text-gray-700 hover:bg-gray-50">
        <span>🎧 YouTube playlist'ai (discovery šaltiniai)</span>
        <span className="ml-auto text-xs text-gray-400">{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div className="border-t border-gray-100 p-3">
          <p className="mb-2 text-xs text-gray-500">Kuruotų „top recent" playlist'ų nuorodos. Scan perskaito visą playlist'ą (Data API, be 15 ribos) ir įdeda tik ko dar nėra kataloge — jie atsiranda šiame sąraše žemiau.</p>
          <div className="mb-2 flex gap-2">
            <input value={url} onChange={e => setUrl(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') add() }}
              placeholder="YouTube playlist nuoroda (…?list=…)"
              className="min-w-0 flex-1 rounded-md border border-gray-200 px-2.5 py-1.5 text-sm outline-none focus:border-violet-400" />
            <button onClick={add} disabled={busy || !url.trim()} className="shrink-0 rounded-md bg-gray-800 px-3 py-1.5 text-sm font-semibold text-white hover:bg-gray-900 disabled:opacity-50">Pridėti</button>
            <button onClick={scan} disabled={busy} className="shrink-0 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">Paleisti scan'ą</button>
          </div>
          {scanMsg && <p className="mb-2 text-xs text-gray-600">{scanMsg}</p>}
          <div className="space-y-1">
            {sources.length === 0 && <p className="text-xs text-gray-400">Nėra playlist'ų. Pridėk bent vieną kuruotą „naujos muzikos" playlist'ą.</p>}
            {sources.map(s => (
              <div key={s.id} className="flex items-center gap-2 rounded-md border border-gray-100 px-2 py-1.5 text-sm">
                <button onClick={() => toggle(s)} title={s.is_active ? 'Aktyvus' : 'Išjungtas'}
                  className={`h-4 w-4 shrink-0 rounded-full ${s.is_active ? 'bg-green-500' : 'bg-gray-300'}`} />
                <span className="min-w-0 flex-1 truncate text-gray-700">{s.name}{s.last_error && <span className="ml-1 text-red-500" title={s.last_error}>⚠</span>}</span>
                <button onClick={() => del(s)} className="shrink-0 text-xs text-gray-400 hover:text-red-500">Šalinti</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

type Suggestion = {
  video: { videoId: string; title: string; channel: string; duration: string } | null
  existingTrackId: number | null
  artist: { id: number; name: string; slug: string; score: number | null } | null
}

function MissingRow({ m, onDone, autoSuggest }: { m: Missing; onDone: () => void; autoSuggest?: boolean }) {
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [searching, setSearching] = useState(false)
  // Jei daina atėjo iš YouTube discovery — jau turim tikrą video, rodom iškart (be paieškos).
  const [sug, setSug] = useState<Suggestion | null>(
    m.videoId ? { video: { videoId: m.videoId, title: m.title, channel: 'YouTube discovery', duration: '' }, existingTrackId: null, artist: null } : null
  )
  const [sugLoading, setSugLoading] = useState(false)
  const [sugTried, setSugTried] = useState(!!m.videoId)

  const post = async (action: string, extra?: any) =>
    fetch('/api/admin/charts/missing', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ artist: m.artist, title: m.title, videoId: m.videoId ?? null, action, ...extra }),
    }).then(r => r.json()).catch(() => null)

  const act = async (action: string, extra?: any) => {
    setBusy(true); setMsg('Tvarkoma…')
    const r = await post(action, extra)
    setBusy(false)
    if (r?.ok) {
      setMsg(r.deduped ? `✓ jau kataloge — susieta ${r.linked ?? 0} topuose` : `✓ pridėta, susieta ${r.linked ?? 0} topuose`)
      setTimeout(onDone, 800)
    } else setMsg(r?.error || 'Klaida')
  }

  // Atmesti pasiūlymą — dažniausiai discovery daina, kurios nenorim (ne iš topų).
  // Pažymim kandidatą 'rejected' backend'e ir iškart dingdinam iš sąrašo.
  const reject = async () => {
    if (busy) return
    setBusy(true); setMsg('Atmetama…')
    await post('reject')
    setMsg('✕ atmesta')
    setTimeout(onDone, 500)
  }

  const fetchSuggest = useCallback(async () => {
    if (sugTried) return
    setSugTried(true); setSugLoading(true)
    const r = await post('suggest')
    setSugLoading(false)
    if (r?.ok) setSug({ video: r.video, existingTrackId: r.existingTrackId, artist: r.artist })
  }, [sugTried]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (autoSuggest) fetchSuggest() }, [autoSuggest, fetchSuggest])

  // „Pridėti" → atidaro TĄ PATĮ kontroliuojamą quick-add flow (URL → preview →
  // albumų patikra → commit). Po commit'o susiejam su topais (žr. listener'į).
  const [openedVid, setOpenedVid] = useState<string | null>(null)
  async function startQuickAdd() {
    let vid = sug?.video?.videoId || m.videoId || null
    if (!vid) {
      setSugLoading(true)
      const r = await post('suggest')
      setSugLoading(false)
      if (r?.ok) { setSug({ video: r.video, existingTrackId: r.existingTrackId, artist: r.artist }); setSugTried(true) }
      vid = r?.video?.videoId || null
    }
    if (!vid) { setMsg('YouTube nerasta'); return }
    setOpenedVid(vid)
    openAdminQuickAdd(`https://www.youtube.com/watch?v=${vid}`)
  }
  useEffect(() => {
    if (!openedVid) return
    const onCommit = (e: Event) => {
      const d = (e as CustomEvent).detail
      if (!d) return
      const match = d.videoId === openedVid || (typeof d.url === 'string' && d.url.includes(openedVid))
      if (!match) return
      const trackId = d.result?.track?.id
      if (trackId) act('link', { trackId })
      else { setMsg('✓ pridėta'); setTimeout(onDone, 700) }
    }
    window.addEventListener('musiclt:quickadd-committed', onCommit)
    return () => window.removeEventListener('musiclt:quickadd-committed', onCommit)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openedVid])

  // Atlikėjas jau kataloge? Discovery kandidatai atneša tai iškart (m.artistId),
  // chart eilutėms — po „suggest" (sug.artist). Rodom 🔥 su populiarumo score.
  const hasArtist = sug?.artist != null || m.artistId != null
  const score = sug?.artist?.score ?? m.artistScore ?? null
  const artistSlug = sug?.artist?.slug ?? m.artistSlug ?? null
  const artistId = sug?.artist?.id ?? m.artistId ?? null
  const ytUrl = sug?.video ? `https://www.youtube.com/watch?v=${sug.video.videoId}` : null

  return (
    <div className="border-b border-gray-100 px-3 py-2.5 last:border-b-0">
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-[13px] font-bold tabular-nums text-amber-700" title="Keliuose topuose">{m.chartCount}×</span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-snug text-gray-800">{m.title}</p>
          <p className="mt-0.5 text-xs text-gray-500">
            {artistId ? (
              <>
                <a href={`/admin/artists/${artistId}`} target="_blank" rel="noreferrer"
                  className="font-medium text-violet-600 hover:underline" title="Atlikėjo redagavimas (admin, naujame lange)">{m.artist}</a>
                {artistSlug && (
                  <a href={`/atlikejai/${artistSlug}`} target="_blank" rel="noreferrer"
                    className="ml-1 inline-flex translate-y-[1px] text-gray-400 hover:text-violet-600" title="Viešas puslapis (naujame lange)">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" /></svg>
                  </a>
                )}
              </>
            ) : (
              <span className={m.artist ? 'font-medium text-gray-600' : 'font-medium italic text-gray-400'}>{m.artist || 'atlikėjas nenustatytas'}</span>
            )}
            {hasArtist && <span className="ml-1 rounded bg-orange-100 px-1.5 py-0.5 text-[11px] font-bold text-orange-700" title="Atlikėjas jau kataloge · populiarumo score">🔥 {score ?? '—'}</span>}
            <span className="text-gray-300"> · {m.charts.join(', ')}</span>
          </p>

          {/* YouTube populiarumo matai — kad būtų galima įsivertinti ar verta pridėti.
              velocity (views/val) = palyginamas „karštumo" matas tarp dainų. */}
          {(m.views != null || m.velocity != null || m.publishedAt) && (
            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
              {m.velocity != null && (
                <span className="rounded bg-rose-50 px-1.5 py-0.5 font-semibold text-rose-700" title="Peržiūros per valandą (palyginamas karštumo matas)">⚡ {fmtVel(m.velocity)}</span>
              )}
              {m.views != null && (
                <span className="rounded bg-gray-100 px-1.5 py-0.5 font-medium text-gray-600" title="Viso peržiūrų">👁 {fmtViews(m.views)}</span>
              )}
              {m.publishedAt && (
                <span className="text-gray-400" title={new Date(m.publishedAt).toLocaleDateString('lt-LT')}>{fmtAge(m.publishedAt)}</span>
              )}
            </div>
          )}

          {/* Veiksmai — atskira eilutė, wrap'inasi mobile'e */}
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <button onClick={startQuickAdd} disabled={busy}
              title="Atidaro greito pridėjimo flow (peržiūra + albumų patikra), po patvirtinimo susieja su topais"
              className="rounded bg-blue-600 px-3 py-1 text-[13px] font-semibold text-white hover:bg-blue-700 disabled:opacity-50">✓ Pridėti</button>
            <button onClick={() => setSearching(s => !s)} disabled={busy}
              className="rounded bg-gray-100 px-3 py-1 text-[13px] font-medium text-gray-700 hover:bg-gray-200 disabled:opacity-50">Susieti</button>
            {!autoSuggest && !sug && !sugLoading && (
              <button onClick={fetchSuggest} disabled={busy}
                className="rounded bg-gray-100 px-3 py-1 text-[13px] font-medium text-gray-700 hover:bg-gray-200 disabled:opacity-50">🔎 YouTube</button>
            )}
            {m.videoId && (
              <button onClick={reject} disabled={busy}
                title="Atmesti pasiūlymą — daugiau nebesiūlys"
                className="rounded bg-gray-100 px-3 py-1 text-[13px] font-medium text-gray-500 hover:bg-red-100 hover:text-red-600 disabled:opacity-50">✕ Atmesti</button>
            )}
            {msg && <span className="text-[13px] font-medium text-gray-500">{msg}</span>}
          </div>

          {/* YouTube siūlymas (peržiūrai) */}
          {(sugLoading || sug?.video) && (
            <div className="mt-2 flex items-center gap-2.5 rounded-lg border border-gray-200 bg-gray-50 p-2">
              {sugLoading ? (
                <span className="text-xs text-gray-400">🔎 Ieškoma YouTube…</span>
              ) : sug?.video && ytUrl ? (
                <>
                  <a href={ytUrl} target="_blank" rel="noreferrer" className="shrink-0">
                    <img src={`https://i.ytimg.com/vi/${sug.video.videoId}/mqdefault.jpg`} alt="" className="h-11 w-[74px] rounded object-cover" />
                  </a>
                  <div className="min-w-0 flex-1">
                    <a href={ytUrl} target="_blank" rel="noreferrer" className="block truncate text-[13px] font-medium text-gray-800 hover:underline">{sug.video.title}</a>
                    <p className="truncate text-xs text-gray-500">{sug.video.channel}{sug.video.duration && ` · ${sug.video.duration}`}</p>
                  </div>
                  {sug.existingTrackId ? (
                    <button onClick={() => act('link', { trackId: sug.existingTrackId })} disabled={busy}
                      className="shrink-0 rounded bg-amber-100 px-2.5 py-1 text-[12px] font-semibold text-amber-700 hover:bg-amber-200 disabled:opacity-50">Susieti</button>
                  ) : null}
                </>
              ) : null}
            </div>
          )}
          {sug && !sug.video && !sugLoading && <p className="mt-1 text-xs text-gray-400">YouTube siūlymo nerasta.</p>}
        </div>
      </div>

      {searching && <LinkSearch defaultQuery={`${simpleArtist(m.artist)} ${cleanTitle(m.title)}`} fallbackQuery={cleanTitle(m.title)} onPick={(h) => { setSearching(false); act('link', { trackId: h.id }) }} />}
    </div>
  )
}

function LinkSearch({ defaultQuery, fallbackQuery, onPick }: { defaultQuery: string; fallbackQuery?: string; onPick: (h: Hit) => void }) {
  const [q, setQ] = useState(defaultQuery)
  const [hits, setHits] = useState<Hit[]>([])
  const [loading, setLoading] = useState(false)
  const t = useRef<any>(null)
  // fallback: jei „atlikėjas + pavadinimas" nieko neranda (pvz. chart primary
  // artist ≠ katalogo artist — „Шадэ" yra po Xcho, ne „Индия"), bandom dar kartą
  // TIK su pavadinimu, kad daina vis tiek išnirtų pasirinkimui.
  const run = useCallback((query: string, fallback?: string) => {
    if (t.current) clearTimeout(t.current)
    t.current = setTimeout(async () => {
      if (query.trim().length < 2) { setHits([]); return }
      setLoading(true)
      const fetchHits = async (qq: string): Promise<Hit[]> => {
        const r = await fetch(`/api/search-entities?q=${encodeURIComponent(qq)}`).then(r => r.json()).catch(() => ({ results: [] }))
        return (r.results || []).filter((h: Hit) => h.type === 'daina').slice(0, 6)
      }
      let res = await fetchHits(query)
      if (res.length === 0 && fallback && fallback.trim() && fallback.trim() !== query.trim()) {
        res = await fetchHits(fallback)
      }
      setHits(res)
      setLoading(false)
    }, 250)
  }, [])
  useEffect(() => { run(defaultQuery, fallbackQuery) }, [defaultQuery, fallbackQuery, run])
  return (
    <div className="ml-12 mt-2 rounded-lg border border-gray-200 bg-gray-50 p-2">
      <input autoFocus value={q} onChange={e => { setQ(e.target.value); run(e.target.value) }}
        placeholder="Ieškoti dainos kataloge…"
        className="w-full rounded-md border border-gray-200 px-2.5 py-1.5 text-sm outline-none focus:border-violet-400" />
      <div className="mt-1.5 max-h-52 overflow-y-auto">
        {loading && <p className="px-2 py-1.5 text-xs text-gray-400">Ieškoma…</p>}
        {!loading && hits.length === 0 && <p className="px-2 py-1.5 text-xs text-gray-400">Nieko nerasta. Naudok „Sukurti".</p>}
        {hits.map(h => (
          <button key={h.id} onClick={() => onPick(h)} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-white">
            {h.image_url ? <img src={h.image_url} alt="" className="h-7 w-7 shrink-0 rounded object-cover" /> : <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-gray-200 text-gray-400">♪</span>}
            <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-gray-800">{h.title}</span><span className="block truncate text-xs text-gray-400">{h.artist}</span></span>
            <span className="shrink-0 text-[14px] font-semibold text-violet-600">Susieti</span>
          </button>
        ))}
      </div>
    </div>
  )
}
