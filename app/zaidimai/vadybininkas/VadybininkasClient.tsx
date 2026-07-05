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

type RosterArtist = {
  artistId: number
  name: string
  slug: string
  image: string | null
  price: number
  signedAt: string
  countsFromNextWeek?: boolean
  lastWeekPoints: number | null
  livePoints: number
  liveBreakdown: { chart: number; yt: number; rel: number; base: number } | null
}
type BoardRow = { name: string; points: number; isMe: boolean }
type Boards = { week: BoardRow[]; month: BoardRow[]; season: BoardRow[]; weekLabel: string; totalTeams: number }
type TeamData = {
  team: {
    id: number; name: string; budget: number; spent: number; budgetLeft: number
    transfersLeft: number; seasonPoints: number; seasonRank: number | null
    liveWeekPoints: number; weeks: Array<{ week_start: string; points: number }>
  } | null
  roster: RosterArtist[]
  rosterSize: number
  boards: Boards
  isAuthenticated: boolean
}
type MarketArtist = {
  id: number; name: string; slug: string; image: string | null
  price: number; country: string; lastWeekPoints: number | null; trending: boolean; onMyRoster: boolean
}

type View = 'loading' | 'intro' | 'draft' | 'startas' | 'valdymas'

export default function VadybininkasClient() {
  const [data, setData] = useState<TeamData | null>(null)
  const [view, setView] = useState<View>('loading')
  const [error, setError] = useState<string | null>(null)

  // Vedlys
  const [teamName, setTeamName] = useState('')
  const [creating, setCreating] = useState(false)

  // Rinka
  const [marketOpen, setMarketOpen] = useState(false) // valdymo režime — overlay
  const [market, setMarket] = useState<MarketArtist[]>([])
  const [marketTotal, setMarketTotal] = useState(0)
  const [marketPage, setMarketPage] = useState(0)
  const [marketQ, setMarketQ] = useState('')
  const [marketSort, setMarketSort] = useState<'populiariausi' | 'pigiausi'>('populiariausi')
  const [marketSalis, setMarketSalis] = useState<'visi' | 'lt' | 'uzsienio'>('visi')
  const [marketLoading, setMarketLoading] = useState(false)
  const [busyArtist, setBusyArtist] = useState<number | null>(null)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [boardTab, setBoardTab] = useState<'week' | 'month' | 'season'>('season')

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
        else if ((json.roster || []).length < (json.rosterSize || 5)) setView('draft')
        else setView('valdymas')
      }
      return json
    } catch {
      setError('Nepavyko įkelti — pabandyk dar kartą')
      return null
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const loadMarket = useCallback(async (q: string, page: number, sort: string, salis: string) => {
    setMarketLoading(true)
    try {
      const res = await fetch(`/api/zaidimai/vadybininkas/rinka?q=${encodeURIComponent(q)}&puslapis=${page}&rusiavimas=${sort}&salis=${salis}`)
      const json = await res.json()
      setMarket(json.artists || [])
      setMarketTotal(json.total || 0)
      setMarketPage(page)
    } catch { /* paliekam esamą */ }
    setMarketLoading(false)
  }, [])

  const marketVisible = view === 'draft' || marketOpen
  useEffect(() => {
    if (!marketVisible) return
    void loadMarket(marketQ, 0, marketSort, marketSalis)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [marketVisible, marketSort, marketSalis])

  function onSearchChange(v: string) {
    setMarketQ(v)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => void loadMarket(v, 0, marketSort, marketSalis), 350)
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
      await Promise.all([
        load({ keepView: true }),
        marketVisible ? loadMarket(marketQ, marketPage, marketSort, marketSalis) : Promise.resolve(),
      ])
    } catch { setError('Tinklo klaida — pabandyk dar kartą') }
    setBusyArtist(null)
  }

  // Vedlio žingsnio numeris antraštei
  const wizardStep = view === 'intro' ? 1 : view === 'draft' ? 2 : view === 'startas' ? 3 : 0

  const lastWeekTotal = roster.reduce((s, r) => s + (r.lastWeekPoints || 0), 0)
  const maxLive = Math.max(1, ...roster.map(r => r.livePoints))

  return (
    <div className="fl-root">
      <style>{css}</style>

      {/* Viršus */}
      <div className="fl-top">
        <Link href="/zaidimai" className="fl-back">← Žaidimai</Link>
        {wizardStep > 0 && (
          <div className="fl-steps">
            {[1, 2, 3].map(n => (
              <span key={n} className={`fl-step-dot${wizardStep === n ? ' now' : ''}${wizardStep > n ? ' done' : ''}`}>
                {wizardStep > n ? '✓' : n}
              </span>
            ))}
          </div>
        )}
        {view === 'valdymas' && team && <span className="fl-top-name">💼 {team.name}</span>}
      </div>

      {view === 'loading' && <div className="fl-center"><div className="fl-spinner" /></div>}

      {error && <div className="fl-error" onClick={() => setError(null)}>{error} ✕</div>}

      {/* ══════════ 1 ŽINGSNIS: kaip veikia + pavadinimas ══════════ */}
      {view === 'intro' && (
        <div className="fl-wizard">
          <h1 className="fl-h1">Muzikos vadybininkas</h1>
          <p className="fl-lead">Tapk vadybininku: surink 5 realių atlikėjų komandą — taškus jie neš pagal <b>tikrus rezultatus</b>.</p>

          <div className="fl-how">
            <div className="fl-how-card">
              <span className="fl-how-emoji">✍️</span>
              <b>1. Pasirašyk 5 atlikėjus</b>
              <span>Nuo LT scenos iki pasaulio žvaigždžių. Biudžetas — 220 tšk.</span>
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

          <LeagueBoards boards={data?.boards} tab={boardTab} setTab={setBoardTab} compact />
        </div>
      )}

      {/* ══════════ 2 ŽINGSNIS: komandos surinkimas ══════════ */}
      {view === 'draft' && team && (
        <div className="fl-wizard">
          <h1 className="fl-h1">Surink komandą</h1>

          {/* Progresas + biudžetas — VISADA matomi (sticky) */}
          <div className="fl-draft-status">
            <div className="fl-slots">
              {Array.from({ length: rosterSize }).map((_, i) => {
                const r = roster[i]
                return r ? (
                  <button key={r.artistId} className="fl-slot filled" title={`${r.name} — paleisti`} onClick={() => doAction('release', r.artistId)}>
                    {r.image
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={proxyImg(r.image, 96)} alt={r.name} />
                      : <span>🎤</span>}
                    <i className="fl-slot-x">✕</i>
                  </button>
                ) : (
                  <span key={`e${i}`} className="fl-slot">+</span>
                )
              })}
              <span className="fl-slots-label">{roster.length}/{rosterSize}</span>
            </div>
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
            marketLoading={marketLoading}
            marketPage={marketPage}
            marketTotal={marketTotal}
            onPage={p => void loadMarket(marketQ, p, marketSort, marketSalis)}
            budgetLeft={team.budgetLeft}
            slotsLeft={slotsLeft}
            busyArtist={busyArtist}
            onSign={id => doAction('sign', id)}
            onRelease={id => doAction('release', id)}
          />

          {rosterFull && (
            <div className="fl-draft-done">
              <button className="fl-btn-primary big" onClick={() => setView('startas')}>Komanda paruošta →</button>
            </div>
          )}
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
                {r.image
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={proxyImg(r.image, 120)} alt={r.name} />
                  : <span>🎤</span>}
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
        <>
          {/* Herojus: DU aiškūs skaičiai */}
          <div className="fl-hero">
            <div className="fl-hero-main">
              <span className="fl-hero-label">Ši savaitė</span>
              <span className="fl-hero-num">{team.liveWeekPoints}</span>
              <span className="fl-hero-sub">tšk. (tarpinis — galutinai pirmadienį)</span>
            </div>
            <div className="fl-hero-side">
              <span className="fl-hero-chip">🏆 Sezonas: <b>{team.seasonPoints}</b>{team.seasonRank ? ` · #${team.seasonRank}` : ''}</span>
              <span className="fl-hero-chip dim">💰 {team.budgetLeft} · 🔁 {team.transfersLeft} mainai</span>
            </div>
          </div>

          {/* Komanda — vizualios taškų juostos */}
          <div className="fl-sec-head">
            <h2 className="fl-h2">Komanda</h2>
            <button className="fl-btn-market" onClick={() => setMarketOpen(o => !o)}>
              {marketOpen ? 'Uždaryti rinką ✕' : '↔ Mainai'}
            </button>
          </div>

          <div className="fl-roster">
            {roster.map(r => (
              <div key={r.artistId} className="fl-player">
                <span className="fl-player-img">
                  {r.image
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={proxyImg(r.image, 120)} alt="" loading="lazy" />
                    : <span className="fl-player-ph">🎤</span>}
                </span>
                <span className="fl-player-main">
                  <span className="fl-player-name-row">
                    <Link href={`/atlikejai/${r.slug}`} className="fl-player-name">{r.name}</Link>
                    {r.countsFromNextWeek && <em className="fl-new-badge" title="Taškai komandai — nuo pirmadienio">🆕 nuo pirmadienio</em>}
                  </span>
                  <span
                    className="fl-points-bar"
                    title={r.liveBreakdown ? `Topai ${r.liveBreakdown.chart} · YouTube ${r.liveBreakdown.yt} · Naujos dainos ${r.liveBreakdown.rel} · Bazė ${r.liveBreakdown.base}` : ''}
                  >
                    {r.liveBreakdown && r.livePoints > 0 ? (
                      <>
                        <i className="seg chart" style={{ width: `${(r.liveBreakdown.chart / maxLive) * 100}%` }} />
                        <i className="seg yt" style={{ width: `${(r.liveBreakdown.yt / maxLive) * 100}%` }} />
                        <i className="seg rel" style={{ width: `${(r.liveBreakdown.rel / maxLive) * 100}%` }} />
                        <i className="seg base" style={{ width: `${(r.liveBreakdown.base / maxLive) * 100}%` }} />
                      </>
                    ) : <i className="seg empty" />}
                  </span>
                </span>
                <span className="fl-player-live">
                  <b>{r.livePoints}</b>
                  <i>šią sav.</i>
                </span>
              </div>
            ))}
          </div>
          <div className="fl-legend">
            <span><i className="dot chart" /> Topai</span>
            <span><i className="dot yt" /> YouTube</span>
            <span><i className="dot rel" /> Naujos dainos</span>
            <span><i className="dot base" /> Bazė</span>
          </div>

          {/* Rinka (mainams) — atsidaro po komanda, tie patys filtrai viršuje */}
          {marketOpen && (
            <MarketPanel
              market={market}
              marketQ={marketQ}
              onSearchChange={onSearchChange}
              marketSalis={marketSalis}
              setMarketSalis={setMarketSalis}
              marketSort={marketSort}
              setMarketSort={setMarketSort}
              marketLoading={marketLoading}
              marketPage={marketPage}
              marketTotal={marketTotal}
              onPage={p => void loadMarket(marketQ, p, marketSort, marketSalis)}
              budgetLeft={team.budgetLeft}
              slotsLeft={slotsLeft}
              busyArtist={busyArtist}
              onSign={id => doAction('sign', id)}
              onRelease={id => doAction('release', id)}
              releaseHint={team.transfersLeft > 0 ? `Mainams pirmiausia paleisk atlikėją komandoje (liko ${team.transfersLeft})` : 'Mainų limitas šiai savaitei išnaudotas'}
            />
          )}

          {/* Turai */}
          {team.weeks.length > 0 && (
            <div className="fl-weeks">
              <h2 className="fl-h2">Turų istorija</h2>
              <div className="fl-weeks-row">
                {team.weeks.map(w => (
                  <div key={w.week_start} className="fl-week-chip">
                    <span>{w.week_start.slice(5)}</span>
                    <b>{w.points}</b>
                  </div>
                ))}
              </div>
            </div>
          )}

          <LeagueBoards boards={data!.boards} tab={boardTab} setTab={setBoardTab} />

          <p className="fl-foot">
            Taškai — kas pirmadienį iš realių duomenų: vietos TOP40/TOP30 ir pasaulio topuose
            (Billboard, Spotify, Apple), YouTube augimas, naujos dainos. Naujai pasirašyti atlikėjai
            taškus neša nuo kito pirmadienio.
          </p>
        </>
      )}
    </div>
  )
}

