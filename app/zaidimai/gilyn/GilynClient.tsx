'use client'

// app/zaidimai/gilyn/GilynClient.tsx — v3
//
// GILYN — kasdienis muzikos atradimo žaidimas.
//
// v3 (Edvardo feedback round 2):
//   * swipe = VARTYMAS pirmyn/atgal (kaip tikroje plokštelių dėžėje), o ne pasirinkimas
//   * pasirinkimas — tik aiškus mygtukas; „Praleisti" nebėra
//   * crate jausmas: šonuose matosi gretimų plokštelių kraštai
//   * progresas = realiai peržiūrėtos plokštelės (max seen), ne pozicija
//   * ikonos vietoj lietuviškų CTA tekstų (bookmark, gilyn = ⌄⌄, grotuvas)
//   * loading etapai („Analizuojamas pasirinkimas…") kol serveris ruošia duris
//   * kasimosi ekranas: viršuje — pasirinkto atlikėjo pristatymas (bio + perklausa),
//     žemiau — tolesni keliai
//   * rezultatas: radinio išsaugojimas (bookmark → lentyna + žemėlapio ★), paprasta bendruomenė
//   * žemėlapis: ikonų statistika, proporcingi regionai (visi substiliai), aiškūs paaiškinimai

import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import Link from 'next/link'
import ZaidimoLangas from '@/components/zaidimai/ZaidimoLangas'

// ── Tipai ────────────────────────────────────────────────────────────────

