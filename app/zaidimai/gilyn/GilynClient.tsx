'use client'

// app/zaidimai/gilyn/GilynClient.tsx — v2
//
// GILYN — kasdienis muzikos atradimo žaidimas.
//
// v2 (Edvardo feedback 2026-07-11):
//   * vienas welcome ekranas vietoj 4 (onboarding+intro sujungti)
//   * swipe flow kaip appse (kairėn=praleisti, dešinėn=pasilikti/keisti)
//   * kortelė su blur'intu viršelio fonu (maskuoja low-res viršelius)
//   * pilnas grotuvo sheet'as su albumo tracklist'u — visur
//   * „Kasti gilyn" galima nuo pirmo pasilikimo (nebūtina visų 20)
//   * vizualus korio žemėlapis + substiliaus sheet „kas atidengė"
//   * rezultato kelias perklausomas + nuorodos į atlikėjus

import { useEffect, useRef, useState, useCallback } from 'react'
import Link from 'next/link'
import ZaidimoLangas from '@/components/zaidimai/ZaidimoLangas'

// ── Tipai ────────────────────────────────────────────────────────────────

type TrackRef = { t: string; y: string }
type BoxAlbum = {
  albumId: number; artistId: number; title: string; artist: string
  artistSlug: string | null; albumSlug: string | null; year: number | null
  cover: string; ytId: string | null; previewTitle: string | null
  tracks?: TrackRef[]; country: string | null
  personal: 'liked_album' | 'liked_artist' | 'near' | 'new'
}
type Door = {
  doorType: 'sound' | 'scene' | 'bridge'; label: string
  artistId: number; artist: string; artistSlug: string | null
  albumId: number | null; title: string | null; year: number | null
  cover: string | null; ytId: string | null; tracks?: TrackRef[]; reason: string
}
type PathNode = {
  step: number; doorType: string; artistId: number; artist: string
  artistSlug: string | null; albumId: number | null; title: string | null
  cover: string | null; year: number | null; ytId: string | null
  tracks?: TrackRef[]; reason: string | null
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
type SubStyle = {
  id: number; name: string; beacons: number; visited: number; heard: number; saved: number
  artists: { n: string; k: 'saved' | 'visited' | 'beacon' }[]
}
type MapData = {
  regions: { genreId: number; name: string; substyles: SubStyle[]; beacons: number; visited: number }[]
  totals: { beacons: number; visited: number; heard: number; saved: number; substylesTouched: number; substylesTotal: number }
  likeCounts: { artists: number; albums: number; tracks: number }
}
type PlayerItem = {
  artist: string; title: string | null; year: number | null; cover: string | null
  tracks: TrackRef[]; artistSlug?: string | null
}

const DOOR_COLORS: Record<string, string> = { sound: 'var(--accent-green)', scene: 'var(--accent-blue)', bridge: '#a855f7' }
const PERSONAL_LABEL: Record<string, string | null> = {
  liked_album: '❤️ Jau mėgsti šį albumą',
  liked_artist: '❤️ Jau tavo žemėlapyje',
  near: 'Netoli tavo teritorijos',
  new: null,
}
const SWIPE_T = 84   // px slenkstis

export default function GilynClient() {
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [day, setDay] = useState('')
  const [box, setBox] = useState<BoxAlbum[]>([])
  const [run, setRun] = useState<Run | null>(null)
  const [community, setCommunity] = useState<Community>(null)
  const [likeCounts, setLikeCounts] = useState({ artists: 0, albums: 0, tracks: 0 })
  const [view, setView] = useState<'load' | 'welcome' | 'box' | 'boxEnd' | 'dig' | 'result' | 'map'>('load')
  const [player, setPlayer] = useState<PlayerItem | null>(null)
  const [playerIdx, setPlayerIdx] = useState(0)
  const [swapSheet, setSwapSheet] = useState<BoxAlbum | null>(null)
  const [digNowSheet, setDigNowSheet] = useState(false)
  const [shelfOpen, setShelfOpen] = useState(false)
  const [mapData, setMapData] = useState<MapData | null>(null)
  const [subSheet, setSubSheet] = useState<SubStyle | null>(null)
  const [busy, setBusy] = useState(false)
  const [xpGain, setXpGain] = useState<number | null>(null)

  // swipe
  const [dragX, setDragX] = useState(0)
  const [dragging, setDragging] = useState(false)
  const dragStart = useRef<{ x: number; y: number } | null>(null)

  const refresh = useCallback(async () => {
    try {
      const r = await fetch('/api/zaidimai/gilyn', { cache: 'no-store' })
      const j = await r.json()
      if (j.error) { setErr(j.error); setLoading(false); return }
      setDay(j.day); setBox(j.box); setRun(j.run); setCommunity(j.community); setLikeCounts(j.likeCounts)
      if (!j.run) setView('welcome')
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

  // Self-heal: dėžė baigta su vinilu, bet serveris dar 'box' (race) → kasimasis
  useEffect(() => {
    if (run && run.status === 'box' && run.boxPos >= 20 && run.held) {
      post('finishBox').then(j => { if (j?.run) routeView(j.run) })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run?.status, run?.boxPos])

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

  // ── Grotuvas ──
  function openPlayer(item: PlayerItem, heardPayload?: { albumId?: number; artistId?: number }) {
    if (!item.tracks?.length) return
    setPlayer(item); setPlayerIdx(0)
    if (heardPayload?.albumId || heardPayload?.artistId) post('heard', heardPayload)
  }

  // ── Dėžės veiksmai ──
  const current = run && run.status === 'box' && run.boxPos < 20 ? box[run.boxPos] : null
  const next = run && run.status === 'box' && run.boxPos + 1 < 20 ? box[run.boxPos + 1] : null

  async function actHold(a: BoxAlbum) {
    if (!run || busy) return
    if (run.held && run.held.albumId !== a.albumId) { setSwapSheet(a); return }
    setRun({ ...run, boxPos: run.boxPos + 1, held: heldOf(a) })
    const j = await post('hold', { albumId: a.albumId })
    if (j?.run) routeView(j.run)
  }
  async function confirmSwap(a: BoxAlbum) {
    if (!run) return
    setSwapSheet(null)
    setRun({ ...run, boxPos: run.boxPos + 1, held: heldOf(a), swaps: run.swaps + 1 })
    const j = await post('swap', { albumId: a.albumId })
    if (j?.run) routeView(j.run)
  }
  async function actSkip() {
    if (!run || busy) return
    const nextPos = run.boxPos + 1
    setRun({ ...run, boxPos: nextPos })
    const j = await post('advance', {})
    if (j?.run) routeView(j.run)
    else if (nextPos >= 20 && !run.held) setView('boxEnd')
  }
  function actShelf(a: BoxAlbum) {
    if (!run) return
    if (!run.shelf.some((s: any) => s.albumId === a.albumId)) {
      setRun({ ...run, shelf: [...run.shelf, { albumId: a.albumId, artist: a.artist, title: a.title, cover: a.cover, year: a.year, ytId: a.ytId, tracks: a.tracks }] })
      post('shelf', { albumId: a.albumId })
    }
  }
  async function actUndo() {
    if (!run || run.boxPos <= 0) return
    const j = await post('undo')
    if (j?.run) setView('box')
  }
  async function digNow() {
    setDigNowSheet(false); setBusy(true)
    const j = await post('finishBox')
    setBusy(false)
    if (j?.run) routeView(j.run)
  }
  async function chooseDoor(d: Door) {
    if (!run || busy) return
    setBusy(true)
    const j = await post('chooseDoor', { artistId: d.artistId })
    setBusy(false)
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
    return { albumId: a.albumId, artistId: a.artistId, title: a.title, artist: a.artist, artistSlug: a.artistSlug, year: a.year, cover: a.cover, ytId: a.ytId, tracks: a.tracks || [] }
  }

  // ── Swipe handlers ──
  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (busy || swapSheet || player) return
    dragStart.current = { x: e.clientX, y: e.clientY }
    setDragging(true)
    ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
  }
  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragStart.current) return
    setDragX(e.clientX - dragStart.current.x)
  }
  function onPointerUp() {
    if (!dragStart.current) return
    const dx = dragX
    dragStart.current = null
    setDragging(false)
    setDragX(0)
    if (!current) return
    if (dx > SWIPE_T) actHold(current)
    else if (dx < -SWIPE_T) actSkip()
  }

  const heldCta = run?.held && run.status === 'box' && run.boxPos < 20

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

      {/* ── WELCOME (vienas ekranas) ── */}
      {!loading && !err && view === 'welcome' && (
        <div className="g-center g-welcome">
          <Vinyl size={86} />
          <h1 className="g-h1">Dienos dėžė</h1>
          <p className="g-date">{day}</p>
          <p className="g-lead">20 plokštelių — ta pati dėžė visiems.<br />Laikyk vieną. Dėžės gale ji taps durimis gilyn.</p>
          {likeCounts.artists + likeCounts.albums + likeCounts.tracks > 0 && (
            <div className="g-beaconbox">
              <BeaconMini />
              <span>Tavo žemėlapis jau gyvas: <b>{likeCounts.artists}</b> atlikėjų, <b>{likeCounts.albums}</b> albumų ir <b>{likeCounts.tracks}</b> dainų pamėgimai tapo švyturiais.</span>
            </div>
          )}
          <button className="g-cta" onClick={begin} disabled={busy} type="button">{busy ? 'Ruošiama…' : 'Atidaryti dėžę'}</button>
          <p className="g-hint">~3 min · perklausa neprivaloma · nėra teisingų atsakymų</p>
        </div>
      )}

      {/* ── DĖŽĖ ── */}
      {!loading && !err && view === 'box' && run && current && (
        <div className="g-boxwrap">
          <div className="g-progress">
            <span className="g-pos">{run.boxPos + 1} <i>/ 20</i></span>
            <div className="g-bar"><i style={{ width: `${((run.boxPos) / 20) * 100}%` }} /></div>
            {run.boxPos > 0 && <button className="g-undo" onClick={actUndo} type="button" aria-label="Atšaukti">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M9 14 4 9l5-5" /><path d="M4 9h10a6 6 0 0 1 0 12h-3" /></svg>
            </button>}
          </div>

          <div className="g-stack">
            {next && (
              <div className="g-card g-peek" key={`peek-${next.albumId}`} aria-hidden="true">
                <div className="g-blur" style={{ backgroundImage: `url(${next.cover})` }} />
              </div>
            )}
            <div
              className={`g-card${dragging ? ' drag' : ''}`}
              key={current.albumId}
              style={{ transform: `translateX(${dragX}px) rotate(${dragX * 0.05}deg)` }}
              onPointerDown={onPointerDown} onPointerMove={onPointerMove}
              onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
            >
              <div className="g-blur" style={{ backgroundImage: `url(${current.cover})` }} />
              <span className="g-swipelbl no" style={{ opacity: Math.min(1, Math.max(0, -dragX / SWIPE_T)) }}>PRALEIDŽIU</span>
              <span className="g-swipelbl yes" style={{ opacity: Math.min(1, Math.max(0, dragX / SWIPE_T)) }}>{run.held ? 'KEIČIU' : 'PASILIEKU'}</span>
              {PERSONAL_LABEL[current.personal] && <span className={`g-chip ${current.personal}`}>{PERSONAL_LABEL[current.personal]}</span>}
              <div className="g-coverbox">
                <div className="g-vinylpeek" aria-hidden="true" />
                <img className="g-cover" src={current.cover} alt="" referrerPolicy="no-referrer" draggable={false} />
                {(current.tracks?.length || 0) > 0 && (
                  <button className="g-play" type="button" aria-label="Klausyti"
                    onClick={() => openPlayer({ artist: current.artist, title: current.title, year: current.year, cover: current.cover, tracks: current.tracks || [], artistSlug: current.artistSlug }, { albumId: current.albumId })}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="#fff"><polygon points="6 4 20 12 6 20 6 4" /></svg>
                  </button>
                )}
              </div>
              <div className="g-meta">
                <span className="g-artist">{current.artist}</span>
                <span className="g-title">{current.title}{current.year ? ` · ${current.year}` : ''}</span>
              </div>
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

          <div className={`g-held${run.held ? ' has' : ''}`}>
            {run.held ? (
              <>
                <img src={run.held.cover} alt="" referrerPolicy="no-referrer"
                  onClick={() => openPlayer({ artist: run.held.artist, title: run.held.title, year: run.held.year, cover: run.held.cover, tracks: run.held.tracks || [], artistSlug: run.held.artistSlug }, { albumId: run.held.albumId })} />
                <div className="g-heldtxt">
                  <span className="g-heldlbl">Tavo vinilas</span>
                  <span className="g-heldname">{run.held.artist} — {run.held.title}</span>
                </div>
                <button className="g-digbtn" onClick={() => setDigNowSheet(true)} type="button">Kasti gilyn</button>
              </>
            ) : (
              <>
                <div className="g-heldempty" aria-hidden="true"><Vinyl size={28} /></div>
                <div className="g-heldtxt">
                  <span className="g-heldlbl dim">Tavo vieta tuščia</span>
                  <span className="g-heldname dim">Brauk dešinėn arba spausk „Pasilikti"</span>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── DĖŽĖ BAIGTA BE PASIRINKIMO ── */}
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

      {/* ── KASIMASIS ── */}
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
          <h2 className="g-digq">Trys durys iš „{run.path[run.path.length - 1]?.artist}"</h2>
          <p className="g-digfrom">Pasirinkęs vienas, kitų dviejų šiandien nebepamatysi.</p>

          <div className="g-doors">
            {(run.doors || []).map(d => (
              <div className="g-door" key={d.artistId} style={{ borderColor: `color-mix(in srgb, ${DOOR_COLORS[d.doorType]} 45%, transparent)` }}>
                <span className="g-doortype" style={{ color: DOOR_COLORS[d.doorType] }}>{d.label}</span>
                <div className="g-doorbody"
                  onClick={() => openPlayer({ artist: d.artist, title: d.title, year: d.year, cover: d.cover, tracks: d.tracks || [], artistSlug: d.artistSlug }, { artistId: d.artistId })}
                  role="button" tabIndex={0}>
                  <div className="g-doorcover">
                    <img src={d.cover || ''} alt="" referrerPolicy="no-referrer" />
                    {(d.tracks?.length || 0) > 0 && <span className="g-play sm" aria-hidden="true">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="#fff"><polygon points="6 4 20 12 6 20 6 4" /></svg>
                    </span>}
                  </div>
                  <div className="g-doormeta">
                    <span className="g-doorartist">{d.artist}</span>
                    {d.title && <span className="g-dooralbum">{d.title}{d.year ? ` · ${d.year}` : ''}</span>}
                    <span className="g-doorwhy">{d.reason}</span>
                  </div>
                </div>
                <button className="g-doorgo" onClick={() => chooseDoor(d)} disabled={busy} type="button"
                  style={{ background: DOOR_COLORS[d.doorType] }}>Eiti gilyn</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── REZULTATAS ── */}
      {!loading && !err && view === 'result' && run && (
        <div className="g-reswrap">
          {xpGain !== null && <div className="g-xp">+{xpGain} XP</div>}
          <h2 className="g-h1 center">Tavo dienos kelias</h2>
          {run.path.length > 0 ? (
            <div className="g-respath">
              {run.path.map((p: any, i: number, all: any[]) => (
                <div key={i} className={`g-resnode${run.finalPick?.artistId === p.artistId ? ' picked' : ''}`}>
                  <img src={p.cover || ''} alt="" referrerPolicy="no-referrer"
                    onClick={() => openPlayer({ artist: p.artist, title: p.title, year: p.year, cover: p.cover, tracks: p.tracks || [], artistSlug: p.artistSlug }, { artistId: p.artistId })} />
                  <div className="g-resmeta"
                    onClick={() => openPlayer({ artist: p.artist, title: p.title, year: p.year, cover: p.cover, tracks: p.tracks || [], artistSlug: p.artistSlug }, { artistId: p.artistId })}>
                    <span className="g-resartist">{p.artist}</span>
                    {p.title && <span className="g-restitle">{p.title}{p.year ? ` · ${p.year}` : ''}</span>}
                    <span className="g-resreason">{p.doorType === 'portal' ? 'Tavo dienos portalas' : p.reason}</span>
                  </div>
                  <div className="g-resacts">
                    <button className={`g-starbtn${run.finalPick?.artistId === p.artistId ? ' on' : ''}`} type="button"
                      aria-label="Dienos radinys" onClick={() => post('finalPick', { index: i })}>★</button>
                    {p.artistSlug && <Link className="g-linkbtn" href={`/atlikejai/${p.artistSlug}`} aria-label="Atlikėjo puslapis">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M7 17 17 7" /><path d="M8 7h9v9" /></svg>
                    </Link>}
                  </div>
                  {i < all.length - 1 && <span className="g-resline" aria-hidden="true" />}
                </div>
              ))}
              <p className="g-hint">★ — pažymėk, kuris taškas buvo tikrasis dienos radinys. Paspaudęs kortelę — perklausysi.</p>
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
                    <i style={{ width: `${s.sound}%`, background: DOOR_COLORS.sound }} />
                    <i style={{ width: `${s.scene}%`, background: DOOR_COLORS.scene }} />
                    <i style={{ width: `${s.bridge}%`, background: DOOR_COLORS.bridge }} />
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

      {/* ── ŽEMĖLAPIS ── */}
      {!loading && view === 'map' && (
        <div className="g-mapwrap">
          <button className="g-mapback" onClick={() => run ? routeView(run) : setView('welcome')} type="button">← Grįžti</button>
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
              <div className="g-maplegend">
                <span><i className="hex beacon" /> švyturys — tavo pamėgta muzika</span>
                <span><i className="hex visited" /> aplankyta per Gilyn keliones</span>
                <span><i className="hex saved" /> ★ dienos radiniai</span>
                <span><i className="hex fog" /> rūkas — dar neatrasta</span>
              </div>
              {mapData.regions.map(r => <RegionHex key={r.genreId} region={r} onPick={s => setSubSheet(s)} />)}
              <p className="g-hint">Paspausk teritoriją — pamatysi, kokie atlikėjai ją atidengė.</p>
            </>
          )}
        </div>
      )}

      {/* ── SHEETS ── */}
      {player && (
        <PlayerSheet item={player} idx={playerIdx} setIdx={setPlayerIdx} onClose={() => setPlayer(null)} />
      )}

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

      {digNowSheet && run?.held && (
        <div className="g-sheetback" onClick={() => setDigNowSheet(false)}>
          <div className="g-sheet" onClick={e => e.stopPropagation()}>
            <h3 className="g-h3 center">Kasti gilyn su „{run.held.artist}"?</h3>
            <p className="g-dim center">Dėžėje liko dar {20 - run.boxPos} neapžiūrėtos plokštelės — jose gali slėptis geresnis radinys. Nusprendus kasti, šiandien atgal nebegrįši.</p>
            <button className="g-cta" onClick={digNow} disabled={busy} type="button">Kasti gilyn dabar</button>
            <button className="g-cta ghost" onClick={() => setDigNowSheet(false)} type="button">Dar pavartysiu</button>
          </div>
        </div>
      )}

      {shelfOpen && run && (
        <div className="g-sheetback" onClick={() => setShelfOpen(false)}>
          <div className="g-sheet" onClick={e => e.stopPropagation()}>
            <h3 className="g-h3 center">Lentyna — paklausyti vėliau</h3>
            {(!run.shelf || run.shelf.length === 0) && <p className="g-dim center">Tuščia. Vartydamas spausk lentynos ženkliuką.</p>}
            <div className="g-shelflist">
              {(run.shelf || []).map((s: any) => (
                <div className="g-shelfitem" key={s.albumId}
                  onClick={() => { setShelfOpen(false); openPlayer({ artist: s.artist, title: s.title, year: s.year, cover: s.cover, tracks: s.tracks || (s.ytId ? [{ t: s.title, y: s.ytId }] : []) }) }}
                  role="button" tabIndex={0}>
                  <img src={s.cover} alt="" referrerPolicy="no-referrer" />
                  <div className="g-shelfmeta">
                    <span className="g-shelfartist">{s.artist}</span>
                    <span className="g-shelftitle">{s.title}{s.year ? ` · ${s.year}` : ''}</span>
                  </div>
                  <span className="g-play sm inline" aria-hidden="true">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="#fff"><polygon points="6 4 20 12 6 20 6 4" /></svg>
                  </span>
                </div>
              ))}
            </div>
            <button className="g-cta ghost" onClick={() => setShelfOpen(false)} type="button">Uždaryti</button>
          </div>
        </div>
      )}

      {subSheet && (
        <div className="g-sheetback" onClick={() => setSubSheet(null)}>
          <div className="g-sheet" onClick={e => e.stopPropagation()}>
            <h3 className="g-h3 center">{subSheet.name}</h3>
            <p className="g-dim center">
              {subSheet.saved > 0 && `★ ${subSheet.saved} radiniai · `}
              {subSheet.visited > 0 && `${subSheet.visited} aplankyta per Gilyn · `}
              {subSheet.beacons > 0 ? `${subSheet.beacons} švyturiai iš tavo pamėgimų` : ''}
            </p>
            {subSheet.artists.length > 0 ? (
              <div className="g-subartists">
                {subSheet.artists.map((a, i) => (
                  <span key={i} className={`g-suba ${a.k}`}>
                    {a.k === 'saved' ? '★' : a.k === 'visited' ? '✓' : '❤️'} {a.n}
                  </span>
                ))}
              </div>
            ) : (
              <p className="g-dim center">Šią teritoriją dar dengia rūkas.</p>
            )}
            <p className="g-hint">❤️ — tavo pamėgimai (švyturiai) · ✓ — Gilyn kelionės · ★ — dienos radiniai</p>
            <button className="g-cta ghost" onClick={() => setSubSheet(null)} type="button">Uždaryti</button>
          </div>
        </div>
      )}
    </ZaidimoLangas>
  )
}

// ── Grotuvo sheet'as ─────────────────────────────────────────────────────

function PlayerSheet({ item, idx, setIdx, onClose }: {
  item: PlayerItem; idx: number; setIdx: (i: number) => void; onClose: () => void
}) {
  const tr = item.tracks[Math.min(idx, item.tracks.length - 1)]
  return (
    <div className="g-sheetback" onClick={onClose}>
      <div className="g-sheet g-playersheet" onClick={e => e.stopPropagation()}>
        <div className="g-pshead">
          <img src={item.cover || ''} alt="" referrerPolicy="no-referrer" />
          <div className="g-psmeta">
            <span className="g-psartist">{item.artist}</span>
            <span className="g-pstitle">{item.title}{item.year ? ` · ${item.year}` : ''}</span>
          </div>
          {item.artistSlug && <Link className="g-linkbtn" href={`/atlikejai/${item.artistSlug}`} aria-label="Atlikėjo puslapis">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M7 17 17 7" /><path d="M8 7h9v9" /></svg>
          </Link>}
          <button className="g-psclose" onClick={onClose} type="button" aria-label="Uždaryti">✕</button>
        </div>
        {tr && (
          <div className="g-psvideo">
            <iframe key={tr.y}
              src={`https://www.youtube.com/embed/${tr.y}?autoplay=1&rel=0&modestbranding=1&playsinline=1&iv_load_policy=3`}
              title={tr.t} allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen />
          </div>
        )}
        <div className="g-pslist">
          {item.tracks.map((t, i) => (
            <button key={t.y} className={`g-pstrack${i === idx ? ' on' : ''}`} onClick={() => setIdx(i)} type="button">
              <span className="g-psnum">{i === idx ? '▶' : i + 1}</span>
              <span className="g-psname">{t.t}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Korio žemėlapio regionas ─────────────────────────────────────────────

function RegionHex({ region, onPick }: {
  region: { genreId: number; name: string; substyles: SubStyle[] }
  onPick: (s: SubStyle) => void
}) {
  const active = region.substyles.filter(s => s.beacons || s.visited || s.saved || s.heard)
  const fogAll = region.substyles.filter(s => !(s.beacons || s.visited || s.saved || s.heard))
  const maxHex = 33
  const fogShown = Math.max(0, Math.min(fogAll.length, maxHex - active.length))
  const cells: { s: SubStyle | null; k: string }[] = [
    ...active.slice(0, maxHex).map(s => ({ s, k: s.saved ? 'saved' : s.visited ? 'visited' : s.beacons ? 'beacon' : 'heard' })),
    ...fogAll.slice(0, fogShown).map(s => ({ s, k: 'fog' })),
  ]
  const fogRest = fogAll.length - fogShown

  // Korio geometrija (pointy-top hex)
  const R = 21, W = R * 1.732, H = R * 2
  const cols = 10
  const rows = Math.ceil(cells.length / cols)
  const svgW = cols * W + W / 2 + 4
  const svgH = rows * H * 0.75 + H * 0.25 + 4

  function hexPoints(cx: number, cy: number): string {
    const pts: string[] = []
    for (let a = 0; a < 6; a++) {
      const ang = (Math.PI / 180) * (60 * a - 30)
      pts.push(`${(cx + R * 0.94 * Math.cos(ang)).toFixed(1)},${(cy + R * 0.94 * Math.sin(ang)).toFixed(1)}`)
    }
    return pts.join(' ')
  }

  return (
    <div className="g-region">
      <div className="g-regionhead">
        <span className="g-regionname">{region.name}</span>
        <span className="g-regionstat">{active.length ? `${active.length} atrasta` : 'rūkas'}{fogRest > 0 ? ` · +${fogRest} rūke` : ''}</span>
      </div>
      {cells.length > 0 && (
        <svg className="g-hexsvg" viewBox={`0 0 ${svgW} ${svgH}`} style={{ width: '100%', height: 'auto' }}>
          {cells.map((c, i) => {
            const row = Math.floor(i / cols), col = i % cols
            const cx = col * W + (row % 2 ? W : W / 2) + 2
            const cy = row * H * 0.75 + R + 2
            return (
              <g key={i} className={`g-hexc ${c.k}`} onClick={() => c.s && onPick(c.s)} role="button">
                <polygon points={hexPoints(cx, cy)} />
                {c.k === 'saved' && <text x={cx} y={cy + 4.5} textAnchor="middle" className="g-hexstar">★</text>}
              </g>
            )
          })}
        </svg>
      )}
      {active.length > 0 && (
        <div className="g-regionnames">
          {active.slice(0, 4).map(s => <span key={s.id} onClick={() => onPick(s)} role="button">{s.name}</span>)}
          {active.length > 4 && <span className="more">+{active.length - 4}</span>}
        </div>
      )}
    </div>
  )
}

// ── Ikonos ───────────────────────────────────────────────────────────────

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
function BeaconMini() {
  return (
    <svg width="34" height="34" viewBox="0 0 100 100" aria-hidden="true" style={{ flexShrink: 0 }}>
      <circle cx="30" cy="60" r="8" fill="var(--accent-orange)" />
      <circle cx="30" cy="60" r="16" fill="none" stroke="var(--accent-orange)" strokeOpacity="0.35" strokeWidth="3" />
      <circle cx="72" cy="34" r="8" fill="var(--accent-orange)" />
      <circle cx="72" cy="34" r="16" fill="none" stroke="var(--accent-orange)" strokeOpacity="0.35" strokeWidth="3" />
    </svg>
  )
}

// ── Stiliai ──────────────────────────────────────────────────────────────

const css = `
.g-center { display: flex; flex-direction: column; align-items: center; text-align: center; gap: 14px; padding: 22px 8px; }
.g-h1 { font-size: 24px; font-weight: 900; letter-spacing: -0.02em; margin: 0; }
.g-h1.center { text-align: center; }
.g-h3 { font-size: 16px; font-weight: 900; margin: 0 0 6px; }
.g-h3.center { text-align: center; }
.g-date { font-size: 12px; font-weight: 800; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.08em; margin: -6px 0 0; }
.g-lead { font-size: 15px; color: var(--text-secondary); line-height: 1.55; margin: 0; max-width: 360px; }
.g-lead.center { text-align: center; margin: 0 auto; }
.g-dim { font-size: 13.5px; color: var(--text-muted); }
.g-dim.center { text-align: center; margin: 0; }
.g-hint { font-size: 12px; color: var(--text-muted); text-align: center; margin: 10px 0 0; }
.g-cta { display: block; width: 100%; max-width: 340px; margin: 4px auto 0; border: 0; cursor: pointer; font-size: 16px; font-weight: 900; color: #fff; background: var(--accent-orange); border-radius: 13px; padding: 14px; }
.g-cta.alt { background: var(--bg-elevated); color: var(--text-primary); border: 1px solid rgba(140,160,190,0.3); }
.g-cta.ghost { background: transparent; color: var(--text-muted); border: 0; font-weight: 700; font-size: 14px; padding: 10px; }
.g-cta:disabled { opacity: 0.6; }
.g-spin { animation: gspin 2.4s linear infinite; }
@keyframes gspin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .g-spin { animation: none; } }
.g-beaconbox { display: flex; align-items: center; gap: 12px; text-align: left; max-width: 360px; font-size: 13px; color: var(--text-secondary); line-height: 1.5; background: color-mix(in srgb, var(--accent-orange) 8%, var(--bg-surface)); border: 1px solid color-mix(in srgb, var(--accent-orange) 30%, transparent); border-radius: 14px; padding: 12px 14px; }
.g-beaconbox b { color: var(--text-primary); }

/* ── Dėžė ── */
.g-boxwrap { display: flex; flex-direction: column; gap: 12px; min-height: 100%; }
.g-progress { display: flex; align-items: center; gap: 10px; }
.g-pos { font-size: 15px; font-weight: 900; white-space: nowrap; }
.g-pos i { font-style: normal; color: var(--text-muted); font-weight: 700; font-size: 12px; }
.g-bar { flex: 1; height: 5px; border-radius: 99px; background: rgba(140,160,190,0.18); overflow: hidden; }
.g-bar i { display: block; height: 100%; background: var(--accent-orange); border-radius: 99px; transition: width 0.3s ease; }
.g-undo { width: 32px; height: 32px; border-radius: 10px; border: 1px solid rgba(140,160,190,0.25); background: var(--bg-surface); color: var(--text-secondary); display: flex; align-items: center; justify-content: center; cursor: pointer; flex-shrink: 0; }

.g-stack { position: relative; }
.g-card { position: relative; overflow: hidden; background: var(--bg-surface); border: 1px solid rgba(140,160,190,0.2); border-radius: 20px; padding: 42px 14px 14px; display: flex; flex-direction: column; gap: 10px; touch-action: pan-y; user-select: none; cursor: grab; transition: transform 0.25s ease; }
.g-card.drag { transition: none; cursor: grabbing; }
.g-card.g-peek { position: absolute; inset: 0; transform: scale(0.95) translateY(10px); opacity: 0.6; pointer-events: none; }
.g-blur { position: absolute; inset: -30px; background-size: cover; background-position: center; filter: blur(34px) saturate(1.15); opacity: 0.35; pointer-events: none; }
.g-swipelbl { position: absolute; top: 14px; z-index: 3; font-size: 13px; font-weight: 900; letter-spacing: 0.08em; border-radius: 9px; padding: 5px 11px; pointer-events: none; }
.g-swipelbl.no { right: 14px; color: #fff; background: rgba(200,60,60,0.9); }
.g-swipelbl.yes { left: 14px; color: #fff; background: var(--accent-green); }
.g-chip { position: relative; z-index: 2; align-self: flex-start; font-size: 11.5px; font-weight: 800; border-radius: 999px; padding: 4px 11px; margin-top: -30px; background: color-mix(in srgb, var(--accent-orange) 18%, var(--bg-surface)); color: var(--accent-orange); }
.g-chip.near { background: color-mix(in srgb, var(--accent-blue) 18%, var(--bg-surface)); color: var(--accent-link, #7aa7ff); }
.g-coverbox { position: relative; z-index: 1; width: min(74%, 300px); aspect-ratio: 1; margin: 4px auto 0; }
.g-vinylpeek { position: absolute; top: 4%; right: -13%; width: 96%; height: 92%; border-radius: 50%; background: radial-gradient(circle at center, #0a0a0a 28%, #161616 29%, #0d0d0d 46%, #191919 47%, #0e0e0e 70%, #1a1a1a 71%, #101010 100%); box-shadow: -6px 0 18px rgba(0,0,0,0.5); }
.g-cover { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; border-radius: 6px; box-shadow: 0 10px 34px rgba(0,0,0,0.45); }
.g-play { position: absolute; right: -8px; bottom: -8px; width: 52px; height: 52px; border-radius: 50%; border: 3px solid var(--bg-surface); cursor: pointer; background: var(--accent-orange); display: flex; align-items: center; justify-content: center; padding-left: 3px; box-shadow: 0 8px 24px rgba(0,0,0,0.4); }
.g-play.sm { position: absolute; right: 5px; bottom: 5px; width: 30px; height: 30px; border-width: 0; padding-left: 2px; }
.g-play.sm.inline { position: static; flex-shrink: 0; display: flex; }
.g-meta { position: relative; z-index: 1; display: flex; flex-direction: column; gap: 2px; text-align: center; padding-top: 6px; }
.g-artist { font-size: 20px; font-weight: 900; letter-spacing: -0.01em; }
.g-title { font-size: 13.5px; color: var(--text-secondary); font-weight: 600; }

.g-actions { display: flex; gap: 9px; }
.g-act { border: 0; cursor: pointer; border-radius: 13px; font-weight: 900; font-size: 15px; padding: 13px 0; }
.g-act.ghost { flex: 1; background: var(--bg-elevated); color: var(--text-secondary); border: 1px solid rgba(140,160,190,0.22); }
.g-act.main { flex: 1.6; background: var(--accent-orange); color: #fff; }
.g-act.shelf { width: 50px; display: flex; align-items: center; justify-content: center; background: var(--bg-elevated); color: var(--text-muted); border: 1px solid rgba(140,160,190,0.22); }
.g-act.shelf.on { color: var(--accent-orange); border-color: var(--accent-orange); }

.g-held { display: flex; align-items: center; gap: 11px; background: var(--bg-elevated); border: 1px solid rgba(140,160,190,0.2); border-radius: 14px; padding: 9px 12px; margin-top: auto; }
.g-held.has { border-color: color-mix(in srgb, var(--accent-orange) 45%, transparent); background: color-mix(in srgb, var(--accent-orange) 7%, var(--bg-elevated)); }
.g-held img { width: 44px; height: 44px; border-radius: 8px; object-fit: cover; cursor: pointer; }
.g-heldempty { width: 44px; height: 44px; border-radius: 8px; border: 1.5px dashed rgba(140,160,190,0.4); display: flex; align-items: center; justify-content: center; opacity: 0.55; }
.g-heldtxt { display: flex; flex-direction: column; min-width: 0; flex: 1; }
.g-heldlbl { font-size: 10px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.08em; color: var(--accent-orange); }
.g-heldlbl.dim { color: var(--text-muted); }
.g-heldname { font-size: 13px; font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.g-heldname.dim { color: var(--text-muted); font-weight: 600; }
.g-digbtn { flex-shrink: 0; border: 0; cursor: pointer; border-radius: 11px; font-weight: 900; font-size: 13px; color: #fff; background: var(--accent-orange); padding: 10px 14px; }
.g-shelfbtn { display: flex; align-items: center; gap: 5px; border: 1px solid rgba(140,160,190,0.25); background: var(--bg-surface); color: var(--text-secondary); border-radius: 10px; padding: 6px 10px; font-size: 12.5px; font-weight: 800; cursor: pointer; }

/* ── Kasimasis ── */
.g-digwrap { display: flex; flex-direction: column; gap: 12px; }
.g-pathline { display: flex; align-items: center; gap: 5px; }
.g-pathnode { display: flex; align-items: center; gap: 5px; }
.g-pathnode img { width: 30px; height: 30px; border-radius: 7px; object-fit: cover; border: 1px solid rgba(140,160,190,0.3); }
.g-patharrow { color: var(--text-muted); font-size: 12px; }
.g-pathstep { margin-left: auto; font-size: 12.5px; font-weight: 900; color: var(--text-muted); }
.g-digq { font-size: 20px; font-weight: 900; letter-spacing: -0.02em; margin: 2px 0 0; }
.g-digfrom { font-size: 12.5px; color: var(--text-muted); margin: -6px 0 2px; }
.g-doors { display: flex; flex-direction: column; gap: 10px; }
.g-door { background: var(--bg-surface); border: 1.5px solid; border-radius: 16px; padding: 12px; display: flex; flex-direction: column; gap: 9px; }
.g-doortype { font-size: 10.5px; font-weight: 900; letter-spacing: 0.09em; }
.g-doorbody { display: flex; gap: 12px; cursor: pointer; }
.g-doorcover { position: relative; width: 104px; height: 104px; border-radius: 10px; overflow: hidden; flex-shrink: 0; background: #000; }
.g-doorcover img { width: 100%; height: 100%; object-fit: cover; }
.g-doormeta { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.g-doorartist { font-size: 16.5px; font-weight: 900; }
.g-dooralbum { font-size: 12px; color: var(--text-secondary); font-weight: 600; }
.g-doorwhy { font-size: 12.5px; color: var(--text-muted); line-height: 1.45; margin-top: 2px; }
.g-doorgo { border: 0; cursor: pointer; border-radius: 11px; font-weight: 900; font-size: 14px; color: #fff; padding: 11px 0; }
.g-doorgo:disabled { opacity: 0.55; }

/* ── Rezultatas ── */
.g-reswrap { display: flex; flex-direction: column; gap: 14px; }
.g-xp { align-self: center; font-size: 13px; font-weight: 900; color: var(--accent-green); background: color-mix(in srgb, var(--accent-green) 14%, transparent); border-radius: 999px; padding: 5px 14px; }
.g-respath { display: flex; flex-direction: column; }
.g-resnode { position: relative; display: flex; align-items: center; gap: 12px; background: var(--bg-surface); border: 1px solid rgba(140,160,190,0.2); border-radius: 14px; padding: 10px 12px; margin-bottom: 14px; }
.g-resnode.picked { border-color: var(--accent-orange); box-shadow: 0 0 0 1px var(--accent-orange); }
.g-resnode img { width: 54px; height: 54px; border-radius: 9px; object-fit: cover; flex-shrink: 0; cursor: pointer; }
.g-resmeta { display: flex; flex-direction: column; gap: 1px; min-width: 0; flex: 1; cursor: pointer; }
.g-resartist { font-size: 15px; font-weight: 900; }
.g-restitle { font-size: 12px; color: var(--text-secondary); font-weight: 600; }
.g-resreason { font-size: 11.5px; color: var(--text-muted); }
.g-resacts { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
.g-starbtn { width: 34px; height: 34px; border-radius: 10px; border: 1px solid rgba(140,160,190,0.3); background: transparent; color: var(--text-muted); font-size: 17px; cursor: pointer; }
.g-starbtn.on { color: #fff; background: var(--accent-orange); border-color: var(--accent-orange); }
.g-linkbtn { width: 34px; height: 34px; border-radius: 10px; border: 1px solid rgba(140,160,190,0.3); color: var(--text-secondary); display: flex; align-items: center; justify-content: center; text-decoration: none; }
.g-resline { position: absolute; left: 37px; bottom: -14px; width: 2px; height: 14px; background: rgba(140,160,190,0.35); }
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
.g-maplegend { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 10px; font-size: 11.5px; color: var(--text-secondary); }
.g-maplegend span { display: flex; align-items: center; gap: 7px; }
.g-maplegend .hex { width: 13px; height: 13px; flex-shrink: 0; clip-path: polygon(50% 0, 100% 25%, 100% 75%, 50% 100%, 0 75%, 0 25%); display: inline-block; }
.g-maplegend .hex.beacon { background: color-mix(in srgb, var(--accent-orange) 55%, var(--bg-surface)); }
.g-maplegend .hex.visited { background: var(--accent-green); }
.g-maplegend .hex.saved { background: var(--accent-orange); }
.g-maplegend .hex.fog { background: rgba(140,160,190,0.18); }
.g-region { background: var(--bg-surface); border: 1px solid rgba(140,160,190,0.18); border-radius: 14px; padding: 12px 13px; }
.g-regionhead { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 8px; }
.g-regionname { font-size: 14.5px; font-weight: 900; }
.g-regionstat { font-size: 11px; font-weight: 700; color: var(--text-muted); }
.g-hexsvg { display: block; }
.g-hexc { cursor: pointer; }
.g-hexc polygon { stroke-width: 1; }
.g-hexc.beacon polygon { fill: color-mix(in srgb, var(--accent-orange) 42%, var(--bg-surface)); stroke: var(--accent-orange); }
.g-hexc.visited polygon { fill: color-mix(in srgb, var(--accent-green) 55%, var(--bg-surface)); stroke: var(--accent-green); }
.g-hexc.saved polygon { fill: var(--accent-orange); stroke: var(--accent-orange); }
.g-hexc.heard polygon { fill: rgba(140,160,190,0.22); stroke: rgba(140,160,190,0.5); }
.g-hexc.fog polygon { fill: rgba(140,160,190,0.1); stroke: rgba(140,160,190,0.16); }
.g-hexstar { fill: #fff; font-size: 13px; font-weight: 900; pointer-events: none; }
.g-regionnames { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
.g-regionnames span { font-size: 11px; font-weight: 700; color: var(--text-secondary); background: rgba(140,160,190,0.12); border-radius: 999px; padding: 3px 9px; cursor: pointer; }
.g-regionnames span.more { color: var(--text-muted); background: transparent; border: 1px dashed rgba(140,160,190,0.3); }
.g-subartists { display: flex; flex-wrap: wrap; gap: 7px; justify-content: center; }
.g-suba { font-size: 12.5px; font-weight: 700; border-radius: 999px; padding: 5px 12px; background: rgba(140,160,190,0.12); color: var(--text-secondary); }
.g-suba.saved { background: color-mix(in srgb, var(--accent-orange) 20%, transparent); color: var(--accent-orange); }
.g-suba.visited { background: color-mix(in srgb, var(--accent-green) 16%, transparent); color: var(--accent-green); }

/* ── Sheets ── */
.g-sheetback { position: fixed; inset: 0; z-index: 500; background: rgba(8,10,16,0.66); display: flex; align-items: flex-end; justify-content: center; }
.g-sheet { width: 100%; max-width: 520px; max-height: 86vh; overflow-y: auto; background: var(--bg-elevated); border-radius: 22px 22px 0 0; padding: 18px 18px calc(20px + env(safe-area-inset-bottom)); display: flex; flex-direction: column; gap: 12px; }
.g-playersheet { padding-top: 14px; }
.g-pshead { display: flex; align-items: center; gap: 11px; }
.g-pshead img { width: 46px; height: 46px; border-radius: 9px; object-fit: cover; }
.g-psmeta { display: flex; flex-direction: column; min-width: 0; flex: 1; }
.g-psartist { font-size: 15px; font-weight: 900; }
.g-pstitle { font-size: 12px; color: var(--text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.g-psclose { width: 34px; height: 34px; border-radius: 10px; border: 1px solid rgba(140,160,190,0.3); background: transparent; color: var(--text-secondary); font-size: 15px; cursor: pointer; flex-shrink: 0; }
.g-psvideo { position: relative; aspect-ratio: 16/9; border-radius: 12px; overflow: hidden; background: #000; }
.g-psvideo iframe { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; }
.g-pslist { display: flex; flex-direction: column; gap: 4px; }
.g-pstrack { display: flex; align-items: center; gap: 10px; border: 0; background: transparent; color: var(--text-secondary); font-size: 13.5px; font-weight: 600; text-align: left; padding: 9px 10px; border-radius: 10px; cursor: pointer; }
.g-pstrack.on { background: color-mix(in srgb, var(--accent-orange) 12%, transparent); color: var(--text-primary); font-weight: 800; }
.g-psnum { width: 20px; flex-shrink: 0; font-size: 11.5px; font-weight: 800; color: var(--text-muted); text-align: center; }
.g-pstrack.on .g-psnum { color: var(--accent-orange); }
.g-psname { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.g-swaprow { display: flex; align-items: center; gap: 8px; }
.g-swapcol { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 5px; text-align: center; }
.g-swapcol img { width: 92px; height: 92px; border-radius: 11px; object-fit: cover; }
.g-swaplbl { font-size: 10px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.07em; color: var(--text-muted); }
.g-swaplbl.new { color: var(--accent-orange); }
.g-swapname { font-size: 13.5px; font-weight: 900; }
.g-swaptitle { font-size: 11.5px; color: var(--text-secondary); }
.g-swaparw { font-size: 20px; color: var(--text-muted); flex-shrink: 0; }
.g-shelflist { display: flex; flex-direction: column; gap: 8px; }
.g-shelfitem { display: flex; align-items: center; gap: 10px; background: var(--bg-surface); border: 1px solid rgba(140,160,190,0.18); border-radius: 12px; padding: 8px 10px; cursor: pointer; }
.g-shelfitem img { width: 44px; height: 44px; border-radius: 8px; object-fit: cover; }
.g-shelfmeta { display: flex; flex-direction: column; min-width: 0; flex: 1; }
.g-shelfartist { font-size: 13.5px; font-weight: 800; }
.g-shelftitle { font-size: 11.5px; color: var(--text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
`
