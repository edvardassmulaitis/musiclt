'use client'

// app/admin/boombox/page.tsx
//
// Boombox admin moderavimo panelis. 4 tab'ai (Image / Duel / Verdict / Video).
//
// Kiekvienas tab'as:
//   - Top'e — auto-generate (duel/verdict) arba paprastą formą (image/video)
//   - List'e — visi drop'ai su queue position, status, stats (jei jau matę user'iai)
//   - Vienu klikimu galima archyvuoti / status pakeisti / sort_order pabumpti

import { useEffect, useState, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import MusicSearchPicker, { type AttachmentHit } from '@/components/MusicSearchPicker'

type DropType = 'image' | 'duel' | 'verdict' | 'video'

type TrackInfo = { id: number; title: string; artist: string }
type ArtistInfo = { id: number; name: string }
type DropStats = { total: number; correctPct: number | null; topChoice: string | null; topPct: number | null }

export default function AdminBoombox() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const isAdmin = session?.user?.role === 'admin' || session?.user?.role === 'super_admin'

  const [tab, setTab] = useState<DropType>('image')
  const [drops, setDrops] = useState<any[]>([])
  const [trackMap, setTrackMap] = useState<Record<number, TrackInfo>>({})
  const [artistMap, setArtistMap] = useState<Record<number, ArtistInfo>>({})
  const [statsMap, setStatsMap] = useState<Record<number, DropStats>>({})
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
      setStatsMap(data.statsMap || {})
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
    if (res.ok) { setMsg('Atnaujinta'); load() }
    else { const j = await res.json().catch(() => ({})); setMsg('Klaida: ' + (j.error || 'unknown')) }
    setTimeout(() => setMsg(''), 2500)
  }

  async function archiveDrop(id: number) {
    if (!confirm('Archyvuoti šį drop\'ą?')) return
    const res = await fetch(`/api/admin/boombox/drops?id=${id}&type=${tab}`, { method: 'DELETE' })
    if (res.ok) load()
  }

  async function generateBatch(type: 'duel' | 'verdict', scope: 'lt' | 'foreign' | 'mixed', count: number) {
    setLoading(true); setMsg('Generuojama...')
    try {
      const res = await fetch('/api/admin/boombox/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, count, scope }),
      })
      const j = await res.json()
      if (j.error) setMsg('Klaida: ' + j.error)
      else setMsg(`Sukurta ${j.count} iš prašomų ${j.requested}`)
      load()
    } finally {
      setLoading(false)
      setTimeout(() => setMsg(''), 4000)
    }
  }

  if (status === 'loading' || !isAdmin) return <div style={{ padding: 40 }}>Laukiama...</div>

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
        <div style={{ display: 'flex', gap: 14, fontSize: 13 }}>
          <Link href="/admin" style={{ color: 'var(--text-muted)' }}>← admin</Link>
          <Link href="/boombox" target="_blank" style={{ color: 'var(--accent-orange)' }}>↗ žiūrėti zoną</Link>
        </div>
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
              padding: '10px 16px', fontSize: 13, fontWeight: 600,
              color: tab === t.key ? 'var(--text-primary)' : 'var(--text-muted)',
              cursor: 'pointer', whiteSpace: 'nowrap',
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

      {/* Top action bar — type-specific */}
      {(tab === 'duel' || tab === 'verdict') && (
        <AutoGenerateBar
          type={tab}
          onGenerate={(scope, count) => generateBatch(tab, scope, count)}
          disabled={loading}
        />
      )}
      {tab === 'image' && <ImageCreator onCreated={load} />}
      {tab === 'video' && <VideoCreator onCreated={load} />}

      {loading && <div style={{ padding: 20, color: 'var(--text-muted)' }}>Kraunasi...</div>}

      {!loading && drops.length === 0 && (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', background: 'var(--card-bg)', borderRadius: 12, border: '1px dashed var(--border-default)' }}>
          {tab === 'duel' ? 'Tuščia. Spauskim "Generuoti", kad sukurtume kelias dvikovas iš katalogo.' :
           tab === 'verdict' ? 'Tuščia. Spauskim "Generuoti", kad sudėtume verdikto kandidatus.' :
           tab === 'video' ? 'Tuščia. Įmesk pirmą video link\'ą.' :
           'Tuščia. Sukurk pirmą atspėk vaizdo drop\'ą.'}
        </div>
      )}

      {!loading && drops.length > 0 && (
        <DropTable
          type={tab}
          drops={drops}
          trackMap={trackMap}
          artistMap={artistMap}
          statsMap={statsMap}
          onPatch={patchDrop}
          onArchive={archiveDrop}
        />
      )}
    </div>
  )
}

// ─── Auto-generate bar (duel + verdict) ───

