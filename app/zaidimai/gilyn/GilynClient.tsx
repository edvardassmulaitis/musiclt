'use client'

// app/zaidimai/gilyn/GilynClient.tsx
//
// GILYN — kasdienis muzikos atradimo žaidimas.
//
// Srautas: onboarding → intro → DĖŽĖ (20 plokštelių, vienas laikomas vinilas)
// → KASIMASIS (3 žingsniai po 3 duris) → REZULTATAS (kelias + bendruomenė)
// → ŽEMĖLAPIS (žanrai → substiliai, švyturiai, rūkas).
//
// Principai: mobile-first, preview savanoriškas, jokių populiarumo balų,
// bendruomenės % tik po pasirinkimo, undo — vienas žingsnis.

import { useEffect, useState, useCallback } from 'react'
import ZaidimoLangas from '@/components/zaidimai/ZaidimoLangas'

// ── Tipai ────────────────────────────────────────────────────────────────

type BoxAlbum = {
  albumId: number; artistId: number; title: string; artist: string
  artistSlug: string | null; albumSlug: string | null; year: number | null
  cover: string; ytId: string | null; previewTitle: string | null
  country: string | null; personal: 'liked_album' | 'liked_artist' | 'near' | 'new'
}
type Door = {
  doorType: 'sound' | 'scene' | 'bridge'; label: string
  artistId: number; artist: string; artistSlug: string | null
  albumId: number | null; title: string | null; year: number | null
  cover: string | null; ytId: string | null; reason: string
}
type PathNode = {
  step: number; doorType: string; artistId: number; artist: string
  artistSlug: string | null; albumId: number | null; title: string | null
  cover: string | null; year: number | null; ytId: string | null; reason: string | null
}
type Run = {
  status: 'box' | 'dig' | 'done'; boxPos: number; held: any; swaps: number
  shelf: any[]; heard: number[]; doors: Door[] | null; path: PathNode[]
  digStep: number; finalPick: any; finishedAt: string | null
}
type Community = {
  finished: number; heldSameFinal: number; avgSwaps: number
  doorSplit: { sound: number; scene: number; bridge: number }[]
  sameFinalRegion: number
} | null
type MapData = {
  regions: { genreId: number; name: string; substyles: { id: number; name: string; beacons: number; visited: number; heard: number; saved: number }[]; beacons: number; visited: number }[]
  totals: { beacons: number; visited: number; heard: number; saved: number; substylesTouched: number; substylesTotal: number }
  likeCounts: { artists: number; albums: number; tracks: number }
}

const DOOR_COLORS: Record<string, string> = { sound: 'var(--accent-green)', scene: 'var(--accent-blue)', bridge: '#a855f7' }
const PERSONAL_LABEL: Record<string, string | null> = {
  liked_album: '❤️ Jau mėgsti šį albumą',
  liked_artist: '❤️ Jau tavo žemėlapyje',
  near: 'Netoli tavo teritorijos',
  new: null,
}

// ── Komponentas ──────────────────────────────────────────────────────────

