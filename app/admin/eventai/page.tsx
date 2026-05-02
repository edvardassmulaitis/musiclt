'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

/* ──────────────────────────────────────────────────────────────────
 * /admin/eventai — visi „Kas vyksta" feed event'ai (activity_events)
 *  + visų vartotojų personal notifications statistika.
 *
 * Tikslas: viename ekrane matyti, kurie endpoint'ai realiai trigger'ina,
 * kuris event tipas dažniausias, paskutiniai 200 įrašų su preview, ir
 * galimybė selektyviai trinti (admin only).
 * ────────────────────────────────────────────────────────────────── */

type ActivityRow = {
  id: number
  event_type: string
  user_id: string | null
  actor_name: string | null
  actor_avatar: string | null
  entity_type: string | null
  entity_id: number | null
  entity_title: string | null
  entity_url: string | null
  entity_image: string | null
  metadata: any
  created_at: string
  is_public: boolean
}

type EventTypeMeta = {
  type: string
  label: string
  source: string
  group: 'reaction' | 'content' | 'vote' | 'comment' | 'system'
}

// Visų known event tipų katalogas — užtikrina, kad pamatyti
// kuriame endpoint'e log'inama net jei dar nei vieno įrašo nėra.
const KNOWN_EVENTS: EventTypeMeta[] = [
  { type: 'artist_like',      label: 'Atlikėjo patiktukas',     source: 'POST /api/artists/[id]/like',         group: 'reaction' },
  { type: 'album_like',       label: 'Albumo patiktukas',       source: 'POST /api/albums/[id]/like',          group: 'reaction' },
  { type: 'track_like',       label: 'Dainos patiktukas',       source: '(dar nėra endpoint\'o)',              group: 'reaction' },
  { type: 'comment',          label: 'Komentaras',              source: 'POST /api/comments + /api/forum-posts', group: 'comment' },
  { type: 'thread_created',   label: 'Nauja diskusija',         source: 'POST /api/diskusijos',                group: 'comment' },
  { type: 'daily_nomination', label: 'Dienos dainos nominacija',source: 'POST /api/dienos-daina/nominations',  group: 'vote' },
  { type: 'daily_vote',       label: 'Dienos dainos balsas',    source: 'POST /api/dienos-daina/votes',        group: 'vote' },
  { type: 'top_vote',         label: 'TOP balsavimas',          source: 'POST /api/top/vote',                  group: 'vote' },
  { type: 'voting_vote',      label: 'Apdovanojimų balsavimas', source: '(dar nesujungta)',                    group: 'vote' },
  { type: 'blog_post',        label: 'Naujas blog įrašas',      source: 'POST /api/blog/posts (kai status=published)', group: 'content' },
  { type: 'news',             label: 'Nauja naujiena',          source: '(dar nesujungta)',                    group: 'content' },
  { type: 'event_created',    label: 'Naujas renginys',         source: '(dar nesujungta)',                    group: 'content' },
]

const GROUP_LABEL: Record<string, string> = {
  reaction: 'Reakcijos',
  comment:  'Komentarai ir diskusijos',
  vote:     'Balsavimai',
  content:  'Naujas turinys',
  system:   'Sistema',
}

function relTime(iso: string): string {
  const d = new Date(iso).getTime()
  const diff = Math.max(0, Date.now() - d)
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'ką tik'
  if (m < 60) return `prieš ${m} min.`
  const h = Math.floor(m / 60)
  if (h < 24) return `prieš ${h} val.`
  const days = Math.floor(h / 24)
  if (days < 7) return `prieš ${days} d.`
  return new Date(iso).toLocaleDateString('lt-LT')
}