function AutoGenerateBar({ type, onGenerate, disabled }: {
  type: 'duel' | 'verdict'
  onGenerate: (scope: 'lt' | 'foreign' | 'mixed', count: number) => void
  disabled: boolean
}) {
  const [scope, setScope] = useState<'lt' | 'foreign' | 'mixed'>('lt')
  const [count, setCount] = useState(10)

  return (
    <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 12, padding: 16, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
      <div style={{ flex: 1, minWidth: 200 }}>
        <div style={{ fontFamily: 'Outfit, system-ui, sans-serif', fontSize: 15, fontWeight: 700, marginBottom: 2 }}>
          Auto-generuoti {type === 'duel' ? 'dvikovas' : 'verdiktus'}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          {type === 'duel'
            ? 'Pora dainų iš katalogo — rotuoja old vs old / new vs new / old vs new. Šalys nemaišomos.'
            : 'Track\'ai su video iš top atlikėjų. Pirmiausia naujausi (≥2024).'}
        </div>
      </div>

      <select value={scope} onChange={e => setScope(e.target.value as any)} className="admin-input" style={{ minWidth: 120 }}>
        <option value="lt">Tik LT</option>
        <option value="foreign">Tik užsienio</option>
        <option value="mixed">Mišrus</option>
      </select>

      <select value={count} onChange={e => setCount(parseInt(e.target.value))} className="admin-input" style={{ minWidth: 80 }}>
        {[5, 10, 20, 30].map(n => <option key={n} value={n}>{n} vnt.</option>)}
      </select>

      <button
        onClick={() => onGenerate(scope, count)}
        disabled={disabled}
        style={{ background: 'var(--accent-orange)', color: 'white', border: 'none', padding: '10px 20px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
      >
        ⚡ Generuoti
      </button>
    </div>
  )
}

// ─── Image creator (image URL + correct track via picker, decoys auto) ───

function ImageCreator({ onCreated }: { onCreated: () => void }) {
  const [imageUrl, setImageUrl] = useState('')
  const [aiPrompt, setAiPrompt] = useState('')
  const [correctTrack, setCorrectTrack] = useState<AttachmentHit | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [err, setErr] = useState('')

  async function submit() {
    setErr('')
    if (!imageUrl.trim()) return setErr('Nurodyk vaizdo URL')
    if (!correctTrack) return setErr('Pasirink teisingą dainą')

    setSubmitting(true)
    try {
      const res = await fetch('/api/admin/boombox/drops', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'image',
          image_url: imageUrl.trim(),
          ai_prompt: aiPrompt.trim() || null,
          correct_track_id: correctTrack.id,
          status: 'ready',
        }),
      })
      const j = await res.json()
      if (!res.ok) { setErr(j.error || 'Klaida'); return }
      setImageUrl(''); setAiPrompt(''); setCorrectTrack(null)
      onCreated()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 12, padding: 16, marginBottom: 16 }}>
      <div style={{ fontFamily: 'Outfit, system-ui, sans-serif', fontSize: 15, fontWeight: 700, marginBottom: 4 }}>
        Naujas atspėk vaizdo drop'as
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 14 }}>
        Įmesk AI vaizdo URL + pasirink teisingą dainą. Decoy track'ai parinkti automatiškai (panašus laikmetis, ta pati šalis, kitas atlikėjas).
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, alignItems: 'flex-start' }}>
        <div>
          <label style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginBottom: 4, fontWeight: 600 }}>Vaizdo URL *</label>
          <input
            type="url"
            value={imageUrl}
            onChange={e => setImageUrl(e.target.value)}
            placeholder="https://..."
            className="admin-input"
            style={{ width: '100%' }}
          />
        </div>

        <div>
          <label style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginBottom: 4, fontWeight: 600 }}>Teisinga daina *</label>
          {correctTrack ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--card-bg)', border: '1px solid var(--accent-orange)', borderRadius: 8, padding: '8px 12px' }}>
              <div style={{ flex: 1, fontSize: 13 }}>
                <strong>{correctTrack.title}</strong>
                <span style={{ color: 'var(--text-muted)', marginLeft: 6 }}>{correctTrack.artist}</span>
              </div>
              <button onClick={() => setCorrectTrack(null)} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 16 }}>×</button>
            </div>
          ) : (
            <MusicSearchPicker
              attached={[]}
              onAdd={(hit) => { if (hit.type === 'daina') setCorrectTrack(hit) }}
              placeholder="Ieškok dainos pavadinimu..."
              compact
            />
          )}
        </div>
      </div>

      <div style={{ marginTop: 10 }}>
        <label style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginBottom: 4, fontWeight: 600 }}>AI prompt'as <span style={{ color: 'var(--text-faint)' }}>(optional, referencei)</span></label>
        <textarea
          value={aiPrompt}
          onChange={e => setAiPrompt(e.target.value)}
          rows={2}
          placeholder="synthwave 80s city, red car..."
          className="admin-input"
          style={{ width: '100%' }}
        />
      </div>

      {err && <div style={{ color: 'var(--status-error-text)', fontSize: 12, marginTop: 8 }}>{err}</div>}

      <div style={{ marginTop: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
        <button
          onClick={submit}
          disabled={submitting}
          style={{ background: 'var(--accent-orange)', color: 'white', border: 'none', padding: '10px 20px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
        >
          {submitting ? 'Kuriama...' : '+ Pridėti'}
        </button>
        <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>Drop'as iškart eis į queue (status: ready). Bus parodytas eilėje pagal sort_order.</span>
      </div>
    </div>
  )
}

// ─── Video creator (URL only + optional artist OR track) ───

function VideoCreator({ onCreated }: { onCreated: () => void }) {
  const [url, setUrl] = useState('')
  const [caption, setCaption] = useState('')
  const [tag, setTag] = useState<AttachmentHit | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [err, setErr] = useState('')

  async function submit() {
    setErr('')
    if (!url.trim()) return setErr('Įmesk video link\'ą')
    setSubmitting(true)
    try {
      const body: any = {
        type: 'video',
        source_url: url.trim(),
        caption: caption.trim(),
        status: 'ready',
      }
      if (tag) {
        if (tag.type === 'grupe') body.related_artist_id = tag.id
        else if (tag.type === 'daina') body.related_track_id = tag.id
      }
      const res = await fetch('/api/admin/boombox/drops', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const j = await res.json()
      if (!res.ok) { setErr(j.error || 'Klaida'); return }
      setUrl(''); setCaption(''); setTag(null)
      onCreated()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 12, padding: 16, marginBottom: 16 }}>
      <div style={{ fontFamily: 'Outfit, system-ui, sans-serif', fontSize: 15, fontWeight: 700, marginBottom: 4 }}>
        Naujas video drop'as
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 14 }}>
        Įmesk TikTok / YT Shorts / IG Reels link'ą. Šaltinį ir embed_id išgaus automatiškai.
      </div>

      <div style={{ marginBottom: 10 }}>
        <label style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginBottom: 4, fontWeight: 600 }}>Video URL *</label>
        <input
          type="url"
          value={url}
          onChange={e => setUrl(e.target.value)}
          placeholder="https://www.youtube.com/shorts/... arba tiktok.com/..."
          className="admin-input"
          style={{ width: '100%' }}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 8 }}>
        <div>
          <label style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginBottom: 4, fontWeight: 600 }}>Caption <span style={{ color: 'var(--text-faint)' }}>(optional)</span></label>
          <input
            type="text"
            value={caption}
            onChange={e => setCaption(e.target.value)}
            placeholder="kai..."
            className="admin-input"
            style={{ width: '100%' }}
          />
        </div>

        <div>
          <label style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginBottom: 4, fontWeight: 600 }}>Susijęs atlikėjas / daina <span style={{ color: 'var(--text-faint)' }}>(optional)</span></label>
          {tag ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--card-bg)', border: '1px solid var(--accent-orange)', borderRadius: 8, padding: '8px 12px' }}>
              <div style={{ flex: 1, fontSize: 13 }}>
                <span style={{ fontSize: 11, color: 'var(--text-muted)', marginRight: 6 }}>{tag.type === 'grupe' ? 'atlikėjas' : 'daina'}</span>
                <strong>{tag.title}</strong>
                {tag.artist && <span style={{ color: 'var(--text-muted)', marginLeft: 6 }}>{tag.artist}</span>}
              </div>
              <button onClick={() => setTag(null)} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 16 }}>×</button>
            </div>
          ) : (
            <MusicSearchPicker
              attached={[]}
              onAdd={(hit) => { if (hit.type !== 'albumas') setTag(hit) }}
              placeholder="Ieškok atlikėjo arba dainos..."
              compact
            />
          )}
        </div>
      </div>

      {err && <div style={{ color: 'var(--status-error-text)', fontSize: 12, marginTop: 8 }}>{err}</div>}

      <div style={{ marginTop: 12 }}>
        <button
          onClick={submit}
          disabled={submitting}
          style={{ background: 'var(--accent-orange)', color: 'white', border: 'none', padding: '10px 20px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
        >
          {submitting ? 'Kuriama...' : '+ Pridėti'}
        </button>
      </div>
    </div>
  )
}