export default function GilynClient() {
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [day, setDay] = useState('')
  const [box, setBox] = useState<BoxAlbum[]>([])
  const [run, setRun] = useState<Run | null>(null)
  const [community, setCommunity] = useState<Community>(null)
  const [likeCounts, setLikeCounts] = useState({ artists: 0, albums: 0, tracks: 0 })
  const [view, setView] = useState<'load' | 'onboard' | 'intro' | 'box' | 'boxEnd' | 'dig' | 'result' | 'map'>('load')
  const [onbStep, setOnbStep] = useState(0)
  const [playing, setPlaying] = useState<string | null>(null)   // ytId, kuris groja
  const [swapSheet, setSwapSheet] = useState<BoxAlbum | null>(null)
  const [shelfOpen, setShelfOpen] = useState(false)
  const [mapData, setMapData] = useState<MapData | null>(null)
  const [busy, setBusy] = useState(false)
  const [cardAnim, setCardAnim] = useState('')
  const [xpGain, setXpGain] = useState<number | null>(null)

  // ── Užkrovimas ──
  const refresh = useCallback(async () => {
    try {
      const r = await fetch('/api/zaidimai/gilyn', { cache: 'no-store' })
      const j = await r.json()
      if (j.error) { setErr(j.error); setLoading(false); return }
      setDay(j.day); setBox(j.box); setRun(j.run); setCommunity(j.community); setLikeCounts(j.likeCounts)
      const seen = typeof window !== 'undefined' && window.localStorage.getItem('gilyn_onb')
      if (!j.run) setView(seen ? 'intro' : 'onboard')
      else routeView(j.run)
      setLoading(false)
    } catch {
      setErr('Nepavyko užkrauti. Patikrink ryšį.'); setLoading(false)
    }
  }, [])
  useEffect(() => { refresh() }, [refresh])

  function routeView(r: Run) {
    if (r.status === 'box') setView(r.boxPos >= 20 && !r.held ? 'boxEnd' : 'box')
    else if (r.status === 'dig') setView('dig')
    else setView('result')
  }

  // ── Veiksmai (optimistinis UI) ──
  async function post(action: string, extra: Record<string, any> = {}): Promise<any> {
    try {
      const r = await fetch('/api/zaidimai/gilyn', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...extra }),
      })
      const j = await r.json()
      if (j.error) { await refresh(); return null }
      if (j.run) setRun(j.run)
      if (j.community !== undefined) setCommunity(j.community)
      if (typeof j.xp === 'number') setXpGain(j.xp)
      return j
    } catch { await refresh(); return null }
  }

  async function begin() {
    setBusy(true)
    const j = await post('start')
    setBusy(false)
    if (j?.run) { setRun(j.run); setView('box') }
  }

  function animateAdvance(dir: 'skip' | 'take') {
    setCardAnim(dir === 'take' ? 'gc-take' : 'gc-skip')
    window.setTimeout(() => setCardAnim(''), 320)
  }

  async function actHold(a: BoxAlbum) {
    if (!run || busy) return
    setPlaying(null)
    if (run.held && run.held.albumId !== a.albumId) { setSwapSheet(a); return }
    animateAdvance('take')
    const isLast = run.boxPos + 1 >= 20
    setRun({ ...run, boxPos: run.boxPos + 1, held: heldOf(a) })
    const j = await post('hold', { albumId: a.albumId })
    if (j?.run) routeView(j.run)
    else if (isLast) await refresh()
  }

  async function confirmSwap(a: BoxAlbum) {
    if (!run) return
    setSwapSheet(null); setPlaying(null)
    animateAdvance('take')
    setRun({ ...run, boxPos: run.boxPos + 1, held: heldOf(a), swaps: run.swaps + 1 })
    const j = await post('swap', { albumId: a.albumId })
    if (j?.run) routeView(j.run)
  }

  async function actSkip() {
    if (!run || busy) return
    setPlaying(null)
    animateAdvance('skip')
    const nextPos = run.boxPos + 1
    setRun({ ...run, boxPos: nextPos })
    const j = await post('advance', {})
    if (j?.run) routeView(j.run)
    else if (nextPos >= 20) { if (run.held) await refresh(); else setView('boxEnd') }
  }

  async function actShelf(a: BoxAlbum) {
    if (!run) return
    if (!run.shelf.some((s: any) => s.albumId === a.albumId)) {
      setRun({ ...run, shelf: [...run.shelf, { albumId: a.albumId, artist: a.artist, title: a.title, cover: a.cover, year: a.year, ytId: a.ytId }] })
      post('shelf', { albumId: a.albumId })
    }
  }

  async function actUndo() {
    if (!run || run.boxPos <= 0) return
    setPlaying(null)
    const j = await post('undo')
    if (j?.run) setView('box')
  }

  function actHeard(a: { albumId?: number; artistId?: number; ytId: string | null }) {
    if (!a.ytId) return
    setPlaying(a.ytId)
    if (run?.status === 'box' && a.albumId) {
      if (!run.heard.includes(a.albumId)) setRun({ ...run, heard: [...run.heard, a.albumId] })
      post('heard', { albumId: a.albumId })
    } else if (a.artistId) {
      post('heard', { artistId: a.artistId })
    }
  }

  async function chooseDoor(d: Door) {
    if (!run || busy) return
    setBusy(true); setPlaying(null)
    setCardAnim('gc-take')
    const j = await post('chooseDoor', { artistId: d.artistId })
    setBusy(false); setCardAnim('')
    if (j?.run) routeView(j.run)
  }

  async function openMap() {
    setView('map')
    if (!mapData) {
      try {
        const r = await fetch('/api/zaidimai/gilyn/zemelapis', { cache: 'no-store' })
        const j = await r.json()
        if (!j.error) setMapData(j)
      } catch {}
    }
  }

  function heldOf(a: BoxAlbum) {
    return { albumId: a.albumId, artistId: a.artistId, title: a.title, artist: a.artist, artistSlug: a.artistSlug, year: a.year, cover: a.cover, ytId: a.ytId }
  }

  // ── Render ──
  const current = run && run.status === 'box' && run.boxPos < 20 ? box[run.boxPos] : null

  return (
    <ZaidimoLangas title="Gilyn" backHref="/zaidimai" maxWidth={520}
      right={run && run.status !== 'done' && run.shelf?.length > 0 ? (
        <button className="g-shelfbtn" onClick={() => setShelfOpen(true)} type="button" aria-label="Lentyna">
          <ShelfIcon /> {run.shelf.length}
        </button>
      ) : undefined}
    >
      <style>{css}</style>

      {loading && <div className="g-center"><Vinyl spin size={74} /><p className="g-dim">Traukiame dienos dėžę…</p></div>}
      {err && !loading && <div className="g-center"><p className="g-dim">{err}</p><button className="g-cta" onClick={() => { setErr(null); setLoading(true); refresh() }} type="button">Bandyti dar kartą</button></div>}

      {!loading && !err && view === 'onboard' && <Onboarding step={onbStep} likeCounts={likeCounts}
        onNext={() => {
          if (onbStep < 2) setOnbStep(onbStep + 1)
          else { window.localStorage.setItem('gilyn_onb', '1'); setView('intro') }
        }} />}

      {!loading && !err && view === 'intro' && (
        <div className="g-center">
          <Vinyl size={90} />
          <h1 className="g-h1">Dienos dėžė</h1>
          <p className="g-date">{day}</p>
          <p className="g-lead">20 plokštelių. Viena vieta.<br />Kur šiandien nusikasi?</p>
          <ul className="g-rules">
            <li><b>Vartyk</b> — visi šiandien gauna tą patį rinkinį.</li>
            <li><b>Laikyk vieną</b> — naujas radinys gali pakeisti seną.</li>
            <li><b>Dėžės gale</b> tavo vinilas taps durimis gilyn.</li>
          </ul>
          <button className="g-cta" onClick={begin} disabled={busy} type="button">{busy ? 'Ruošiama…' : 'Atidaryti dėžę'}</button>
          <p className="g-hint">~4 min · preview neprivalomas · be teisingų atsakymų</p>
        </div>
      )}

      {!loading && !err && view === 'box' && run && current && (
        <div className="g-boxwrap">
          <div className="g-progress">
            <span className="g-pos">{run.boxPos + 1} <i>/ 20</i></span>
            <div className="g-bar"><i style={{ width: `${((run.boxPos) / 20) * 100}%` }} /></div>
            {run.boxPos > 0 && <button className="g-undo" onClick={actUndo} type="button" aria-label="Atšaukti">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M9 14 4 9l5-5" /><path d="M4 9h10a6 6 0 0 1 0 12h-3" /></svg>
            </button>}
          </div>

          <div className={`g-card ${cardAnim}`} key={current.albumId}>
            <div className="g-coverwrap">
              {playing === current.ytId && current.ytId ? (
                <iframe key={current.ytId} className="g-iframe"
                  src={`https://www.youtube.com/embed/${current.ytId}?autoplay=1&rel=0&modestbranding=1&playsinline=1&iv_load_policy=3`}
                  title={current.title} allow="autoplay; encrypted-media" />
              ) : (
                <>
                  <div className="g-vinylpeek" aria-hidden="true" />
                  <img className="g-cover" src={current.cover} alt="" referrerPolicy="no-referrer" />
                  {current.ytId && (
                    <button className="g-play" onClick={() => actHeard(current)} type="button" aria-label="Klausyti ištraukos">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="#fff"><polygon points="6 4 20 12 6 20 6 4" /></svg>
                    </button>
                  )}
                </>
              )}
            </div>
            {PERSONAL_LABEL[current.personal] && <span className={`g-chip ${current.personal}`}>{PERSONAL_LABEL[current.personal]}</span>}
            <div className="g-meta">
              <span className="g-artist">{current.artist}</span>
              <span className="g-title">{current.title}{current.year ? ` · ${current.year}` : ''}</span>
            </div>
          </div>

          <div className="g-actions">
            <button className="g-act ghost" onClick={actSkip} type="button">Praleisti</button>
            <button className="g-act main" onClick={() => actHold(current)} type="button">
              {run.held ? 'Pakeisti' : 'Pasilikti'}
            </button>
            <button className={`g-act shelf${run.shelf.some((s: any) => s.albumId === current.albumId) ? ' on' : ''}`}
              onClick={() => actShelf(current)} type="button" aria-label="Į lentyną"><ShelfIcon /></button>
          </div>

          <div className="g-held">
            {run.held ? (
              <>
                <img src={run.held.cover} alt="" referrerPolicy="no-referrer" />
                <div className="g-heldtxt">
                  <span className="g-heldlbl">Laikai</span>
                  <span className="g-heldname">{run.held.artist} — {run.held.title}</span>
                </div>
              </>
            ) : (
              <>
                <div className="g-heldempty" aria-hidden="true"><Vinyl size={30} /></div>
                <div className="g-heldtxt">
                  <span className="g-heldlbl">Tavo vieta tuščia</span>
                  <span className="g-heldname dim">Radęs įdomų — pasilik</span>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {!loading && !err && view === 'boxEnd' && run && (
        <div className="g-center">
          <Vinyl size={74} />
          <h2 className="g-h1">Šiandien niekas neužkabino</h2>
          <p className="g-lead">Nieko tokio — būna dienų, kai dėžė ne tavo.</p>
          <button className="g-cta" onClick={async () => { setBusy(true); const j = await post('surprise'); setBusy(false); if (j?.run) routeView(j.run) }} disabled={busy} type="button">Nustebink mane</button>
          {run.shelf?.length > 0 && <button className="g-cta alt" onClick={() => setShelfOpen(true)} type="button">Peržiūrėti lentyną ({run.shelf.length})</button>}
          <button className="g-cta ghost" onClick={async () => { const j = await post('endDay'); if (j?.run) routeView(j.run) }} type="button">Baigti šiandien</button>
        </div>
      )}

      {!loading && !err && view === 'dig' && run && (
        <div className="g-digwrap">
          <div className="g-pathline">
            {run.path.map((p, i) => (
              <span key={i} className="g-pathnode">
                {i > 0 && <span className="g-patharrow">→</span>}
                <img src={p.cover || ''} alt="" referrerPolicy="no-referrer" />
              </span>
            ))}
            <span className="g-pathstep">{run.digStep + 1} / 3</span>
          </div>
          <h2 className="g-digq">Kur šios durys nuves?</h2>
          <p className="g-digfrom">Dabar esi: <b>{run.path[run.path.length - 1]?.artist}</b></p>

          <div className="g-doors">
            {(run.doors || []).map(d => (
              <div className={`g-door ${cardAnim && 'dim'}`} key={d.artistId} style={{ borderColor: `color-mix(in srgb, ${DOOR_COLORS[d.doorType]} 45%, transparent)` }}>
                <span className="g-doortype" style={{ color: DOOR_COLORS[d.doorType] }}>{d.label}</span>
                <div className="g-doorbody">
                  <div className="g-doorcover">
                    {playing === d.ytId && d.ytId ? (
                      <iframe key={d.ytId} className="g-iframe sm"
                        src={`https://www.youtube.com/embed/${d.ytId}?autoplay=1&rel=0&modestbranding=1&playsinline=1&iv_load_policy=3`}
                        title={d.artist} allow="autoplay; encrypted-media" />
                    ) : (
                      <>
                        <img src={d.cover || ''} alt="" referrerPolicy="no-referrer" />
                        {d.ytId && <button className="g-play sm" onClick={() => actHeard({ artistId: d.artistId, ytId: d.ytId })} type="button" aria-label="Klausyti">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="#fff"><polygon points="6 4 20 12 6 20 6 4" /></svg>
                        </button>}
                      </>
                    )}
                  </div>
                  <div className="g-doormeta">
                    <span className="g-doorartist">{d.artist}</span>
                    {d.title && <span className="g-dooralbum">{d.title}{d.year ? ` · ${d.year}` : ''}</span>}
                    <span className="g-doorwhy">{d.reason}</span>
                  </div>
                </div>
                <button className="g-doorgo" onClick={() => chooseDoor(d)} disabled={busy} type="button"
                  style={{ background: DOOR_COLORS[d.doorType] }}>Kasti čia</button>
              </div>
            ))}
          </div>
          <p className="g-hint">Pasirinkęs vienas duris, kitų dviejų šiandien nebematysi.</p>
        </div>
      )}

      {!loading && !err && view === 'result' && run && (
        <div className="g-reswrap">
          {xpGain !== null && <div className="g-xp">+{xpGain} XP</div>}
          <h2 className="g-h1 center">Tavo dienos kelias</h2>
          {run.path.length > 0 ? (
            <div className="g-respath">
              {[...(run.held && !run.path.some(p => p.step === 0) ? [{ step: 0, doorType: 'portal', ...run.held, reason: null }] : []), ...run.path].map((p: any, i: number, all: any[]) => (
                <div key={i} className={`g-resnode${run.finalPick?.artistId === p.artistId ? ' picked' : ''}`}
                  onClick={() => post('finalPick', { index: i })} role="button" tabIndex={0}>
                  <img src={p.cover || ''} alt="" referrerPolicy="no-referrer" />
                  <div className="g-resmeta">
                    <span className="g-resartist">{p.artist}</span>
                    {p.title && <span className="g-restitle">{p.title}{p.year ? ` · ${p.year}` : ''}</span>}
                    {p.reason && <span className="g-resreason">{p.reason}</span>}
                    {p.doorType === 'portal' && <span className="g-resreason">Tavo dienos portalas</span>}
                  </div>
                  {run.finalPick?.artistId === p.artistId && <span className="g-star">★</span>}
                  {i < all.length - 1 && <span className="g-resline" aria-hidden="true" />}
                </div>
              ))}
              <p className="g-hint">Paspausk kelio tašką — pažymėk savo dienos radinį ★</p>
            </div>
          ) : (
            <p className="g-lead center">Šiandien kelio nebuvo — dėžė liko uždaryta. Rytoj — nauja.</p>
          )}

          {community && (
            <div className="g-comm">
              <h3 className="g-h3">Bendruomenė šiandien</h3>
              <p className="g-commrow">Baigė kelią: <b>{community.finished}</b></p>
              {run.held && <p className="g-commrow">Su tavo albumu baigė <b>{community.heldSameFinal}%</b></p>}
              {run.path.length > 1 && <p className="g-commrow">Tavo galutinį tašką pasiekė <b>{community.sameFinalRegion}%</b></p>}
              {community.doorSplit.map((s, i) => (
                (s.sound + s.scene + s.bridge > 0) && <div className="g-split" key={i}>
                  <span className="g-splitlbl">{i + 1} žingsnis</span>
                  <div className="g-splitbar">
                    <i style={{ width: `${s.sound}%`, background: DOOR_COLORS.sound }} title={`Artimas skambesys ${s.sound}%`} />
                    <i style={{ width: `${s.scene}%`, background: DOOR_COLORS.scene }} title={`Scena ${s.scene}%`} />
                    <i style={{ width: `${s.bridge}%`, background: DOOR_COLORS.bridge }} title={`Tiltas ${s.bridge}%`} />
                  </div>
                </div>
              ))}
              <p className="g-legend">
                <span style={{ color: DOOR_COLORS.sound }}>● skambesys</span>
                <span style={{ color: DOOR_COLORS.scene }}>● scena</span>
                <span style={{ color: DOOR_COLORS.bridge }}>● tiltas</span>
              </p>
            </div>
          )}

          <button className="g-cta" onClick={openMap} type="button">Atidaryti žemėlapį</button>
          {run.shelf?.length > 0 && <button className="g-cta alt" onClick={() => setShelfOpen(true)} type="button">Lentyna ({run.shelf.length})</button>}
          <p className="g-hint">Nauja dėžė — rytoj.</p>
        </div>
      )}

      {!loading && view === 'map' && (
        <div className="g-mapwrap">
          <button className="g-mapback" onClick={() => run ? routeView(run) : setView('intro')} type="button">← Grįžti</button>
          <h2 className="g-h1 center">Tavo muzikos žemėlapis</h2>
          {!mapData ? (
            <div className="g-center"><Vinyl spin size={54} /><p className="g-dim">Braižome žemėlapį…</p></div>
          ) : (
            <>
              <div className="g-maptotals">
                <div><b>{mapData.totals.beacons}</b><span>švyturiai</span></div>
                <div><b>{mapData.totals.visited}</b><span>aplankyta</span></div>
                <div><b>{mapData.totals.saved}</b><span>radiniai</span></div>
                <div><b>{mapData.totals.substylesTouched}<i>/{mapData.totals.substylesTotal}</i></b><span>teritorijos</span></div>
              </div>
              {mapData.regions.map(r => {
                const active = r.substyles.filter(s => s.beacons || s.visited || s.saved || s.heard)
                const fog = r.substyles.length - active.length
                return (
                  <div className="g-region" key={r.genreId}>
                    <div className="g-regionhead">
                      <span className="g-regionname">{r.name}</span>
                      <span className="g-regionstat">{active.length ? `${active.length} atrasta` : 'rūkas'}</span>
                    </div>
                    <div className="g-subs">
                      {active.slice(0, 14).map(s => (
                        <span key={s.id} className={`g-sub${s.saved ? ' saved' : s.visited ? ' visited' : s.beacons ? ' beacon' : ' heard'}`}>
                          {s.saved ? '★ ' : ''}{s.name}
                        </span>
                      ))}
                      {fog > 0 && <span className="g-sub fog">+{fog} rūke</span>}
                    </div>
                  </div>
                )
              })}
              <p className="g-hint">Švyturiai — tavo seni pamėgimai. Žali — kur realiai keliavai per Gilyn. ★ — išsaugoti radiniai. Rūkas laukia.</p>
            </>
          )}
        </div>
      )}

      {/* ── Pakeitimo lapas ── */}
      {swapSheet && run?.held && (
        <div className="g-sheetback" onClick={() => setSwapSheet(null)}>
          <div className="g-sheet" onClick={e => e.stopPropagation()}>
            <h3 className="g-h3 center">Keisti laikomą vinilą?</h3>
            <div className="g-swaprow">
              <div className="g-swapcol">
                <span className="g-swaplbl">Dabar laikai</span>
                <img src={run.held.cover} alt="" referrerPolicy="no-referrer" />
                <span className="g-swapname">{run.held.artist}</span>
                <span className="g-swaptitle">{run.held.title}</span>
              </div>
              <span className="g-swaparw">⇄</span>
              <div className="g-swapcol">
                <span className="g-swaplbl new">Naujas radinys</span>
                <img src={swapSheet.cover} alt="" referrerPolicy="no-referrer" />
                <span className="g-swapname">{swapSheet.artist}</span>
                <span className="g-swaptitle">{swapSheet.title}</span>
              </div>
            </div>
            <button className="g-cta" onClick={() => confirmSwap(swapSheet)} type="button">Pakeisti į {swapSheet.artist}</button>
            <button className="g-cta ghost" onClick={() => setSwapSheet(null)} type="button">Palikti {run.held.artist}</button>
          </div>
        </div>
      )}

      {/* ── Lentyna ── */}
      {shelfOpen && run && (
        <div className="g-sheetback" onClick={() => setShelfOpen(false)}>
          <div className="g-sheet" onClick={e => e.stopPropagation()}>
            <h3 className="g-h3 center">Lentyna — paklausyti vėliau</h3>
            {(!run.shelf || run.shelf.length === 0) && <p className="g-dim center">Tuščia. Vartydamas spausk lentynos ženkliuką.</p>}
            <div className="g-shelflist">
              {(run.shelf || []).map((s: any) => (
                <div className="g-shelfitem" key={s.albumId}>
                  <img src={s.cover} alt="" referrerPolicy="no-referrer" />
                  <div className="g-shelfmeta">
                    <span className="g-shelfartist">{s.artist}</span>
                    <span className="g-shelftitle">{s.title}{s.year ? ` · ${s.year}` : ''}</span>
                  </div>
                  {s.ytId && <button className="g-play sm inline" onClick={() => { setShelfOpen(false); setPlaying(s.ytId) }} type="button" aria-label="Klausyti">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="#fff"><polygon points="6 4 20 12 6 20 6 4" /></svg>
                  </button>}
                </div>
              ))}
            </div>
            <button className="g-cta ghost" onClick={() => setShelfOpen(false)} type="button">Uždaryti</button>
          </div>
        </div>
      )}
    </ZaidimoLangas>
  )
}

// ── Onboarding ───────────────────────────────────────────────────────────

function Onboarding({ step, likeCounts, onNext }: { step: number; likeCounts: { artists: number; albums: number; tracks: number }; onNext: () => void }) {
  const hasLikes = likeCounts.artists + likeCounts.albums + likeCounts.tracks > 0
  const screens = [
    {
      icon: <Vinyl size={80} />,
      title: 'Vartyk dienos dėžę',
      text: 'Kasdien — ta pati 20 plokštelių dėžė visiems. Jokių teisingų atsakymų: tik tavo smalsumas.',
    },
    {
      icon: <HoldIcon />,
      title: 'Laikyk tik vieną',
      text: 'Radai įdomų — pasilik. Pasirodė geresnis — keisk. Bet nežinai, kas dar laukia dėžėje…',
    },
    hasLikes ? {
      icon: <BeaconIcon />,
      title: 'Tavo žemėlapis jau gyvas',
      text: `Radome: ${likeCounts.artists} pamėgtų atlikėjų, ${likeCounts.albums} albumų, ${likeCounts.tracks} dainų. Jie tapo švyturiais tavo muzikos žemėlapyje — Gilyn kelionės sujungs teritorijas tarp jų.`,
    } : {
      icon: <BeaconIcon />,
      title: 'Kelias atidengia žemėlapį',
      text: 'Dėžės gale tavo vinilas taps durimis: trys pasirinkimai nuves ten, kur dar nebuvai. Kiekviena kelionė sklaido rūką tavo muzikos žemėlapyje.',
    },
  ]
  const s = screens[step]
  return (
    <div className="g-center">
      {s.icon}
      <h2 className="g-h1">{s.title}</h2>
      <p className="g-lead">{s.text}</p>
      <div className="g-dots">{[0, 1, 2].map(i => <i key={i} className={i === step ? 'on' : ''} />)}</div>
      <button className="g-cta" onClick={onNext} type="button">{step < 2 ? 'Toliau' : 'Pradėti'}</button>
    </div>
  )
}

// ── Ikonos / vinilas ─────────────────────────────────────────────────────

function Vinyl({ size = 60, spin = false }: { size?: number; spin?: boolean }) {
  return (
    <svg className={spin ? 'g-spin' : ''} width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
      <circle cx="50" cy="50" r="48" fill="#111" stroke="rgba(140,160,190,0.3)" strokeWidth="1.5" />
      <circle cx="50" cy="50" r="38" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
      <circle cx="50" cy="50" r="30" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
      <circle cx="50" cy="50" r="16" fill="var(--accent-orange)" />
      <circle cx="50" cy="50" r="3.5" fill="#111" />
    </svg>
  )
}
function ShelfIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" /><path d="M17 21v-8H7v8" /><path d="M7 3v5h8" /></svg>
}
function HoldIcon() {
  return (
    <svg width="80" height="80" viewBox="0 0 100 100" aria-hidden="true">
      <rect x="18" y="18" width="64" height="64" rx="6" fill="var(--bg-elevated)" stroke="rgba(140,160,190,0.3)" strokeWidth="1.5" />
      <circle cx="50" cy="50" r="24" fill="#111" /><circle cx="50" cy="50" r="8" fill="var(--accent-orange)" />
    </svg>
  )
}
function BeaconIcon() {
  return (
    <svg width="80" height="80" viewBox="0 0 100 100" aria-hidden="true">
      <circle cx="30" cy="60" r="7" fill="var(--accent-orange)" />
      <circle cx="30" cy="60" r="14" fill="none" stroke="var(--accent-orange)" strokeOpacity="0.35" strokeWidth="2" />
      <circle cx="72" cy="34" r="7" fill="var(--accent-orange)" />
      <circle cx="72" cy="34" r="14" fill="none" stroke="var(--accent-orange)" strokeOpacity="0.35" strokeWidth="2" />
      <path d="M40 55 Q52 42 63 40" stroke="rgba(140,160,190,0.5)" strokeWidth="2" strokeDasharray="3 4" fill="none" />
    </svg>
  )
}

// ── Stiliai ──────────────────────────────────────────────────────────────

const css = `
.g-center { display: flex; flex-direction: column; align-items: center; text-align: center; gap: 14px; padding: 28px 8px; }
.g-h1 { font-size: 24px; font-weight: 900; letter-spacing: -0.02em; margin: 0; }
.g-h1.center { text-align: center; }
.g-h3 { font-size: 16px; font-weight: 900; margin: 0 0 10px; }
.g-h3.center { text-align: center; }
.g-date { font-size: 12px; font-weight: 800; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.08em; margin: -6px 0 0; }
.g-lead { font-size: 15px; color: var(--text-secondary); line-height: 1.55; margin: 0; max-width: 340px; }
.g-lead.center { text-align: center; margin: 0 auto; }
.g-dim { font-size: 13.5px; color: var(--text-muted); }
.g-dim.center { text-align: center; }
.g-hint { font-size: 12px; color: var(--text-muted); text-align: center; margin: 10px 0 0; }
.g-rules { list-style: none; margin: 4px 0; padding: 0; display: flex; flex-direction: column; gap: 9px; text-align: left; }
.g-rules li { font-size: 14px; color: var(--text-secondary); padding-left: 22px; position: relative; }
.g-rules li::before { content: '◉'; position: absolute; left: 0; color: var(--accent-orange); font-size: 12px; }
.g-rules b { color: var(--text-primary); }
.g-cta { display: block; width: 100%; max-width: 340px; margin: 4px auto 0; border: 0; cursor: pointer; font-size: 16px; font-weight: 900; color: #fff; background: var(--accent-orange); border-radius: 13px; padding: 14px; }
.g-cta.alt { background: var(--bg-elevated); color: var(--text-primary); border: 1px solid rgba(140,160,190,0.3); }
.g-cta.ghost { background: transparent; color: var(--text-muted); border: 0; font-weight: 700; font-size: 14px; padding: 10px; }
.g-cta:disabled { opacity: 0.6; }
.g-dots { display: flex; gap: 6px; }
.g-dots i { width: 7px; height: 7px; border-radius: 50%; background: rgba(140,160,190,0.3); }
.g-dots i.on { background: var(--accent-orange); }
.g-spin { animation: gspin 2.4s linear infinite; }
@keyframes gspin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .g-spin { animation: none; } }

/* ── Dėžė ── */
.g-boxwrap { display: flex; flex-direction: column; gap: 12px; min-height: 100%; }
.g-progress { display: flex; align-items: center; gap: 10px; }
.g-pos { font-size: 15px; font-weight: 900; white-space: nowrap; }
.g-pos i { font-style: normal; color: var(--text-muted); font-weight: 700; font-size: 12px; }
.g-bar { flex: 1; height: 5px; border-radius: 99px; background: rgba(140,160,190,0.18); overflow: hidden; }
.g-bar i { display: block; height: 100%; background: var(--accent-orange); border-radius: 99px; transition: width 0.3s ease; }
.g-undo { width: 32px; height: 32px; border-radius: 10px; border: 1px solid rgba(140,160,190,0.25); background: var(--bg-surface); color: var(--text-secondary); display: flex; align-items: center; justify-content: center; cursor: pointer; flex-shrink: 0; }

.g-card { background: var(--bg-surface); border: 1px solid rgba(140,160,190,0.2); border-radius: 18px; padding: 14px; display: flex; flex-direction: column; gap: 10px; }
.g-card.gc-take { animation: gctake 0.32s ease; }
.g-card.gc-skip { animation: gcskip 0.32s ease; }
@keyframes gctake { 0% { transform: none; opacity: 1; } 100% { transform: translateY(26px) scale(0.94); opacity: 0; } }
@keyframes gcskip { 0% { transform: none; opacity: 1; } 100% { transform: translateX(-46px) rotate(-3deg); opacity: 0; } }
@media (prefers-reduced-motion: reduce) { .g-card.gc-take, .g-card.gc-skip { animation: none; } }
.g-coverwrap { position: relative; aspect-ratio: 1; border-radius: 12px; overflow: hidden; background: #000; }
.g-vinylpeek { position: absolute; top: 6%; right: -16%; width: 92%; height: 88%; border-radius: 50%; background: radial-gradient(circle at center, #0a0a0a 28%, #161616 29%, #0d0d0d 46%, #191919 47%, #0e0e0e 70%, #1a1a1a 71%, #101010 100%); box-shadow: -6px 0 18px rgba(0,0,0,0.5); }
.g-cover { position: absolute; inset: 0; width: 94%; height: 100%; object-fit: cover; border-radius: 4px; box-shadow: 8px 0 22px rgba(0,0,0,0.45); }
.g-iframe { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; }
.g-iframe.sm { position: absolute; inset: 0; }
.g-play { position: absolute; right: 12px; bottom: 12px; width: 52px; height: 52px; border-radius: 50%; border: 0; cursor: pointer; background: var(--accent-orange); display: flex; align-items: center; justify-content: center; padding-left: 4px; box-shadow: 0 8px 24px rgba(0,0,0,0.45); }
.g-play.sm { width: 34px; height: 34px; right: 6px; bottom: 6px; padding-left: 2px; }
.g-play.sm.inline { position: static; flex-shrink: 0; }
.g-chip { align-self: flex-start; font-size: 11.5px; font-weight: 800; border-radius: 999px; padding: 4px 11px; background: color-mix(in srgb, var(--accent-orange) 16%, transparent); color: var(--accent-orange); }
.g-chip.near { background: color-mix(in srgb, var(--accent-blue) 16%, transparent); color: var(--accent-link, #7aa7ff); }
.g-meta { display: flex; flex-direction: column; gap: 2px; }
.g-artist { font-size: 19px; font-weight: 900; letter-spacing: -0.01em; }
.g-title { font-size: 13.5px; color: var(--text-secondary); font-weight: 600; }

.g-actions { display: flex; gap: 9px; }
.g-act { border: 0; cursor: pointer; border-radius: 13px; font-weight: 900; font-size: 15px; padding: 13px 0; }
.g-act.ghost { flex: 1; background: var(--bg-elevated); color: var(--text-secondary); border: 1px solid rgba(140,160,190,0.22); }
.g-act.main { flex: 1.6; background: var(--accent-orange); color: #fff; }
.g-act.shelf { width: 50px; display: flex; align-items: center; justify-content: center; background: var(--bg-elevated); color: var(--text-muted); border: 1px solid rgba(140,160,190,0.22); }
.g-act.shelf.on { color: var(--accent-orange); border-color: var(--accent-orange); }

.g-held { display: flex; align-items: center; gap: 11px; background: var(--bg-elevated); border: 1px solid rgba(140,160,190,0.2); border-radius: 14px; padding: 9px 12px; margin-top: auto; }
.g-held img { width: 42px; height: 42px; border-radius: 8px; object-fit: cover; }
.g-heldempty { width: 42px; height: 42px; border-radius: 8px; border: 1.5px dashed rgba(140,160,190,0.4); display: flex; align-items: center; justify-content: center; opacity: 0.55; }
.g-heldtxt { display: flex; flex-direction: column; min-width: 0; }
.g-heldlbl { font-size: 10px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.08em; color: var(--accent-orange); }
.g-heldname { font-size: 13px; font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.g-heldname.dim { color: var(--text-muted); font-weight: 600; }
.g-shelfbtn { display: flex; align-items: center; gap: 5px; border: 1px solid rgba(140,160,190,0.25); background: var(--bg-surface); color: var(--text-secondary); border-radius: 10px; padding: 6px 10px; font-size: 12.5px; font-weight: 800; cursor: pointer; }

/* ── Kasimasis ── */
.g-digwrap { display: flex; flex-direction: column; gap: 12px; }
.g-pathline { display: flex; align-items: center; gap: 5px; }
.g-pathnode { display: flex; align-items: center; gap: 5px; }
.g-pathnode img { width: 30px; height: 30px; border-radius: 7px; object-fit: cover; border: 1px solid rgba(140,160,190,0.3); }
.g-patharrow { color: var(--text-muted); font-size: 12px; }
.g-pathstep { margin-left: auto; font-size: 12.5px; font-weight: 900; color: var(--text-muted); }
.g-digq { font-size: 21px; font-weight: 900; letter-spacing: -0.02em; margin: 2px 0 0; }
.g-digfrom { font-size: 13px; color: var(--text-secondary); margin: -6px 0 2px; }
.g-doors { display: flex; flex-direction: column; gap: 10px; }
.g-door { background: var(--bg-surface); border: 1.5px solid; border-radius: 16px; padding: 12px; display: flex; flex-direction: column; gap: 9px; transition: opacity 0.25s; }
.g-door.dim { opacity: 0.4; }
.g-doortype { font-size: 10.5px; font-weight: 900; letter-spacing: 0.09em; }
.g-doorbody { display: flex; gap: 11px; }
.g-doorcover { position: relative; width: 86px; height: 86px; border-radius: 10px; overflow: hidden; flex-shrink: 0; background: #000; }
.g-doorcover img { width: 100%; height: 100%; object-fit: cover; }
.g-doormeta { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.g-doorartist { font-size: 16px; font-weight: 900; }
.g-dooralbum { font-size: 12px; color: var(--text-secondary); font-weight: 600; }
.g-doorwhy { font-size: 12.5px; color: var(--text-muted); line-height: 1.45; margin-top: 2px; }
.g-doorgo { border: 0; cursor: pointer; border-radius: 11px; font-weight: 900; font-size: 14px; color: #fff; padding: 11px 0; }
.g-doorgo:disabled { opacity: 0.55; }

/* ── Rezultatas ── */
.g-reswrap { display: flex; flex-direction: column; gap: 14px; }
.g-xp { align-self: center; font-size: 13px; font-weight: 900; color: var(--accent-green); background: color-mix(in srgb, var(--accent-green) 14%, transparent); border-radius: 999px; padding: 5px 14px; }
.g-respath { display: flex; flex-direction: column; gap: 0; }
.g-resnode { position: relative; display: flex; align-items: center; gap: 12px; background: var(--bg-surface); border: 1px solid rgba(140,160,190,0.2); border-radius: 14px; padding: 10px 12px; margin-bottom: 14px; cursor: pointer; }
.g-resnode.picked { border-color: var(--accent-orange); box-shadow: 0 0 0 1px var(--accent-orange); }
.g-resnode img { width: 52px; height: 52px; border-radius: 9px; object-fit: cover; flex-shrink: 0; }
.g-resmeta { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.g-resartist { font-size: 15px; font-weight: 900; }
.g-restitle { font-size: 12px; color: var(--text-secondary); font-weight: 600; }
.g-resreason { font-size: 11.5px; color: var(--text-muted); }
.g-star { margin-left: auto; color: var(--accent-orange); font-size: 20px; flex-shrink: 0; }
.g-resline { position: absolute; left: 36px; bottom: -14px; width: 2px; height: 14px; background: rgba(140,160,190,0.35); }
.g-comm { background: var(--bg-surface); border: 1px solid rgba(140,160,190,0.2); border-radius: 16px; padding: 14px 16px; display: flex; flex-direction: column; gap: 7px; }
.g-commrow { font-size: 13.5px; color: var(--text-secondary); margin: 0; }
.g-commrow b { color: var(--text-primary); }
.g-split { display: flex; align-items: center; gap: 9px; }
.g-splitlbl { font-size: 11px; font-weight: 800; color: var(--text-muted); white-space: nowrap; width: 72px; }
.g-splitbar { flex: 1; height: 9px; border-radius: 99px; overflow: hidden; display: flex; background: rgba(140,160,190,0.15); }
.g-splitbar i { display: block; height: 100%; }
.g-legend { display: flex; gap: 12px; font-size: 11px; font-weight: 700; margin: 2px 0 0; }

/* ── Žemėlapis ── */
.g-mapwrap { display: flex; flex-direction: column; gap: 12px; }
.g-mapback { align-self: flex-start; border: 0; background: transparent; color: var(--text-muted); font-size: 13.5px; font-weight: 800; cursor: pointer; padding: 4px 0; }
.g-maptotals { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
.g-maptotals div { background: var(--bg-surface); border: 1px solid rgba(140,160,190,0.2); border-radius: 12px; padding: 10px 6px; display: flex; flex-direction: column; align-items: center; gap: 2px; }
.g-maptotals b { font-size: 18px; font-weight: 900; }
.g-maptotals b i { font-style: normal; font-size: 11px; color: var(--text-muted); }
.g-maptotals span { font-size: 10px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.04em; }
.g-region { background: var(--bg-surface); border: 1px solid rgba(140,160,190,0.18); border-radius: 14px; padding: 12px 13px; }
.g-regionhead { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 8px; }
.g-regionname { font-size: 14.5px; font-weight: 900; }
.g-regionstat { font-size: 11px; font-weight: 700; color: var(--text-muted); }
.g-subs { display: flex; flex-wrap: wrap; gap: 6px; }
.g-sub { font-size: 11.5px; font-weight: 700; border-radius: 999px; padding: 4px 10px; }
.g-sub.beacon { background: color-mix(in srgb, var(--accent-orange) 15%, transparent); color: var(--accent-orange); }
.g-sub.visited { background: color-mix(in srgb, var(--accent-green) 15%, transparent); color: var(--accent-green); }
.g-sub.saved { background: color-mix(in srgb, var(--accent-orange) 24%, transparent); color: var(--accent-orange); }
.g-sub.heard { background: rgba(140,160,190,0.14); color: var(--text-secondary); }
.g-sub.fog { background: transparent; border: 1px dashed rgba(140,160,190,0.3); color: var(--text-muted); }

/* ── Lapai (sheet) ── */
.g-sheetback { position: fixed; inset: 0; z-index: 500; background: rgba(8,10,16,0.66); display: flex; align-items: flex-end; justify-content: center; }
.g-sheet { width: 100%; max-width: 520px; max-height: 82vh; overflow-y: auto; background: var(--bg-elevated); border-radius: 22px 22px 0 0; padding: 20px 18px calc(20px + env(safe-area-inset-bottom)); display: flex; flex-direction: column; gap: 12px; }
.g-swaprow { display: flex; align-items: center; gap: 8px; }
.g-swapcol { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 5px; text-align: center; }
.g-swapcol img { width: 92px; height: 92px; border-radius: 11px; object-fit: cover; }
.g-swaplbl { font-size: 10px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.07em; color: var(--text-muted); }
.g-swaplbl.new { color: var(--accent-orange); }
.g-swapname { font-size: 13.5px; font-weight: 900; }
.g-swaptitle { font-size: 11.5px; color: var(--text-secondary); }
.g-swaparw { font-size: 20px; color: var(--text-muted); flex-shrink: 0; }
.g-shelflist { display: flex; flex-direction: column; gap: 8px; }
.g-shelfitem { display: flex; align-items: center; gap: 10px; background: var(--bg-surface); border: 1px solid rgba(140,160,190,0.18); border-radius: 12px; padding: 8px 10px; }
.g-shelfitem img { width: 44px; height: 44px; border-radius: 8px; object-fit: cover; }
.g-shelfmeta { display: flex; flex-direction: column; min-width: 0; }
.g-shelfartist { font-size: 13.5px; font-weight: 800; }
.g-shelftitle { font-size: 11.5px; color: var(--text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
`
