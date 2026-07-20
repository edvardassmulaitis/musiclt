'use client'
// Dienos dainos kortelė su balsavimu iškart iš homepage + „pasiūlė".
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { proxyImgResized } from '@/lib/img-proxy'
import { deviceFpSync } from '@/lib/device-fp'

type Nom = {
  id: number; votes: number
  tracks?: { title: string; cover_url: string | null; artists?: { name: string } | null } | null
  proposer?: { username: string | null; full_name: string | null; avatar_url: string | null } | null
}

export default function DienosDainaCard({ nominations, subtitle }: { nominations: Nom[]; subtitle: string }) {
  const [voted, setVoted] = useState<Set<number>>(new Set())
  const [voting, setVoting] = useState<number | null>(null)
  const [bump, setBump] = useState<Record<number, number>>({})

  useEffect(() => {
    let on = true
    fetch('/api/dienos-daina/votes').then(r => r.json()).then(d => { if (on) setVoted(new Set<number>(d.voted_nomination_ids || [])) }).catch(() => {})
    return () => { on = false }
  }, [])

  const doVote = async (id: number) => {
    if (voted.has(id) || voting) return
    setVoting(id)
    try {
      const r = await fetch('/api/dienos-daina/votes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nomination_id: id, fingerprint: deviceFpSync() }) })
      if (r.ok) { setVoted(p => new Set(p).add(id)); setBump(c => ({ ...c, [id]: (c[id] ?? 0) + 1 })) }
    } catch { /* ignore */ } finally { setVoting(null) }
  }

  if (!nominations.length) return null
  const lead = nominations[0]
  const others = nominations.slice(1, 4)
  const propName = (n: Nom) => n.proposer?.username || n.proposer?.full_name || null
  const cnt = (n: Nom) => (n.votes || 0) + (bump[n.id] || 0)
  const Btn = ({ n }: { n: Nom }) => {
    const did = voted.has(n.id)
    return <button className={`v2-vote${did ? ' on' : ''}`} disabled={did || voting === n.id} onClick={(e) => { e.preventDefault(); doVote(n.id) }}>{did ? '✓' : '♥'}</button>
  }

  return (
    <div className="v2-cw">
      <div className="v2-ch"><span className="v2-ch-bar" style={{ background: 'var(--accent-orange)' }} />Dienos daina</div>
      <div className="v2-dd-lead">
        <span className="v2-dd-cov">
          {lead.tracks?.cover_url && (/* eslint-disable-next-line @next/next/no-img-element */<img src={proxyImgResized(lead.tracks.cover_url, 200)} alt="" loading="lazy" />)}
          <span className="v2-dd-badge">#1</span>
        </span>
        <span className="v2-dd-info">
          <span className="v2-dd-tag">{subtitle}</span>
          <b>{lead.tracks?.title}</b>
          <span className="v2-dd-art">{lead.tracks?.artists?.name}</span>
          {propName(lead) && <span className="v2-dd-prop">pasiūlė {propName(lead)}</span>}
        </span>
      </div>
      <div className="v2-dd-leadrow"><span className="v2-dd-votes">{cnt(lead)} ★ balsų</span><Btn n={lead} /></div>
      {others.map((n, i) => (
        <div key={n.id} className="v2-row">
          <span className="v2-row-rank">{i + 2}</span>
          <span className="v2-row-cov">{n.tracks?.cover_url && (/* eslint-disable-next-line @next/next/no-img-element */<img src={proxyImgResized(n.tracks.cover_url, 72)} alt="" loading="lazy" />)}</span>
          <span className="v2-row-txt"><b>{n.tracks?.title}</b><span>{n.tracks?.artists?.name}{propName(n) ? ` · ${propName(n)}` : ''}</span></span>
          <Btn n={n} />
        </div>
      ))}
      <Link href="/dienos-daina" className="v2-clink">Siūlyti savo dainą →</Link>
    </div>
  )
}
