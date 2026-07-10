'use client'

// app/zaidimai/vadybininkas/VadybininkasClient.tsx
//
// Muzikos vadybininkas — atlikėjų lyga su realiais rezultatais.
//
// UX modelis (Edvardo feedback 2026-07-06: „viskas per vedlius ir žingsnius"):
//   * SETUP VEDLYS (kol komanda nesurinkta): 1) kaip veikia + pavadinimas →
//     2) komandos surinkimas (rinka su paieška/filtrais VIRŠUJE, kortelės,
//     progresas X/5 + biudžeto juosta visada matomi) → 3) startas su
//     prognoze „kiek tavo komanda surinko praėjusią savaitę".
//   * VALDYMAS (komanda pilna): vizualus ekranas — taškų juostos vietoj
//     skaičių lentelių, vienas aiškus mygtukas „Mainai".

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { proxyImg } from '@/lib/img-proxy'
import ZaidimoLangas from '@/components/zaidimai/ZaidimoLangas'

type RosterArtist = {
  artistId: number
  name: string
  slug: string
  image: string | null
  price: number
  signedAt: string
  countsFromNextWeek?: boolean
  isCaptain?: boolean
  lastWeekPoints: number | null
  livePoints: number
  liveBreakdown: { chart: number; yt: number; rel: number; base: number } | null
}
type BoardRow = { teamId?: number; name: string; points: number; isMe: boolean; isBot?: boolean }
type Boards = { week: BoardRow[]; month: BoardRow[]; season: BoardRow[]; weekLabel: string; weekIsLive?: boolean; totalTeams: number }
type FeedEvent = { artistId: number; name: string; image: string | null; cat: string; text: string; pts?: number }
type League = { id: number; name: string; code: string; members: number }
type TeamData = {
  team: {
    id: number; name: string; budget: number; spent: number; budgetLeft: number
    transfersLeft: number; seasonPoints: number; seasonRank: number | null
    monthPoints?: number; monthRank?: number | null
    liveWeekPoints: number; captainArtistId?: number | null
    weeks: Array<{ week_start: string; points: number; live?: boolean }>
  } | null
  roster: RosterArtist[]
  rosterSize: number
  boards: Boards
  deadline?: string
  events?: FeedEvent[]
  leagues?: League[]
  isAuthenticated: boolean
}
type MarketArtist = {
  id: number; name: string; slug: string; image: string | null
  price: number; priceDelta?: number; country: string; lastWeekPoints: number | null; trending: boolean; onMyRoster: boolean
}

type View = 'loading' | 'intro' | 'draft' | 'startas' | 'valdymas' | 'mainai'

const SRC_LABEL: Record<string, string> = { chart: 'topų', yt: 'YouTube', rel: 'naujų dainų', base: 'populiarumo' }

/** Iš ko atlikėjas surinko daugiausia taškų — žmogui suprantamas žodis. */
function topSource(bd: { chart: number; yt: number; rel: number; base: number } | null): string | null {
  if (!bd) return null
  const e = Object.entries(bd).sort((a, b) => b[1] - a[1])
  return e[0][1] > 0 ? SRC_LABEL[e[0][0]] : null
}

/** Inicialai vietoj trūkstamos nuotraukos — spalva iš vardo hash'o. */
const AVA_COLORS = ['#f97316', '#10b981', '#6366f1', '#ec4899', '#0ea5e9', '#eab308', '#8b5cf6', '#14b8a6']
function Ava({ name, image, size }: { name: string; image: string | null; size: number }) {
  if (image) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={proxyImg(image, size * 2)} alt="" loading="lazy" />
  }
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  const parts = name.trim().split(/\s+/)
  const ini = (parts[0]?.[0] || '?') + (parts[1]?.[0] || '')
  return (
    <span className="fl-ava-ini" style={{ background: AVA_COLORS[h % AVA_COLORS.length], fontSize: Math.round(size * 0.36) }}>
      {ini.toUpperCase()}
    </span>
  )
}

