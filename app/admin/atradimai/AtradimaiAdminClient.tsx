'use client'

// app/admin/atradimai/AtradimaiAdminClient.tsx
// Trūkstami + susieti atradimai su komentaro kontekstu (išskleidžiama).
// Trūkstamus → susieti su DB / sukurti / praleisti. Susietus → atrišti (taisymui).

import { useState } from 'react'
import Link from 'next/link'

export type Sample = { id: number; track_name: string | null; embed_type: string | null; embed_id: string | null; body: string }
export type PendingGroup = { artist_name: string; count: number; ids: number[]; samples: Sample[] }
export type LinkedGroup = { artist_id: number; db_name: string; slug: string | null; raw_name: string; count: number; samples: Sample[] }
export type Report = { id: number; kind: string; name: string; note: string | null; source_url: string | null; context: string | null; created_at: string }
type ArtistHit = { id: number; name: string; slug: string; country: string | null; cover_image_url: string | null }

function embedUrl(t: string | null, id: string | null) {
  if (!id) return null
  if (t === 'youtube') return `https://youtu.be/${id}`
  const kind = (t || 'spotify_track').replace('spotify_', '')
  return `https://open.spotify.com/${kind}/${id}`
}

const btn: React.CSSProperties = { fontSize: 13.5, fontWeight: 700, padding: '6px 12px', borderRadius: 8, border: '1px solid #e6e3df', background: '#fff', cursor: 'pointer' }
const card: React.CSSProperties = { background: '#fff', border: '1px solid #e6e3df', borderRadius: 12, padding: 14 }

async function patch(payload: any) {
  await fetch('/api/admin/atradimai', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }).catch(() => {})
}

function Samples({ samples }: { samples: Sample[] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, margin: '10px 0', paddingTop: 10, borderTop: '1px solid #f1efec' }}>
      {samples.map(s => {
        const u = embedUrl(s.embed_type, s.embed_id)
        return (
          <div key={s.id} style={{ fontSize: 13.5, color: '#4b463f', lineHeight: 1.5 }}>
            {s.track_name && <span style={{ fontWeight: 700, color: '#1a1a1a' }}>{s.track_name} · </span>}
            {s.body || <span style={{ color: '#9c978d' }}>(be teksto)</span>}
            {u && <a href={u} target="_blank" rel="noopener noreferrer" style={{ marginLeft: 6, color: '#2563eb', fontSize: 12.5, whiteSpace: 'nowrap' }}>{s.embed_type === 'youtube' ? '▶ klausyti' : '♫ klausyti'}</a>}
          </div>
        )
      })}
    </div>
  )
}

function ExpandToggle({ open, set, count }: { open: boolean; set: (v: boolean) => void; count: number }) {
  return (
    <button onClick={() => set(!open)} style={{ ...btn, border: 'none', background: 'transparent', color: '#6b675f', padding: '4px 0', fontSize: 13 }}>
      {open ? '▾ Slėpti' : `▸ Rodyti komentarus (${count})`}
    </button>
  )
}

