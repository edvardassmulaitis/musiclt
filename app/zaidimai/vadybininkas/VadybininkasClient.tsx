'use client'

// app/zaidimai/vadybininkas/VadybininkasClient.tsx
//
// Muzikos vadybininkas v2 — TĘSTINĖ FANTASY LYGA su realiais atlikėjais ir
// realiais jų rezultatais (YouTube augimas, topai, releizai). Kaip krepšinio
// rinkos žaidimuose: sudarai komandą, laikai ilgai, taškai kas savaitę,
// mėnesio/sezono lyderiai.

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
  price: number; lastWeekPoints: number | null; trending: boolean; onMyRoster: boolean
}

export default function VadybininkasClient() {
  const [data, setData] = useState<TeamData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  // Komandos kūrimas
  const [teamName, setTeamName] = useState('')
  const [creating, setCreating] = useState(false)

  // Rinka
  const [marketOpen, setMarketOpen] = useState(false)
  const [market, setMarket] = useState<MarketArtist[]>([])
  const [marketTotal, setMarketTotal] = useState(0)
  const [marketPage, setMarketPage] = useState(0)
  const [marketQ, setMarketQ] = useState('')
  const [marketLoading, setMarketLoading] = useState(false)
  const [busyArtist, setBusyArtist] = useState<number | null>(null)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [boardTab, setBoardTab] = useState<'week' | 'month' | 'season'>('season')

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/zaidimai/vadybininkas')
      const json = await res.json()
      setData(json)
    } catch {
      setError('Nepavyko užkrauti — pabandyk dar kartą')
    }
    setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])

  const loadMarket = useCallback(async (q: string, page: number) => {
    setMarketLoading(true)
    try {
      const res = await fetch(`/api/zaidimai/vadybininkas/rinka?q=${encodeURIComponent(q)}&puslapis=${page}`)
      const json = await res.json()
      setMarket(json.artists || [])
      setMarketTotal(json.total || 0)
      setMarketPage(page)
    } catch { /* paliekam seną */ }
    setMarketLoading(false)
  }, [])

  useEffect(() => {
    if (!marketOpen) return
    void loadMarket(marketQ, 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [marketOpen])

  function onSearchChange(v: string) {
    setMarketQ(v)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => void loadMarket(v, 0), 350)
  }

  async function createTeam() {
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
      setNotice(`Komanda sukurta! +${json.xp} tšk. Dabar pasirašyk 5 atlikėjus 👇`)
      await load()
      setMarketOpen(true)
    } catch { setError('Tinklo klaida') }
    setCreating(false)
  }

  async function doAction(action: 'sign' | 'release', artistId: number) {
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
      await Promise.all([load(), marketOpen ? loadMarket(marketQ, marketPage) : Promise.resolve()])
    } catch { setError('Tinklo klaida') }
    setBusyArtist(null)
  }

  const team = data?.team
  const roster = data?.roster || []
  const slotsLeft = (data?.rosterSize || 5) - roster.length

  return (
    <div className="fl-root">
      <style>{css}</style>

      <div className="fl-top">
        <Link href="/zaidimai" className="fl-back">← Žaidimai</Link>
        {team && <span className="fl-top-name">💼 {team.name}</span>}
      </div>

      {loading && <div className="fl-center"><div className="fl-spinner" /></div>}

      {!loading && data && !team && (
        <div className="fl-onboard">
          <h1 className="fl-h1">Muzikos vadybininkas</h1>
          <p className="fl-lead">
            Fantasy lyga su <b>realiais Lietuvos atlikėjais</b>. Sudarai komandą iš 5 atlikėjų —
            taškus jie neša pagal <b>tikrus savaitės rezultatus</b>: YouTube augimą, vietas
            topuose ir naujus releizus. Kas pirmadienį — nauja turo lentelė, o mėnesio ir
            sezono lyderiai kaunasi ilgai.
          </p>
          <ul className="fl-rules">
            <li>💰 Biudžetas <b>220 tšk.</b> — superžvaigždės brangios, atrask pigius kylančius</li>
            <li>📊 Taškai kas pirmadienį iš realių duomenų (+ live progresas kasdien)</li>
            <li>🔁 Iki <b>3 transferų</b> per savaitę</li>
          </ul>
          {!data.isAuthenticated && (
            <p className="fl-warn">⚠️ Žaidi kaip svečias — komanda pririšta prie šio įrenginio. <Link href="/auth/prisijungti">Prisijunk</Link>, kad jos neprarastum ir matytum savo vardą lygoje.</p>
          )}
          <div className="fl-create">
            <input
              className="fl-input"
              placeholder="Komandos pavadinimas, pvz. „Garažo imperija“"
              value={teamName}
              maxLength={30}
              onChange={e => setTeamName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') void createTeam() }}
            />
            <button className="fl-btn-primary" disabled={creating} onClick={createTeam}>
              {creating ? 'Kuriama…' : 'Įkurti komandą'}
            </button>
          </div>
          {error && <div className="fl-error">{error}</div>}

          <LeagueBoards boards={data.boards} tab={boardTab} setTab={setBoardTab} />
        </div>
      )}

      {!loading && data && team && (
        <>
          {notice && <div className="fl-notice" onClick={() => setNotice(null)}>{notice}</div>}
          {error && <div className="fl-error" onClick={() => setError(null)}>{error}</div>}

          {/* Komandos statusas */}
          <div className="fl-stats">
            <div className="fl-stat big">
              <span className="fl-stat-label">Ši savaitė (live)</span>
              <span className="fl-stat-val">{team.liveWeekPoints}</span>
            </div>
            <div className="fl-stat">
              <span className="fl-stat-label">Sezonas</span>
              <span className="fl-stat-val">{team.seasonPoints}{team.seasonRank ? <em>#{team.seasonRank}</em> : null}</span>
            </div>
            <div className="fl-stat">
              <span className="fl-stat-label">Biudžetas</span>
              <span className="fl-stat-val">{team.budgetLeft}</span>
            </div>
            <div className="fl-stat">
              <span className="fl-stat-label">Transferai</span>
              <span className="fl-stat-val">{team.transfersLeft}</span>
            </div>
          </div>

          {/* Roster */}
          <div className="fl-sec-head">
            <h2 className="fl-h2">Komanda <span className="fl-dim">{roster.length}/{data.rosterSize}</span></h2>
            <button className="fl-btn-market" onClick={() => setMarketOpen(o => !o)}>
              {marketOpen ? 'Slėpti rinką' : slotsLeft > 0 ? `Į rinką (${slotsLeft} vietos) →` : 'Rinka →'}
            </button>
          </div>

          {roster.length === 0 && (
            <div className="fl-empty-roster">Komanda tuščia — atsidaryk rinką ir pasirašyk 5 atlikėjus.</div>
          )}

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
                  <Link href={`/atlikejai/${r.slug}`} className="fl-player-name">{r.name}</Link>
                  <span className="fl-player-meta">kaina {r.price}{r.lastWeekPoints !== null ? ` · pr. sav. ${r.lastWeekPoints} tšk.` : ''}</span>
                </span>
                <span className="fl-player-live" title={r.liveBreakdown ? `Topai ${r.liveBreakdown.chart} · YT ${r.liveBreakdown.yt} · Releizai ${r.liveBreakdown.rel} · Bazė ${r.liveBreakdown.base}` : ''}>
                  <b>{r.livePoints}</b>
                  <i>šią sav.</i>
                </span>
                <button
                  className="fl-release"
                  disabled={busyArtist === r.artistId || team.transfersLeft <= 0}
                  title={team.transfersLeft <= 0 ? 'Transferų limitas šiai savaitei' : `Paleisti (grąžins ${r.price} tšk.)`}
                  onClick={() => doAction('release', r.artistId)}
                >✕</button>
              </div>
            ))}
            {Array.from({ length: slotsLeft }).map((_, i) => (
              <button key={`empty-${i}`} className="fl-player empty" onClick={() => setMarketOpen(true)}>
                <span className="fl-player-ph-slot">+</span>
                <span className="fl-empty-label">Laisva vieta — pasirašyk atlikėją</span>
              </button>
            ))}
          </div>

          {/* Rinka */}
          {marketOpen && (
            <div className="fl-market">
              <input
                className="fl-input"
                placeholder="Ieškoti atlikėjo…"
                value={marketQ}
                onChange={e => onSearchChange(e.target.value)}
              />
              {marketLoading && <div className="fl-center small"><div className="fl-spinner" /></div>}
              {!marketLoading && market.length === 0 && <div className="fl-dim" style={{ padding: '14px 0' }}>Nieko nerasta.</div>}
              <div className="fl-market-list">
                {market.map(a => {
                  const canSign = !a.onMyRoster && slotsLeft > 0 && a.price <= team.budgetLeft
                  return (
                    <div key={a.id} className="fl-mrow">
                      <span className="fl-player-img sm">
                        {a.image
                          // eslint-disable-next-line @next/next/no-img-element
                          ? <img src={proxyImg(a.image, 96)} alt="" loading="lazy" />
                          : <span className="fl-player-ph">🎤</span>}
                      </span>
                      <span className="fl-mrow-main">
                        <span className="fl-mrow-name">{a.name} {a.trending && <em className="fl-trend">📈</em>}</span>
                        <span className="fl-player-meta">{a.lastWeekPoints !== null ? `pr. sav. ${a.lastWeekPoints} tšk.` : 'naujokas lygoje'}</span>
                      </span>
                      <span className="fl-mrow-price">{a.price}</span>
                      {a.onMyRoster ? (
                        <span className="fl-mine">✓ tavo</span>
                      ) : (
                        <button
                          className="fl-sign"
                          disabled={!canSign || busyArtist === a.id}
                          title={!canSign ? (slotsLeft <= 0 ? 'Komanda pilna' : a.price > team.budgetLeft ? 'Per brangu' : '') : 'Pasirašyti'}
                          onClick={() => doAction('sign', a.id)}
                        >Pasirašyti</button>
                      )}
                    </div>
                  )
                })}
              </div>
              <div className="fl-pager">
                <button disabled={marketPage === 0 || marketLoading} onClick={() => void loadMarket(marketQ, marketPage - 1)}>← Ankstesni</button>
                <span className="fl-dim">{marketPage * 30 + 1}–{Math.min((marketPage + 1) * 30, marketTotal)} iš {marketTotal}</span>
                <button disabled={(marketPage + 1) * 30 >= marketTotal || marketLoading} onClick={() => void loadMarket(marketQ, marketPage + 1)}>Kiti →</button>
              </div>
            </div>
          )}

          {/* Savaičių istorija */}
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

          <LeagueBoards boards={data.boards} tab={boardTab} setTab={setBoardTab} />

          <p className="fl-foot">
            Taškai skaičiuojami kas pirmadienį iš realių duomenų: vietos TOP40/TOP30 (iki 40 tšk./daina),
            YouTube peržiūrų augimas, nauji releizai (+12), aktyvumo bazė. „Live" — einamosios savaitės prognozė.
          </p>
        </>
      )}
    </div>
  )
}