// ── Rinkos panelė (bendrai vedliui ir mainams) ────────────────────────────

function MarketPanel(props: {
  market: MarketArtist[]
  marketQ: string
  onSearchChange: (v: string) => void
  marketSalis: 'visi' | 'lt' | 'uzsienio'
  setMarketSalis: (v: 'visi' | 'lt' | 'uzsienio') => void
  marketSort: 'populiariausi' | 'pigiausi'
  setMarketSort: (v: 'populiariausi' | 'pigiausi') => void
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
          <button className={marketSort === 'populiariausi' ? 'on' : ''} onClick={() => setMarketSort('populiariausi')}>⭐ Populiariausi</button>
          <button className={marketSort === 'pigiausi' ? 'on' : ''} onClick={() => setMarketSort('pigiausi')}>💸 Pigiausi</button>
        </div>
      </div>

      {marketLoading && <div className="fl-center small"><div className="fl-spinner" /></div>}
      {!marketLoading && market.length === 0 && <div className="fl-dim" style={{ padding: '14px 4px' }}>Nieko nerasta — pabandyk kitą paiešką.</div>}

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
              onClick={() => (a.onMyRoster ? onRelease(a.id) : canSign ? onSign(a.id) : undefined)}
            >
              <span className="fl-mcard-img">
                {a.image
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={proxyImg(a.image, 160)} alt="" loading="lazy" />
                  : <span className="fl-player-ph">🎤</span>}
                {a.trending && <em className="fl-mcard-trend">📈</em>}
                {a.onMyRoster && <em className="fl-mcard-mine">✓</em>}
              </span>
              <span className="fl-mcard-name">{a.name}</span>
              <span className="fl-mcard-meta">{a.lastWeekPoints !== null && a.lastWeekPoints > 0 ? `pr. sav. ${a.lastWeekPoints} tšk.` : a.country === 'LT' ? 'Lietuva' : 'užsienio'}</span>
              <span className={`fl-mcard-price${!affordable && !a.onMyRoster ? ' expensive' : ''}`}>{a.onMyRoster ? 'Paleisti ✕' : `${a.price} tšk.`}</span>
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

function LeagueBoards({ boards, tab, setTab, compact }: {
  boards?: Boards
  tab: 'week' | 'month' | 'season'
  setTab: (t: 'week' | 'month' | 'season') => void
  compact?: boolean
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
        <button className={tab === 'week' ? 'on' : ''} onClick={() => setTab('week')}>Savaitė</button>
        <button className={tab === 'month' ? 'on' : ''} onClick={() => setTab('month')}>Mėnuo</button>
        <button className={tab === 'season' ? 'on' : ''} onClick={() => setTab('season')}>Sezonas</button>
      </div>
      {rows.length === 0 ? (
        <div className="fl-dim" style={{ padding: '10px 0' }}>
          {tab === 'week' ? 'Savaitės rezultatai — po pirmadienio skaičiavimo.' : 'Lyga tik prasideda — būk tarp pirmųjų!'}
        </div>
      ) : (
        <ol className="fl-board-list">
          {rows.map((r, i) => (
            <li key={i} className={`fl-board-row${r.isMe ? ' me' : ''}`}>
              <span className={`fl-rank r${i + 1}`}>{i + 1}</span>
              <span className="fl-board-name">{r.name}{r.isMe ? ' (tu)' : ''}</span>
              <span className="fl-board-pts">{r.points} tšk.</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

const css = `
.fl-root { max-width: 760px; margin: 0 auto; padding: 24px 16px 90px; }
.fl-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; gap: 10px; }
.fl-back { font-size: 14px; font-weight: 700; color: var(--text-secondary); text-decoration: none; }
.fl-top-name { font-size: 14px; font-weight: 900; color: var(--text-primary); }
.fl-steps { display: flex; gap: 6px; }
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
.fl-warn a { color: #f59e0b; font-weight: 800; }

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
  background: linear-gradient(135deg, #10b981, #059669); box-shadow: 0 10px 26px rgba(16,185,129,0.3);
}
.fl-btn-primary:disabled { opacity: 0.5; }
.fl-btn-primary.big { font-size: 18px; padding: 15px 34px; border-radius: 999px; }

/* ── 2 žingsnis: draft status (sticky) ── */
.fl-draft-status {
  position: sticky; top: 60px; z-index: 8; background: var(--bg-body);
  padding: 10px 0 12px; margin-bottom: 4px; border-bottom: 1px solid rgba(140,160,190,0.15);
}
.fl-slots { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
.fl-slot {
  position: relative; width: 46px; height: 46px; border-radius: 50%; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center; overflow: hidden;
  border: 2px dashed rgba(140,160,190,0.4); color: var(--text-muted); font-size: 18px; background: transparent;
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
.fl-budget-bar div { height: 100%; background: linear-gradient(90deg, #10b981, #f59e0b); transition: width .25s ease; }
.fl-budget-num { font-size: 14px; color: var(--text-secondary); white-space: nowrap; }
.fl-budget-num b { font-size: 16px; color: var(--text-primary); }
.fl-draft-done { position: sticky; bottom: 14px; display: flex; justify-content: center; margin-top: 16px; }

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

/* ── Valdymas: herojus ── */
.fl-hero {
  display: flex; align-items: stretch; gap: 14px; flex-wrap: wrap;
  background: linear-gradient(140deg, rgba(16,185,129,0.14), var(--bg-surface));
  border: 1px solid rgba(16,185,129,0.4); border-radius: 18px; padding: 18px 20px; margin-bottom: 22px;
}
.fl-hero-main { display: flex; flex-direction: column; }
.fl-hero-label { font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.06em; color: #10b981; }
.fl-hero-num { font-size: 46px; font-weight: 900; color: var(--text-primary); line-height: 1.05; }
.fl-hero-sub { font-size: 12px; color: var(--text-muted); }
.fl-hero-side { display: flex; flex-direction: column; gap: 8px; justify-content: center; margin-left: auto; }
.fl-hero-chip { font-size: 14px; font-weight: 700; color: var(--text-primary); background: var(--bg-surface); border: 1px solid rgba(140,160,190,0.22); border-radius: 999px; padding: 7px 14px; }
.fl-hero-chip b { color: var(--text-primary); }
.fl-hero-chip.dim { color: var(--text-secondary); font-weight: 600; }

.fl-sec-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 10px; }
.fl-btn-market {
  font-size: 14px; font-weight: 800; color: #fff; cursor: pointer;
  background: linear-gradient(135deg, #10b981, #059669); border: 0; border-radius: 999px; padding: 9px 18px;
  box-shadow: 0 8px 20px rgba(16,185,129,0.3);
}

/* ── Roster su taškų juostomis ── */
.fl-roster { display: flex; flex-direction: column; gap: 8px; margin-bottom: 8px; }
.fl-player {
  display: flex; align-items: center; gap: 12px; padding: 10px 12px; border-radius: 14px;
  background: var(--bg-surface); border: 1px solid rgba(140,160,190,0.2);
}
.fl-player-img { width: 46px; height: 46px; border-radius: 50%; overflow: hidden; flex-shrink: 0; background: rgba(148,163,184,0.15); }
.fl-player-img img { width: 100%; height: 100%; object-fit: cover; display: block; }
.fl-player-ph { display: flex; align-items: center; justify-content: center; width: 100%; height: 100%; font-size: 18px; }
.fl-player-main { display: flex; flex-direction: column; gap: 6px; min-width: 0; flex: 1; }
.fl-player-name-row { display: flex; align-items: center; gap: 8px; min-width: 0; }
.fl-player-name { font-size: 16px; font-weight: 800; color: var(--text-primary); text-decoration: none; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fl-new-badge { font-style: normal; font-size: 10px; font-weight: 800; color: #f59e0b; white-space: nowrap; }
.fl-points-bar { display: flex; height: 8px; border-radius: 4px; overflow: hidden; background: rgba(148,163,184,0.14); width: 100%; }
.fl-points-bar .seg { height: 100%; display: block; }
.fl-points-bar .seg.chart { background: #f59e0b; }
.fl-points-bar .seg.yt { background: #ef4444; }
.fl-points-bar .seg.rel { background: #8b5cf6; }
.fl-points-bar .seg.base { background: #64748b; }
.fl-points-bar .seg.empty { width: 2%; background: rgba(148,163,184,0.25); }
.fl-player-live { display: flex; flex-direction: column; align-items: flex-end; flex-shrink: 0; }
.fl-player-live b { font-size: 22px; font-weight: 900; color: #10b981; line-height: 1; }
.fl-player-live i { font-style: normal; font-size: 10px; color: var(--text-muted); }
.fl-legend { display: flex; gap: 14px; flex-wrap: wrap; font-size: 11px; color: var(--text-muted); margin-bottom: 22px; padding-left: 4px; }
.fl-legend .dot { display: inline-block; width: 8px; height: 8px; border-radius: 2px; margin-right: 4px; }
.fl-legend .dot.chart { background: #f59e0b; }
.fl-legend .dot.yt { background: #ef4444; }
.fl-legend .dot.rel { background: #8b5cf6; }
.fl-legend .dot.base { background: #64748b; }

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
.fl-rank.r1 { background: #f59e0b; color: #1a1206; }
.fl-rank.r2 { background: #94a3b8; color: #10151d; }
.fl-rank.r3 { background: #b45309; color: #fff; }
.fl-board-name { font-weight: 700; color: var(--text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fl-board-pts { margin-left: auto; font-weight: 800; color: var(--text-primary); white-space: nowrap; font-size: 12px; }

.fl-foot { font-size: 12px; color: var(--text-muted); line-height: 1.5; }
.fl-wizard { padding-top: 4px; }
`
