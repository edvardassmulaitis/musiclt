'use client'

// app/admin/boombox/page.tsx
//
// Boombox admin moderavimo panelis. 4 tab'ai: Image / Duel / Verdict / Video drops.
// Kiekvienas — sąrašas + kūrimo formą + status toggle (draft → ready) + archive.

import { useEffect, useState, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

type DropType = 'image' | 'duel' | 'verdict' | 'video'

type ImageDrop = {
  id: number
  image_url: string
  ai_prompt: string | null
  correct_track_id: number
  decoy_track_ids: number[]
  difficulty: number
  scheduled_for: string | null
  status: string
  created_at: string
}

type DuelDrop = {
  id: number
  matchup_type: 'old_vs_old' | 'new_vs_new' | 'old_vs_new'
  track_a_id: number
  track_b_id: number
  scheduled_for: string | null
  status: string
  created_at: string
}

type VerdictDrop = {
  id: number
  track_id: number
  scheduled_for: string | null
  status: string
  created_at: string
}

type VideoDrop = {
  id: number
  source: 'tiktok' | 'reels' | 'shorts' | 'youtube'
  source_url: string
  embed_id: string | null
  caption: string
  related_artist_id: number | null
  related_track_id: number | null
  scheduled_for: string | null
  sort_order: number
  status: string
  created_at: string
}

type TrackInfo = { id: number; title: string; artist: string }
type ArtistInfo = { id: number; name: string }

export default function AdminBoombox() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const isAdmin = session?.user?.role === 'admin' || session?.user?.role === 'super_admin'

  const [tab, setTab] = useState<DropType>('image')
  const [drops, setDrops] = useState<any[]>([])
  const [trackMap, setTrackMap] = useState<Record<number, TrackInfo>>({})
  const [artistMap, setArtistMap] = useState<Record<number, ArtistInfo>>({})
  const [loading, setLoading] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    if (status === 'unauthenticated') { router.push('/auth/signin'); return }
    if (status === 'authenticated' && !isAdmin) { router.push('/'); return }
  }, [status, isAdmin, router])

  const load = useCallback(async () => {
    if (status !== 'authenticated' || !isAdmin) return
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/boombox/drops?type=${tab}`)
      const data = await res.json()
      setDrops(data.drops || [])
      setTrackMap(data.trackMap || {})
      setArtistMap(data.artistMap || {})
    } finally {
      setLoading(false)
    }
  }, [tab, status, isAdmin])

  useEffect(() => { load() }, [load])

  async function patchDrop(id: number, patch: any) {
    const res = await fetch('/api/admin/boombox/drops', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, type: tab, ...patch }),
    })
    if (res.ok) {
      setMsg('Atnaujinta')
      load()
    } else {
      const j = await res.json().catch(() => ({}))
      setMsg('Klaida: ' + (j.error || 'unknown'))
    }
    setTimeout(() => setMsg(''), 2500)
  }

  async function archiveDrop(id: number) {
    if (!confirm('Archyvuoti šį drop\'ą?')) return
    const res = await fetch(`/api/admin/boombox/drops?id=${id}&type=${tab}`, { method: 'DELETE' })
    if (res.ok) load()
  }

  if (status === 'loading' || !isAdmin) {
    return <div style={{ padding: 40 }}>Laukiama...</div>
  }

  const tabs: Array<{ key: DropType; label: string }> = [
    { key: 'image', label: 'Atspėk vaizdą' },
    { key: 'duel', label: 'Dvikovos' },
    { key: 'verdict', label: 'Verdiktai' },
    { key: 'video', label: 'Video drop\'ai' },
  ]

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 16 }}>
        <h1 style={{ fontFamily: 'Outfit, system-ui, sans-serif', fontSize: 28, fontWeight: 800 }}>
          Boombox moderavimas
        </h1>
        <Link href="/boombox" style={{ fontSize: 13, color: 'var(--accent-orange)' }}>↗ Žiūrėti zoną</Link>
      </div>

      <div style={{ display: 'flex', gap: 8, borderBottom: '1px solid var(--border-default)', marginBottom: 20, overflowX: 'auto' }}>
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => { setTab(t.key); setShowCreate(false) }}
            style={{
              background: tab === t.key ? 'var(--bg-active)' : 'transparent',
              border: 'none',
              borderBottom: tab === t.key ? '2px solid var(--accent-orange)' : '2px solid transparent',
              padding: '10px 16px',
              fontSize: 13,
              fontWeight: 600,
              color: tab === t.key ? 'var(--text-primary)' : 'var(--text-muted)',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {msg && (
        <div style={{ padding: 10, background: 'var(--status-success-bg)', color: 'var(--status-success-text)', borderRadius: 8, marginBottom: 12, fontSize: 13 }}>
          {msg}
        </div>
      )}

      <div style={{ marginBottom: 16 }}>
        <button
          onClick={() => setShowCreate(s => !s)}
          style={{
            background: 'var(--accent-orange)', color: 'white', border: 'none',
            padding: '10px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}
        >
          {showCreate ? 'Atšaukti' : '+ Naujas'}
        </button>
      </div>

      {showCreate && (
        <CreateForm type={tab} onCreated={() => { setShowCreate(false); load() }} />
      )}

      {loading && <div style={{ padding: 20, color: 'var(--text-muted)' }}>Kraunasi...</div>}

      {!loading && drops.length === 0 && (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
          Tuščia. Sukurk pirmą drop'ą.
        </div>
      )}

      {!loading && drops.length > 0 && (
        <DropTable
          type={tab}
          drops={drops}
          trackMap={trackMap}
          artistMap={artistMap}
          onPatch={patchDrop}
          onArchive={archiveDrop}
        />
      )}
    </div>
  )
}

// ─── Drop tables ───

function DropTable({ type, drops, trackMap, artistMap, onPatch, onArchive }: {
  type: DropType
  drops: any[]
  trackMap: Record<number, TrackInfo>
  artistMap: Record<number, ArtistInfo>
  onPatch: (id: number, patch: any) => void
  onArchive: (id: number) => void
}) {
  return (
    <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 12, overflow: 'hidden' }}>
      <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
        <thead style={{ background: 'var(--bg-elevated)' }}>
          <tr>
            <th style={th}>ID</th>
            <th style={th}>Turinys</th>
            <th style={th}>Data</th>
            <th style={th}>Status</th>
            <th style={th}>Veiksmai</th>
          </tr>
        </thead>
        <tbody>
          {drops.map((d: any) => (
            <tr key={d.id} style={{ borderTop: '1px solid var(--border-default)' }}>
              <td style={td}>{d.id}</td>
              <td style={td}>{describeDrop(type, d, trackMap, artistMap)}</td>
              <td style={td}>
                <input
                  type="date"
                  defaultValue={d.scheduled_for || ''}
                  onBlur={(e) => {
                    const v = e.target.value || null
                    if (v !== d.scheduled_for) onPatch(d.id, { scheduled_for: v })
                  }}
                  style={dateInput}
                />
              </td>
              <td style={td}>
                <select
                  value={d.status}
                  onChange={(e) => onPatch(d.id, { status: e.target.value })}
                  style={statusSelect(d.status)}
                >
                  <option value="draft">draft</option>
                  <option value="ready">ready</option>
                  <option value="archived">archived</option>
                </select>
              </td>
              <td style={td}>
                <button
                  onClick={() => onArchive(d.id)}
                  style={{ background: 'transparent', border: '1px solid var(--border-default)', color: 'var(--text-muted)', padding: '4px 10px', borderRadius: 6, fontSize: 11, cursor: 'pointer' }}
                >
                  Archyvuoti
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function describeDrop(type: DropType, d: any, trackMap: Record<number, TrackInfo>, artistMap: Record<number, ArtistInfo>) {
  if (type === 'image') {
    const correct = trackMap[d.correct_track_id]
    const decoys = (d.decoy_track_ids || []).map((id: number) => trackMap[id]?.title).filter(Boolean).join(', ')
    return (
      <div>
        <div style={{ fontWeight: 600 }}>✓ {correct ? `${correct.artist} — ${correct.title}` : `track #${d.correct_track_id}`}</div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
          decoys: {decoys || '—'} · sunkumas {d.difficulty}
        </div>
        {d.image_url && <a href={d.image_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: 'var(--accent-orange)' }}>↗ vaizdas</a>}
      </div>
    )
  }
  if (type === 'duel') {
    const a = trackMap[d.track_a_id]; const b = trackMap[d.track_b_id]
    return (
      <div>
        <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>{d.matchup_type.replace(/_/g, ' ')}</div>
        <div>A: {a ? `${a.artist} — ${a.title}` : `#${d.track_a_id}`}</div>
        <div>B: {b ? `${b.artist} — ${b.title}` : `#${d.track_b_id}`}</div>
      </div>
    )
  }
  if (type === 'verdict') {
    const t = trackMap[d.track_id]
    return <div>{t ? `${t.artist} — ${t.title}` : `#${d.track_id}`}</div>
  }
  if (type === 'video') {
    const a = d.related_artist_id ? artistMap[d.related_artist_id] : null
    return (
      <div>
        <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>{d.source}</div>
        <div style={{ fontWeight: 600 }}>{d.caption}</div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
          {a ? `→ ${a.name}` : '(be atlikėjo tag\'o)'} · sort {d.sort_order}
        </div>
        <a href={d.source_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: 'var(--accent-orange)' }}>↗ source</a>
      </div>
    )
  }
  return null
}

