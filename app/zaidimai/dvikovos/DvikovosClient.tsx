'use client'

// app/zaidimai/dvikovos/DvikovosClient.tsx
//
// Dainų dvikovos serijomis — boombox duel archyvo balsavimas.
// Kortelė po kortelės: dvi dainos (viršelis + YT mygtukas paklausyti),
// balsas → bendruomenės procentai → kita dvikova.

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'

type Side = { id: number; title: string; artist: string; cover_url: string | null; ytId: string | null; year: number | null }
type Duel = { id: number; matchup_type: string; a: Side; b: Side }
type Stats = { total: number; aPct: number; bPct: number }

const MATCHUP_LABEL: Record<string, string> = {
  old_vs_old: 'Klasika prieš klasiką',
  new_vs_new: 'Naujiena prieš naujieną',
  old_vs_new: 'Klasika prieš naujieną',
}

export default function DvikovosClient() {
  const [duels, setDuels] = useState<Duel[]>([])
  const [idx, setIdx] = useState(0)
  const [loading, setLoading] = useState(true)
  const [allDone, setAllDone] = useState(false)
  const [voted, setVoted] = useState<'A' | 'B' | null>(null)
  const [stats, setStats] = useState<Stats | null>(null)
  const [xpLeft, setXpLeft] = useState<number | null>(null)
  const [sessionXp, setSessionXp] = useState(0)
  const [votesCount, setVotesCount] = useState(0)
  const [majorityStreak, setMajorityStreak] = useState(0)
  const [playing, setPlaying] = useState<'A' | 'B' | null>(null)
  const advanceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  async function loadBatch() {
    setLoading(true)
    try {
      const res = await fetch('/api/zaidimai/dvikovos')
      const json = await res.json()
      if (json.done || !json.duels?.length) {
        setAllDone(true)
      } else {
        setDuels(json.duels)
        setIdx(0)
        setXpLeft(json.votesXpLeft ?? null)
      }
    } catch { /* rodom empty state */ setAllDone(true) }
    setLoading(false)
  }

  useEffect(() => {
    void loadBatch()
    return () => { if (advanceRef.current) clearTimeout(advanceRef.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const duel = duels[idx] || null

  async function vote(choice: 'A' | 'B') {
    if (!duel || voted) return
    setVoted(choice)
    setPlaying(null)
    try {
      const res = await fetch('/api/zaidimai/dvikovos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dropId: duel.id, choice }),
      })
      const json = await res.json()
      if (json.stats) {
        setStats(json.stats)
        // „Su dauguma" mini-žaidimas: ar tavo pasirinkimas sutampa su bendruomene
        const myPct = choice === 'A' ? json.stats.aPct : json.stats.bPct
        const otherPct = choice === 'A' ? json.stats.bPct : json.stats.aPct
        if (json.stats.total > 1) {
          setMajorityStreak(s => (myPct >= otherPct ? s + 1 : 0))
        }
      }
      if (typeof json.xp === 'number') setSessionXp(x => x + json.xp)
      if (typeof json.votesXpLeft === 'number') setXpLeft(json.votesXpLeft)
      setVotesCount(v => v + 1)
    } catch { /* balsas UI lieka */ }
    advanceRef.current = setTimeout(next, 3200)
  }

  function next() {
    if (advanceRef.current) { clearTimeout(advanceRef.current); advanceRef.current = null }
    setVoted(null)
    setStats(null)
    setPlaying(null)
    if (idx + 1 < duels.length) setIdx(i => i + 1)
    else void loadBatch()
  }

  function SideCard({ side, tag, pct, winner }: { side: Side; tag: 'A' | 'B'; pct: number | null; winner: boolean }) {
    const isPicked = voted === tag
    return (
      <div className={`dv-side${isPicked ? ' picked' : ''}${voted && !isPicked ? ' faded' : ''}`}>
        <div className="dv-media">
          {playing === tag && side.ytId ? (
            <iframe
              src={`https://www.youtube-nocookie.com/embed/${side.ytId}?autoplay=1&rel=0&modestbranding=1&playsinline=1`}
              allow="autoplay; encrypted-media"
              title={side.title}
            />
          ) : (
            <>
              {side.cover_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={side.cover_url} alt="" loading="lazy" />
              ) : side.ytId ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`https://img.youtube.com/vi/${side.ytId}/mqdefault.jpg`} alt="" loading="lazy" />
              ) : (
                <div className="dv-media-empty">🎵</div>
              )}
              {side.ytId && !voted && (
                <button className="dv-play" onClick={(e) => { e.stopPropagation(); setPlaying(tag) }} aria-label="Paklausyti">▶</button>
              )}
            </>
          )}
          {pct !== null && (
            <div className={`dv-pct${winner ? ' win' : ''}`}>{pct}%</div>
          )}
        </div>
        <div className="dv-side-meta">
          <span className="dv-side-title">{side.title}</span>
          <span className="dv-side-artist">{side.artist}{side.year ? ` · ${side.year}` : ''}</span>
        </div>
        {!voted && (
          <button className="dv-vote" onClick={() => vote(tag)}>Balsuoju už šitą</button>
        )}
      </div>
    )
  }

  return (
    <div className="dv-root">
      <style>{css}</style>

      <div className="dv-top">
        <Link href="/zaidimai" className="dv-back">← Žaidimai</Link>
        <div className="dv-top-right">
          {sessionXp > 0 && <span className="dv-session-xp">⚡ +{sessionXp}</span>}
          {xpLeft !== null && xpLeft > 0 && <span className="dv-xp-left">balsų su taškais: {xpLeft}</span>}
        </div>
      </div>

      <h1 className="dv-h1">Dainų dvikovos</h1>

      {loading && <div className="dv-center"><div className="dv-spinner" /></div>}

      {!loading && allDone && (
        <div className="dv-done">
          <span style={{ fontSize: 40 }}>🏁</span>
          <p>Visose dvikovose jau balsavai!</p>
          <p className="dv-done-sub">Naujų atsiranda nuolat — užsuk rytoj. O kol kas:</p>
          <Link href="/zaidimai/dainu-kvizas" className="dv-cta">Žaisti „Atspėk dainą" →</Link>
        </div>
      )}

      {!loading && !allDone && duel && (
        <div className="dv-stage">
          <div className="dv-matchup">{MATCHUP_LABEL[duel.matchup_type] || 'Dvikova'}</div>
          <div className="dv-pair">
            <SideCard
              side={duel.a} tag="A"
              pct={stats ? stats.aPct : null}
              winner={!!stats && stats.aPct >= stats.bPct}
            />
            <div className="dv-vs">VS</div>
            <SideCard
              side={duel.b} tag="B"
              pct={stats ? stats.bPct : null}
              winner={!!stats && stats.bPct >= stats.aPct}
            />
          </div>
          {voted && (
            <div className="dv-after">
              {stats && stats.total > 1 && (
                <span className={`dv-majority${(voted === 'A' ? stats.aPct >= stats.bPct : stats.bPct >= stats.aPct) ? ' with' : ' against'}`}>
                  {(voted === 'A' ? stats.aPct >= stats.bPct : stats.bPct >= stats.aPct)
                    ? <>🎯 Tu su dauguma{majorityStreak >= 3 ? ` — ${majorityStreak} iš eilės!` : ''}</>
                    : <>🦄 Prieš srovę!</>}
                </span>
              )}
              {stats && <span className="dv-after-total">{stats.total} balsų</span>}
              <button className="dv-next" onClick={next}>Kita dvikova →</button>
            </div>
          )}
          <div className="dv-progress-line">{votesCount > 0 ? `Šiandien balsavai ${votesCount} k. · ` : ''}Balsas = 15 tšk. (pirmi 10 per dieną)</div>
        </div>
      )}
    </div>
  )
}