function LeagueBoards({ boards, tab, setTab }: { boards: Boards; tab: 'week' | 'month' | 'season'; setTab: (t: 'week' | 'month' | 'season') => void }) {
  const rows = boards[tab]
  return (
    <div className="fl-league">
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
          {tab === 'week' ? `Savaitės (${boards.weekLabel}) rezultatai — po pirmadienio skaičiavimo.` : 'Dar nėra rezultatų — lyga tik prasideda!'}
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
.fl-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; }
.fl-back { font-size: 14px; font-weight: 700; color: var(--text-secondary); text-decoration: none; }
.fl-top-name { font-size: 14px; font-weight: 900; color: var(--text-primary); }
.fl-h1 { font-size: 30px; font-weight: 900; letter-spacing: -0.02em; color: var(--text-primary); margin: 0 0 10px; }
.fl-h2 { font-size: 20px; font-weight: 900; color: var(--text-primary); margin: 0; }
.fl-lead { font-size: 14px; color: var(--text-secondary); line-height: 1.6; margin: 0 0 14px; }
.fl-lead b { color: var(--text-primary); }
.fl-dim { font-size: 12px; color: var(--text-muted); }

.fl-center { display: flex; justify-content: center; padding: 70px 0; }
.fl-center.small { padding: 20px 0; }
.fl-spinner { width: 38px; height: 38px; border-radius: 50%; border: 3px solid rgba(148,163,184,0.25); border-top-color: #10b981; animation: flspin .8s linear infinite; }
@keyframes flspin { to { transform: rotate(360deg); } }

.fl-rules { list-style: none; margin: 0 0 14px; padding: 0; display: flex; flex-direction: column; gap: 7px; }
.fl-rules li { font-size: 14px; color: var(--text-secondary); }
.fl-rules b { color: var(--text-primary); }
.fl-warn { font-size: 12px; color: var(--text-secondary); background: rgba(245,158,11,0.1); border: 1px solid rgba(245,158,11,0.35); border-radius: 10px; padding: 9px 12px; margin-bottom: 14px; }
.fl-warn a { color: #f59e0b; font-weight: 800; }

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

.fl-error { font-size: 14px; color: #f87171; background: rgba(248,113,113,0.1); border-radius: 10px; padding: 10px 14px; margin-bottom: 12px; cursor: pointer; }
.fl-notice { font-size: 14px; color: #34d399; background: rgba(16,185,129,0.12); border-radius: 10px; padding: 10px 14px; margin-bottom: 12px; cursor: pointer; }

.fl-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 22px; }
@media (max-width: 560px) { .fl-stats { grid-template-columns: repeat(2, 1fr); } }
.fl-stat { display: flex; flex-direction: column; gap: 3px; background: var(--bg-surface); border: 1px solid rgba(140,160,190,0.2); border-radius: 13px; padding: 12px 14px; }
.fl-stat.big { border-color: rgba(16,185,129,0.5); background: linear-gradient(140deg, rgba(16,185,129,0.12), var(--bg-surface)); }
.fl-stat-label { font-size: 12px; color: var(--text-muted); }
.fl-stat-val { font-size: 24px; font-weight: 900; color: var(--text-primary); line-height: 1.05; }
.fl-stat-val em { font-style: normal; font-size: 12px; color: #10b981; margin-left: 6px; }

.fl-sec-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 10px; }
.fl-btn-market {
  font-size: 14px; font-weight: 800; color: #10b981; cursor: pointer;
  background: rgba(16,185,129,0.1); border: 1px solid rgba(16,185,129,0.4); border-radius: 999px; padding: 8px 16px;
}
.fl-empty-roster { font-size: 14px; color: var(--text-muted); padding: 8px 0 12px; }

.fl-roster { display: flex; flex-direction: column; gap: 8px; margin-bottom: 22px; }
.fl-player {
  display: flex; align-items: center; gap: 12px; padding: 10px 12px; border-radius: 14px;
  background: var(--bg-surface); border: 1px solid rgba(140,160,190,0.2);
}
.fl-player.empty { border-style: dashed; cursor: pointer; color: var(--text-muted); background: transparent; }
.fl-player-ph-slot { width: 44px; height: 44px; border-radius: 50%; border: 1px dashed rgba(140,160,190,0.4); display: flex; align-items: center; justify-content: center; font-size: 20px; flex-shrink: 0; }
.fl-empty-label { font-size: 14px; }
.fl-player-img { width: 44px; height: 44px; border-radius: 50%; overflow: hidden; flex-shrink: 0; background: rgba(148,163,184,0.15); }
.fl-player-img.sm { width: 38px; height: 38px; }
.fl-player-img img { width: 100%; height: 100%; object-fit: cover; display: block; }
.fl-player-ph { display: flex; align-items: center; justify-content: center; width: 100%; height: 100%; font-size: 18px; }
.fl-player-main { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.fl-player-name { font-size: 16px; font-weight: 800; color: var(--text-primary); text-decoration: none; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fl-player-meta { font-size: 12px; color: var(--text-muted); }
.fl-player-live { margin-left: auto; display: flex; flex-direction: column; align-items: flex-end; flex-shrink: 0; }
.fl-player-live b { font-size: 20px; font-weight: 900; color: #10b981; line-height: 1; }
.fl-player-live i { font-style: normal; font-size: 10px; color: var(--text-muted); }
.fl-release {
  flex-shrink: 0; width: 30px; height: 30px; border-radius: 9px; cursor: pointer;
  background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.35); color: #f87171; font-weight: 800;
}
.fl-release:disabled { opacity: 0.35; cursor: not-allowed; }

.fl-market { background: var(--bg-surface); border: 1px solid rgba(16,185,129,0.35); border-radius: 16px; padding: 14px; margin-bottom: 22px; }
.fl-market .fl-input { width: 100%; margin-bottom: 10px; background: var(--bg-body); }
.fl-market-list { display: flex; flex-direction: column; }
.fl-mrow { display: flex; align-items: center; gap: 11px; padding: 8px 4px; border-bottom: 1px dashed rgba(140,160,190,0.15); }
.fl-mrow:last-child { border-bottom: 0; }
.fl-mrow-main { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.fl-mrow-name { font-size: 14px; font-weight: 800; color: var(--text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fl-trend { font-style: normal; font-size: 12px; }
.fl-mrow-price { margin-left: auto; font-size: 16px; font-weight: 900; color: #f59e0b; flex-shrink: 0; }
.fl-sign {
  flex-shrink: 0; font-size: 12px; font-weight: 800; color: #fff; cursor: pointer; border: 0; border-radius: 999px; padding: 8px 14px;
  background: linear-gradient(135deg, #10b981, #059669);
}
.fl-sign:disabled { opacity: 0.35; cursor: not-allowed; }
.fl-mine { flex-shrink: 0; font-size: 12px; font-weight: 800; color: #10b981; }
.fl-pager { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-top: 10px; }
.fl-pager button { font-size: 12px; font-weight: 800; color: var(--text-secondary); background: transparent; border: 1px solid rgba(140,160,190,0.3); border-radius: 999px; padding: 7px 14px; cursor: pointer; }
.fl-pager button:disabled { opacity: 0.35; cursor: not-allowed; }

.fl-weeks { margin-bottom: 22px; }
.fl-weeks-row { display: flex; gap: 8px; overflow-x: auto; padding: 10px 0 4px; }
.fl-week-chip { display: flex; flex-direction: column; align-items: center; gap: 2px; background: var(--bg-surface); border: 1px solid rgba(140,160,190,0.2); border-radius: 11px; padding: 8px 13px; flex-shrink: 0; }
.fl-week-chip span { font-size: 10px; color: var(--text-muted); }
.fl-week-chip b { font-size: 16px; font-weight: 900; color: var(--text-primary); }

.fl-league { background: var(--bg-surface); border: 1px solid rgba(140,160,190,0.18); border-radius: 16px; padding: 16px; margin-bottom: 14px; }
.fl-league-head { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 10px; }
.fl-tabs { display: flex; gap: 6px; margin-bottom: 10px; }
.fl-tabs button {
  font-size: 12px; font-weight: 800; color: var(--text-secondary); cursor: pointer;
  background: transparent; border: 1px solid rgba(140,160,190,0.25); border-radius: 999px; padding: 6px 14px;
}
.fl-tabs button.on { color: #10b981; border-color: rgba(16,185,129,0.6); background: rgba(16,185,129,0.08); }
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
.fl-onboard .fl-league { margin-top: 20px; }
`