function LinkArtist({ rawName, ids, onLinked }: { rawName: string; ids?: number[]; onLinked: () => void }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [res, setRes] = useState<ArtistHit[]>([])
  const [busy, setBusy] = useState(false)
  async function search(v: string) {
    setQ(v); if (v.trim().length < 2) { setRes([]); return }
    try { const r = await fetch('/api/admin/artists/search?q=' + encodeURIComponent(v)).then(r => r.json()); setRes(r.results || []) } catch { setRes([]) }
  }
  async function link(a: ArtistHit) { setBusy(true); await patch({ type: 'link_artist', artist_name: rawName, artist_id: a.id, discovery_ids: ids }); onLinked() }
  if (!open) return <button style={{ ...btn, color: '#2563eb', borderColor: '#2563eb44' }} onClick={() => { setOpen(true); search(rawName) }}>🔗 Susieti su DB</button>
  return (
    <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
      <input autoFocus value={q} onChange={e => search(e.target.value)} placeholder="Ieškoti atlikėjo DB…"
        style={{ width: '100%', padding: '7px 10px', borderRadius: 8, border: '1px solid #e6e3df', fontSize: 14, outline: 'none' }} />
      {res.length > 0 && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20, marginTop: 4, background: '#fff', border: '1px solid #e6e3df', borderRadius: 10, boxShadow: '0 10px 30px rgba(0,0,0,.15)', maxHeight: 240, overflowY: 'auto' }}>
          {res.map(a => (
            <button key={a.id} disabled={busy} onClick={() => link(a)}
              style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', padding: '8px 10px', border: 'none', borderBottom: '1px solid #f1efec', background: 'transparent', cursor: 'pointer', fontSize: 14 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {a.cover_image_url ? <img src={a.cover_image_url} alt="" width={24} height={24} style={{ borderRadius: 5, objectFit: 'cover' }} /> : <span style={{ width: 24, height: 24, borderRadius: 5, background: '#eee', display: 'inline-block' }} />}
              <span style={{ fontWeight: 700 }}>{a.name}</span>
              {a.country && <span style={{ color: '#9c978d', fontSize: 12 }}>{a.country}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function PendingCard({ g, onGone }: { g: PendingGroup; onGone: () => void }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
        <strong style={{ fontSize: 15 }}>{g.artist_name}</strong>
        <span style={{ fontSize: 12, color: '#9c978d', fontWeight: 700 }}>{g.count}×</span>
      </div>
      <ExpandToggle open={open} set={setOpen} count={g.count} />
      {open && <Samples samples={g.samples} />}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 8 }}>
        <LinkArtist rawName={g.artist_name} ids={g.ids} onLinked={onGone} />
        <Link href="/admin/artist-import" style={{ ...btn, color: '#f97316', borderColor: '#f9731644', textDecoration: 'none' }}>+ Sukurti</Link>
        <button style={btn} onClick={() => { patch({ type: 'pending_done', artist_name: g.artist_name, discovery_ids: g.ids }); onGone() }}>Praleisti</button>
      </div>
    </div>
  )
}

function LinkedCard({ g, onUnlinked }: { g: LinkedGroup; onUnlinked: () => void }) {
  const [open, setOpen] = useState(false)
  const mismatch = g.raw_name && g.db_name && g.raw_name.toLowerCase() !== g.db_name.toLowerCase()
  return (
    <div style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
        <div style={{ minWidth: 0 }}>
          {g.slug ? <Link href={`/atlikejai/${g.slug}`} target="_blank" style={{ fontSize: 15, fontWeight: 800, color: '#16a34a', textDecoration: 'none' }}>{g.db_name}</Link> : <strong style={{ fontSize: 15 }}>{g.db_name}</strong>}
          {mismatch && <span style={{ fontSize: 12.5, color: '#b45309', marginLeft: 6 }}>(tekste: „{g.raw_name}")</span>}
        </div>
        <span style={{ fontSize: 12, color: '#9c978d', fontWeight: 700 }}>{g.count}×</span>
      </div>
      <ExpandToggle open={open} set={setOpen} count={g.count} />
      {open && <Samples samples={g.samples} />}
      <div style={{ marginTop: 8 }}>
        <button style={{ ...btn, color: '#dc2626', borderColor: '#dc262644' }} onClick={() => { patch({ type: 'unlink', artist_id: g.artist_id }); onUnlinked() }}>↩ Atrišti (į trūkstamus)</button>
      </div>
    </div>
  )
}

export default function AtradimaiAdminClient({ pendingGroups, linkedGroups, reports }: { pendingGroups: PendingGroup[]; linkedGroups: LinkedGroup[]; reports: Report[] }) {
  const [pend, setPend] = useState(pendingGroups)
  const [linked, setLinked] = useState(linkedGroups)
  const [reps, setReps] = useState(reports)
  const [showLinked, setShowLinked] = useState(false)

  return (
    <div style={{ maxWidth: 1040, margin: '0 auto', padding: '28px 20px 80px' }}>
      <h1 style={{ fontFamily: "'Outfit',sans-serif", fontSize: 26, fontWeight: 900, margin: '0 0 4px' }}>Muzikos atradimai</h1>
      <p style={{ color: '#6b675f', fontSize: 14, margin: '0 0 24px' }}>
        Atlikėjai iš <Link href="/muzikos-atradimai" style={{ color: '#f97316', fontWeight: 700 }}>atradimų</Link>. Išskleisk komentarą kontekstui, tada <b>„Susieti su DB"</b> (jei jau yra), <b>„Sukurti"</b> arba <b>„Praleisti"</b>.
      </p>

      <h2 style={{ fontFamily: "'Outfit',sans-serif", fontSize: 17, fontWeight: 800, margin: '0 0 12px' }}>Trūkstami atlikėjai ({pend.length})</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(340px,1fr))', gap: 12, marginBottom: 36 }}>
        {pend.length === 0 ? <p style={{ color: '#6b675f' }}>Visi sutvarkyti 🎉</p> :
          pend.map(g => <PendingCard key={g.artist_name} g={g} onGone={() => setPend(p => p.filter(x => x.artist_name !== g.artist_name))} />)}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <h2 style={{ fontFamily: "'Outfit',sans-serif", fontSize: 17, fontWeight: 800, margin: 0 }}>Susieti su DB ({linked.length})</h2>
        <button style={{ ...btn, border: 'none', background: 'transparent', color: '#2563eb' }} onClick={() => setShowLinked(s => !s)}>{showLinked ? 'Slėpti' : 'Peržiūrėti / taisyti'}</button>
      </div>
      {showLinked && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(340px,1fr))', gap: 12, marginBottom: 36 }}>
          {linked.length === 0 ? <p style={{ color: '#6b675f' }}>Susietų nėra.</p> :
            linked.map(g => <LinkedCard key={g.artist_id} g={g} onUnlinked={() => setLinked(l => l.filter(x => x.artist_id !== g.artist_id))} />)}
        </div>
      )}

      <h2 style={{ fontFamily: "'Outfit',sans-serif", fontSize: 17, fontWeight: 800, margin: '0 0 12px' }}>Narių pranešimai ({reps.length})</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {reps.length === 0 ? <p style={{ color: '#6b675f' }}>Naujų pranešimų nėra.</p> : reps.map(r => (
          <div key={r.id} style={{ ...card, display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
            <div style={{ minWidth: 0 }}>
              <span style={{ fontSize: 11.5, fontWeight: 800, textTransform: 'uppercase', color: '#9c978d', letterSpacing: '.04em' }}>{r.kind}</span>
              <div style={{ fontSize: 15, fontWeight: 700 }}>{r.name}</div>
              {r.note && <div style={{ fontSize: 14, color: '#6b675f', marginTop: 2 }}>{r.note}</div>}
              {r.source_url && <a href={r.source_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, color: '#2563eb' }}>{r.source_url}</a>}
            </div>
            <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
              <button style={{ ...btn, color: '#16a34a', borderColor: '#16a34a44' }} onClick={() => { patch({ type: 'report', id: r.id, status: 'handled' }); setReps(x => x.filter(y => y.id !== r.id)) }}>Sutvarkyta</button>
              <button style={{ ...btn, color: '#9c978d' }} onClick={() => { patch({ type: 'report', id: r.id, status: 'rejected' }); setReps(x => x.filter(y => y.id !== r.id)) }}>Atmesti</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