const css = `
.dv-root { max-width: 860px; margin: 0 auto; padding: 24px 16px 90px; }
.dv-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
.dv-back { font-size: 14px; font-weight: 700; color: var(--text-secondary); text-decoration: none; }
.dv-top-right { display: flex; gap: 8px; align-items: center; }
.dv-session-xp { font-size: 14px; font-weight: 900; color: #f59e0b; }
.dv-xp-left { font-size: 12px; color: var(--text-muted); }
.dv-h1 { font-size: 30px; font-weight: 900; letter-spacing: -0.02em; color: var(--text-primary); margin: 0 0 18px; }

.dv-center { display: flex; justify-content: center; padding: 70px 0; }
.dv-spinner { width: 38px; height: 38px; border-radius: 50%; border: 3px solid rgba(148,163,184,0.25); border-top-color: #6366f1; animation: dvspin .8s linear infinite; }
@keyframes dvspin { to { transform: rotate(360deg); } }

.dv-done { display: flex; flex-direction: column; align-items: center; text-align: center; gap: 8px; padding: 50px 0; color: var(--text-primary); font-size: 16px; font-weight: 700; }
.dv-done-sub { font-size: 14px; color: var(--text-secondary); font-weight: 500; }
.dv-cta { margin-top: 8px; font-size: 16px; font-weight: 800; color: #fff; text-decoration: none; background: linear-gradient(135deg, #f59e0b, #f97316); border-radius: 999px; padding: 12px 24px; }

.dv-matchup { text-align: center; font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-muted); margin-bottom: 12px; }

.dv-pair { display: grid; grid-template-columns: 1fr auto 1fr; gap: 12px; align-items: stretch; }
@media (max-width: 640px) { .dv-pair { grid-template-columns: 1fr; } .dv-vs { padding: 2px 0; } }

.dv-vs { align-self: center; font-size: 20px; font-weight: 900; color: var(--text-muted); text-align: center; }

.dv-side {
  display: flex; flex-direction: column; gap: 10px; padding: 12px; border-radius: 16px;
  background: var(--bg-surface); border: 1px solid rgba(140,160,190,0.2);
  transition: border-color .15s ease, opacity .2s ease, transform .15s ease;
}
.dv-side.picked { border-color: #6366f1; box-shadow: 0 0 0 2px rgba(99,102,241,0.35); }
.dv-side.faded { opacity: 0.62; }

.dv-media { position: relative; border-radius: 12px; overflow: hidden; aspect-ratio: 16/10; background: #0c0f15; }
.dv-media img { width: 100%; height: 100%; object-fit: cover; display: block; }
.dv-media iframe { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; }
.dv-media-empty { display: flex; align-items: center; justify-content: center; height: 100%; font-size: 34px; }
.dv-play {
  position: absolute; inset: 0; margin: auto; width: 54px; height: 54px; border-radius: 50%;
  background: rgba(12,15,21,0.72); color: #fff; font-size: 18px; border: 1px solid rgba(255,255,255,0.35); cursor: pointer;
  display: flex; align-items: center; justify-content: center; backdrop-filter: blur(2px);
}
.dv-play:hover { background: rgba(99,102,241,0.85); }
.dv-pct {
  position: absolute; right: 8px; bottom: 8px; font-size: 20px; font-weight: 900; color: #fff;
  background: rgba(12,15,21,0.78); border-radius: 10px; padding: 4px 12px;
}
.dv-pct.win { background: rgba(99,102,241,0.92); }

.dv-side-meta { display: flex; flex-direction: column; gap: 2px; min-height: 40px; }
.dv-side-title { font-size: 16px; font-weight: 800; color: var(--text-primary); }
.dv-side-artist { font-size: 12px; color: var(--text-secondary); }

.dv-vote {
  font-size: 14px; font-weight: 800; color: #fff; cursor: pointer; border: 0; border-radius: 11px; padding: 11px 0;
  background: linear-gradient(135deg, #6366f1, #8b5cf6);
}
.dv-vote:hover { filter: brightness(1.1); }

.dv-after { display: flex; align-items: center; justify-content: center; gap: 16px; margin-top: 16px; flex-wrap: wrap; }
.dv-majority { font-size: 14px; font-weight: 800; }
.dv-majority.with { color: #10b981; }
.dv-majority.against { color: #a78bfa; }
.dv-after-total { font-size: 12px; color: var(--text-muted); }
.dv-next {
  font-size: 14px; font-weight: 800; color: #fff; cursor: pointer; border: 0; border-radius: 999px; padding: 10px 22px;
  background: linear-gradient(135deg, #6366f1, #8b5cf6); box-shadow: 0 8px 20px rgba(99,102,241,0.35);
}
.dv-progress-line { text-align: center; font-size: 12px; color: var(--text-muted); margin-top: 16px; }
`
