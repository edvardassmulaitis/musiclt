'use client'

// app/admin/atradimai/AtradimaiAdminClient.tsx
// Trūkstamų atlikėjų (iš atradimų) + narių pranešimų valdymas.

import { useState } from 'react'
import Link from 'next/link'

export type PendingGroup = {
  artist_name: string
  count: number
  samples: { id: number; track_name: string | null; embed_type: string | null; embed_id: string | null }[]
}
export type Report = {
  id: number; kind: string; name: string; note: string | null; source_url: string | null; context: string | null; created_at: string
}

function embedUrl(t: string | null, id: string | null) {
  if (!id) return null
  if (t === 'youtube') return `https://youtu.be/${id}`
  const kind = (t || 'spotify_track').replace('spotify_', '')
  return `https://open.spotify.com/${kind}/${id}`
}

export default function AtradimaiAdminClient({ pendingGroups, reports }: { pendingGroups: PendingGroup[]; reports: Report[] }) {
  const [groups, setGroups] = useState(pendingGroups)
  const [reps, setReps] = useState(reports)

  async function patch(payload: any) {
    await fetch('/api/admin/atradimai', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }).catch(() => {})
  }
  function markPending(name: string) {
    patch({ type: 'pending_done', artist_name: name }); setGroups(g => g.filter(x => x.artist_name !== name))
  }
  function markReport(id: number, status: string) {
    patch({ type: 'report', id, status }); setReps(r => r.filter(x => x.id !== id))
  }

  const card: React.CSSProperties = { background: '#fff', border: '1px solid #e6e3df', borderRadius: 12, padding: 14 }
  const btn: React.CSSProperties = { fontSize: 12.5, fontWeight: 700, padding: '6px 12px', borderRadius: 8, border: '1px solid #e6e3df', background: '#fff', cursor: 'pointer' }

  return (
    <div style={{ maxWidth: 980, margin: '0 auto', padding: '28px 20px 80px' }}>
      <h1 style={{ fontFamily: "'Outfit',sans-serif", fontSize: 26, fontWeight: 900, margin: '0 0 4px' }}>Atradimai — trūkstami</h1>
      <p style={{ color: '#6b675f', fontSize: 14, margin: '0 0 24px' }}>
        Atlikėjai/dainos, paminėti „Muzikos atradimuose", kurių dar nėra DB. Sukūrus per <Link href="/admin/artist-import" style={{ color: '#f97316', fontWeight: 700 }}>Atlikėjų importą</Link>, atradimai automatiškai susisies (vardo sutapimas).
      </p>

      <h2 style={{ fontFamily: "'Outfit',sans-serif", fontSize: 17, fontWeight: 800, margin: '0 0 12px' }}>
        Trūkstami atlikėjai iš atradimų ({groups.length})
      </h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))', gap: 12, marginBottom: 36 }}>
        {groups.length === 0 ? <p style={{ color: '#6b675f' }}>Visi sutvarkyti 🎉</p> : groups.map(g => (
          <div key={g.artist_name} style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
              <strong style={{ fontSize: 15 }}>{g.artist_name}</strong>
              <span style={{ fontSize: 11, color: '#9c978d', fontWeight: 700 }}>{g.count}×</span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '8px 0' }}>
              {g.samples.map(s => {
                const u = embedUrl(s.embed_type, s.embed_id)
                return u ? <a key={s.id} href={u} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11.5, color: '#2563eb', textDecoration: 'none', background: '#f1f4f9', padding: '3px 8px', borderRadius: 8 }}>{s.embed_type === 'youtube' ? '▶' : '♫'} {s.track_name || 'klausyti'}</a> : null
              })}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Link href="/admin/artist-import" style={{ ...btn, color: '#f97316', borderColor: '#f9731644', textDecoration: 'none' }}>+ Sukurti</Link>
              <button style={btn} onClick={() => markPending(g.artist_name)}>Pažymėti tvarkyta</button>
            </div>
          </div>
        ))}
      </div>

      <h2 style={{ fontFamily: "'Outfit',sans-serif", fontSize: 17, fontWeight: 800, margin: '0 0 12px' }}>
        Narių pranešimai ({reps.length})
      </h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {reps.length === 0 ? <p style={{ color: '#6b675f' }}>Naujų pranešimų nėra.</p> : reps.map(r => (
          <div key={r.id} style={{ ...card, display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
            <div style={{ minWidth: 0 }}>
              <span style={{ fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', color: '#9c978d', letterSpacing: '.04em' }}>{r.kind}</span>
              <div style={{ fontSize: 15, fontWeight: 700 }}>{r.name}</div>
              {r.note && <div style={{ fontSize: 13, color: '#6b675f', marginTop: 2 }}>{r.note}</div>}
              {r.source_url && <a href={r.source_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: '#2563eb' }}>{r.source_url}</a>}
            </div>
            <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
              <button style={{ ...btn, color: '#16a34a', borderColor: '#16a34a44' }} onClick={() => markReport(r.id, 'handled')}>Sutvarkyta</button>
              <button style={{ ...btn, color: '#9c978d' }} onClick={() => markReport(r.id, 'rejected')}>Atmesti</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
