'use client'

// app/admin/boombox/page.tsx
//
// Boombox admin moderavimo panelis. 4 tab'ai (Image / Duel / Verdict / Video).
//
// Kiekvienas tab'as:
//   - Top'e — auto-generate (duel/verdict) arba paprastą formą (image/video)
//   - List'e — visi drop'ai su queue position, status, stats (jei jau matę user'iai)
//   - Vienu klikimu galima archyvuoti / status pakeisti / sort_order pabumpti

import { useEffect, useState, useCallback, useRef } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import MusicSearchPicker, { type AttachmentHit } from '@/components/MusicSearchPicker'

type DropType = 'image' | 'duel' | 'verdict' | 'video'

type TrackInfo = { id: number; title: string; artist: string; release_year: number | null; release_date: string | null }
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
    // Clear stale data IMMEDIATELY — kitaip describeDrop'as bando atvaizduoti
    // skirtingo type'o eilutes per render'į prieš atvykstant naujam data
    setDrops([])
    setTrackMap({})
    setArtistMap({})
    setStatsMap({})
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
  const [uploading, setUploading] = useState(false)
  const [err, setErr] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function uploadFile(file: File) {
    setErr('')
    if (!file.type.startsWith('image/')) {
      setErr('Tik nuotraukos failai leidžiami')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setErr('Failas per didelis (max 5MB)')
      return
    }
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/upload', { method: 'POST', body: fd })
      const j = await res.json()
      if (j.url) setImageUrl(j.url)
      else setErr(j.error || 'Upload klaida')
    } finally {
      setUploading(false)
    }
  }

  async function submit() {
    setErr('')
    if (!imageUrl) return setErr('Įkelk vaizdą')
    if (!correctTrack) return setErr('Pasirink teisingą dainą')

    setSubmitting(true)
    try {
      const res = await fetch('/api/admin/boombox/drops', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'image',
          image_url: imageUrl,
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
        Įkelk AI vaizdą + pasirink teisingą dainą. Decoy track'ai parinkti automatiškai (panašus laikmetis, ta pati šalis, kitas atlikėjas).
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, alignItems: 'flex-start' }}>
        {/* Image upload zona */}
        <div>
          <label style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginBottom: 4, fontWeight: 600 }}>Vaizdas *</label>
          {imageUrl ? (
            <div style={{ position: 'relative', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--accent-orange)' }}>
              <img src={imageUrl} alt="preview" style={{ width: '100%', height: 180, objectFit: 'cover', display: 'block' }} />
              <button
                onClick={() => setImageUrl('')}
                style={{ position: 'absolute', top: 6, right: 6, background: 'rgba(0,0,0,0.6)', color: 'white', border: 'none', borderRadius: '50%', width: 26, height: 26, cursor: 'pointer', fontSize: 14 }}
              >×</button>
            </div>
          ) : (
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault(); setDragOver(false)
                const f = e.dataTransfer.files?.[0]
                if (f) uploadFile(f)
              }}
              onClick={() => fileInputRef.current?.click()}
              style={{
                border: dragOver ? '2px dashed var(--accent-orange)' : '2px dashed var(--border-default)',
                background: dragOver ? 'rgba(249,115,22,0.05)' : 'var(--card-bg)',
                borderRadius: 8,
                padding: '32px 16px',
                textAlign: 'center',
                cursor: 'pointer',
                transition: 'all .15s',
                minHeight: 180,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
              }}
            >
              {uploading ? (
                <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Įkeliama...</div>
              ) : (
                <>
                  <div style={{ fontSize: 32 }}>📥</div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>Tempk failą čia</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>arba spauk pasirinkti · max 5MB</div>
                </>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) uploadFile(f)
                }}
              />
            </div>
          )}
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

          <label style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginTop: 12, marginBottom: 4, fontWeight: 600 }}>
            AI prompt'as <span style={{ color: 'var(--text-faint)' }}>(optional)</span>
          </label>
          <textarea
            value={aiPrompt}
            onChange={e => setAiPrompt(e.target.value)}
            rows={2}
            placeholder="synthwave 80s city, red car..."
            className="admin-input"
            style={{ width: '100%' }}
          />
        </div>
      </div>

      {err && <div style={{ color: 'var(--status-error-text)', fontSize: 12, marginTop: 8 }}>{err}</div>}

      <div style={{ marginTop: 12 }}>
        <button
          onClick={submit}
          disabled={submitting || uploading}
          style={{ background: 'var(--accent-orange)', color: 'white', border: 'none', padding: '10px 20px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
        >
          {submitting ? 'Kuriama...' : '+ Pridėti'}
        </button>
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
            <th style={th}>Atsakymai</th>
            <th style={th}></th>
          </tr>
        </thead>
        <tbody>
          {drops.map((d: any) => {
            const stats = statsMap[d.id]
            const isPublished = !!d.published_at
            const isArchived = d.status === 'archived'
            const isReady = d.status === 'ready'
            const isDraft = d.status === 'draft'
            const queueLabel = isArchived ? 'arch' : isPublished ? '—' : isDraft ? 'off' : `#${d.sort_order || 0}`
            return (
              <tr key={d.id} style={{ borderTop: '1px solid var(--border-default)', opacity: isDraft || isArchived ? 0.55 : 1 }}>
                <td style={{ ...td, color: isPublished ? 'var(--text-faint)' : isReady ? 'var(--accent-green)' : 'var(--text-faint)', fontWeight: 600, fontFamily: 'monospace', fontSize: 12 }}>
                  {queueLabel}
                  {isPublished && (
                    <div style={{ fontSize: 10, color: 'var(--text-faint)', marginTop: 2, fontFamily: 'inherit', fontWeight: 400 }}>
                      {new Date(d.published_at).toLocaleDateString('lt-LT', { month: 'short', day: 'numeric' })}
                    </div>
                  )}
                </td>
                <td style={td}>{describeDrop(type, d, trackMap, artistMap)}</td>
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
                <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                  {!isArchived && (
                    <button
                      onClick={() => onPatch(d.id, { status: isReady ? 'draft' : 'ready' })}
                      title={isReady ? 'Išjungti (draft)' : 'Įjungti (ready)'}
                      style={{
                        background: isReady ? 'transparent' : 'var(--status-success-bg)',
                        border: `1px solid ${isReady ? 'var(--border-default)' : 'var(--accent-green)'}`,
                        color: isReady ? 'var(--text-muted)' : 'var(--accent-green)',
                        padding: '4px 10px', borderRadius: 6, fontSize: 11, cursor: 'pointer', marginRight: 6, fontWeight: 600,
                      }}
                    >
                      {isReady ? 'Išjungti' : 'Įjungti'}
                    </button>
                  )}
                  {isReady && !isPublished && (
                    <button
                      onClick={() => onPatch(d.id, { sort_order: 0 })}
                      title="Pakelti į priekį"
                      style={{ background: 'transparent', border: '1px solid var(--border-default)', color: 'var(--text-muted)', padding: '4px 8px', borderRadius: 6, fontSize: 11, cursor: 'pointer', marginRight: 6 }}
                    >
                      ↑ next
                    </button>
                  )}
                  {!isArchived && (
                    <button
                      onClick={() => onArchive(d.id)}
                      style={{ background: 'transparent', border: '1px solid var(--border-default)', color: 'var(--text-muted)', padding: '4px 10px', borderRadius: 6, fontSize: 11, cursor: 'pointer' }}
                    >
                      Archyvuoti
                    </button>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function trackDateLabel(t: TrackInfo | undefined): { label: string; missing: boolean } {
  if (!t) return { label: '', missing: false }
  if (t.release_date) return { label: new Date(t.release_date).toLocaleDateString('lt-LT', { year: 'numeric', month: 'short', day: 'numeric' }), missing: false }
  if (t.release_year) return { label: String(t.release_year), missing: false }
  return { label: 'be datos', missing: true }
}

function DateLabel({ t }: { t: TrackInfo | undefined }) {
  const d = trackDateLabel(t)
  if (!d.label) return null
  return (
    <span style={{
      marginLeft: 8, fontSize: 11,
      color: d.missing ? 'var(--status-error-text)' : 'var(--text-faint)',
      fontStyle: d.missing ? 'italic' : 'normal',
    }}>
      {d.label}
    </span>
  )
}

function describeDrop(type: DropType, d: any, trackMap: Record<number, TrackInfo>, artistMap: Record<number, ArtistInfo>) {
  if (type === 'image' && d?.correct_track_id) {
    const correct = trackMap[d.correct_track_id]
    const decoys = (d.decoy_track_ids || []).map((id: number) => trackMap[id]?.title).filter(Boolean).join(', ')
    return (
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        {d.image_url && <img src={d.image_url} alt="" style={{ width: 50, height: 50, objectFit: 'cover', borderRadius: 6, flexShrink: 0 }} />}
        <div>
          <div style={{ fontWeight: 600 }}>
            ✓ {correct ? `${correct.artist} — ${correct.title}` : `track #${d.correct_track_id}`}
            <DateLabel t={correct} />
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
            decoys: {decoys || '—'}
          </div>
        </div>
      </div>
    )
  }
  if (type === 'duel' && d?.matchup_type) {
    const a = trackMap[d.track_a_id]; const b = trackMap[d.track_b_id]
    const matchup = String(d.matchup_type || '').replace(/_/g, ' ')
    return (
      <div>
        <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>{matchup}</div>
        <div>
          A: {a ? `${a.artist} — ${a.title}` : `#${d.track_a_id}`}
          <DateLabel t={a} />
        </div>
        <div>
          B: {b ? `${b.artist} — ${b.title}` : `#${d.track_b_id}`}
          <DateLabel t={b} />
        </div>
      </div>
    )
  }
  if (type === 'verdict' && d?.track_id) {
    const t = trackMap[d.track_id]
    return (
      <div>
        {t ? `${t.artist} — ${t.title}` : `#${d.track_id}`}
        <DateLabel t={t} />
      </div>
    )
  }
  if (type === 'video' && d?.source) {
    const a = d.related_artist_id ? artistMap[d.related_artist_id] : null
    const t = d.related_track_id ? trackMap[d.related_track_id] : null
    return (
      <div>
        <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>{d.source}</div>
        {d.caption && <div style={{ fontWeight: 600 }}>{d.caption}</div>}
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
          {t ? `→ ${t.artist} — ${t.title}` : a ? `→ ${a.name}` : <span style={{ color: 'var(--text-faint)' }}>be tag&apos;o</span>}
        </div>
        <a href={d.source_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: 'var(--accent-orange)' }}>↗ source</a>
      </div>
    )
  }
  return null
}

const th: React.CSSProperties = { padding: '10px 12px', fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600, textAlign: 'left' }
const td: React.CSSProperties = { padding: '12px', fontSize: 13, verticalAlign: 'top' }