// ─── Create forms (minimal — just inputs, will be polished later) ───

function CreateForm({ type, onCreated }: { type: DropType; onCreated: () => void }) {
  const [submitting, setSubmitting] = useState(false)
  const [err, setErr] = useState('')
  const [form, setForm] = useState<any>(getEmptyForm(type))

  async function submit() {
    setSubmitting(true); setErr('')
    try {
      const body: any = { type, ...form }
      // Parse decoy IDs for image
      if (type === 'image' && typeof form.decoy_track_ids === 'string') {
        body.decoy_track_ids = form.decoy_track_ids.split(',').map((x: string) => parseInt(x.trim())).filter(Boolean)
      }
      // Number coercions
      if (type === 'image') body.correct_track_id = parseInt(form.correct_track_id)
      if (type === 'duel') {
        body.track_a_id = parseInt(form.track_a_id)
        body.track_b_id = parseInt(form.track_b_id)
      }
      if (type === 'verdict') body.track_id = parseInt(form.track_id)
      if (type === 'video') {
        if (form.related_artist_id) body.related_artist_id = parseInt(form.related_artist_id)
        if (form.related_track_id) body.related_track_id = parseInt(form.related_track_id)
      }

      const res = await fetch('/api/admin/boombox/drops', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const j = await res.json()
      if (res.ok) {
        setForm(getEmptyForm(type))
        onCreated()
      } else {
        setErr(j.error || 'Klaida')
      }
    } finally {
      setSubmitting(false)
    }
  }

  function input(label: string, key: string, opts: { type?: string; placeholder?: string; rows?: number } = {}) {
    return (
      <label style={{ display: 'block', marginBottom: 10 }}>
        <span style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginBottom: 4, fontWeight: 600 }}>{label}</span>
        {opts.rows ? (
          <textarea
            value={form[key] || ''}
            onChange={(e) => setForm({ ...form, [key]: e.target.value })}
            rows={opts.rows}
            placeholder={opts.placeholder}
            className="admin-input"
            style={{ width: '100%' }}
          />
        ) : (
          <input
            type={opts.type || 'text'}
            value={form[key] || ''}
            onChange={(e) => setForm({ ...form, [key]: e.target.value })}
            placeholder={opts.placeholder}
            className="admin-input"
            style={{ width: '100%' }}
          />
        )}
      </label>
    )
  }

  function select(label: string, key: string, options: Array<[string, string]>) {
    return (
      <label style={{ display: 'block', marginBottom: 10 }}>
        <span style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginBottom: 4, fontWeight: 600 }}>{label}</span>
        <select
          value={form[key] || options[0][0]}
          onChange={(e) => setForm({ ...form, [key]: e.target.value })}
          className="admin-input"
          style={{ width: '100%' }}
        >
          {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </label>
    )
  }

  return (
    <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 12, padding: 20, marginBottom: 16 }}>
      <h3 style={{ fontFamily: 'Outfit, system-ui, sans-serif', fontSize: 16, fontWeight: 700, marginBottom: 14 }}>
        Naujas {type === 'image' ? 'atspėk vaizdo' : type === 'duel' ? 'dvikovos' : type === 'verdict' ? 'verdikto' : 'video'} drop'as
      </h3>

      {type === 'image' && (
        <>
          {input('Vaizdo URL (proxinto AI vaizdo)', 'image_url', { placeholder: 'https://...' })}
          {input('AI promptas (referencei)', 'ai_prompt', { rows: 2, placeholder: 'synthwave 80s city, red car...' })}
          {input('Teisingo track ID', 'correct_track_id', { type: 'number' })}
          {input('Decoy track ID\'ai (kableliais, 3 vnt.)', 'decoy_track_ids', { placeholder: '123,456,789' })}
          {input('Sunkumas (1–5)', 'difficulty', { type: 'number' })}
        </>
      )}
      {type === 'duel' && (
        <>
          {select('Matchup tipas', 'matchup_type', [
            ['old_vs_old', 'Old vs Old'],
            ['new_vs_new', 'New vs New'],
            ['old_vs_new', 'Old vs New'],
          ])}
          {input('Track A ID', 'track_a_id', { type: 'number' })}
          {input('Track B ID', 'track_b_id', { type: 'number' })}
        </>
      )}
      {type === 'verdict' && (
        <>
          {input('Track ID', 'track_id', { type: 'number' })}
        </>
      )}
      {type === 'video' && (
        <>
          {select('Šaltinis', 'source', [
            ['shorts', 'YouTube Shorts'],
            ['tiktok', 'TikTok'],
            ['reels', 'Instagram Reels'],
            ['youtube', 'YouTube'],
          ])}
          {input('Source URL', 'source_url', { placeholder: 'https://www.youtube.com/shorts/...' })}
          {input('Embed ID (jei gali ištraukti rankomis)', 'embed_id', { placeholder: 'dQw4w9WgXcQ' })}
          {input('Caption', 'caption', { rows: 2, placeholder: 'kai bočas pradeda Single Ladies šokį...' })}
          {input('Susijęs atlikėjo ID (jei norisi tag\'o)', 'related_artist_id', { type: 'number' })}
          {input('Susijęs track ID (optional)', 'related_track_id', { type: 'number' })}
          {input('Sort order (mažesnis = aukščiau)', 'sort_order', { type: 'number' })}
        </>
      )}

      {input('Schedule data (YYYY-MM-DD, optional)', 'scheduled_for', { type: 'date' })}
      {select('Status', 'status', [
        ['draft', 'Draft'],
        ['ready', 'Ready (publikuoti)'],
      ])}

      {err && <div style={{ color: 'var(--status-error-text)', fontSize: 12, marginBottom: 10 }}>{err}</div>}

      <button
        onClick={submit}
        disabled={submitting}
        style={{ background: 'var(--accent-orange)', color: 'white', border: 'none', padding: '10px 20px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
      >
        {submitting ? 'Kuriama...' : 'Sukurti'}
      </button>
    </div>
  )
}

function getEmptyForm(type: DropType): any {
  if (type === 'image') return { difficulty: '2', status: 'draft' }
  if (type === 'duel') return { matchup_type: 'old_vs_old', status: 'draft' }
  if (type === 'verdict') return { status: 'draft' }
  if (type === 'video') return { source: 'shorts', sort_order: '0', status: 'draft' }
  return {}
}

const th: React.CSSProperties = { padding: '10px 12px', fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600, textAlign: 'left' }
const td: React.CSSProperties = { padding: '12px', fontSize: 13, verticalAlign: 'top' }
const dateInput: React.CSSProperties = {
  background: 'var(--input-bg)', border: '1px solid var(--input-border)',
  color: 'var(--input-text)', padding: '4px 8px', borderRadius: 6, fontSize: 12,
}
function statusSelect(status: string): React.CSSProperties {
  const colors: Record<string, string> = {
    draft: 'var(--text-muted)',
    ready: 'var(--accent-green)',
    archived: 'var(--text-faint)',
  }
  return {
    background: 'var(--input-bg)', border: '1px solid var(--input-border)',
    color: colors[status] || 'var(--text-primary)', padding: '4px 8px', borderRadius: 6,
    fontSize: 12, fontWeight: 600,
  }
}