type TrackRef = { t: string; y: string }
type BoxAlbum = {
  albumId: number; artistId: number; title: string; artist: string
  artistSlug: string | null; albumSlug: string | null; year: number | null
  cover: string; ytId: string | null; previewTitle: string | null
  tracks?: TrackRef[]; country: string | null
  styles?: string[]; blurb?: string | null
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
type NodeInfo = { albumDesc: string | null; bio: string | null; country: string | null; years: string | null; artistTop: TrackRef[] } | null
type Community = {
  finished: number; heldSameFinal: number; avgSwaps: number
  doorSplit: { sound: number; scene: number; bridge: number }[]
  sameFinalRegion: number
} | null
type SubStyle = {
  id: number; name: string; beacons: number; visited: number; heard: number; saved: number
  artists: { id: number; n: string; k: 'saved' | 'visited' | 'beacon' }[]
}
type MapData = {
  regions: { genreId: number; name: string; substyles: SubStyle[]; beacons: number; visited: number }[]
  totals: { beacons: number; visited: number; heard: number; saved: number; substylesTouched: number; substylesTotal: number }
  likeCounts: { artists: number; albums: number; tracks: number }
  edges?: { a: number; b: number; t: string }[]
}
type FreeNode = {
  artistId: number; artist: string; artistSlug: string | null
  cover: string | null; title: string | null; year: number | null
  tracks?: TrackRef[]; reason: string | null
}
type PlayerItem = {
  artist: string; title: string | null; year: number | null; cover: string | null
  tracks: TrackRef[]; artistSlug?: string | null
}

const DOOR_COLORS: Record<string, string> = { sound: 'var(--accent-green)', scene: 'var(--accent-blue)', bridge: '#a855f7' }
const DOOR_NAMES: Record<string, string> = { sound: 'artimas skambesys', scene: 'ta pati scena', bridge: 'netikėtas tiltas' }
const PERSONAL_LABEL: Record<string, string | null> = {
  liked_album: '❤️ Jau mėgsti šį albumą',
  liked_artist: '❤️ Jau tavo žemėlapyje',
  near: 'Netoli tavo teritorijos',
  new: null,
}
const SWIPE_T = 70
const LOAD_STAGES = [
  'Ruošiame kitą žingsnį…',
  'Ieškome panašaus skambesio…',
  'Žvalgomės po tą pačią sceną…',
  'Tikriname, ką mėgsta gerbėjai…',
]

export default function GilynClient() {
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [day, setDay] = useState('')
  const [box, setBox] = useState<BoxAlbum[]>([])
  const [run, setRun] = useState<Run | null>(null)
  const [nodeInfo, setNodeInfo] = useState<NodeInfo>(null)
  const [community, setCommunity] = useState<Community>(null)
  const [likeCounts, setLikeCounts] = useState({ artists: 0, albums: 0, tracks: 0 })
  const [view, setView] = useState<'load' | 'welcome' | 'box' | 'boxEnd' | 'dig' | 'result' | 'map' | 'free'>('load')
  const [freePath, setFreePath] = useState<FreeNode[]>([])
  const [freeDoors, setFreeDoors] = useState<Door[]>([])
  const [freeInfo, setFreeInfo] = useState<NodeInfo>(null)
  const [player, setPlayer] = useState<PlayerItem | null>(null)
  const [playerIdx, setPlayerIdx] = useState(0)
  const [swapSheet, setSwapSheet] = useState<BoxAlbum | null>(null)
  const [shelfOpen, setShelfOpen] = useState(false)
  const [mapData, setMapData] = useState<MapData | null>(null)
  const [subSheet, setSubSheet] = useState<SubStyle | null>(null)
  const [busy, setBusy] = useState(false)
  const [beaconBanner, setBeaconBanner] = useState(false)
  useEffect(() => {
    try { if (!window.localStorage.getItem('gilyn_bcn')) setBeaconBanner(true) } catch {}
  }, [])
  function dismissBeacons() {
    setBeaconBanner(false)
    try { window.localStorage.setItem('gilyn_bcn', '1') } catch {}
  }
  const [staging, setStaging] = useState(false)     // loading overlay su etapais
  const [stageIdx, setStageIdx] = useState(0)
  const [xpGain, setXpGain] = useState<number | null>(null)
  const [savedIdx, setSavedIdx] = useState<Set<number>>(new Set())

  // Vartymas
  const [idx, setIdx] = useState(0)                 // 0..19, 20 = dėžės galas
  const maxSeen = useRef(0)
  const [dragX, setDragX] = useState(0)
  const [dragging, setDragging] = useState(false)
  const dragStart = useRef<{ x: number; y: number } | null>(null)

  const refresh = useCallback(async () => {
    try {
      const r = await fetch('/api/zaidimai/gilyn', { cache: 'no-store' })
      const j = await r.json()
      if (j.error) { setErr(j.error); setLoading(false); return }
      setDay(j.day); setBox(j.box); setCommunity(j.community); setLikeCounts(j.likeCounts)
      if (j.nodeInfo !== undefined) setNodeInfo(j.nodeInfo)
      let theRun = j.run
      if (!theRun) {
        // be tarpinio ekrano — run'as startuoja iškart
        const s = await fetch('/api/zaidimai/gilyn', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'start' }),
        }).then(x => x.json()).catch(() => null)
        theRun = s?.run || null
        if (theRun) {
          maxSeen.current = 1
          fetch('/api/zaidimai/gilyn', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'seen', seen: 1 }),
          }).catch(() => {})
        }
      }
      setRun(theRun)
      if (theRun?.status === 'box') {
        const seen = Math.max(1, Math.min(20, theRun.boxPos || 1))
        maxSeen.current = Math.max(maxSeen.current, seen)
        setIdx(Math.min(seen - 1, 19))
      }
      if (theRun) routeView(theRun)
      else setErr('Nepavyko pradėti. Pabandyk dar kartą.')
      setLoading(false)
    } catch {
      setErr('Nepavyko užkrauti. Patikrink ryšį.'); setLoading(false)
    }
  }, [])
  useEffect(() => { refresh() }, [refresh])

  function routeView(r: Run) {
    if (r.status === 'box') setView('box')
    else if (r.status === 'dig') setView('dig')
    else setView('result')
  }

  // Loading etapų rotacija
  useEffect(() => {
    if (!staging) return
    setStageIdx(0)
    const t = setInterval(() => setStageIdx(i => (i + 1) % LOAD_STAGES.length), 1300)
    return () => clearInterval(t)
  }, [staging])

  async function post(action: string, extra: Record<string, any> = {}): Promise<any> {
    try {
      const r = await fetch('/api/zaidimai/gilyn', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...extra }),
      })
      const j = await r.json()
      if (j.error) { await refresh(); return null }
      if (j.run) setRun(j.run)
      if (j.nodeInfo !== undefined) setNodeInfo(j.nodeInfo)
      if (j.community !== undefined) setCommunity(j.community)
      if (typeof j.xp === 'number') setXpGain(j.xp)
      return j
    } catch { await refresh(); return null }
  }

  // ── Grotuvas ──
  function openPlayer(item: PlayerItem, heardPayload?: { albumId?: number; artistId?: number }, startIdx = 0) {
    if (!item.tracks?.length) return
    setPlayer(item); setPlayerIdx(Math.min(startIdx, item.tracks.length - 1))
    if (heardPayload?.albumId || heardPayload?.artistId) post('heard', heardPayload)
  }

  // ── Vartymas ──
  function goTo(n: number) {
    const clamped = Math.max(0, Math.min(20, n))
    setIdx(clamped)
    const seen = Math.min(20, clamped + 1)
    if (seen > maxSeen.current) {
      maxSeen.current = seen
      post('seen', { seen })
    }
  }
  const current = run?.status === 'box' && idx < 20 ? box[idx] : null
  const prevAlb = idx > 0 ? box[idx - 1] : null
  const nextAlb = idx < 19 ? box[idx + 1] : null
  const viewedCount = Math.min(20, Math.max(maxSeen.current, idx + 1))

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
    if (dx < -SWIPE_T) goTo(idx + 1)        // braukiam kairėn → kita plokštelė
    else if (dx > SWIPE_T && idx > 0) goTo(idx - 1)
  }

  // ── Veiksmai ──
  async function actHold(a: BoxAlbum) {
    if (!run || busy) return
    if (run.held && run.held.albumId !== a.albumId) { setSwapSheet(a); return }
    if (run.held?.albumId === a.albumId) return
    setRun({ ...run, held: heldOf(a) })
    post('hold', { albumId: a.albumId })
  }
  async function confirmSwap(a: BoxAlbum) {
    if (!run) return
    setSwapSheet(null)
    setRun({ ...run, held: heldOf(a), swaps: run.swaps + 1 })
    post('swap', { albumId: a.albumId })
  }
  function actShelf(a: BoxAlbum) {
    if (!run) return
    if (!run.shelf.some((s: any) => s.albumId === a.albumId)) {
      setRun({ ...run, shelf: [...run.shelf, { albumId: a.albumId, artist: a.artist, title: a.title, cover: a.cover, year: a.year, ytId: a.ytId, tracks: a.tracks }] })
      post('shelf', { albumId: a.albumId })
    }
  }
  async function digNow() {
    if (busy) return
    setBusy(true); setStaging(true)
    const j = await post('finishBox')
    setBusy(false); setStaging(false)
    if (j?.run) routeView(j.run)
  }
  async function chooseDoor(d: Door) {
    if (!run || busy) return
    setBusy(true); setStaging(true)
    const j = await post('chooseDoor', { artistId: d.artistId })
    setBusy(false); setStaging(false)
    if (j?.run) routeView(j.run)
  }
  async function saveFind(i: number) {
    setSavedIdx(prev => new Set(prev).add(i))
    await post('saveFind', { index: i })
  }
  // ── Free Dig ──
  async function startFreeDig(artistId: number, seed?: Partial<FreeNode>) {
    setSubSheet(null); setStaging(true); setView('free')
    const j = await post('freeDoors', { artistId, exclude: [] })
    setStaging(false)
    if (!j) { setView('map'); return }
    setFreeDoors(j.doors || [])
    setFreeInfo(j.nodeInfo || null)
    const cur = j.current || {}
    setFreePath([{
      artistId, artist: cur.artist || seed?.artist || '…', artistSlug: cur.artistSlug || seed?.artistSlug || null,
      cover: seed?.cover || cur.cover || null, title: seed?.title || null, year: seed?.year || null,
      tracks: seed?.tracks || [], reason: null,
    }])
  }
  async function freeChoose(d: Door) {
    if (busy) return
    setBusy(true); setStaging(true)
    const exclude = [...freePath.map(p => p.artistId), ...freeDoors.map(x => x.artistId)]
    const j = await post('freeDoors', { artistId: d.artistId, exclude })
    setBusy(false); setStaging(false)
    if (!j) return
    setFreePath(p => [...p, {
      artistId: d.artistId, artist: d.artist, artistSlug: d.artistSlug,
      cover: d.cover, title: d.title, year: d.year, tracks: d.tracks || [], reason: d.reason,
    }])
    setFreeDoors(j.doors || [])
    setFreeInfo(j.nodeInfo || null)
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

  const curNode = run?.path?.length ? run.path[run.path.length - 1] : null
  const isHeldCurrent = current && run?.held?.albumId === current.albumId

  return (
    <ZaidimoLangas title="Gilyn" backHref="/zaidimai" maxWidth={view === 'dig' || view === 'free' || view === 'map' ? 980 : 520}
      right={
        <>
          {run && run.status !== 'done' && run.shelf?.length > 0 && (
            <button className="g-shelfbtn" onClick={() => setShelfOpen(true)} type="button" aria-label="Lentyna">
              <BookmarkIcon filled={false} size={15} /> {run.shelf.length}
            </button>
          )}
          {view !== 'map' && !loading && (
            <button className="g-shelfbtn" onClick={openMap} type="button" aria-label="Žemėlapis">
              <HexMini />
            </button>
          )}
        </>
      }
    >
      <style>{css}</style>

      {loading && <div className="g-center g-loadfill"><CrateLoader /></div>}
      {err && !loading && <div className="g-center"><p className="g-dim">{err}</p><button className="g-cta" onClick={() => { setErr(null); setLoading(true); refresh() }} type="button">Bandyti dar kartą</button></div>}

      {/* ── DĖŽĖ (crate vartymas) ── */}
      {!loading && !err && view === 'box' && run && (
        <div className="g-boxwrap">
          {beaconBanner && likeCounts.artists + likeCounts.albums + likeCounts.tracks > 0 && (
            <div className="g-beaconbox slim">
              <BeaconMini />
              <span><b>{likeCounts.artists + likeCounts.tracks}</b> tavo pamėgimų jau šviečia žemėlapyje — kelionės sujungs teritorijas tarp jų.</span>
              <button className="g-bclose" onClick={dismissBeacons} type="button" aria-label="Uždaryti">✕</button>
            </div>
          )}
          <div className="g-progress">
            <span className="g-pos">{Math.min(idx + 1, 20)} <i>/ 20</i></span>
            <div className="g-bar"><i style={{ width: `${(Math.min(idx + 1, 20) / 20) * 100}%` }} /></div>
          </div>

          {idx < 20 && current ? (
            <div className="g-crate">
              {prevAlb && (
                <button className="g-spine left" onClick={() => goTo(idx - 1)} type="button" aria-label="Ankstesnė plokštelė"
                  style={{ backgroundImage: `url(${prevAlb.cover})` }}><span className="g-spinesh" /></button>
              )}
              {idx < 19 ? (
                <button className="g-spine right" onClick={() => goTo(idx + 1)} type="button" aria-label="Kita plokštelė"
                  style={{ backgroundImage: `url(${nextAlb?.cover || ''})` }}><span className="g-spinesh" /></button>
              ) : (
                <button className="g-spine right end" onClick={() => goTo(20)} type="button" aria-label="Dėžės galas"><span className="g-spineend">⌇</span></button>
              )}

              <button className="g-navarr left" onClick={() => goTo(idx - 1)} type="button" aria-label="Ankstesnė" disabled={idx === 0}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
              </button>
              <button className="g-navarr right" onClick={() => goTo(idx + 1)} type="button" aria-label="Kita">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
              </button>
              {dragging && dragX < -8 && nextAlb && (
                <div className="g-card g-adj" style={{ transform: `translateX(calc(100% + 14px + ${dragX * 0.55}px))` }} aria-hidden="true">
                  <div className="g-blur" style={{ backgroundImage: `url(${nextAlb.cover})` }} />
                  <div className="g-coverbox"><div className="g-vinylpeek" /><img className="g-cover" src={nextAlb.cover} alt="" referrerPolicy="no-referrer" draggable={false} /></div>
                  <div className="g-meta"><span className="g-artist">{nextAlb.artist}</span><span className="g-title">{nextAlb.title}{nextAlb.year ? ` · ${nextAlb.year}` : ''}</span></div>
                </div>
              )}
              {dragging && dragX > 8 && prevAlb && (
                <div className="g-card g-adj" style={{ transform: `translateX(calc(-100% - 14px + ${dragX * 0.55}px))` }} aria-hidden="true">
                  <div className="g-blur" style={{ backgroundImage: `url(${prevAlb.cover})` }} />
                  <div className="g-coverbox"><div className="g-vinylpeek" /><img className="g-cover" src={prevAlb.cover} alt="" referrerPolicy="no-referrer" draggable={false} /></div>
                  <div className="g-meta"><span className="g-artist">{prevAlb.artist}</span><span className="g-title">{prevAlb.title}{prevAlb.year ? ` · ${prevAlb.year}` : ''}</span></div>
                </div>
              )}
              <div
                className={`g-card${dragging ? ' drag' : ''}`}
                key={current.albumId}
                style={{ transform: `translateX(${dragX * 0.55}px)` }}
                onPointerDown={onPointerDown} onPointerMove={onPointerMove}
                onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
              >
                <div className="g-blur" style={{ backgroundImage: `url(${current.cover})` }} />
                {PERSONAL_LABEL[current.personal] && <span className={`g-chip ${current.personal}`}>{PERSONAL_LABEL[current.personal]}</span>}
                <div className="g-coverbox">
                  <div className="g-vinylpeek" aria-hidden="true" />
                  <img className="g-cover" src={current.cover} alt="" referrerPolicy="no-referrer" draggable={false} />
                  {(current.tracks?.length || 0) > 0 && (
                    <button className="g-play" type="button" aria-label="Klausyti"
                      onClick={() => openPlayer({ artist: current.artist, title: current.title, year: current.year, cover: current.cover, tracks: current.tracks || [], artistSlug: current.artistSlug }, { albumId: current.albumId })}>
                      <PlayIcon size={20} />
                    </button>
                  )}
                </div>
                <div className="g-meta">
                  <span className="g-artist">{current.artist}</span>
                  <span className="g-title">{current.title}{current.year ? ` · ${current.year}` : ''}</span>
                  {(current.styles?.length || 0) > 0 && (
                    <span className="g-styles">{(current.styles || []).map(s => <i key={s}>{s}</i>)}</span>
                  )}
                  {current.blurb && <span className="g-blurbtxt">{current.blurb}</span>}
                </div>
              </div>
            </div>
          ) : (
            <div className="g-crate g-crateend">
              <div className="g-card">
                <div className="g-endpanel">
                  <Vinyl size={62} />
                  <h3 className="g-h3 center">Peržiūrėjai visą dėžę</h3>
                  {run.held ? (
                    <>
                      <p className="g-dim center">Laikai: <b>{run.held.artist} — {run.held.title}</b></p>
                      <button className="g-cta" onClick={digNow} disabled={busy} type="button">Kasti gilyn <ArrowIcon size={17} /></button>
                    </>
                  ) : (
                    <>
                      <p className="g-dim center">Niekas neužkabino? Būna.</p>
                      <button className="g-cta" onClick={async () => { setStaging(true); const j = await post('surprise'); setStaging(false); if (j?.run) routeView(j.run) }} type="button">Nustebink mane</button>
                      <button className="g-cta ghost" onClick={async () => { const j = await post('endDay'); if (j?.run) routeView(j.run) }} type="button">Baigti šiandien</button>
                    </>
                  )}
                  <button className="g-cta ghost" onClick={() => goTo(19)} type="button">← Grįžti į dėžę</button>
                </div>
              </div>
            </div>
          )}

          {idx < 20 && current && (
            <div className="g-actions">
              <button className={`g-act shelfic${run.shelf.some((s: any) => s.albumId === current.albumId) ? ' on' : ''}`}
                onClick={() => actShelf(current)} type="button" aria-label="Pasidėti vėliau">
                <BookmarkIcon filled={run.shelf.some((s: any) => s.albumId === current.albumId)} size={16} />
                <span>Vėliau</span>
              </button>
              <button className={`g-act main${isHeldCurrent ? ' held' : ''}`} onClick={() => actHold(current)} type="button" disabled={!!isHeldCurrent}>
                {isHeldCurrent ? '✓ Pasirinkta' : run.held ? 'Pakeisti į šitą' : 'Pasirinkti'}
              </button>
            </div>
          )}

          <div className={`g-held${run.held ? ' has' : ' empty'}`}>
            {run.held ? (
              <>
                <img src={run.held.cover} alt="" referrerPolicy="no-referrer"
                  onClick={() => openPlayer({ artist: run.held.artist, title: run.held.title, year: run.held.year, cover: run.held.cover, tracks: run.held.tracks || [], artistSlug: run.held.artistSlug }, { albumId: run.held.albumId })} />
                <div className="g-heldtxt">
                  <span className="g-heldlbl">Tavo vinilas</span>
                  <span className="g-heldname">{run.held.artist} — {run.held.title}</span>
                </div>
                <button className="g-digbtn" onClick={digNow} disabled={busy} type="button" aria-label="Kasti gilyn">
                  <ArrowIcon size={18} />
                </button>
              </>
            ) : (
              <div className="g-heldslot" aria-label="Čia atsidurs tavo pasirinkimas">
                <span className="g-heldq">?</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── KASIMASIS: hero + keliai ── */}
      {!loading && !err && view === 'dig' && run && curNode && (
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

          <div className="g-hero">
            <div className="g-heroblur" style={{ backgroundImage: `url(${curNode.cover})` }} />
            <div className="g-herotop">
              <div className="g-herocover" onClick={() => openPlayer({ artist: curNode.artist, title: curNode.title, year: curNode.year, cover: curNode.cover, tracks: curNode.tracks || [], artistSlug: curNode.artistSlug }, { artistId: curNode.artistId })}>
                <img src={curNode.cover || ''} alt="" referrerPolicy="no-referrer" />
                {(curNode.tracks?.length || 0) > 0 && <span className="g-play sm" aria-hidden="true"><PlayIcon size={13} /></span>}
              </div>
              <div className="g-heromu">
                <span className="g-heroartist">{curNode.artist}</span>
                <span className="g-heroalbum">{curNode.title}{curNode.year ? ` · ${curNode.year}` : ''}</span>
                {(nodeInfo?.country || nodeInfo?.years) && (
                  <span className="g-herofacts">{[nodeInfo?.country, nodeInfo?.years].filter(Boolean).join(' · ')}</span>
                )}
              </div>
              {curNode.artistSlug && <Link className="g-linkbtn hero" href={`/atlikejai/${curNode.artistSlug}`} aria-label="Atlikėjo puslapis" target="_blank" rel="noopener"><LinkIcon size={15} /></Link>}
            </div>
            {(() => {
              const boxBlurb = box.find(b => b.albumId === curNode.albumId)?.blurb
              const txt = boxBlurb || nodeInfo?.albumDesc || nodeInfo?.bio
              return txt ? <p className="g-herobio">{txt}</p> : null
            })()}
            {(curNode.tracks?.length || 0) > 0 && (
              <div className="g-herohits">
                {(curNode.tracks || []).slice(0, 3).map((t, i) => (
                  <button key={t.y} className="g-herohit" type="button"
                    onClick={() => openPlayer({ artist: curNode.artist, title: curNode.title, year: curNode.year, cover: curNode.cover, tracks: curNode.tracks || [], artistSlug: curNode.artistSlug }, { artistId: curNode.artistId }, i)}>
                    <span className="g-hitplay"><PlayIcon size={10} /></span>
                    <span className="g-hitname">{t.t}</span>
                  </button>
                ))}
              </div>
            )}
            {(nodeInfo?.artistTop?.length || 0) > 0 && (
              <button className="g-herolisten alt" type="button"
                onClick={() => openPlayer({ artist: curNode.artist, title: 'Top dainos', year: null, cover: curNode.cover, tracks: nodeInfo?.artistTop || [], artistSlug: curNode.artistSlug }, { artistId: curNode.artistId })}>
                <PlayIcon size={13} /> Daugiau jų muzikos
              </button>
            )}
          </div>

          <h2 className="g-digq">Kur toliau?</h2>
          <div className="g-doors">
            {(run.doors || []).map(d => (
              <div className="g-door" key={d.artistId} style={{ borderColor: `color-mix(in srgb, ${DOOR_COLORS[d.doorType]} 45%, transparent)` }}>
                <div className="g-doorbody"
                  onClick={() => openPlayer({ artist: d.artist, title: d.title, year: d.year, cover: d.cover, tracks: d.tracks || [], artistSlug: d.artistSlug }, { artistId: d.artistId })}
                  role="button" tabIndex={0}>
                  <div className="g-doorcover">
                    <img src={d.cover || ''} alt="" referrerPolicy="no-referrer" />
                    {(d.tracks?.length || 0) > 0 && <span className="g-play sm" aria-hidden="true"><PlayIcon size={12} /></span>}
                  </div>
                  <div className="g-doormeta">
                    <span className="g-doortype" style={{ color: DOOR_COLORS[d.doorType] }}>{d.label}</span>
                    <span className="g-doorartist">{d.artist}</span>
                    {d.title && <span className="g-dooralbum">{d.title}{d.year ? ` · ${d.year}` : ''}</span>}
                    <span className="g-doorwhy">{d.reason}</span>
                  </div>
                  <button className="g-doorgo" onClick={e => { e.stopPropagation(); chooseDoor(d) }} disabled={busy} type="button"
                    aria-label={`Eiti gilyn: ${d.artist}`} style={{ background: DOOR_COLORS[d.doorType] }}>
                    <ArrowIcon size={20} />
                  </button>
                </div>
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
              {run.path.map((p: any, i: number, all: any[]) => {
                const saved = savedIdx.has(i) || run.finalPick?.artistId === p.artistId
                return (
                  <div key={i} className={`g-resnode${saved ? ' picked' : ''}`}>
                    <img src={p.cover || ''} alt="" referrerPolicy="no-referrer"
                      onClick={() => openPlayer({ artist: p.artist, title: p.title, year: p.year, cover: p.cover, tracks: p.tracks || [], artistSlug: p.artistSlug }, { artistId: p.artistId })} />
                    <div className="g-resmeta"
                      onClick={() => openPlayer({ artist: p.artist, title: p.title, year: p.year, cover: p.cover, tracks: p.tracks || [], artistSlug: p.artistSlug }, { artistId: p.artistId })}>
                      <span className="g-resartist">{p.artist}</span>
                      {p.title && <span className="g-restitle">{p.title}{p.year ? ` · ${p.year}` : ''}</span>}
                      <span className="g-resreason">{p.doorType === 'portal' ? 'Tavo dienos portalas' : p.reason}</span>
                    </div>
                    <div className="g-resacts">
                      <button className={`g-savebtn${saved ? ' on' : ''}`} type="button"
                        aria-label="Išsaugoti radinį" onClick={() => saveFind(i)}>
                        <BookmarkIcon filled={saved} size={16} />
                      </button>
                      {p.artistSlug && <Link className="g-linkbtn" href={`/atlikejai/${p.artistSlug}`} aria-label="Atlikėjo puslapis" target="_blank" rel="noopener"><LinkIcon size={14} /></Link>}
                    </div>
                    {i < all.length - 1 && <span className="g-resline" aria-hidden="true" />}
                  </div>
                )
              })}
              <p className="g-hint"><BookmarkIcon filled size={11} /> — išsaugok radinį: jis atsidurs lentynoje ir tavo žemėlapyje. Paspaudęs kortelę — perklausysi.</p>
            </div>
          ) : (
            <p className="g-lead center">Šiandien kelio nebuvo — dėžė liko uždaryta. Rytoj — nauja.</p>
          )}

          {community && community.finished > 0 && (
            <div className="g-comm">
              <h3 className="g-h3">Kaip šiandien sekėsi kitiems?</h3>
              <p className="g-commrow">Kelią baigė <b>{community.finished}</b> {community.finished === 1 ? 'žmogus' : 'žmonės'}.</p>
              {run.held && community.finished > 1 && <p className="g-commrow">Tą patį vinilą kaip tu laikė <b>{community.heldSameFinal}%</b>.</p>}
              {(() => {
                const sums = { sound: 0, scene: 0, bridge: 0 }
                for (const s of community.doorSplit) { sums.sound += s.sound; sums.scene += s.scene; sums.bridge += s.bridge }
                const top = (Object.entries(sums) as [keyof typeof sums, number][]).sort((a, b) => b[1] - a[1])[0]
                return top[1] > 0 ? <p className="g-commrow">Dažniausiai rinktasi: <b style={{ color: DOOR_COLORS[top[0]] }}>{DOOR_NAMES[top[0]]}</b>.</p> : null
              })()}
            </div>
          )}

          <button className="g-cta" onClick={openMap} type="button">Atidaryti žemėlapį</button>
          {run.path.length > 0 && (
            <button className="g-cta alt" type="button"
              onClick={() => {
                const last: any = run.path[run.path.length - 1]
                startFreeDig(last.artistId, { artist: last.artist, artistSlug: last.artistSlug, cover: last.cover, title: last.title, year: last.year, tracks: last.tracks })
              }}>
              Tęsti kasimąsi laisvai <ArrowIcon size={15} />
            </button>
          )}
          {run.shelf?.length > 0 && <button className="g-cta alt" onClick={() => setShelfOpen(true)} type="button">Lentyna ({run.shelf.length})</button>}
          <p className="g-hint">Nauja dėžė — rytoj.</p>
        </div>
      )}

      {/* ── FREE DIG ── */}
      {!loading && view === 'free' && freePath.length > 0 && (() => {
        const cur = freePath[freePath.length - 1]
        return (
          <div className="g-digwrap">
            <div className="g-pathline">
              <span className="g-freebadge">LAISVAS KASIMASIS</span>
              {freePath.slice(-6).map((p, i) => (
                <span key={i} className="g-pathnode">
                  {i > 0 && <span className="g-patharrow">→</span>}
                  {p.cover ? <img src={p.cover} alt="" referrerPolicy="no-referrer" /> : <span className="g-pathdot" />}
                </span>
              ))}
            </div>

            <div className="g-hero">
              {cur.cover && <div className="g-heroblur" style={{ backgroundImage: `url(${cur.cover})` }} />}
              <div className="g-herotop">
                {cur.cover && (
                  <div className="g-herocover" onClick={() => openPlayer({ artist: cur.artist, title: cur.title, year: cur.year, cover: cur.cover, tracks: cur.tracks || [], artistSlug: cur.artistSlug }, { artistId: cur.artistId })}>
                    <img src={cur.cover} alt="" referrerPolicy="no-referrer" />
                    {(cur.tracks?.length || 0) > 0 && <span className="g-play sm" aria-hidden="true"><PlayIcon size={13} /></span>}
                  </div>
                )}
                <div className="g-heromu">
                  <span className="g-heroartist">{cur.artist}</span>
                  {cur.title && <span className="g-heroalbum">{cur.title}{cur.year ? ` · ${cur.year}` : ''}</span>}
                  {(freeInfo?.country || freeInfo?.years) && (
                    <span className="g-herofacts">{[freeInfo?.country, freeInfo?.years].filter(Boolean).join(' · ')}</span>
                  )}
                </div>
                {cur.artistSlug && <Link className="g-linkbtn hero" href={`/atlikejai/${cur.artistSlug}`} aria-label="Atlikėjo puslapis" target="_blank" rel="noopener"><LinkIcon size={15} /></Link>}
              </div>
              {(freeInfo?.albumDesc || freeInfo?.bio) && <p className="g-herobio">{freeInfo?.albumDesc || freeInfo?.bio}</p>}
              {(freeInfo?.artistTop?.length || 0) > 0 && (
                <button className="g-herolisten alt" type="button"
                  onClick={() => openPlayer({ artist: cur.artist, title: 'Top dainos', year: null, cover: cur.cover, tracks: freeInfo?.artistTop || [], artistSlug: cur.artistSlug }, { artistId: cur.artistId })}>
                  <PlayIcon size={13} /> Daugiau jų muzikos
                </button>
              )}
            </div>

            <h2 className="g-digq">Kur toliau?</h2>
            <div className="g-doors">
              {freeDoors.map(d => (
                <div className="g-door" key={d.artistId} style={{ borderColor: `color-mix(in srgb, ${DOOR_COLORS[d.doorType]} 45%, transparent)` }}>
                  <div className="g-doorbody"
                    onClick={() => openPlayer({ artist: d.artist, title: d.title, year: d.year, cover: d.cover, tracks: d.tracks || [], artistSlug: d.artistSlug }, { artistId: d.artistId })}
                    role="button" tabIndex={0}>
                    <div className="g-doorcover">
                      <img src={d.cover || ''} alt="" referrerPolicy="no-referrer" />
                      {(d.tracks?.length || 0) > 0 && <span className="g-play sm" aria-hidden="true"><PlayIcon size={12} /></span>}
                    </div>
                    <div className="g-doormeta">
                      <span className="g-doortype" style={{ color: DOOR_COLORS[d.doorType] }}>{d.label}</span>
                      <span className="g-doorartist">{d.artist}</span>
                      {d.title && <span className="g-dooralbum">{d.title}{d.year ? ` · ${d.year}` : ''}</span>}
                      <span className="g-doorwhy">{d.reason}</span>
                    </div>
                    <button className="g-doorgo" onClick={e => { e.stopPropagation(); freeChoose(d) }} disabled={busy} type="button"
                      aria-label={`Kasti: ${d.artist}`} style={{ background: DOOR_COLORS[d.doorType] }}>
                      <ArrowIcon size={20} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <button className="g-cta ghost" onClick={() => { setFreePath([]); setFreeDoors([]); openMap() }} type="button">Baigti kasimąsi</button>
          </div>
        )
      })()}

      {/* ── ŽEMĖLAPIS v3 ── */}
      {!loading && view === 'map' && (
        <div className="g-mapwrap">
          <button className="g-mapback" onClick={() => run ? routeView(run) : setView('box')} type="button">← Grįžti</button>
          <h2 className="g-h1 center">Tavo muzikos žemėlapis</h2>
          {!mapData ? (
            <div className="g-center"><Vinyl spin size={54} /><p className="g-dim">Braižome žemėlapį…</p></div>
          ) : (
            <>
              <div className="g-maptotals">
                <div><HeartIcon size={15} /><b>{mapData.totals.beacons}</b><span>pamėgta</span></div>
                <div><CheckIcon size={15} /><b>{mapData.totals.visited}</b><span>aplankyta</span></div>
                <div><StarIcon size={15} /><b>{mapData.totals.saved}</b><span>radiniai</span></div>
                <div><HexMini /><b>{mapData.totals.substylesTouched}<i>/{mapData.totals.substylesTotal}</i></b><span>stiliai</span></div>
              </div>
              <p className="g-mapexpl">Kiekvienas šešiakampis — muzikos stilius. <span className="cl-b">Oranžiniai</span> — tavo pamėgta muzika, <span className="cl-v">žali</span> — kur nukeliavai per Gilyn, <span className="cl-s">★</span> — radiniai, pilki — dar rūke. Linijos — tavo kelionės.</p>
              <MapWorld regions={mapData.regions} edges={mapData.edges || []} onPick={s => setSubSheet(s)} />
            </>
          )}
        </div>
      )}

      {/* ── Loading overlay su etapais ── */}
      {staging && (
        <div className="g-stageback">
          <Vinyl spin size={70} />
          <p className="g-stagetxt">{LOAD_STAGES[stageIdx]}</p>
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

      {shelfOpen && run && (
        <div className="g-sheetback" onClick={() => setShelfOpen(false)}>
          <div className="g-sheet" onClick={e => e.stopPropagation()}>
            <h3 className="g-h3 center">Lentyna — paklausyti vėliau</h3>
            {(!run.shelf || run.shelf.length === 0) && <p className="g-dim center">Tuščia. Vartydamas spausk <BookmarkIcon filled={false} size={12} /> ženkliuką.</p>}
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
                  <span className="g-play sm inline" aria-hidden="true"><PlayIcon size={12} /></span>
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
              {subSheet.saved > 0 && <><StarIcon size={12} /> {subSheet.saved} radiniai · </>}
              {subSheet.visited > 0 && <><CheckIcon size={12} /> {subSheet.visited} aplankyta · </>}
              {subSheet.beacons > 0 && <><HeartIcon size={12} /> {subSheet.beacons} pamėgta</>}
            </p>
            {subSheet.artists.length > 0 ? (
              <>
                <div className="g-subartists">
                  {subSheet.artists.map((a, i) => (
                    <button key={i} className={`g-suba ${a.k}`} type="button" onClick={() => startFreeDig(a.id, { artist: a.n })}>
                      {a.k === 'saved' ? <StarIcon size={11} /> : a.k === 'visited' ? <CheckIcon size={11} /> : <HeartIcon size={11} />} {a.n}
                      <ArrowIcon size={11} />
                    </button>
                  ))}
                </div>
                <p className="g-hint">Paspausk atlikėją — pradėsi laisvą kasimąsi nuo jo.</p>
              </>
            ) : (
              <p className="g-dim center">Šį stilių dar dengia rūkas — jokių tavo pėdsakų.</p>
            )}
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
          {item.artistSlug && <Link className="g-linkbtn" href={`/atlikejai/${item.artistSlug}`} aria-label="Atlikėjo puslapis" target="_blank" rel="noopener"><LinkIcon size={15} /></Link>}
          <button className="g-psclose" onClick={onClose} type="button" aria-label="Uždaryti">✕</button>
        </div>
        {tr && (
          <div className="g-psvideo">
            <iframe key={tr.y}
              src={`https://www.youtube.com/embed/${tr.y}?autoplay=1&rel=0&modestbranding=1&playsinline=1&iv_load_policy=3${typeof window !== 'undefined' ? `&origin=${encodeURIComponent(window.location.origin)}` : ''}`}
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

// ── ŽEMĖLAPIS 2.0: vientisas pasaulis su pan/zoom ir kelionių linijomis ──

const REGION_HUES: Record<string, string> = {
  'Rokas': '#ef4444', 'Elektronika': '#06b6d4', 'Hip-hopas': '#f59e0b', 'Pop / R&B': '#ec4899',
  'Sunkioji': '#64748b', 'Alternatyva': '#a855f7', 'Rimtoji': '#10b981', 'Kiti stiliai': '#94a3b8',
}
// Stabilios salų pozicijos — vartotojas išmoksta, kur kas yra
const REGION_POS: Record<string, [number, number]> = {
  'Rokas': [235, 215], 'Alternatyva': [600, 165], 'Sunkioji': [965, 215],
  'Rimtoji': [415, 415], 'Kiti stiliai': [785, 415],
  'Pop / R&B': [235, 625], 'Elektronika': [600, 665], 'Hip-hopas': [965, 625],
}
const WORLD_W = 1200, WORLD_H = 830

/** Hex spiralės axial koordinatės: centras + žiedai. */
function spiralCoords(n: number): [number, number][] {
  const out: [number, number][] = [[0, 0]]
  const dirs: [number, number][] = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]]
  let k = 1
  while (out.length < n) {
    let q = -k, r = k
    for (let i = 0; i < 6 && out.length < n; i++) {
      for (let j = 0; j < k && out.length < n; j++) {
        out.push([q, r])
        q += dirs[i][0]; r += dirs[i][1]
      }
    }
    k++
  }
  return out
}

function MapWorld({ regions, edges, onPick }: {
  regions: { genreId: number; name: string; substyles: SubStyle[] }[]
  edges: { a: number; b: number; t: string }[]
  onPick: (s: SubStyle) => void
}) {
  const R = 13, HW = R * 1.732

  const layout = useMemo(() => {
    const cells: { s: SubStyle; k: string; x: number; y: number; hue: string }[] = []
    const pos = new Map<number, [number, number]>()
    const labels: { name: string; x: number; y: number; hue: string; act: number; tot: number }[] = []
    for (const rg of regions) {
      const [cx, cy] = REGION_POS[rg.name] || [WORLD_W / 2, WORLD_H / 2]
      const hue = REGION_HUES[rg.name] || '#94a3b8'
      const sorted = [...rg.substyles].sort((a, b) =>
        (b.beacons + b.visited * 3 + b.saved * 5 + (b.heard ? 1 : 0)) -
        (a.beacons + a.visited * 3 + a.saved * 5 + (a.heard ? 1 : 0)))
      const coords = spiralCoords(sorted.length)
      let minY = cy
      sorted.forEach((s, i) => {
        const [q, rr] = coords[i]
        const x = cx + HW * (q + rr / 2)
        const y = cy + R * 1.5 * rr
        if (y < minY) minY = y
        const k = s.saved ? 'saved' : s.visited ? 'visited' : s.beacons ? 'beacon' : s.heard ? 'heard' : 'fog'
        cells.push({ s, k, x, y, hue })
        pos.set(s.id, [x, y])
      })
      labels.push({
        name: rg.name, x: cx, y: minY - 22, hue,
        act: rg.substyles.filter(s => s.beacons || s.visited || s.saved).length,
        tot: rg.substyles.length,
      })
    }
    return { cells, pos, labels }
  }, [regions, HW])

  const [vb, setVb] = useState({ x: 0, y: 0, w: WORLD_W })
  const svgRef = useRef<SVGSVGElement | null>(null)
  const drag = useRef<{ px: number; py: number; vx: number; vy: number; moved: number } | null>(null)
  const suppressClick = useRef(false)

  function zoomAt(f: number, cx?: number, cy?: number) {
    setVb(v => {
      const w = Math.min(WORLD_W * 1.2, Math.max(240, v.w * f))
      const ax = cx ?? v.x + v.w / 2
      const ay = cy ?? v.y + (v.w * WORLD_H / WORLD_W) / 2
      const kx = (ax - v.x) / v.w
      const ky = (ay - v.y) / (v.w * WORLD_H / WORLD_W)
      return { x: ax - w * kx, y: ay - (w * WORLD_H / WORLD_W) * ky, w }
    })
  }
  function svgPoint(e: { clientX: number; clientY: number }): [number, number] {
    const el = svgRef.current
    if (!el) return [vb.x + vb.w / 2, vb.y + vb.w / 2]
    const r = el.getBoundingClientRect()
    return [vb.x + ((e.clientX - r.left) / r.width) * vb.w, vb.y + ((e.clientY - r.top) / r.height) * (vb.w * WORLD_H / WORLD_W)]
  }

  function hexPts(cx: number, cy: number): string {
    const pts: string[] = []
    for (let a = 0; a < 6; a++) {
      const ang = (Math.PI / 180) * (60 * a - 30)
      pts.push(`${(cx + R * 0.9 * Math.cos(ang)).toFixed(1)},${(cy + R * 0.9 * Math.sin(ang)).toFixed(1)}`)
    }
    return pts.join(' ')
  }

  const fillFor = (k: string, hue: string) =>
    k === 'saved' ? 'var(--accent-orange)'
      : k === 'visited' ? 'color-mix(in srgb, var(--accent-green) 60%, var(--bg-surface))'
        : k === 'beacon' ? 'color-mix(in srgb, var(--accent-orange) 46%, var(--bg-surface))'
          : k === 'heard' ? 'rgba(140,160,190,0.3)'
            : `color-mix(in srgb, ${hue} 11%, var(--bg-surface))`
  const strokeFor = (k: string, hue: string) =>
    k === 'saved' || k === 'beacon' ? 'var(--accent-orange)'
      : k === 'visited' ? 'var(--accent-green)'
        : k === 'heard' ? 'rgba(140,160,190,0.55)'
          : `color-mix(in srgb, ${hue} 26%, transparent)`

  return (
    <div className="g-world">
      <div className="g-worldbtns">
        <button onClick={() => zoomAt(0.72)} type="button" aria-label="Priartinti">+</button>
        <button onClick={() => zoomAt(1.38)} type="button" aria-label="Atitolinti">−</button>
        <button onClick={() => setVb({ x: 0, y: 0, w: WORLD_W })} type="button" aria-label="Visas žemėlapis">⌂</button>
      </div>
      <svg
        ref={svgRef}
        viewBox={`${vb.x} ${vb.y} ${vb.w} ${(vb.w * WORLD_H / WORLD_W)}`}
        className="g-worldsvg"
        onWheel={e => zoomAt(e.deltaY > 0 ? 1.12 : 0.89, ...svgPoint(e))}
        onPointerDown={e => {
          drag.current = { px: e.clientX, py: e.clientY, vx: vb.x, vy: vb.y, moved: 0 }
          ;(e.target as Element).setPointerCapture?.(e.pointerId)
        }}
        onPointerMove={e => {
          const d = drag.current
          if (!d) return
          const el = svgRef.current
          const rw = el ? el.getBoundingClientRect().width : 1
          const dx = e.clientX - d.px, dy = e.clientY - d.py
          d.moved = Math.max(d.moved, Math.abs(dx) + Math.abs(dy))
          setVb(v => ({ ...v, x: d.vx - dx * (v.w / rw), y: d.vy - dy * (v.w / rw) }))
        }}
        onPointerUp={() => {
          suppressClick.current = (drag.current?.moved || 0) > 8
          drag.current = null
          window.setTimeout(() => { suppressClick.current = false }, 80)
        }}
        onPointerCancel={() => { drag.current = null }}
      >
        {edges.map((e2, i) => {
          const A = layout.pos.get(e2.a), B = layout.pos.get(e2.b)
          if (!A || !B) return null
          const mx = (A[0] + B[0]) / 2 + (B[1] - A[1]) * 0.16
          const my = (A[1] + B[1]) / 2 + (A[0] - B[0]) * 0.16
          return <path key={i} d={`M ${A[0]} ${A[1]} Q ${mx} ${my} ${B[0]} ${B[1]}`}
            fill="none" stroke={DOOR_COLORS[e2.t] || 'var(--accent-orange)'} strokeWidth={2.6}
            strokeLinecap="round" opacity={0.55} />
        })}
        {layout.cells.map(c => (
          <g key={c.s.id} className="g-wx" onClick={() => { if (!suppressClick.current) onPick(c.s) }} role="button">
            <polygon points={hexPts(c.x, c.y)} style={{ fill: fillFor(c.k, c.hue), stroke: strokeFor(c.k, c.hue), strokeWidth: 0.9 }} />
            {c.k === 'saved' && <text x={c.x} y={c.y + 3.5} textAnchor="middle" className="g-hexstar">★</text>}
          </g>
        ))}
        {layout.labels.map(l => (
          <text key={l.name} x={l.x} y={l.y} textAnchor="middle" className="g-wlabel" style={{ fill: l.hue }}>
            {l.name} <tspan className="g-wlabelct">{l.act}/{l.tot}</tspan>
          </text>
        ))}
      </svg>
    </div>
  )
}

// ── Ikonos ───────────────────────────────────────────────────────────────

function CrateLoader() {
  return (
    <div className="g-crateload" aria-label="Kraunama dienos dėžė">
      {[0, 1, 2, 3, 4, 5].map(i => (
        <div key={i} className="g-cl-rec" style={{ animationDelay: `${i * 0.14}s`, left: `${i * 30 + 14}px`, zIndex: 7 - i }}>
          <Vinyl size={96} />
        </div>
      ))}
      <div className="g-cl-box" aria-hidden="true" />
      <div className="g-cl-shine" aria-hidden="true" />
    </div>
  )
}

function ArrowIcon({ size = 16 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></svg>
}

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
function PlayIcon({ size = 16 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="#fff" aria-hidden="true"><polygon points="6 4 20 12 6 20 6 4" /></svg>
}
function BookmarkIcon({ filled, size = 16 }: { filled: boolean; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z" /></svg>
}
function DigIcon({ size = 16 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m7 6 5 5 5-5" /><path d="m7 13 5 5 5-5" /></svg>
}
function LinkIcon({ size = 14 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 17 17 7" /><path d="M8 7h9v9" /></svg>
}
function HeartIcon({ size = 14 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="var(--accent-orange)" aria-hidden="true"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" /></svg>
}
function CheckIcon({ size = 14 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="var(--accent-green)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>
}
function StarIcon({ size = 14 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="var(--accent-orange)" aria-hidden="true"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>
}
function HexMini() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="rgba(140,160,190,0.35)" aria-hidden="true"><polygon points="12 2 21 7 21 17 12 22 3 17 3 7" /></svg>
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
.g-dim b { color: var(--text-primary); }
.g-hint { font-size: 12px; color: var(--text-muted); text-align: center; margin: 10px 0 0; }
.g-cta { display: flex; align-items: center; justify-content: center; gap: 8px; width: 100%; max-width: 340px; margin: 4px auto 0; border: 0; cursor: pointer; font-size: 16px; font-weight: 900; color: #fff; background: var(--accent-orange); border-radius: 13px; padding: 14px; }
.g-cta.alt { background: var(--bg-elevated); color: var(--text-primary); border: 1px solid rgba(140,160,190,0.3); }
.g-cta.ghost { background: transparent; color: var(--text-muted); border: 0; font-weight: 700; font-size: 14px; padding: 10px; }
.g-cta.dig { background: #1d4ed8; }
.g-cta:disabled { opacity: 0.6; }
.g-spin { animation: gspin 2.4s linear infinite; }
@keyframes gspin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .g-spin { animation: none; } }
.g-beaconbox { display: flex; align-items: center; gap: 12px; text-align: left; max-width: 360px; font-size: 13px; color: var(--text-secondary); line-height: 1.5; background: color-mix(in srgb, var(--accent-orange) 8%, var(--bg-surface)); border: 1px solid color-mix(in srgb, var(--accent-orange) 30%, transparent); border-radius: 14px; padding: 12px 14px; }
.g-beaconbox b { color: var(--text-primary); }
.g-beaconbox.slim { max-width: none; position: relative; padding: 9px 30px 9px 12px; font-size: 12px; }
.g-bclose { position: absolute; top: 6px; right: 9px; border: 0; background: transparent; color: var(--text-muted); cursor: pointer; font-size: 12px; padding: 2px; }

/* ── Dėžė (crate) ── */
.g-boxwrap { display: flex; flex-direction: column; gap: 12px; min-height: 100%; }
.g-progress { display: flex; align-items: center; gap: 10px; }
.g-pos { font-size: 15px; font-weight: 900; white-space: nowrap; }
.g-pos i { font-style: normal; color: var(--text-muted); font-weight: 700; font-size: 12px; }
.g-bar { flex: 1; height: 5px; border-radius: 99px; background: rgba(140,160,190,0.18); overflow: hidden; }
.g-bar i { display: block; height: 100%; background: var(--accent-orange); border-radius: 99px; transition: width 0.3s ease; }

.g-crate { position: relative; padding: 0 20px; overflow: hidden; }
.g-adj { position: absolute; top: 0; left: 20px; right: 20px; bottom: 0; z-index: 1; pointer-events: none; transition: none; }
.g-navarr { position: absolute; top: 45%; transform: translateY(-50%); width: 40px; height: 40px; border-radius: 50%; background: var(--bg-elevated); border: 1px solid rgba(140,160,190,0.3); color: var(--text-secondary); cursor: pointer; z-index: 4; display: none; align-items: center; justify-content: center; box-shadow: 0 4px 14px rgba(0,0,0,0.25); }
.g-navarr.left { left: 30px; }
.g-navarr.right { right: 30px; }
.g-navarr:disabled { opacity: 0.3; cursor: default; }
@media (min-width: 640px) and (hover: hover) { .g-navarr { display: flex; } }
.g-styles { display: flex; gap: 6px; justify-content: center; flex-wrap: wrap; margin-top: 5px; }
.g-styles i { font-style: normal; font-size: 11px; font-weight: 800; color: var(--text-secondary); background: rgba(140,160,190,0.14); border-radius: 999px; padding: 3px 10px; }
.g-blurbtxt { font-size: 12.5px; color: var(--text-muted); line-height: 1.5; margin: 6px auto 0; max-width: 340px; }
.g-loadfill { justify-content: center; min-height: 60vh; }
.g-crateload { position: relative; width: 250px; height: 170px; overflow: hidden; filter: drop-shadow(0 14px 22px rgba(0,0,0,0.22)); }
.g-cl-rec { position: absolute; bottom: 14px; animation: gclflip 2.1s cubic-bezier(0.37, 0, 0.63, 1) infinite; will-change: transform; }
@keyframes gclflip {
  0%, 100% { transform: translateY(34px) rotate(0deg) scale(0.96); }
  35% { transform: translateY(-10px) rotate(-6deg) scale(1); }
  55% { transform: translateY(-4px) rotate(-3deg) scale(1); }
}
@media (prefers-reduced-motion: reduce) { .g-cl-rec { animation: none; transform: translateY(16px); } }
.g-cl-box { position: absolute; left: 0; right: 0; bottom: 0; height: 58px; z-index: 10; border-radius: 8px 8px 14px 14px; background: linear-gradient(180deg, color-mix(in srgb, var(--text-primary) 16%, var(--bg-elevated)) 0%, var(--bg-elevated) 55%, color-mix(in srgb, #000 12%, var(--bg-elevated)) 100%); border: 1px solid rgba(140,160,190,0.35); border-top: 4px solid color-mix(in srgb, var(--text-primary) 22%, var(--bg-elevated)); box-shadow: inset 0 6px 14px rgba(0,0,0,0.18); }
.g-cl-shine { position: absolute; left: 8%; right: 8%; bottom: 46px; height: 10px; z-index: 11; border-radius: 50%; background: radial-gradient(ellipse at center, rgba(0,0,0,0.28), transparent 70%); }
.g-spine { position: absolute; top: 10px; bottom: 10px; width: 26px; border: 0; padding: 0; cursor: pointer; background-size: cover; background-position: center; z-index: 2; }
.g-spine.left { left: -4px; border-radius: 6px 3px 3px 6px; box-shadow: inset -8px 0 12px rgba(0,0,0,0.55); }
.g-spine.right { right: -4px; border-radius: 3px 6px 6px 3px; box-shadow: inset 8px 0 12px rgba(0,0,0,0.55); }
.g-spinesh { position: absolute; inset: 0; background: rgba(10,12,18,0.35); }
.g-spine.end { background: var(--bg-elevated); border: 1px dashed rgba(140,160,190,0.35); }
.g-spineend { color: var(--text-muted); font-size: 16px; }
.g-card { position: relative; overflow: hidden; background: var(--bg-surface); border: 1px solid rgba(140,160,190,0.2); border-radius: 20px; padding: 40px 14px 14px; display: flex; flex-direction: column; gap: 10px; touch-action: pan-y; user-select: none; cursor: grab; transition: transform 0.25s ease; }
.g-card.drag { transition: none; cursor: grabbing; }
.g-blur { position: absolute; inset: -30px; background-size: cover; background-position: center; filter: blur(34px) saturate(1.15); opacity: 0.35; pointer-events: none; }
.g-chip { position: relative; z-index: 2; align-self: flex-start; font-size: 11.5px; font-weight: 800; border-radius: 999px; padding: 4px 11px; margin-top: -28px; background: color-mix(in srgb, var(--accent-orange) 18%, var(--bg-surface)); color: var(--accent-orange); }
.g-chip.near { background: color-mix(in srgb, var(--accent-blue) 18%, var(--bg-surface)); color: var(--accent-link, #7aa7ff); }
.g-coverbox { position: relative; z-index: 1; width: min(68%, 238px); aspect-ratio: 1; margin: 4px auto 0; }
.g-vinylpeek { position: absolute; top: 4%; right: -13%; width: 96%; height: 92%; border-radius: 50%; background: radial-gradient(circle at center, #0a0a0a 28%, #161616 29%, #0d0d0d 46%, #191919 47%, #0e0e0e 70%, #1a1a1a 71%, #101010 100%); box-shadow: -6px 0 18px rgba(0,0,0,0.5); }
.g-cover { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; border-radius: 6px; box-shadow: 0 10px 34px rgba(0,0,0,0.45); }
.g-play { position: absolute; right: -8px; bottom: -8px; width: 52px; height: 52px; border-radius: 50%; border: 3px solid var(--bg-surface); cursor: pointer; background: var(--accent-orange); display: flex; align-items: center; justify-content: center; padding-left: 3px; box-shadow: 0 8px 24px rgba(0,0,0,0.4); }
.g-play.sm { position: absolute; right: 5px; bottom: 5px; width: 30px; height: 30px; border-width: 0; padding-left: 2px; }
.g-play.sm.inline { position: static; flex-shrink: 0; display: flex; }
.g-meta { position: relative; z-index: 1; display: flex; flex-direction: column; gap: 2px; text-align: center; padding-top: 6px; }
.g-artist { font-size: 20px; font-weight: 900; letter-spacing: -0.01em; }
.g-title { font-size: 13.5px; color: var(--text-secondary); font-weight: 600; }
.g-endpanel { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 26px 8px; }
.g-crateend { padding: 0; }

.g-actions { display: flex; gap: 9px; }
.g-act { border: 0; cursor: pointer; border-radius: 13px; font-weight: 900; font-size: 15px; padding: 13px 0; }
.g-act.main { flex: 1.35; background: var(--accent-orange); color: #fff; }
.g-act.main.held { background: color-mix(in srgb, var(--accent-green) 22%, var(--bg-elevated)); color: var(--accent-green); }
.g-act.shelfic { flex: 1; display: flex; align-items: center; justify-content: center; gap: 7px; background: var(--bg-elevated); color: var(--text-secondary); border: 1px solid rgba(140,160,190,0.22); font-size: 13.5px; font-weight: 800; }
.g-act.shelfic.on { color: var(--accent-orange); border-color: var(--accent-orange); }

.g-held { display: flex; align-items: center; gap: 11px; background: var(--bg-elevated); border: 1px solid rgba(140,160,190,0.2); border-radius: 14px; padding: 9px 12px; margin-top: auto; }
.g-held.has { border-color: color-mix(in srgb, var(--accent-orange) 45%, transparent); background: color-mix(in srgb, var(--accent-orange) 7%, var(--bg-elevated)); }
.g-held img { width: 44px; height: 44px; border-radius: 8px; object-fit: cover; cursor: pointer; }
.g-held.empty { justify-content: center; background: transparent; border-style: dashed; }
.g-heldslot { width: 46px; height: 46px; border-radius: 11px; border: 2px dashed color-mix(in srgb, var(--accent-orange) 55%, transparent); display: flex; align-items: center; justify-content: center; }
.g-heldq { font-size: 19px; font-weight: 900; color: var(--accent-orange); opacity: 0.85; }
.g-heldtxt { display: flex; flex-direction: column; min-width: 0; flex: 1; }
.g-heldlbl { font-size: 10px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.08em; color: var(--accent-orange); }
.g-heldlbl.dim { color: var(--text-muted); }
.g-heldname { font-size: 13px; font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.g-heldname.dim { color: var(--text-muted); font-weight: 600; }
.g-digbtn { flex-shrink: 0; width: 42px; height: 42px; border: 0; cursor: pointer; border-radius: 12px; color: #fff; background: var(--accent-orange); display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 12px rgba(0,0,0,0.2); }
.g-digbtn:disabled { opacity: 0.6; }
.g-shelfbtn { display: flex; align-items: center; gap: 5px; border: 1px solid rgba(140,160,190,0.25); background: var(--bg-surface); color: var(--text-secondary); border-radius: 10px; padding: 6px 10px; font-size: 12.5px; font-weight: 800; cursor: pointer; }

/* ── Kasimasis ── */
.g-digwrap { display: flex; flex-direction: column; gap: 12px; }
@media (min-width: 880px) {
  .g-digwrap { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 20px; grid-template-areas: "path path" "hero head" "hero doors"; align-items: start; }
  .g-digwrap .g-pathline { grid-area: path; margin-bottom: 8px; }
  .g-digwrap .g-hero { grid-area: hero; position: sticky; top: 0; }
  .g-digwrap .g-digq { grid-area: head; margin: 0 0 8px; }
  .g-digwrap .g-doors { grid-area: doors; }
}
.g-pathline { display: flex; align-items: center; gap: 5px; }
.g-pathnode { display: flex; align-items: center; gap: 5px; }
.g-pathnode img { width: 30px; height: 30px; border-radius: 7px; object-fit: cover; border: 1px solid rgba(140,160,190,0.3); }
.g-patharrow { color: var(--text-muted); font-size: 12px; }
.g-pathstep { margin-left: auto; font-size: 12.5px; font-weight: 900; color: var(--text-muted); }
.g-hero { position: relative; overflow: hidden; background: var(--bg-surface); border: 1px solid color-mix(in srgb, var(--accent-orange) 35%, transparent); border-radius: 18px; padding: 14px; display: flex; flex-direction: column; gap: 10px; }
.g-heroblur { position: absolute; inset: -30px; background-size: cover; background-position: center; filter: blur(36px) saturate(1.1); opacity: 0.28; pointer-events: none; }
.g-herotop { position: relative; display: flex; gap: 12px; align-items: center; }
.g-herocover { position: relative; width: 92px; height: 92px; border-radius: 11px; overflow: hidden; flex-shrink: 0; cursor: pointer; box-shadow: 0 8px 22px rgba(0,0,0,0.4); }
.g-herocover img { width: 100%; height: 100%; object-fit: cover; }
.g-heromu { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1; }
.g-heroartist { font-size: 20px; font-weight: 900; letter-spacing: -0.01em; }
.g-heroalbum { font-size: 12.5px; color: var(--text-secondary); font-weight: 600; }
.g-herofacts { font-size: 11.5px; color: var(--text-muted); }
.g-herobio { position: relative; font-size: 13px; color: var(--text-secondary); line-height: 1.55; margin: 0; }
.g-herohits { position: relative; display: flex; flex-direction: column; gap: 5px; }
.g-herohit { display: flex; align-items: center; gap: 9px; border: 0; cursor: pointer; text-align: left; background: color-mix(in srgb, var(--bg-body) 45%, transparent); border-radius: 10px; padding: 8px 10px; color: var(--text-primary); font-size: 13px; font-weight: 700; }
.g-hitplay { width: 24px; height: 24px; border-radius: 50%; background: var(--accent-orange); display: flex; align-items: center; justify-content: center; padding-left: 1px; flex-shrink: 0; }
.g-hitname { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.g-herolisten { position: relative; display: flex; align-items: center; justify-content: center; gap: 8px; border: 0; cursor: pointer; border-radius: 11px; font-weight: 800; font-size: 13.5px; color: #fff; background: var(--accent-orange); padding: 11px; }
.g-herolisten.alt { background: transparent; color: var(--text-secondary); border: 1px solid rgba(140,160,190,0.3); }
.g-herolisten.alt svg { opacity: 0.7; }
.g-linkbtn { width: 34px; height: 34px; border-radius: 10px; border: 1px solid rgba(140,160,190,0.3); color: var(--text-secondary); display: flex; align-items: center; justify-content: center; text-decoration: none; flex-shrink: 0; }
.g-linkbtn.hero { position: relative; }
.g-digq { font-size: 18px; font-weight: 900; letter-spacing: -0.02em; margin: 4px 0 0; }
.g-doors { display: flex; flex-direction: column; gap: 10px; }
.g-door { background: var(--bg-surface); border: 1.5px solid; border-radius: 16px; padding: 12px; }
.g-doorbody { display: flex; gap: 12px; cursor: pointer; align-items: center; }
.g-doorcover { position: relative; width: 84px; height: 84px; border-radius: 10px; overflow: hidden; flex-shrink: 0; background: #000; }
.g-doorcover img { width: 100%; height: 100%; object-fit: cover; }
.g-doormeta { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1; }
.g-doortype { font-size: 10px; font-weight: 900; letter-spacing: 0.09em; }
.g-doorartist { font-size: 16px; font-weight: 900; }
.g-dooralbum { font-size: 11.5px; color: var(--text-secondary); font-weight: 600; }
.g-doorwhy { font-size: 12px; color: var(--text-muted); line-height: 1.4; margin-top: 2px; }
.g-doorgo { flex-shrink: 0; width: 48px; height: 48px; border: 0; cursor: pointer; border-radius: 50%; color: #fff; display: flex; align-items: center; justify-content: center; box-shadow: 0 6px 18px rgba(0,0,0,0.3); }
.g-doorgo:disabled { opacity: 0.55; }

/* ── Rezultatas ── */
.g-reswrap { display: flex; flex-direction: column; gap: 14px; }
.g-xp { align-self: center; font-size: 13px; font-weight: 900; color: var(--accent-green); background: color-mix(in srgb, var(--accent-green) 14%, transparent); border-radius: 999px; padding: 5px 14px; }
.g-respath { display: flex; flex-direction: column; }
.g-resnode { position: relative; display: flex; align-items: center; gap: 12px; background: var(--bg-surface); border: 1px solid rgba(140,160,190,0.2); border-radius: 14px; padding: 10px 12px; margin-bottom: 14px; }
.g-resnode.picked { border-color: var(--accent-orange); }
.g-resnode img { width: 54px; height: 54px; border-radius: 9px; object-fit: cover; flex-shrink: 0; cursor: pointer; }
.g-resmeta { display: flex; flex-direction: column; gap: 1px; min-width: 0; flex: 1; cursor: pointer; }
.g-resartist { font-size: 15px; font-weight: 900; }
.g-restitle { font-size: 12px; color: var(--text-secondary); font-weight: 600; }
.g-resreason { font-size: 11.5px; color: var(--text-muted); }
.g-resacts { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
.g-savebtn { width: 34px; height: 34px; border-radius: 10px; border: 1px solid rgba(140,160,190,0.3); background: transparent; color: var(--text-muted); cursor: pointer; display: flex; align-items: center; justify-content: center; }
.g-savebtn.on { color: #fff; background: var(--accent-orange); border-color: var(--accent-orange); }
.g-resline { position: absolute; left: 37px; bottom: -14px; width: 2px; height: 14px; background: rgba(140,160,190,0.35); }
.g-comm { background: var(--bg-surface); border: 1px solid rgba(140,160,190,0.2); border-radius: 16px; padding: 14px 16px; display: flex; flex-direction: column; gap: 7px; }
.g-commrow { font-size: 13.5px; color: var(--text-secondary); margin: 0; }
.g-commrow b { color: var(--text-primary); }

/* ── Žemėlapis v3 ── */
.g-mapwrap { display: flex; flex-direction: column; gap: 12px; }
.g-mapback { align-self: flex-start; border: 0; background: transparent; color: var(--text-muted); font-size: 13.5px; font-weight: 800; cursor: pointer; padding: 4px 0; }
.g-maptotals { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
.g-maptotals div { background: var(--bg-surface); border: 1px solid rgba(140,160,190,0.2); border-radius: 12px; padding: 10px 6px; display: flex; flex-direction: column; align-items: center; gap: 3px; }
.g-maptotals b { font-size: 17px; font-weight: 900; }
.g-maptotals b i { font-style: normal; font-size: 11px; color: var(--text-muted); }
.g-maptotals span { font-size: 9.5px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.04em; }
.g-mapexpl { font-size: 12.5px; color: var(--text-secondary); line-height: 1.5; margin: 0; }
.g-mapexpl .cl-b { color: var(--accent-orange); font-weight: 800; }
.g-mapexpl .cl-v { color: var(--accent-green); font-weight: 800; }
.g-mapexpl .cl-s { color: var(--accent-orange); font-weight: 800; }
.g-world { position: relative; background: var(--bg-surface); border: 1px solid rgba(140,160,190,0.2); border-radius: 16px; overflow: hidden; }
.g-worldsvg { display: block; width: 100%; height: auto; touch-action: none; cursor: grab; }
.g-worldsvg:active { cursor: grabbing; }
.g-worldbtns { position: absolute; top: 10px; right: 10px; z-index: 5; display: flex; flex-direction: column; gap: 6px; }
.g-worldbtns button { width: 36px; height: 36px; border-radius: 10px; border: 1px solid rgba(140,160,190,0.3); background: var(--bg-elevated); color: var(--text-primary); font-size: 17px; font-weight: 800; cursor: pointer; box-shadow: 0 3px 10px rgba(0,0,0,0.2); }
.g-wx { cursor: pointer; }
.g-wlabel { font-size: 17px; font-weight: 900; letter-spacing: -0.01em; paint-order: stroke; stroke: var(--bg-surface); stroke-width: 4px; }
.g-wlabelct { font-size: 11px; font-weight: 700; opacity: 0.75; }
.g-freebadge { font-size: 9.5px; font-weight: 900; letter-spacing: 0.08em; color: var(--accent-orange); background: color-mix(in srgb, var(--accent-orange) 14%, transparent); border-radius: 999px; padding: 4px 10px; margin-right: 4px; }
.g-pathdot { width: 30px; height: 30px; border-radius: 7px; background: rgba(140,160,190,0.2); display: inline-block; }
.g-region { background: var(--bg-surface); border: 1px solid rgba(140,160,190,0.18); border-radius: 14px; padding: 12px 13px; }
.g-regionhead { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 8px; }
.g-regionname { font-size: 14.5px; font-weight: 900; display: flex; align-items: center; gap: 7px; }
.g-regiondot { width: 9px; height: 9px; border-radius: 50%; display: inline-block; }
.g-regionstat { font-size: 11px; font-weight: 700; color: var(--text-muted); }
.g-hexsvg { display: block; }
.g-hexc { cursor: pointer; }
.g-hexc polygon { stroke-width: 0.8; }
.g-hexc.beacon polygon { fill: color-mix(in srgb, var(--accent-orange) 42%, var(--bg-surface)); stroke: var(--accent-orange); }
.g-hexc.visited polygon { fill: color-mix(in srgb, var(--accent-green) 55%, var(--bg-surface)); stroke: var(--accent-green); }
.g-hexc.saved polygon { fill: var(--accent-orange); stroke: var(--accent-orange); }
.g-hexc.heard polygon { fill: rgba(140,160,190,0.22); stroke: rgba(140,160,190,0.5); }
.g-hexc.fog polygon { fill: rgba(140,160,190,0.09); stroke: rgba(140,160,190,0.14); }
.g-hexstar { fill: #fff; font-size: 9px; font-weight: 900; pointer-events: none; }
.g-regionnames { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
.g-regionnames span { font-size: 11px; font-weight: 700; color: var(--text-secondary); background: rgba(140,160,190,0.12); border-radius: 999px; padding: 3px 9px; cursor: pointer; }
.g-regionnames span.more { color: var(--text-muted); background: transparent; border: 1px dashed rgba(140,160,190,0.3); }
.g-subartists { display: flex; flex-wrap: wrap; gap: 7px; justify-content: center; }
.g-suba { display: inline-flex; align-items: center; gap: 5px; font-size: 12.5px; font-weight: 700; border-radius: 999px; padding: 6px 12px; background: rgba(140,160,190,0.12); color: var(--text-secondary); border: 0; cursor: pointer; }
.g-suba.saved { background: color-mix(in srgb, var(--accent-orange) 20%, transparent); color: var(--accent-orange); }
.g-suba.visited { background: color-mix(in srgb, var(--accent-green) 16%, transparent); color: var(--accent-green); }

/* ── Loading etapai ── */
.g-stageback { position: fixed; inset: 0; z-index: 600; background: color-mix(in srgb, var(--bg-body) 88%, transparent); backdrop-filter: blur(6px); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 18px; }
.g-stagetxt { font-size: 14.5px; font-weight: 800; color: var(--text-secondary); }

/* ── Sheets ── */
.g-sheetback { position: fixed; inset: 0; z-index: 500; background: rgba(8,10,16,0.66); display: flex; align-items: flex-end; justify-content: center; }
.g-sheet { width: 100%; max-width: 520px; max-height: 86vh; overflow-y: auto; overscroll-behavior: contain; background: var(--bg-elevated); border-radius: 22px 22px 0 0; padding: 18px 18px calc(20px + env(safe-area-inset-bottom)); display: flex; flex-direction: column; gap: 12px; }
.g-sheetback { overscroll-behavior: contain; }
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