// ─── Drop list table ───

function DropTable({ type, drops, trackMap, artistMap, statsMap, onPatch, onArchive }: {
  type: DropType
  drops: any[]
  trackMap: Record<number, TrackInfo>
  artistMap: Record<number, ArtistInfo>
  statsMap: Record<number, DropStats>
  onPatch: (id: number, patch: any) => void
  onArchive: (id: number) => void
}) {
  return (
    <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 12, overflow: 'hidden' }}>
      <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
        <thead style={{ background: 'var(--bg-elevated)' }}>
          <tr>
            <th style={th}>Eilė</th>
            <th style={th}>Turinys</th>
            <th style={th}>Status</th>
            <th style={th}>Užfiksuota</th>
            <th style={th}></th>
          </tr>
        </thead>
        <tbody>
          {drops.map((d: any) => {
            const stats = statsMap[d.id]
            const isPublished = !!d.published_at
            const queueLabel = isPublished ? '—' : `#${d.sort_order || 0}`
            return (
              <tr key={d.id} style={{ borderTop: '1px solid var(--border-default)' }}>
                <td style={{ ...td, color: isPublished ? 'var(--text-faint)' : 'var(--text-secondary)', fontWeight: 600, fontFamily: 'monospace', fontSize: 12 }}>
                  {queueLabel}
                </td>
                <td style={td}>{describeDrop(type, d, trackMap, artistMap)}</td>
                <td style={td}>
                  <select
                    value={d.status}
                    onChange={(e) => onPatch(d.id, { status: e.target.value })}
                    style={statusSelectStyle(d.status)}
                  >
                    <option value="draft">draft</option>
                    <option value="ready">ready</option>
                    <option value="archived">archived</option>
                  </select>
                  {isPublished && (
                    <div style={{ fontSize: 10, color: 'var(--text-faint)', marginTop: 4 }}>
                      pirmąkart {new Date(d.published_at).toLocaleDateString('lt-LT')}
                    </div>
                  )}
                </td>
                <td style={{ ...td, fontSize: 12 }}>
                  {stats && stats.total > 0 ? (
                    <div>
                      <div><strong>{stats.total}</strong> {stats.total === 1 ? 'atsakymas' : 'atsakymai'}</div>
                      {stats.correctPct !== null && (
                        <div style={{ color: 'var(--text-muted)' }}>{stats.correctPct}% atspėjo</div>
                      )}
                      {stats.topChoice && stats.topPct !== null && (
                        <div style={{ color: 'var(--text-muted)' }}>top: {stats.topChoice} ({stats.topPct}%)</div>
                      )}
                    </div>
                  ) : (
                    <span style={{ color: 'var(--text-faint)' }}>—</span>
                  )}
                </td>
                <td style={{ ...td, textAlign: 'right' }}>
                  {!isPublished && (
                    <button
                      onClick={() => onPatch(d.id, { sort_order: 0 })}
                      title="Pakelti į priekį"
                      style={{ background: 'transparent', border: '1px solid var(--border-default)', color: 'var(--text-muted)', padding: '4px 8px', borderRadius: 6, fontSize: 11, cursor: 'pointer', marginRight: 6 }}
                    >
                      ↑ next
                    </button>
                  )}
                  <button
                    onClick={() => onArchive(d.id)}
                    style={{ background: 'transparent', border: '1px solid var(--border-default)', color: 'var(--text-muted)', padding: '4px 10px', borderRadius: 6, fontSize: 11, cursor: 'pointer' }}
                  >
                    Archyvuoti
                  </button>
                </td>
              </tr>
            )
          })}
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
          decoys: {decoys || '—'}
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
    const t = d.related_track_id ? trackMap[d.related_track_id] : null
    return (
      <div>
        <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>{d.source}</div>
        {d.caption && <div style={{ fontWeight: 600 }}>{d.caption}</div>}
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
          {t ? `→ ${t.artist} — ${t.title}` : a ? `→ ${a.name}` : <span style={{ color: 'var(--text-faint)' }}>be tag\'o</span>}
        </div>
        <a href={d.source_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: 'var(--accent-orange)' }}>↗ source</a>
      </div>
    )
  }
  return null
}

const th: React.CSSProperties = { padding: '10px 12px', fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600, textAlign: 'left' }
const td: React.CSSProperties = { padding: '12px', fontSize: 13, verticalAlign: 'top' }

function statusSelectStyle(s: string): React.CSSProperties {
  const colors: Record<string, string> = {
    draft: 'var(--text-muted)',
    ready: 'var(--accent-green)',
    archived: 'var(--text-faint)',
  }
  return {
    background: 'var(--input-bg)', border: '1px solid var(--input-border)',
    color: colors[s] || 'var(--text-primary)', padding: '4px 8px', borderRadius: 6, fontSize: 12, fontWeight: 600,
  }
}