export default function AdminEventaiPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [rows, setRows] = useState<ActivityRow[]>([])
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [notifTotal, setNotifTotal] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [filterType, setFilterType] = useState<string>('')
  const [deleting, setDeleting] = useState<number | null>(null)

  const isAdmin = (session?.user as any)?.role === 'admin' || (session?.user as any)?.role === 'super_admin'

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/auth/signin')
  }, [status, router])

  const load = useCallback(async () => {
    if (!isAdmin) return
    setLoading(true)
    try {
      const url = `/api/admin/eventai${filterType ? `?type=${encodeURIComponent(filterType)}` : ''}`
      const res = await fetch(url, { cache: 'no-store' })
      const json = await res.json()
      setRows(json.events || [])
      setCounts(json.counts || {})
      setNotifTotal(typeof json.notifications_total === 'number' ? json.notifications_total : null)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [isAdmin, filterType])

  useEffect(() => { load() }, [load])

  const totalAcrossTypes = useMemo(
    () => Object.values(counts).reduce((s, n) => s + n, 0),
    [counts],
  )

  const onDelete = async (id: number) => {
    if (!confirm('Pašalinti šį įvykį?')) return
    setDeleting(id)
    try {
      await fetch(`/api/admin/eventai?id=${id}`, { method: 'DELETE' })
      setRows(r => r.filter(x => x.id !== id))
    } finally { setDeleting(null) }
  }

  const grouped = useMemo(() => {
    const out: Record<string, EventTypeMeta[]> = {}
    for (const ev of KNOWN_EVENTS) {
      if (!out[ev.group]) out[ev.group] = []
      out[ev.group].push(ev)
    }
    return out
  }, [])

  if (status === 'loading') return <Centered>Kraunasi…</Centered>
  if (!session) return null
  if (!isAdmin) return <Centered>Reikalingos admin teisės.</Centered>

  return (
    <div style={{ padding: '24px 16px', maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ marginBottom: 12 }}>
        <Link href="/admin" style={{ fontSize: 13, color: '#666', textDecoration: 'none' }}>← Admin</Link>
      </div>
      <h1 style={{ fontSize: 26, fontWeight: 900, marginBottom: 4 }}>Įvykiai (activity_events)</h1>
      <p style={{ fontSize: 13, color: '#666', marginBottom: 24, maxWidth: 700 }}>
        Visi „Kas vyksta" feed event'ai. Įjungti tipai automatiškai įrašomi
        atitinkamuose endpoint'uose. Spausk ant tipo kortelės, kad filtruotum
        sąrašą — pamatysi ar tas event'as iš tikrųjų krenta į DB.
      </p>

      {/* Per-type stats grid */}
      {(Object.keys(grouped) as Array<keyof typeof grouped>).map(g => (
        <section key={g as string} style={{ marginBottom: 20 }}>
          <h2 style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#888', margin: '0 0 8px 4px' }}>
            {GROUP_LABEL[g as string]}
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 10 }}>
            {grouped[g as string].map(meta => {
              const count = counts[meta.type] || 0
              const isActive = filterType === meta.type
              const isWired = !meta.source.includes('dar nėra') && !meta.source.includes('dar nesujungta')
              return (
                <button
                  key={meta.type}
                  onClick={() => setFilterType(isActive ? '' : meta.type)}
                  style={{
                    textAlign: 'left',
                    background: isActive ? '#fff' : isWired ? '#fff' : '#fafafa',
                    border: isActive ? '2px solid #f97316' : '1px solid #e5e5e5',
                    borderRadius: 12,
                    padding: '12px 14px',
                    cursor: 'pointer',
                    display: 'flex', flexDirection: 'column', gap: 6,
                    opacity: isWired ? 1 : 0.65,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <span style={{ fontSize: 13.5, fontWeight: 700 }}>{meta.label}</span>
                    <span style={{
                      fontSize: 11, fontWeight: 800,
                      padding: '2px 8px', borderRadius: 999,
                      background: count > 0 ? 'rgba(16,185,129,0.12)' : '#f0f0f0',
                      color: count > 0 ? '#10b981' : '#999',
                    }}>{count}</span>
                  </div>
                  <code style={{ fontSize: 11, color: '#555', background: '#f5f5f5', padding: '2px 6px', borderRadius: 4 }}>
                    {meta.type}
                  </code>
                  <div style={{ fontSize: 11, color: '#888' }}>{meta.source}</div>
                </button>
              )
            })}
          </div>
        </section>
      ))}

      {/* Summary row */}
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: 16, marginBottom: 16, padding: '12px 16px',
        background: '#fff', border: '1px solid #e5e5e5', borderRadius: 12,
      }}>
        <Stat label="Iš viso įvykių" value={totalAcrossTypes} />
        <Stat label="Iš viso pranešimų (notifications)" value={notifTotal ?? '—'} />
        {filterType && <Stat label="Filtras" value={filterType} />}
        {filterType && <button onClick={() => setFilterType('')} style={{ marginLeft: 'auto', fontSize: 12, color: '#0070f3', background: 'none', border: 'none', cursor: 'pointer' }}>Išvalyti filtrą</button>}
      </div>

      {/* Recent rows */}
      <h2 style={{ fontSize: 16, fontWeight: 800, marginBottom: 8 }}>
        Naujausi įvykiai {filterType && <span style={{ color: '#888', fontWeight: 500 }}>({filterType})</span>}
      </h2>
      <div style={{ background: '#fff', border: '1px solid #e5e5e5', borderRadius: 12, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#888' }}>Kraunasi…</div>
        ) : rows.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#888' }}>Įrašų nėra</div>
        ) : (
          rows.map(row => (
            <div key={row.id} style={{
              display: 'flex', gap: 12, padding: '12px 14px', alignItems: 'center',
              borderBottom: '1px solid #f0f0f0',
            }}>
              {row.entity_image ? (
                <img src={row.entity_image} alt="" width={36} height={36}
                  style={{ borderRadius: row.entity_type === 'artist' ? '50%' : 6, objectFit: 'cover', flexShrink: 0 }} />
              ) : row.actor_avatar ? (
                <img src={row.actor_avatar} alt="" width={36} height={36}
                  style={{ borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
              ) : (
                <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#eee', flexShrink: 0 }} />
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.3 }}>
                  {row.actor_name || '—'} <span style={{ color: '#888', fontWeight: 400 }}>· {row.event_type}</span>
                </div>
                <div style={{ fontSize: 12, color: '#555', lineHeight: 1.35, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {row.entity_title || '—'}
                </div>
                <div style={{ fontSize: 11, color: '#999' }}>
                  {relTime(row.created_at)}
                  {row.entity_url && <> · <a href={row.entity_url} style={{ color: '#0070f3' }}>{row.entity_url}</a></>}
                </div>
              </div>
              <button
                onClick={() => onDelete(row.id)}
                disabled={deleting === row.id}
                style={{ flexShrink: 0, padding: '4px 10px', fontSize: 11, color: '#ef4444', background: 'none', border: '1px solid #fecaca', borderRadius: 6, cursor: 'pointer' }}
              >
                {deleting === row.id ? '...' : 'Pašalinti'}
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div style={{ minHeight: '50vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#666' }}>{children}</div>
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color: '#111' }}>{value}</div>
    </div>
  )
}