/** Skaičius „subėga" į vietą — juice'as, kad taškai jaustųsi gyvi. */
function CountUp({ value }: { value: number }) {
  const [shown, setShown] = useState(value)
  const prev = useRef(value)
  useEffect(() => {
    const from = prev.current
    prev.current = value
    if (from === value) { setShown(value); return }
    const t0 = performance.now()
    const dur = 750
    let raf = 0
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / dur)
      const eased = 1 - Math.pow(1 - k, 3)
      setShown(Math.round(from + (value - from) * eased))
      if (k < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [value])
  return <>{shown}</>
}

/** Countdown iki deadline: „2 d. 14 val." / „14 val. 05 min." */
function likoIki(deadlineIso: string): string {
  const ms = Date.parse(deadlineIso) - Date.now()
  if (ms <= 0) return 'skaičiuojama…'
  const min = Math.floor(ms / 60000)
  const d = Math.floor(min / 1440)
  const h = Math.floor((min % 1440) / 60)
  const m = min % 60
  if (d > 0) return `${d} d. ${h} val.`
  if (h > 0) return `${h} val. ${String(m).padStart(2, '0')} min.`
  return `${m} min.`
}

export default function VadybininkasClient() {
  const [data, setData] = useState<TeamData | null>(null)
  const [view, setView] = useState<View>('loading')
  const [error, setError] = useState<string | null>(null)

  // Vedlys
  const [teamName, setTeamName] = useState('')
  const [creating, setCreating] = useState(false)

  // Rinka
  const [market, setMarket] = useState<MarketArtist[]>([])
  const [marketTotal, setMarketTotal] = useState(0)
  const [marketPage, setMarketPage] = useState(0)
  const [marketQ, setMarketQ] = useState('')
  const [marketSort, setMarketSort] = useState<'populiariausi' | 'pigiausi' | 'forma' | 'siulomi'>('siulomi')
  const [tikIperkami, setTikIperkami] = useState(true)
  const [marketSalis, setMarketSalis] = useState<'visi' | 'lt' | 'uzsienio'>('visi')
  const [marketLoading, setMarketLoading] = useState(false)
  const [busyArtist, setBusyArtist] = useState<number | null>(null)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [boardTab, setBoardTab] = useState<'week' | 'month' | 'season'>('week')
  const [modal, setModal] = useState<'lyga' | 'info' | 'kapitonas' | null>(null)
  const [artistModal, setArtistModal] = useState<any>(null)   // {loading} | duomenys
  const [rivalModal, setRivalModal] = useState<any>(null)     // {loading} | {rival}

  // Privačios lygos
  const [activeLeague, setActiveLeague] = useState<number | null>(null) // null = visi
  const [leagueBoards, setLeagueBoards] = useState<Boards | null>(null)
  const [leagueName, setLeagueName] = useState('')
  const [leagueCode, setLeagueCode] = useState('')
  const [leagueBusy, setLeagueBusy] = useState(false)
  const [copiedCode, setCopiedCode] = useState<string | null>(null)

  // Countdown atsinaujina kas minutę
  const [, setTick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setTick(x => x + 1), 60000)
    return () => clearInterval(t)
  }, [])


  const team = data?.team
  const roster = data?.roster || []
  const rosterSize = data?.rosterSize || 5
  const slotsLeft = rosterSize - roster.length
  const rosterFull = !!team && slotsLeft === 0

  const load = useCallback(async (opts: { keepView?: boolean } = {}) => {
    try {
      const res = await fetch('/api/zaidimai/vadybininkas')
      const json: TeamData = await res.json()
      setData(json)
      if (!opts.keepView) {
        if (!json.team) setView('intro')
        else if ((json.roster || []).length === 0) setView('draft')
        else setView('valdymas') // startavus zaidziama ir su nepilna komanda — draft tik kol tuscia
      }
      return json
    } catch {
      setError('Nepavyko įkelti — pabandyk dar kartą')
      return null
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const loadMarket = useCallback(async (q: string, page: number, sort: string, salis: string, iperkami?: boolean, biudzetas?: number) => {
    setMarketLoading(true)
    try {
      const res = await fetch(`/api/zaidimai/vadybininkas/rinka?q=${encodeURIComponent(q)}&puslapis=${page}&rusiavimas=${sort}&salis=${salis}${iperkami ? `&tikIperkami=1&biudzetas=${biudzetas || 0}` : ''}`)
      const json = await res.json()
      setMarket(json.artists || [])
      setMarketTotal(json.total || 0)
      setMarketPage(page)
    } catch { /* paliekam esamą */ }
    setMarketLoading(false)
  }, [])

  const marketVisible = view === 'draft' || view === 'mainai'
  useEffect(() => {
    if (!marketVisible) return
    void loadMarket(marketQ, 0, marketSort, marketSalis, tikIperkami, team?.budgetLeft || 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [marketVisible, marketSort, marketSalis, tikIperkami])

  function onSearchChange(v: string) {
    setMarketQ(v)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => void loadMarket(v, 0, marketSort, marketSalis, tikIperkami, team?.budgetLeft || 0), 350)
  }

  async function openTeam(teamId?: number) {
    if (!teamId || teamId === team?.id) return
    setRivalModal({ loading: true })
    try {
      const res = await fetch(`/api/zaidimai/vadybininkas?komanda=${teamId}`)
      const json = await res.json()
      setRivalModal(res.ok ? json : { klaida: json.error || 'Nepavyko įkelti' })
    } catch { setRivalModal({ klaida: 'Tinklo klaida' }) }
  }

  async function openArtist(id: number) {
    setArtistModal({ loading: true })
    try {
      const res = await fetch(`/api/zaidimai/vadybininkas/atlikejas?id=${id}`)
      const json = await res.json()
      setArtistModal(res.ok ? json : { klaida: json.error || 'Nepavyko įkelti' })
    } catch { setArtistModal({ klaida: 'Tinklo klaida' }) }
  }

  async function createTeam() {
    if (creating) return
    if (teamName.trim().length < 2) { setError('Įrašyk komandos pavadinimą (2–30 simbolių)'); return }
    setCreating(true)
    setError(null)
    try {
      const res = await fetch('/api/zaidimai/vadybininkas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create', name: teamName.trim() }),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error || 'Nepavyko'); setCreating(false); return }
      await load({ keepView: true })
      setView('draft')
    } catch { setError('Tinklo klaida — pabandyk dar kartą') }
    setCreating(false)
  }

  async function doAction(action: 'sign' | 'release', artistId: number) {
    if (busyArtist) return
    setBusyArtist(artistId)
    setError(null)
    try {
      const res = await fetch('/api/zaidimai/vadybininkas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, artistId }),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error || 'Nepavyko'); setBusyArtist(null); return }
      const fresh = await load({ keepView: true })
      if (marketVisible) {
        await loadMarket(marketQ, marketPage, marketSort, marketSalis, tikIperkami, fresh?.team ? fresh.team.budget - (fresh.roster || []).reduce((x: number, r: any) => x + r.price, 0) : 0)
      }
    } catch { setError('Tinklo klaida — pabandyk dar kartą') }
    setBusyArtist(null)
  }

  async function setCaptain(artistId: number) {
    try {
      const res = await fetch('/api/zaidimai/vadybininkas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'captain', artistId }),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error || 'Nepavyko'); return }
      setModal(null)
      await load({ keepView: true })
    } catch { setError('Tinklo klaida — pabandyk dar kartą') }
  }

  async function leagueAction(action: 'league_create' | 'league_join' | 'league_leave', payload: any) {
    if (leagueBusy) return
    setLeagueBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/zaidimai/vadybininkas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...payload }),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error || 'Nepavyko'); setLeagueBusy(false); return }
      setLeagueName(''); setLeagueCode('')
      if (json.league) setActiveLeague(json.league.id)
      await load({ keepView: true })
    } catch { setError('Tinklo klaida — pabandyk dar kartą') }
    setLeagueBusy(false)
  }

  // Privačios lygos lentelė — atskiras fetch'as pagal pasirinktą lygą
  useEffect(() => {
    if (activeLeague == null) { setLeagueBoards(null); return }
    let cancelled = false
    setLeagueBoards(null)
    fetch(`/api/zaidimai/vadybininkas?lyga=${activeLeague}`)
      .then(r => r.json())
      .then(j => { if (!cancelled) setLeagueBoards(j.boards || null) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [activeLeague])

  // Vedlio žingsnio numeris antraštei
  const wizardStep = view === 'intro' ? 1 : view === 'draft' ? 2 : view === 'startas' ? 3 : 0

  const lastWeekTotal = roster.reduce((s, r) => s + (r.lastWeekPoints || 0), 0)

  return (
    <ZaidimoLangas
      title={view === 'valdymas' && team ? `🎵 ${team.name}` : view === 'mainai' ? '↔ Mainai' : 'Muzikos lyga'}
      right={wizardStep > 0 ? (
        <div className="fl-steps">
          {[1, 2, 3].map(n => (
            <span key={n} className={`fl-step-dot${wizardStep === n ? ' now' : ''}${wizardStep > n ? ' done' : ''}`}>
              {wizardStep > n ? '✓' : n}
            </span>
          ))}
        </div>
      ) : view === 'valdymas' ? (
        <button className="fl-icon-btn" onClick={() => setModal('lyga')} aria-label="Lygos lentelė">🏆</button>
      ) : null}
    >
      <style>{css}</style>

      {view === 'loading' && <div className="fl-center"><div className="fl-spinner" /></div>}

      {error && <div className="fl-error" onClick={() => setError(null)}>{error} ✕</div>}

      {/* ══════════ 1 ŽINGSNIS: kaip veikia + pavadinimas ══════════ */}
      {view === 'intro' && (
        <div className="fl-wizard">
          <h1 className="fl-h1">Muzikos lyga</h1>
          <p className="fl-lead">Sudaryk savo komandą iš realių atlikėjų — taškus jie neš pagal <b>tikrus rezultatus</b>.</p>

          <div className="fl-how">
            <div className="fl-how-card">
              <span className="fl-how-emoji">✍️</span>
              <b>1. Pasirašyk atlikėjus</b>
              <span>Nuo Lietuvos scenos iki pasaulio žvaigždžių — kiek telpa į biudžetą.</span>
            </div>
            <div className="fl-how-card">
              <span className="fl-how-emoji">📈</span>
              <b>2. Jie renka taškus patys</b>
              <span>Iš tikrų topų (TOP40, Billboard, Spotify), YouTube augimo ir naujų dainų — kas pirmadienį.</span>
            </div>
            <div className="fl-how-card">
              <span className="fl-how-emoji">🏆</span>
              <b>3. Kilk lygoje</b>
              <span>Savaitės, mėnesio ir sezono lentelės. Iki 3 mainų per savaitę.</span>
            </div>
          </div>

          {!data?.isAuthenticated && (
            <p className="fl-warn">⚠️ Žaidi kaip svečias — komanda pririšta prie šio įrenginio. <Link href="/auth/prisijungti">Prisijunk</Link>, kad jos neprarastum.</p>
          )}

          <label className="fl-label" htmlFor="fl-name">Tavo komandos pavadinimas</label>
          <div className="fl-create">
            <input
              id="fl-name"
              className="fl-input"
              placeholder="pvz. „Garažo imperija“"
              value={teamName}
              maxLength={30}
              onChange={e => setTeamName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') void createTeam() }}
            />
            <button className="fl-btn-primary" disabled={creating} onClick={createTeam}>
              {creating ? 'Kuriama…' : 'Toliau →'}
            </button>
          </div>

          <button className="fl-league-teaser" onClick={() => setModal('lyga')}>
            🏆 Lygos lentelė · {data?.boards.totalTeams || 0} komandų →
          </button>
        </div>
      )}

      {/* ══════════ 2 ŽINGSNIS: komandos surinkimas / MAINAI ══════════ */}
      {(view === 'draft' || view === 'mainai') && team && (
        <div className="fl-wizard">
          {view === 'draft'
            ? <h1 className="fl-h1">Surink komandą</h1>
            : <p className="fl-lead" style={{ marginBottom: 10 }}>Bakstelk atlikėją komandoje (viršuje) — paleisi; bakstelk rinkoje — pasirašysi. Liko mainų: <b>{team.transfersLeft}</b>.</p>}

          {/* Progresas + biudžetas — VISADA matomi (sticky) */}
          <div className="fl-draft-status">
            <div className="fl-slots">
              {Array.from({ length: rosterSize }).map((_, i) => {
                const r = roster[i]
                return r ? (
                  <button key={r.artistId} className="fl-slot filled" title={`${r.name} — paleisti`} onClick={() => { if (window.confirm(`Paleisti ${r.name} iš komandos?`)) void doAction('release', r.artistId) }}>
                    <Ava name={r.name} image={r.image} size={40} />
                    <i className="fl-slot-x">✕</i>
                  </button>
                ) : (
                  <span key={`e${i}`} className="fl-slot">+</span>
                )
              })}
              <span className="fl-slots-label">{roster.length}/{rosterSize}</span>
            </div>
            {view === 'draft' && <p className="fl-slots-hint">Nebūtina užpildyti visų {rosterSize} — startuok kad ir su vienu, kitus prisipirksi vėliau.</p>}
            {slotsLeft > 0 && team.budgetLeft < slotsLeft * 10 && (
              <p className="fl-slots-hint warn">⚠️ Liko {team.budgetLeft} tšk. {slotsLeft} laisvoms vietoms — pigiausias atlikėjas kainuoja 6 tšk.</p>
            )}
            <div className="fl-budget-line">
              <div className="fl-budget-bar"><div style={{ width: `${Math.min(100, (team.spent / team.budget) * 100)}%` }} /></div>
              <span className="fl-budget-num">💰 liko <b>{team.budgetLeft}</b></span>
            </div>
          </div>

          {/* Rinka — paieška ir filtrai VIRŠUJE */}
          <MarketPanel
            market={market}
            marketQ={marketQ}
            onSearchChange={onSearchChange}
            marketSalis={marketSalis}
            setMarketSalis={setMarketSalis}
            marketSort={marketSort}
            setMarketSort={setMarketSort}
            tikIperkami={tikIperkami}
            setTikIperkami={setTikIperkami}
            marketLoading={marketLoading}
            marketPage={marketPage}
            marketTotal={marketTotal}
            onPage={p => void loadMarket(marketQ, p, marketSort, marketSalis, tikIperkami, team.budgetLeft)}
            budgetLeft={team.budgetLeft}
            slotsLeft={slotsLeft}
            busyArtist={busyArtist}
            onSign={id => doAction('sign', id)}
            onRelease={id => doAction('release', id)}
          />

          <div className="fl-draft-done">
            {view === 'draft' && roster.length >= 1 && (
              <button className="fl-btn-primary big" onClick={() => setView('startas')}>
                {rosterFull ? 'Komanda paruošta →' : `Startuoti su ${roster.length} →`}
              </button>
            )}
            {view === 'mainai' && (
              <button className="fl-btn-primary big" onClick={() => { setView('valdymas'); void load({ keepView: true }) }}>Baigti mainus →</button>
            )}
          </div>
        </div>
      )}

      {/* ══════════ 3 ŽINGSNIS: startas ══════════ */}
      {view === 'startas' && team && (
        <div className="fl-wizard fl-startas">
          <span className="fl-start-emoji">🎉</span>
          <h1 className="fl-h1">„{team.name}“ — lygoje!</h1>
          <div className="fl-team-row">
            {roster.map(r => (
              <div key={r.artistId} className="fl-team-avatar">
                <span className="fl-ta-wrap"><Ava name={r.name} image={r.image} size={62} /></span>
                <i>{r.name}</i>
              </div>
            ))}
          </div>
          {lastWeekTotal > 0 && (
            <p className="fl-start-line">Praėjusią savaitę ši komanda būtų surinkusi <b>{lastWeekTotal} tšk.</b></p>
          )}
          <p className="fl-start-line dim">Taškai skaičiuojami kas pirmadienį. Užsuk kasdien — matysi, kaip komandai sekasi dabar.</p>
          <button className="fl-btn-primary big" onClick={() => setView('valdymas')}>Į komandos valdymą →</button>
        </div>
      )}

      {/* ══════════ VALDYMAS ══════════ */}
      {view === 'valdymas' && team && (
        <div className="fl-desk">
        <div className="fl-desk-main">
          {/* 1. VIENA tiesos kortelė: live taškai + deadline countdown */}
          <div className="fl-live-hero">
            <div className="fl-live-main">
              <span className="fl-live-lbl"><i className="fl-live-dot" /> Šią savaitę · LIVE</span>
              <span className="fl-live-num"><CountUp value={team.liveWeekPoints} /><i>tšk.</i></span>
              {data?.deadline && (
                <span className="fl-live-deadline">🔒 Fiksuojama pirmadienį — liko <b>{likoIki(data.deadline)}</b></span>
              )}
            </div>
            <div className="fl-live-side">
              <button className="fl-live-cell" onClick={() => setModal('lyga')}>
                <b>{(() => { const w = data!.boards.week; const i = w.findIndex(r => r.isMe); return i >= 0 ? `#${i + 1}` : '—' })()}</b>
                <span>{(() => {
                  const w = data!.boards.week
                  const i = w.findIndex(r => r.isMe)
                  if (i > 0) return `iki #${i}: ${w[i - 1].points - w[i].points + 1} tšk.`
                  if (i === 0) return 'savaitės lyderis! 🔥'
                  return 'savaitės vieta'
                })()}</span>
              </button>
              <button className="fl-live-cell" onClick={() => setModal('lyga')}>
                <b>{team.seasonPoints}</b>
                <span>sezono taškai{team.seasonRank ? ` · #${team.seasonRank}` : ''}</span>
              </button>
            </div>
          </div>

          {/* 3. Naujos komandos padrąsinimas */}
          {team.weeks.length === 0 && (
            <div className="fl-firsttime">
              Komanda sudaryta! Kol kas taškų dar nėra — jie atsiras po pirmo skaičiavimo. Iki tol gali laisvai keisti sudėtį.
            </div>
          )}

          {/* 4. Savaičių istorija (kai jau yra) */}
          {team.weeks.length > 1 && (
            <div className="fl-hist">
              <div className="fl-hist-head">Savaičių taškai</div>
              <div className="fl-chart">
                {[...team.weeks].reverse().map((w, i, arr) => {
                  const mx = Math.max(1, ...arr.map(x => x.points))
                  const paskutinis = i === arr.length - 1
                  return (
                    <div key={w.week_start} className="fl-chart-col" title={`${w.week_start}: ${w.points} tšk.`}>
                      {paskutinis && <span className="fl-chart-val">{w.points}</span>}
                      <i style={{ height: `${Math.max(4, (w.points / mx) * 100)}%` }} className={paskutinis ? 'now' : ''} />
                      <span className="fl-chart-lbl">{w.week_start.slice(5)}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* 4b. Šios savaitės realūs įvykiai */}
          <div className="fl-feed">
            <div className="fl-hist-head">📡 Šios savaitės įvykiai</div>
            {(data?.events || []).length === 0 ? (
              <div className="fl-feed-empty">Kol kas tylu — kai tavo atlikėjai pajudės topuose, išleis dainą ar augs YouTube, matysi čia.</div>
            ) : (
              <ul className="fl-feed-list">
                {(data!.events || []).slice(0, 8).map((e, i) => (
                  <li key={i} className="fl-feed-row" onClick={() => void openArtist(e.artistId)}>
                    <span className="fl-feed-img"><Ava name={e.name} image={e.image} size={34} /></span>
                    <span className="fl-feed-body"><b>{e.name}</b> · {e.text}</span>
                    {e.pts ? <em className="fl-feed-pts">+{e.pts}</em> : <i className={`dot ${e.cat === 'chart' ? 'chart' : e.cat === 'rel' ? 'rel' : 'yt'}`} />}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* 4c. Kapitonas — vienas strateginis sprendimas */}
          <button className="fl-captain-bar" onClick={() => setModal('kapitonas')}>
            👑 Kapitonas:{' '}
            {team.captainArtistId
              ? (() => {
                  const kap = roster.find(r => r.artistId === team.captainArtistId)
                  return <b>{kap?.name || '—'} <em>×2 taškai</em>{kap?.countsFromNextWeek ? <em style={{ background: 'rgba(239,68,68,0.12)', color: '#b91c1c' }}>nuo pirmadienio</em> : null}</b>
                })()
              : <b className="fl-captain-none">nepaskirtas — pasirink ir gauk ×2 taškus!</b>}
            <span className="fl-captain-go">›</span>
          </button>

          {/* 5. Komanda */}
          <div className="fl-sec-head">
            <h2 className="fl-h2">Tavo komanda <span className="fl-sec-count">{roster.length}/{rosterSize}</span></h2>
            <button className="fl-btn-market" onClick={() => setView('mainai')}>↔ Keisti sudėtį</button>
          </div>

          <div className="fl-roster">
            {roster.map(r => {
              const src = topSource(r.liveBreakdown)
              const statusas = r.countsFromNextWeek
                ? `Skaičiuosis nuo pirmadienio${r.livePoints > 0 ? ` · dabar būtų +${r.livePoints}` : ''}`
                : r.livePoints > 0
                ? (src ? `Daugiausia iš ${src}` : 'Renka taškus')
                : 'Šią savaitę dar tylu'
              const rodomiTsk = r.isCaptain ? r.livePoints * 2 : r.livePoints
              return (
                <button key={r.artistId} className={`fl-p${r.isCaptain ? ' cap' : ''}`} onClick={() => void openArtist(r.artistId)}>
                  <span className="fl-p-img">
                    <Ava name={r.name} image={r.image} size={46} />
                    {r.isCaptain && <em className="fl-p-cap">👑</em>}
                  </span>
                  <span className="fl-p-mid">
                    <span className="fl-p-name">{r.name}{r.isCaptain && <i className="fl-x2">×2</i>}</span>
                    <span className={`fl-p-status${r.countsFromNextWeek ? ' new' : ''}`}>{statusas}</span>
                  </span>
                  <span className={`fl-p-pts${r.countsFromNextWeek ? ' pending' : ''}`}>
                    <b>{rodomiTsk}</b>
                    <i>tšk. ›</i>
                  </span>
                </button>
              )
            })}
            {slotsLeft > 0 && (
              <button className="fl-p fl-p-add" onClick={() => setView('mainai')}>
                <span className="fl-p-plus">+</span>
                <span className="fl-p-addlbl">Laisva vieta — pasirašyk atlikėją</span>
                <span className="fl-p-addgo">›</span>
              </button>
            )}
          </div>

        </div>{/* /fl-desk-main */}

        {/* ── Dešinė juosta: lyga visada matoma ── */}
        <aside className="fl-desk-rail">
          <div className="fl-rail-league">
            <div className="fl-rail-head">
              <span className="fl-hist-head" style={{ margin: 0 }}>🏆 Lyga · savaitė LIVE</span>
              <button className="fl-rail-more" onClick={() => setModal('lyga')}>Visa →</button>
            </div>
            <ol className="fl-board-list">
              {data!.boards.week.slice(0, 9).map((r, i) => (
                <li key={i}>
                  <button className={`fl-board-row btn${r.isMe ? ' me' : ''}`} onClick={() => r.isMe ? setModal('lyga') : void openTeam(r.teamId)}>
                    <span className={`fl-rank r${i + 1}`}>{i + 1}</span>
                    <span className="fl-board-name">{r.name}{r.isMe ? ' (tu)' : ''}{r.isBot ? <i className="fl-bot"> 🤖</i> : null}</span>
                    <span className="fl-board-pts">{r.points}</span>
                  </button>
                </li>
              ))}
            </ol>
            <p className="fl-rail-hint">Bakstelk komandą — pamatysi jos sudėtį</p>
          </div>
          <div className="fl-more-row">
            <button className="fl-more-btn" onClick={() => setModal('info')}>ℹ️ Kaip renkami taškai</button>
          </div>
        </aside>
        </div>
      )}

      {/* ── Atlikėjo kortelė ── */}
      {artistModal && (
        <div className="fl-modal-back" onClick={() => setArtistModal(null)}>
          <div className="fl-modal" onClick={e => e.stopPropagation()}>
            <button className="fl-modal-x" onClick={() => setArtistModal(null)} aria-label="Uždaryti">✕</button>
            {artistModal.loading && <div className="fl-center small"><div className="fl-spinner" /></div>}
            {artistModal.klaida && <div className="fl-error">{artistModal.klaida}</div>}
            {artistModal.artist && (
              <div className="fl-artist">
                <div className="fl-artist-head">
                  <span className="fl-player-img big">
                    <Ava name={artistModal.artist.name} image={artistModal.artist.image} size={58} />
                  </span>
                  <div>
                    <b className="fl-artist-name">{artistModal.artist.name}</b>
                    <span className="fl-artist-meta">{artistModal.artist.country} · kaina dabar {artistModal.artist.price} tšk.</span>
                  </div>
                </div>

                {artistModal.live && (
                  <>
                    <div className="fl-artist-live">Ši savaitė: <b>{artistModal.live.total} tšk.</b></div>
                    <div className="fl-artist-breakdown">
                      <span><i className="dot chart" /> Topai {artistModal.live.chart}</span>
                      <span><i className="dot yt" /> YouTube {artistModal.live.yt}</span>
                      <span><i className="dot rel" /> Naujos dainos {artistModal.live.rel}</span>
                      <span><i className="dot base" /> Bazė {artistModal.live.base}</span>
                    </div>
                  </>
                )}

                {(artistModal.weeks || []).length > 1 && (
                  <>
                    <div className="fl-artist-sub">Savaitiniai taškai</div>
                    <div className="fl-chart">
                      {artistModal.weeks.map((w: any, i: number) => {
                        const mx = Math.max(1, ...artistModal.weeks.map((x: any) => x.points))
                        const paskutinis = i === artistModal.weeks.length - 1
                        return (
                          <div key={w.week} className="fl-chart-col" title={`${w.week}: ${w.points} tšk.`}>
                            {paskutinis && <span className="fl-chart-val">{w.points}</span>}
                            <i style={{ height: `${Math.max(4, (w.points / mx) * 100)}%` }} className={paskutinis ? 'now' : ''} />
                            <span className="fl-chart-lbl">{w.week.slice(5)}</span>
                          </div>
                        )
                      })}
                    </div>
                  </>
                )}

                {(artistModal.events || []).length > 0 && (
                  <>
                    <div className="fl-artist-sub">Realūs įvykiai</div>
                    <ul className="fl-artist-events">
                      {artistModal.events.map((e: any, i: number) => (
                        <li key={i}><span>{e.week.slice(5)}</span> {e.text}</li>
                      ))}
                    </ul>
                  </>
                )}

                <Link href={`/atlikejai/${artistModal.artist.slug}`} className="fl-artist-link">Atlikėjo puslapis →</Link>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Varžovo komanda ── */}
      {rivalModal && (
        <div className="fl-modal-back" onClick={() => setRivalModal(null)}>
          <div className="fl-modal" onClick={e => e.stopPropagation()}>
            <button className="fl-modal-x" onClick={() => setRivalModal(null)} aria-label="Uždaryti">✕</button>
            {rivalModal.loading && <div className="fl-center small"><div className="fl-spinner" /></div>}
            {rivalModal.klaida && <div className="fl-error">{rivalModal.klaida}</div>}
            {rivalModal.rival && (
              <div>
                <h2 className="fl-h2">{rivalModal.rival.name}{rivalModal.rival.isBot ? ' 🤖' : ''}</h2>
                <p className="fl-dim" style={{ margin: '4px 0 14px' }}>
                  Šią savaitę: <b style={{ color: '#10b981' }}>{rivalModal.rival.weekPoints ?? '—'} tšk.</b>
                  {rivalModal.rival.isBot ? ' · kompiuterio valdoma komanda' : ''}
                </p>
                <div className="fl-roster">
                  {rivalModal.rival.roster.map((r: any) => (
                    <button key={r.artistId} className={`fl-p${r.isCaptain ? ' cap' : ''}`} onClick={() => { setRivalModal(null); void openArtist(r.artistId) }}>
                      <span className="fl-p-img"><Ava name={r.name} image={r.image} size={46} /></span>
                      <span className="fl-p-mid">
                        <span className="fl-p-name">{r.name}{r.isCaptain && <i className="fl-x2">×2</i>}</span>
                        <span className="fl-p-status">kaina {r.price} tšk.</span>
                      </span>
                      <span className="fl-p-pts"><b>{r.livePoints}</b><i>tšk. ›</i></span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Modalai ── */}
      {modal && (
        <div className="fl-modal-back" onClick={() => setModal(null)}>
          <div className="fl-modal" onClick={e => e.stopPropagation()}>
            <button className="fl-modal-x" onClick={() => setModal(null)} aria-label="Uždaryti">✕</button>
            {modal === 'lyga' && (
              <>
                {(data?.leagues || []).length > 0 && (
                  <div className="fl-ltabs">
                    <button className={activeLeague == null ? 'on' : ''} onClick={() => setActiveLeague(null)}>🌍 Visi</button>
                    {(data!.leagues || []).map(l => (
                      <button key={l.id} className={activeLeague === l.id ? 'on' : ''} onClick={() => setActiveLeague(l.id)}>{l.name}</button>
                    ))}
                  </div>
                )}
                {activeLeague != null && !leagueBoards
                  ? <div className="fl-center small"><div className="fl-spinner" /></div>
                  : <LeagueBoards boards={activeLeague != null ? leagueBoards! : data!.boards} tab={boardTab} setTab={setBoardTab} onTeam={id => { setModal(null); void openTeam(id) }} />}

                {activeLeague != null && (() => {
                  const lg = (data?.leagues || []).find(l => l.id === activeLeague)
                  return lg ? (
                    <div className="fl-lg-meta">
                      <button
                        className="fl-lg-code"
                        onClick={() => { void navigator.clipboard?.writeText(lg.code).then(() => { setCopiedCode(lg.code); setTimeout(() => setCopiedCode(null), 1600) }) }}
                      >
                        Kodas: <b>{lg.code}</b> {copiedCode === lg.code ? '✓ nukopijuota' : '⧉'}
                      </button>
                      <span className="fl-dim">{lg.members} dalyviai</span>
                      <button className="fl-lg-leave" onClick={() => { setActiveLeague(null); void leagueAction('league_leave', { leagueId: lg.id }) }}>Išeiti</button>
                    </div>
                  ) : null
                })()}

                {team && (
                  <div className="fl-lg-new">
                    <div className="fl-hist-head">Draugų lyga</div>
                    <p className="fl-dim" style={{ margin: '2px 0 8px' }}>Sukurk privačią lygą ir pasidalink kodu — varžykis su draugais.</p>
                    <div className="fl-lg-forms">
                      <div className="fl-lg-form">
                        <input className="fl-input sm" placeholder="Naujos lygos pavadinimas" value={leagueName} maxLength={40} onChange={e => setLeagueName(e.target.value)} />
                        <button className="fl-btn-primary sm" disabled={leagueBusy || leagueName.trim().length < 2} onClick={() => void leagueAction('league_create', { name: leagueName.trim() })}>Sukurti</button>
                      </div>
                      <div className="fl-lg-form">
                        <input className="fl-input sm" placeholder="Draugo lygos kodas" value={leagueCode} maxLength={6} onChange={e => setLeagueCode(e.target.value.toUpperCase())} />
                        <button className="fl-btn-primary sm ghost" disabled={leagueBusy || leagueCode.trim().length !== 6} onClick={() => void leagueAction('league_join', { code: leagueCode.trim() })}>Prisijungti</button>
                      </div>
                    </div>
                  </div>
                )}

                {team && team.weeks.length > 0 && (
                  <div className="fl-weeks">
                    <h2 className="fl-h2">Tavo turai</h2>
                    <div className="fl-weeks-row">
                      {team.weeks.map(w => (
                        <div key={w.week_start} className={`fl-week-chip${w.live ? ' live' : ''}`}>
                          <span>{w.live ? 'LIVE' : w.week_start.slice(5)}</span>
                          <b>{w.points}</b>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
            {modal === 'kapitonas' && team && (
              <div className="fl-cap-modal">
                <h2 className="fl-h2">👑 Kapitonas — ×2 taškai</h2>
                <p className="fl-dim" style={{ margin: '6px 0 12px' }}>Kapitono savaitės taškai dvigubinami. Keisti gali bet kada iki pirmadienio.</p>
                <div className="fl-roster">
                  {roster.map(r => (
                    <button key={r.artistId} className={`fl-p${r.isCaptain ? ' cap' : ''}`} onClick={() => void setCaptain(r.isCaptain ? 0 : r.artistId)}>
                      <span className="fl-p-img"><Ava name={r.name} image={r.image} size={46} /></span>
                      <span className="fl-p-mid">
                        <span className="fl-p-name">{r.name}</span>
                        <span className={`fl-p-status${r.countsFromNextWeek ? ' new' : ''}`}>
                          {r.countsFromNextWeek ? '⚠️ skaičiuosis tik nuo pirmadienio' : `šią sav. ${r.livePoints} tšk.${r.lastWeekPoints != null ? ` · pr. sav. ${r.lastWeekPoints}` : ''}`}
                        </span>
                      </span>
                      <span className="fl-p-pts">{r.isCaptain ? <b style={{ fontSize: 15 }}>👑 ✕</b> : <i>skirti ›</i>}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {modal === 'info' && (
              <div className="fl-info">
                <h2 className="fl-h2">Kaip skaičiuojami taškai?</h2>
                <p>Kiekvienas tavo atlikėjas kas pirmadienį gauna taškus iš <b>realių praėjusios savaitės rezultatų</b>:</p>
                <ul>
                  <li><i className="dot chart" /> <b>Topai</b> — vietos music.lt TOP40/TOP30 ir pasaulio topuose (Billboard, Spotify, Apple)</li>
                  <li><i className="dot yt" /> <b>YouTube</b> — peržiūrų augimas</li>
                  <li><i className="dot rel" /> <b>Naujos dainos</b> — išleistos tą savaitę</li>
                  <li><i className="dot base" /> <b>Bazė</b> — bendras atlikėjo populiarumas</li>
                </ul>
                <p>„Ši savaitė" — tarpinis skaičius, galutinis užfiksuojamas pirmadienio rytą.
                Naujai pasirašyti atlikėjai taškus neša nuo kito pirmadienio (išskyrus pirmąją komandos savaitę).
                Mainų — iki 3 per savaitę. 👑 Kapitono taškai dvigubinami.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </ZaidimoLangas>
  )
}

// ── Rinkos panelė (bendrai vedliui ir mainams) ────────────────────────────

function MarketPanel(props: {
  market: MarketArtist[]
  marketQ: string
  onSearchChange: (v: string) => void
  marketSalis: 'visi' | 'lt' | 'uzsienio'
  setMarketSalis: (v: 'visi' | 'lt' | 'uzsienio') => void
  marketSort: 'populiariausi' | 'pigiausi' | 'forma' | 'siulomi'
  setMarketSort: (v: 'populiariausi' | 'pigiausi' | 'forma' | 'siulomi') => void
  tikIperkami: boolean
  setTikIperkami: (v: boolean) => void
  marketLoading: boolean
  marketPage: number
  marketTotal: number
  onPage: (p: number) => void
  budgetLeft: number
  slotsLeft: number
  busyArtist: number | null
  onSign: (id: number) => void
  onRelease: (id: number) => void
  releaseHint?: string
}) {
  const {
    market, marketQ, onSearchChange, marketSalis, setMarketSalis, marketSort, setMarketSort,
    tikIperkami, setTikIperkami,
    marketLoading, marketPage, marketTotal, onPage, budgetLeft, slotsLeft, busyArtist, onSign, onRelease,
  } = props

  return (
    <div className="fl-market">
      {/* Paieška + filtrai VIRŠUJE */}
      <input
        className="fl-input fl-market-search"
        placeholder="🔍 Ieškok atlikėjo — pvz. Jessica Shy, Queen…"
        value={marketQ}
        onChange={e => onSearchChange(e.target.value)}
      />
      <div className="fl-filters">
        <div className="fl-tabs">
          <button className={marketSalis === 'visi' ? 'on' : ''} onClick={() => setMarketSalis('visi')}>🌍 Visi</button>
          <button className={marketSalis === 'lt' ? 'on' : ''} onClick={() => setMarketSalis('lt')}>🇱🇹 Lietuva</button>
          <button className={marketSalis === 'uzsienio' ? 'on' : ''} onClick={() => setMarketSalis('uzsienio')}>Užsienio</button>
        </div>
        <div className="fl-tabs">
          <button className={marketSort === 'siulomi' ? 'on' : ''} onClick={() => setMarketSort('siulomi')}>✨ Siūlomi</button>
          <button className={marketSort === 'forma' ? 'on' : ''} onClick={() => setMarketSort('forma')}>📈 Geriausia forma</button>
          <button className={marketSort === 'populiariausi' ? 'on' : ''} onClick={() => setMarketSort('populiariausi')}>⭐ Populiariausi</button>
          <button className={marketSort === 'pigiausi' ? 'on' : ''} onClick={() => setMarketSort('pigiausi')}>💸 Pigiausi</button>
        </div>
        <div className="fl-tabs">
          <button className={tikIperkami ? 'on' : ''} onClick={() => setTikIperkami(!tikIperkami)}>💰 Man įperkami — iki {budgetLeft} tšk.</button>
        </div>
      </div>

      {marketLoading && <div className="fl-center small"><div className="fl-spinner" /></div>}
      {!marketLoading && market.length === 0 && (
        <div className="fl-market-empty">
          {tikIperkami && marketSort !== 'pigiausi' ? (
            <>
              <p>Šiame sąraše nieko už ≤{budgetLeft} tšk. — populiarūs ir geros formos atlikėjai kainuoja daugiau.</p>
              <button className="fl-btn-primary sm" onClick={() => setMarketSort('pigiausi')}>Rodyti pigiausius →</button>
            </>
          ) : (
            <p>Nieko nerasta — pabandyk kitą paiešką ar filtrą.</p>
          )}
        </div>
      )}

      {/* Kortelės gridu — nuotrauka, kaina, forma */}
      <div className="fl-market-grid">
        {market.map(a => {
          const affordable = a.price <= budgetLeft
          const canSign = !a.onMyRoster && slotsLeft > 0 && affordable
          return (
            <button
              key={a.id}
              className={`fl-mcard${a.onMyRoster ? ' mine' : ''}${!canSign && !a.onMyRoster ? ' off' : ''}`}
              disabled={busyArtist === a.id}
              title={a.onMyRoster ? 'Paleisti iš komandos' : !affordable ? `Per brangu (${a.price} tšk.)` : slotsLeft <= 0 ? (props.releaseHint || 'Komanda pilna') : 'Pasirašyti'}
              onClick={() => (a.onMyRoster ? (window.confirm(`Paleisti ${a.name} iš komandos?`) && onRelease(a.id)) : canSign ? onSign(a.id) : undefined)}
            >
              <span className="fl-mcard-img">
                <Ava name={a.name} image={a.image} size={62} />
                {a.trending && <em className="fl-mcard-trend">📈</em>}
                {a.onMyRoster && <em className="fl-mcard-mine">✓</em>}
              </span>
              <span className="fl-mcard-name">{a.name}</span>
              <span className="fl-mcard-meta">pr. sav. <b>{a.lastWeekPoints ?? 0}</b> tšk. · {a.country === 'LT' ? '🇱🇹' : '🌍'}</span>
              <span className={`fl-mcard-price${!affordable && !a.onMyRoster ? ' expensive' : ''}`}>
                {a.onMyRoster ? 'Paleisti ✕' : `${a.price} tšk.`}
                {!a.onMyRoster && (a.priceDelta || 0) !== 0 && (
                  <em className={`fl-mcard-delta${(a.priceDelta || 0) > 0 ? ' up' : ' down'}`}>{(a.priceDelta || 0) > 0 ? `▲${a.priceDelta}` : `▼${Math.abs(a.priceDelta || 0)}`}</em>
                )}
              </span>
            </button>
          )
        })}
      </div>

      <div className="fl-pager">
        <button disabled={marketPage === 0 || marketLoading} onClick={() => onPage(marketPage - 1)}>← Ankstesni</button>
        <span className="fl-dim">{Math.min(marketPage * 30 + 1, marketTotal)}–{Math.min((marketPage + 1) * 30, marketTotal)} iš {marketTotal}</span>
        <button disabled={(marketPage + 1) * 30 >= marketTotal || marketLoading} onClick={() => onPage(marketPage + 1)}>Kiti →</button>
      </div>
    </div>
  )
}

// ── Lygos lentelės ────────────────────────────────────────────────────────

function LeagueBoards({ boards, tab, setTab, compact, onTeam }: {
  boards?: Boards
  tab: 'week' | 'month' | 'season'
  setTab: (t: 'week' | 'month' | 'season') => void
  compact?: boolean
  onTeam?: (teamId?: number) => void
}) {
  if (!boards) return null
  const rows = boards[tab]
  return (
    <div className={`fl-league${compact ? ' compact' : ''}`}>
      <div className="fl-league-head">
        <h2 className="fl-h2">Lygos lentelė</h2>
        <span className="fl-dim">{boards.totalTeams} komandų</span>
      </div>
      <div className="fl-tabs">
        <button className={tab === 'week' ? 'on' : ''} onClick={() => setTab('week')}>{boards.weekIsLive ? 'Savaitė · LIVE' : 'Savaitė'}</button>
        <button className={tab === 'month' ? 'on' : ''} onClick={() => setTab('month')}>Mėnuo</button>
      </div>
      {rows.length === 0 ? (
        <div className="fl-dim" style={{ padding: '10px 0' }}>
          {tab === 'week' ? 'Savaitės taškai kaupiasi — lentelė atsinaujina kasdien.' : 'Lyga tik prasideda — būk tarp pirmųjų!'}
        </div>
      ) : (
        <ol className="fl-board-list">
          {rows.map((r, i) => (
            <li key={i}>
              <button className={`fl-board-row btn${r.isMe ? ' me' : ''}`} onClick={() => !r.isMe && onTeam?.(r.teamId)}>
                <span className={`fl-rank r${i + 1}`}>{i + 1}</span>
                <span className="fl-board-name">{r.name}{r.isMe ? ' (tu)' : ''}{r.isBot ? <i className="fl-bot" title="Kompiuterio komanda"> 🤖</i> : null}</span>
                <span className="fl-board-pts">{r.points} tšk.</span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

const css = `
.fl-steps { display: flex; gap: 6px; }
.fl-icon-btn { font-size: 18px; background: var(--bg-surface); border: 1px solid rgba(140,160,190,0.22); border-radius: 12px; width: 36px; height: 36px; cursor: pointer; }
.fl-league-teaser {
  display: block; width: 100%; text-align: left; margin-top: 20px; cursor: pointer;
  font-size: 14px; font-weight: 800; color: var(--text-primary);
  background: var(--bg-surface); border: 1px solid rgba(140,160,190,0.2); border-radius: 13px; padding: 14px 16px;
}
.fl-more-row { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 4px; }
.fl-more-btn {
  flex: 1; min-width: 150px; font-size: 14px; font-weight: 800; color: var(--text-primary); cursor: pointer;
  background: var(--bg-surface); border: 1px solid rgba(140,160,190,0.22); border-radius: 13px; padding: 13px 14px;
}
.fl-modal-back {
  position: fixed; inset: 0; z-index: 60; background: rgba(8,10,15,0.6); backdrop-filter: blur(3px);
  display: flex; align-items: flex-end; justify-content: center;
}
@media (min-width: 640px) { .fl-modal-back { align-items: center; } }
.fl-modal {
  position: relative; width: 100%; max-width: 560px; max-height: 82vh; overflow-y: auto;
  background: var(--bg-body); border: 1px solid rgba(140,160,190,0.25);
  border-radius: 20px 20px 0 0; padding: 20px 18px calc(20px + env(safe-area-inset-bottom));
}
@media (min-width: 640px) { .fl-modal { border-radius: 20px; } }
.fl-modal-x { position: absolute; top: 12px; right: 12px; width: 32px; height: 32px; border-radius: 10px; background: var(--bg-surface); border: 1px solid rgba(140,160,190,0.25); color: var(--text-primary); font-weight: 800; cursor: pointer; }
.fl-info p { font-size: 14px; color: var(--text-secondary); line-height: 1.55; margin: 10px 0; }
.fl-info b { color: var(--text-primary); }
.fl-info ul { list-style: none; margin: 10px 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.fl-info li { font-size: 14px; color: var(--text-secondary); }
.fl-info .dot, .fl-modal .dot { display: inline-block; width: 9px; height: 9px; border-radius: 3px; margin-right: 6px; }
.dot.chart { background: var(--accent-orange); }
.dot.yt { background: #ef4444; }
.dot.rel { background: var(--accent-link); }
.dot.base { background: #64748b; }
.fl-step-dot {
  width: 26px; height: 26px; border-radius: 50%; display: flex; align-items: center; justify-content: center;
  font-size: 12px; font-weight: 900; color: var(--text-muted);
  background: var(--bg-surface); border: 1px solid rgba(140,160,190,0.3);
}
.fl-step-dot.now { color: #fff; background: #10b981; border-color: #10b981; }
.fl-step-dot.done { color: #10b981; border-color: rgba(16,185,129,0.5); }

.fl-h1 { font-size: 30px; font-weight: 900; letter-spacing: -0.02em; color: var(--text-primary); margin: 0 0 10px; }
.fl-h2 { font-size: 20px; font-weight: 900; color: var(--text-primary); margin: 0; }
.fl-lead { font-size: 16px; color: var(--text-secondary); line-height: 1.55; margin: 0 0 18px; }
.fl-lead b { color: var(--text-primary); }
.fl-dim { font-size: 12px; color: var(--text-muted); }
.fl-label { display: block; font-size: 14px; font-weight: 800; color: var(--text-primary); margin-bottom: 8px; }

.fl-center { display: flex; justify-content: center; padding: 70px 0; }
.fl-center.small { padding: 20px 0; }
.fl-spinner { width: 38px; height: 38px; border-radius: 50%; border: 3px solid rgba(148,163,184,0.25); border-top-color: #10b981; animation: flspin .8s linear infinite; }
@keyframes flspin { to { transform: rotate(360deg); } }
.fl-error { font-size: 14px; color: #f87171; background: rgba(248,113,113,0.1); border-radius: 10px; padding: 10px 14px; margin-bottom: 12px; cursor: pointer; }
.fl-warn { font-size: 12px; color: var(--text-secondary); background: rgba(245,158,11,0.1); border: 1px solid rgba(245,158,11,0.35); border-radius: 10px; padding: 9px 12px; margin-bottom: 16px; }
.fl-warn a { color: var(--accent-orange); font-weight: 800; }

/* ── 1 žingsnis: kaip veikia ── */
.fl-how { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 18px; }
@media (max-width: 620px) { .fl-how { grid-template-columns: 1fr; } }
.fl-how-card {
  display: flex; flex-direction: column; gap: 5px; padding: 16px 14px; border-radius: 15px;
  background: var(--bg-surface); border: 1px solid rgba(140,160,190,0.2);
}
.fl-how-emoji { font-size: 26px; }
.fl-how-card b { font-size: 16px; color: var(--text-primary); }
.fl-how-card span:last-child { font-size: 12px; color: var(--text-secondary); line-height: 1.45; }

.fl-create { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 12px; }
.fl-input {
  flex: 1; min-width: 220px; font-size: 16px; color: var(--text-primary);
  background: var(--bg-surface); border: 1px solid rgba(140,160,190,0.3); border-radius: 12px; padding: 12px 14px;
}
.fl-input:focus { outline: none; border-color: #10b981; }
.fl-btn-primary {
  font-size: 16px; font-weight: 800; color: #fff; cursor: pointer; border: 0; border-radius: 12px; padding: 12px 22px;
  background: var(--accent-orange);
}
.fl-btn-primary:disabled { opacity: 0.5; }
.fl-btn-primary.big { font-size: 18px; padding: 15px 34px; border-radius: 999px; }

/* ── 2 žingsnis: draft status (sticky) ── */
.fl-draft-status {
  position: sticky; top: -16px; z-index: 8; background: var(--bg-body);
  padding: 10px 0 12px; margin-bottom: 4px; border-bottom: 1px solid rgba(140,160,190,0.15);
}
.fl-slots { display: flex; align-items: center; flex-wrap: wrap; gap: 7px; margin-bottom: 10px; }
.fl-slot {
  position: relative; width: 40px; height: 40px; border-radius: 50%; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center; overflow: hidden;
  border: 2px dashed rgba(140,160,190,0.4); color: var(--text-muted); font-size: 16px; background: transparent;
}
.fl-slot.filled { border: 2px solid #10b981; cursor: pointer; }
.fl-slot.filled img { width: 100%; height: 100%; object-fit: cover; }
.fl-slot-x {
  position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
  background: rgba(239,68,68,0.75); color: #fff; font-style: normal; font-weight: 900; opacity: 0; transition: opacity .15s;
}
.fl-slot.filled:hover .fl-slot-x { opacity: 1; }
.fl-slots-label { font-size: 16px; font-weight: 900; color: var(--text-primary); margin-left: 4px; }
.fl-budget-line { display: flex; align-items: center; gap: 12px; }
.fl-budget-bar { flex: 1; height: 10px; border-radius: 5px; background: rgba(148,163,184,0.18); overflow: hidden; }
.fl-budget-bar div { height: 100%; background: var(--accent-orange); transition: width .25s ease; }
.fl-budget-num { font-size: 14px; color: var(--text-secondary); white-space: nowrap; }
.fl-budget-num b { font-size: 16px; color: var(--text-primary); }
.fl-draft-done { position: sticky; bottom: 0; display: flex; justify-content: center; margin-top: 16px; padding: 26px 0 14px; pointer-events: none; background: linear-gradient(to top, var(--bg-body) 55%, transparent); }
.fl-draft-done button { pointer-events: auto; }

/* ── v3: LIVE hero ── */
.fl-live-hero { display: flex; gap: 12px; align-items: stretch; background: var(--bg-surface); border: 1px solid rgba(16,185,129,0.4); border-radius: 16px; padding: 16px; margin-bottom: 12px; flex-wrap: wrap; }
.fl-live-main { flex: 1.4; min-width: 200px; display: flex; flex-direction: column; gap: 4px; }
.fl-live-lbl { display: flex; align-items: center; gap: 7px; font-size: 11px; font-weight: 900; letter-spacing: 0.06em; text-transform: uppercase; color: #10b981; }
.fl-live-dot { width: 8px; height: 8px; border-radius: 50%; background: #10b981; animation: flpulse 1.6s ease-in-out infinite; }
@keyframes flpulse { 0%,100% { opacity: 1; } 50% { opacity: 0.35; } }
.fl-live-num { font-size: 44px; font-weight: 900; color: var(--text-primary); line-height: 1; }
.fl-live-num i { font-style: normal; font-size: 15px; font-weight: 700; color: var(--text-muted); margin-left: 6px; }
.fl-live-deadline { font-size: 12px; color: var(--text-secondary); margin-top: 2px; }
.fl-live-deadline b { color: var(--text-primary); }
.fl-live-side { flex: 1; min-width: 150px; display: flex; flex-direction: column; gap: 8px; justify-content: center; }
.fl-live-cell { display: flex; flex-direction: column; align-items: flex-start; gap: 1px; background: var(--bg-body); border: 1px solid rgba(140,160,190,0.2); border-radius: 11px; padding: 8px 12px; cursor: pointer; text-align: left; }
.fl-live-cell b { font-size: 17px; font-weight: 900; color: var(--text-primary); }
.fl-live-cell span { font-size: 10px; color: var(--text-muted); }

/* ── v3: įvykių srautas ── */
.fl-feed { margin-bottom: 14px; }
.fl-feed-empty { font-size: 13px; color: var(--text-muted); background: var(--bg-surface); border: 1px dashed rgba(140,160,190,0.3); border-radius: 12px; padding: 12px 14px; margin-top: 6px; line-height: 1.5; }
.fl-feed-list { list-style: none; margin: 6px 0 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.fl-feed-row { display: flex; align-items: center; gap: 10px; background: var(--bg-surface); border: 1px solid rgba(140,160,190,0.16); border-radius: 11px; padding: 8px 11px; cursor: pointer; }
.fl-feed-row:hover { border-color: rgba(16,185,129,0.45); }
.fl-feed-img { width: 34px; height: 34px; border-radius: 50%; overflow: hidden; flex-shrink: 0; background: rgba(148,163,184,0.15); display: block; }
.fl-feed-img img { width: 100%; height: 100%; object-fit: cover; display: block; }
.fl-feed-body { flex: 1; font-size: 13px; color: var(--text-secondary); line-height: 1.35; min-width: 0; }
.fl-feed-body b { color: var(--text-primary); }
.fl-feed-row .dot { flex-shrink: 0; }

/* ── v3: kapitonas ── */
.fl-captain-bar { display: flex; align-items: center; gap: 7px; width: 100%; text-align: left; font-size: 14px; color: var(--text-secondary); background: var(--bg-surface); border: 1px solid rgba(245,158,11,0.4); border-radius: 13px; padding: 12px 14px; cursor: pointer; margin-bottom: 14px; }
.fl-captain-bar b { color: var(--text-primary); }
.fl-captain-bar b em { font-style: normal; font-size: 11px; font-weight: 900; color: #b45309; background: rgba(245,158,11,0.15); border-radius: 6px; padding: 2px 6px; margin-left: 4px; }
.fl-captain-none { color: var(--accent-orange); }
.fl-captain-go { margin-left: auto; font-size: 18px; color: var(--text-muted); }
.fl-p.cap { border-color: rgba(245,158,11,0.55); }
.fl-p-cap { position: absolute; margin-top: -34px; margin-left: 30px; font-size: 14px; font-style: normal; }
.fl-x2 { font-style: normal; font-size: 11px; font-weight: 900; color: #b45309; background: rgba(245,158,11,0.15); border-radius: 6px; padding: 1px 5px; margin-left: 6px; }
.fl-p-pts.pending b { color: var(--text-muted); }

/* ── v3: avataro inicialai ── */
.fl-ava-ini { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; color: #fff; font-weight: 900; letter-spacing: 0.02em; }
.fl-ta-wrap { width: 62px; height: 62px; border-radius: 50%; overflow: hidden; border: 2px solid #10b981; display: block; background: var(--bg-surface); }
.fl-ta-wrap img { width: 100%; height: 100%; object-fit: cover; display: block; }

/* ── v3: rinka ── */
.fl-mcard-meta b { color: var(--text-primary); }
.fl-mcard-delta { font-style: normal; font-size: 10px; font-weight: 900; margin-left: 5px; }
.fl-mcard-delta.up { color: #10b981; }
.fl-mcard-delta.down { color: #94a3b8; }
.fl-market-empty { padding: 16px 6px; text-align: center; }
.fl-market-empty p { font-size: 13px; color: var(--text-muted); line-height: 1.5; margin: 0 0 10px; }
.fl-btn-primary.sm { font-size: 13px; padding: 9px 16px; }
.fl-btn-primary.sm.ghost { background: transparent; color: var(--accent-orange); border: 1px solid var(--accent-orange); }
.fl-input.sm { font-size: 14px; padding: 9px 12px; min-width: 0; }
.fl-slots-hint.warn { color: #b45309; font-weight: 700; }

/* ── v3: lygos ── */
.fl-ltabs { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 12px; }
.fl-ltabs button { font-size: 12px; font-weight: 800; color: var(--text-secondary); cursor: pointer; background: transparent; border: 1px solid rgba(140,160,190,0.25); border-radius: 999px; padding: 7px 14px; }
.fl-ltabs button.on { color: #10b981; border-color: rgba(16,185,129,0.6); background: rgba(16,185,129,0.08); }
.fl-lg-meta { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin: -4px 0 14px; }
.fl-lg-code { font-size: 13px; color: var(--text-secondary); background: var(--bg-surface); border: 1px dashed rgba(140,160,190,0.4); border-radius: 9px; padding: 7px 11px; cursor: pointer; }
.fl-lg-code b { color: var(--text-primary); letter-spacing: 0.12em; }
.fl-lg-leave { margin-left: auto; font-size: 12px; color: #f87171; background: transparent; border: 0; cursor: pointer; font-weight: 700; }
.fl-lg-new { margin-bottom: 18px; }
.fl-lg-forms { display: flex; flex-direction: column; gap: 8px; }
.fl-lg-form { display: flex; gap: 8px; }
.fl-lg-form .fl-input { flex: 1; }
.fl-week-chip.live { border-color: rgba(16,185,129,0.55); }
.fl-week-chip.live span { color: #10b981; font-weight: 900; }
.fl-bot { font-style: normal; font-size: 12px; }

/* ── v4: desktop layout — lyga visada matoma ── */
.fl-desk { display: grid; grid-template-columns: 1fr; gap: 20px; align-items: start; }
@media (min-width: 1020px) {
  .fl-desk { grid-template-columns: minmax(0, 1fr) 330px; }
  .fl-desk-rail { position: sticky; top: 8px; }
}
.fl-desk-main { min-width: 0; }
.fl-rail-league { background: var(--bg-surface); border: 1px solid rgba(140,160,190,0.2); border-radius: 16px; padding: 14px; }
.fl-rail-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
.fl-rail-more { font-size: 12px; font-weight: 800; color: #10b981; background: transparent; border: 0; cursor: pointer; }
.fl-rail-hint { font-size: 10px; color: var(--text-muted); margin: 8px 2px 0; }
.fl-board-row.btn { width: 100%; background: transparent; border: 0; cursor: pointer; text-align: left; font-size: 13px; }
.fl-board-row.btn:hover { background: color-mix(in srgb, var(--text-primary) 7%, transparent); }
.fl-desk-rail .fl-board-pts { font-size: 12px; }
.fl-desk-rail .fl-more-row { margin-top: 10px; }
.fl-feed-pts { font-style: normal; font-size: 12px; font-weight: 900; color: #10b981; flex-shrink: 0; }

/* ── 3 žingsnis ── */
.fl-startas { display: flex; flex-direction: column; align-items: center; text-align: center; padding-top: 20px; }
.fl-start-emoji { font-size: 52px; margin-bottom: 6px; }
.fl-team-row { display: flex; gap: 12px; flex-wrap: wrap; justify-content: center; margin: 14px 0 18px; }
.fl-team-avatar { display: flex; flex-direction: column; align-items: center; gap: 5px; width: 76px; }
.fl-team-avatar img, .fl-team-avatar > span { width: 62px; height: 62px; border-radius: 50%; object-fit: cover; border: 2px solid #10b981; display: flex; align-items: center; justify-content: center; font-size: 24px; background: var(--bg-surface); }
.fl-team-avatar i { font-style: normal; font-size: 11px; font-weight: 700; color: var(--text-secondary); text-align: center; line-height: 1.2; }
.fl-start-line { font-size: 16px; color: var(--text-secondary); margin: 4px 0; }
.fl-start-line b { color: #10b981; font-size: 18px; }
.fl-start-line.dim { font-size: 13px; color: var(--text-muted); margin-bottom: 18px; }

/* ── Valdymas: statuso juosta (kur stoviu) ── */
.fl-status {
  display: flex; align-items: stretch; background: var(--bg-surface);
  border: 1px solid rgba(16,185,129,0.4); border-radius: 16px; padding: 16px 8px; margin-bottom: 12px;
}
.fl-status-cell { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 3px; text-align: center; }
.fl-status-num { font-size: 28px; font-weight: 900; color: var(--text-primary); line-height: 1; }
.fl-status-num.accent { color: #10b981; }
.fl-status-lbl { font-size: 11px; color: var(--text-muted); font-weight: 600; }
.fl-status-div { width: 1px; background: rgba(140,160,190,0.2); margin: 4px 0; }

.fl-when { font-size: 13px; color: var(--text-secondary); line-height: 1.5; background: var(--bg-surface); border: 1px solid rgba(140,160,190,0.18); border-radius: 12px; padding: 11px 14px; margin-bottom: 12px; }
.fl-when b { color: var(--text-primary); }
.fl-firsttime { font-size: 13px; color: var(--text-secondary); line-height: 1.5; background: rgba(16,185,129,0.08); border: 1px solid rgba(16,185,129,0.3); border-radius: 12px; padding: 11px 14px; margin-bottom: 16px; }

.fl-hist { margin-bottom: 18px; }
.fl-hist-head { font-size: 12px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); margin-bottom: 2px; }

.fl-sec-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 10px; }
.fl-sec-count { font-size: 14px; font-weight: 700; color: var(--text-muted); }
.fl-btn-market {
  font-size: 14px; font-weight: 800; color: #fff; cursor: pointer;
  background: var(--accent-orange); border: 0; border-radius: 999px; padding: 9px 18px;
  box-shadow: 0 8px 20px rgba(16,185,129,0.3);
}

/* ── Roster — aiškios eilutės (nuotrauka, vardas, būsena, taškai) ── */
.fl-roster { display: flex; flex-direction: column; gap: 8px; margin-bottom: 16px; }
.fl-p {
  display: flex; align-items: center; gap: 12px; padding: 11px 13px; border-radius: 14px; width: 100%; text-align: left; cursor: pointer;
  background: var(--bg-surface); border: 1px solid rgba(140,160,190,0.2);
}
.fl-p:hover { border-color: rgba(16,185,129,0.5); }
.fl-p-img { width: 46px; height: 46px; border-radius: 50%; overflow: hidden; flex-shrink: 0; background: rgba(148,163,184,0.15); }
.fl-p-img img { width: 100%; height: 100%; object-fit: cover; display: block; }
.fl-p-mid { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1; }
.fl-p-name { font-size: 16px; font-weight: 800; color: var(--text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fl-p-status { font-size: 12px; color: var(--text-muted); }
.fl-p-status.new { color: var(--accent-orange); font-weight: 700; }
.fl-p-pts { display: flex; flex-direction: column; align-items: flex-end; flex-shrink: 0; }
.fl-p-pts b { font-size: 22px; font-weight: 900; color: #10b981; line-height: 1; }
.fl-p-pts i { font-style: normal; font-size: 10px; color: var(--text-muted); }
.fl-p-add { border-style: dashed; justify-content: flex-start; }
.fl-p-plus { width: 46px; height: 46px; border-radius: 50%; flex-shrink: 0; display: flex; align-items: center; justify-content: center; font-size: 24px; color: var(--text-muted); border: 2px dashed rgba(140,160,190,0.4); }
.fl-p-addlbl { flex: 1; font-size: 14px; font-weight: 700; color: var(--text-secondary); }
.fl-p-addgo { font-size: 20px; color: var(--text-muted); }

/* ── Rinka ── */
.fl-market { background: var(--bg-surface); border: 1px solid rgba(16,185,129,0.35); border-radius: 16px; padding: 14px; margin-bottom: 22px; }
.fl-market-search { width: 100%; margin-bottom: 10px; background: var(--bg-body); }
.fl-filters { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 12px; }
.fl-tabs { display: flex; gap: 6px; flex-wrap: wrap; }
.fl-tabs button {
  font-size: 12px; font-weight: 800; color: var(--text-secondary); cursor: pointer;
  background: transparent; border: 1px solid rgba(140,160,190,0.25); border-radius: 999px; padding: 7px 14px;
}
.fl-tabs button.on { color: #10b981; border-color: rgba(16,185,129,0.6); background: rgba(16,185,129,0.08); }

.fl-market-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
@media (max-width: 560px) { .fl-market-grid { grid-template-columns: repeat(2, 1fr); } }
.fl-mcard {
  display: flex; flex-direction: column; align-items: center; gap: 4px; text-align: center;
  padding: 13px 8px 12px; border-radius: 14px; cursor: pointer;
  background: var(--bg-body); border: 1px solid rgba(140,160,190,0.2);
  transition: transform .13s ease, border-color .13s ease;
}
.fl-mcard:hover:not(.off) { transform: translateY(-2px); border-color: #10b981; }
.fl-mcard.mine { border-color: rgba(16,185,129,0.6); }
.fl-mcard.off { opacity: 0.45; cursor: not-allowed; }
.fl-mcard-img { position: relative; width: 62px; height: 62px; border-radius: 50%; overflow: hidden; background: rgba(148,163,184,0.15); margin-bottom: 3px; }
.fl-mcard-img img { width: 100%; height: 100%; object-fit: cover; display: block; }
.fl-mcard-trend { position: absolute; bottom: 0; right: 0; font-style: normal; font-size: 13px; }
.fl-mcard-mine { position: absolute; top: 0; right: 0; font-style: normal; font-size: 11px; font-weight: 900; color: #fff; background: #10b981; border-radius: 50%; width: 18px; height: 18px; display: flex; align-items: center; justify-content: center; }
.fl-mcard-name { font-size: 13px; font-weight: 800; color: var(--text-primary); line-height: 1.2; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
.fl-mcard-meta { font-size: 10px; color: var(--text-muted); }
.fl-mcard-price { font-size: 14px; font-weight: 900; color: #10b981; }
.fl-mcard.mine .fl-mcard-price { color: #f87171; }
.fl-mcard-price.expensive { color: var(--text-muted); text-decoration: line-through; }

.fl-pager { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-top: 12px; }
.fl-pager button { font-size: 12px; font-weight: 800; color: var(--text-secondary); background: transparent; border: 1px solid rgba(140,160,190,0.3); border-radius: 999px; padding: 7px 14px; cursor: pointer; }
.fl-pager button:disabled { opacity: 0.35; cursor: not-allowed; }

/* ── Turai / lyga ── */
.fl-weeks { margin-bottom: 22px; }
.fl-weeks-row { display: flex; gap: 8px; overflow-x: auto; padding: 10px 0 4px; }
.fl-week-chip { display: flex; flex-direction: column; align-items: center; gap: 2px; background: var(--bg-surface); border: 1px solid rgba(140,160,190,0.2); border-radius: 11px; padding: 8px 13px; flex-shrink: 0; }
.fl-week-chip span { font-size: 10px; color: var(--text-muted); }
.fl-week-chip b { font-size: 16px; font-weight: 900; color: var(--text-primary); }

.fl-league { background: var(--bg-surface); border: 1px solid rgba(140,160,190,0.18); border-radius: 16px; padding: 16px; margin-bottom: 14px; }
.fl-league.compact { margin-top: 22px; }
.fl-league-head { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 10px; }
.fl-league .fl-tabs { margin-bottom: 10px; }
.fl-board-list { list-style: none; margin: 0; padding: 0; }
.fl-board-row { display: flex; align-items: center; gap: 10px; font-size: 14px; padding: 6px 6px; border-radius: 8px; }
.fl-board-row:nth-child(odd) { background: color-mix(in srgb, var(--text-primary) 4%, transparent); }
.fl-board-row.me { outline: 1px solid rgba(16,185,129,0.55); }
.fl-rank { width: 22px; height: 22px; border-radius: 7px; display: flex; align-items: center; justify-content: center; font-weight: 900; font-size: 11px; background: color-mix(in srgb, var(--text-primary) 8%, transparent); color: var(--text-secondary); flex-shrink: 0; }
.fl-rank.r1 { background: var(--accent-orange); color: #fff; }
.fl-rank.r2 { background: #94a3b8; color: #10151d; }
.fl-rank.r3 { background: #b45309; color: #fff; }
.fl-board-name { font-weight: 700; color: var(--text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fl-board-pts { margin-left: auto; font-weight: 800; color: var(--text-primary); white-space: nowrap; font-size: 12px; }

.fl-foot { font-size: 12px; color: var(--text-muted); line-height: 1.5; }
.fl-slots-hint { font-size: 11px; color: var(--text-muted); margin: 0 0 4px; }
.fl-player-img { width: 46px; height: 46px; border-radius: 50%; overflow: hidden; flex-shrink: 0; background: rgba(148,163,184,0.15); }
.fl-player-img img { width: 100%; height: 100%; object-fit: cover; display: block; }
.fl-player-ph { display: flex; align-items: center; justify-content: center; width: 100%; height: 100%; font-size: 18px; }
.fl-player-img.big { width: 58px; height: 58px; }

.fl-chart { display: flex; align-items: flex-end; gap: 8px; height: 96px; padding: 20px 4px 0; margin-bottom: 18px; }
.fl-chart-col { position: relative; flex: 1; max-width: 56px; height: 100%; display: flex; flex-direction: column; justify-content: flex-end; align-items: center; gap: 4px; }
.fl-chart-col i { width: 100%; max-width: 34px; border-radius: 4px 4px 0 0; background: rgba(16,185,129,0.45); display: block; }
.fl-chart-col i.now { background: #10b981; }
.fl-chart-val { position: absolute; top: -18px; font-size: 12px; font-weight: 800; color: var(--text-primary); }
.fl-chart-lbl { font-size: 10px; color: var(--text-muted); }

.fl-artist-head { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
.fl-artist-name { display: block; font-size: 20px; font-weight: 900; color: var(--text-primary); }
.fl-artist-meta { font-size: 12px; color: var(--text-muted); }
.fl-artist-live { font-size: 14px; color: var(--text-secondary); margin-bottom: 6px; }
.fl-artist-live b { color: #10b981; font-size: 16px; }
.fl-artist-breakdown { display: flex; gap: 12px; flex-wrap: wrap; font-size: 12px; color: var(--text-secondary); margin-bottom: 14px; }
.fl-artist-sub { font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); margin: 10px 0 4px; }
.fl-artist-events { list-style: none; margin: 0 0 12px; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.fl-artist-events li { font-size: 13px; color: var(--text-secondary); }
.fl-artist-events li span { font-size: 11px; color: var(--text-muted); margin-right: 6px; }
.fl-artist-link { font-size: 13px; font-weight: 800; color: #10b981; text-decoration: none; }
.fl-wizard { padding-top: 4px; }
`
