'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

type PrefRow = { type: string; enabled: boolean; updated_at?: string }

type TypeMeta = {
  type: string
  label: string
  desc: string
  group: 'reactions' | 'comments' | 'community' | 'system'
}

// Apima visus type'us, kuriuos pripažįsta lib/notifications.ts.
// Default: enabled = true (jeigu prefs row'o nėra DB'e).
const TYPES: TypeMeta[] = [
  // ── Komentarų atsakymai ir komentarai ────────────────────────
  { type: 'comment_reply',  label: 'Atsakymai į komentarus',           desc: 'Kai kažkas atsako į tavo paliktą komentarą', group: 'comments' },
  { type: 'entity_comment', label: 'Komentarai prie tavo turinio',     desc: 'Kai kažkas pakomentuoja tavo paskelbtą įrašą ar nuotrauką', group: 'comments' },
  { type: 'blog_comment',   label: 'Komentarai blog įrašuose',         desc: 'Kai kažkas pakomentuoja tavo blog įrašą', group: 'comments' },
  // ── Patiktukai ───────────────────────────────────────────────
  { type: 'comment_like',   label: 'Patiktukai komentaruose',          desc: 'Kai kažkas pamėgsta tavo komentarą', group: 'reactions' },
  { type: 'blog_like',      label: 'Patiktukai blog įrašuose',         desc: 'Kai kažkas pamėgsta tavo blog įrašą', group: 'reactions' },
  // ── Bendruomenė / muzika ─────────────────────────────────────
  { type: 'favorite_artist_track', label: 'Naujos dainos nuo mėgstamų atlikėjų', desc: 'Kai pasirodo nauja daina ar albumas nuo tavo pamėgto atlikėjo', group: 'community' },
  { type: 'daily_song_winner',     label: 'Dienos dainos rezultatai',           desc: 'Kai tavo nominuotas track\'as laimi dienos dainą', group: 'community' },
  // ── Sistema ──────────────────────────────────────────────────
  { type: 'system', label: 'Sistemos pranešimai', desc: 'Svarbūs admin/redakcijos pranešimai', group: 'system' },
]

const GROUP_LABEL: Record<string, string> = {
  reactions: 'Patiktukai',
  comments:  'Komentarai',
  community: 'Bendruomenė ir muzika',
  system:    'Sistema',
}

export default function NotificationPreferencesPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [prefs, setPrefs] = useState<Record<string, boolean>>({})
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<number | null>(null)

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/auth/signin')
  }, [status, router])

  // Užkraunam visus user'io pref overrides. Kas neturi row'o — laikoma enabled.
  useEffect(() => {
    if (status !== 'authenticated') return
    let aborted = false
    ;(async () => {
      try {
        const res = await fetch('/api/notifications/preferences', { cache: 'no-store' })
        const json = await res.json()
        if (aborted) return
        const map: Record<string, boolean> = {}
        for (const t of TYPES) map[t.type] = true
        for (const p of (json.preferences || []) as PrefRow[]) map[p.type] = !!p.enabled
        setPrefs(map)
      } catch { /* keep defaults */ } finally {
        if (!aborted) setLoaded(true)
      }
    })()
    return () => { aborted = true }
  }, [status])

  const toggle = async (type: string) => {
    const next = !prefs[type]
    setPrefs(p => ({ ...p, [type]: next }))
    setSaving(type)
    try {
      await fetch('/api/notifications/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, enabled: next }),
      })
      setSavedAt(Date.now())
    } catch {
      // revert on failure
      setPrefs(p => ({ ...p, [type]: !next }))
    } finally {
      setSaving(null)
    }
  }

  if (status === 'loading' || !loaded) {
    return (
      <div style={{ minHeight: '50vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 28, height: 28, border: '2px solid var(--accent-link)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    )
  }
  if (!session) return null

  // Group types
  const grouped: Record<string, TypeMeta[]> = {}
  for (const t of TYPES) {
    if (!grouped[t.group]) grouped[t.group] = []
    grouped[t.group].push(t)
  }

  const allEnabled = TYPES.every(t => prefs[t.type] !== false)
  const anyEnabled = TYPES.some(t => prefs[t.type] !== false)

  const masterToggle = async () => {
    const turnOn = !allEnabled
    const next: Record<string, boolean> = {}
    for (const t of TYPES) next[t.type] = turnOn
    setPrefs(next)
    setSaving('__all')
    try {
      await fetch('/api/notifications/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: TYPES.map(t => ({ type: t.type, enabled: turnOn })),
        }),
      })
      setSavedAt(Date.now())
    } catch { /* ignore */ } finally {
      setSaving(null)
    }
  }

  const showSavedHint = savedAt && Date.now() - savedAt < 2500

  return (
    <div style={{ minHeight: '100vh', padding: '24px 16px' }}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>

        {/* Breadcrumb */}
        <div style={{ marginBottom: 16, fontSize: 13 }}>
          <Link href="/auth/profile" style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>
            ← Profilis
          </Link>
        </div>

        <h1 style={{ fontSize: 28, fontWeight: 900, color: 'var(--text-primary)', marginBottom: 6, letterSpacing: '-0.02em' }}>
          Pranešimų nustatymai
        </h1>
        <p style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 24, lineHeight: 1.5 }}>
          Pasirink, kokius pranešimus nori gauti. Visi nauji pranešimai pasirodys
          varpelio ikonoje viršuje.
        </p>

        {/* Master toggle card */}
        <div style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-default)',
          borderRadius: 14, padding: 16, marginBottom: 16,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
        }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)', marginBottom: 2 }}>
              Visi pranešimai
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              {allEnabled
                ? 'Įjungta — gauni visus pažymėtus žemiau.'
                : anyEnabled
                  ? 'Iš dalies — kai kurie tipai išjungti.'
                  : 'Išjungta — pranešimų negausi.'}
            </div>
          </div>
          <Toggle
            checked={allEnabled}
            onChange={masterToggle}
            disabled={saving === '__all'}
            size="lg"
          />
        </div>

        {/* Groups */}
        {(['reactions', 'comments', 'community', 'system'] as const).map(g => (
          grouped[g] && (
            <div key={g} style={{ marginBottom: 18 }}>
              <div style={{
                fontSize: 11, fontWeight: 800, textTransform: 'uppercase',
                letterSpacing: '0.08em', color: 'var(--text-muted)',
                margin: '0 4px 8px',
              }}>
                {GROUP_LABEL[g]}
              </div>
              <div style={{
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-default)',
                borderRadius: 14, overflow: 'hidden',
              }}>
                {grouped[g].map((t, i) => {
                  const enabled = prefs[t.type] !== false
                  return (
                    <div key={t.type} style={{
                      padding: '14px 16px',
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
                      borderTop: i === 0 ? 'none' : '1px solid var(--border-subtle)',
                    }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 13.5, color: 'var(--text-primary)', marginBottom: 2 }}>
                          {t.label}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.4 }}>
                          {t.desc}
                        </div>
                      </div>
                      <Toggle
                        checked={enabled}
                        onChange={() => toggle(t.type)}
                        disabled={saving === t.type}
                      />
                    </div>
                  )
                })}
              </div>
            </div>
          )
        ))}

        {/* Saved hint */}
        <div style={{
          minHeight: 24, marginTop: 4,
          fontSize: 12, color: 'var(--text-muted)',
          textAlign: 'center',
          opacity: showSavedHint ? 1 : 0,
          transition: 'opacity .25s ease',
        }}>
          ✓ Išsaugota
        </div>

        <div style={{
          marginTop: 24, padding: 14,
          background: 'rgba(96,165,250,0.06)',
          border: '1px solid rgba(96,165,250,0.18)',
          borderRadius: 12,
          fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5,
        }}>
          <strong>Pastaba:</strong> el. paštu pranešimų kol kas neišsiunčiame —
          viskas pasirodo svetainėje, varpelio ikonoje. El. pašto pranešimų
          parinktys atsiras vėliau.
        </div>

      </div>
    </div>
  )
}

// ── Switch toggle (CSS-only, accessible) ────────────────────────────
function Toggle({
  checked, onChange, disabled, size = 'md',
}: {
  checked: boolean
  onChange: () => void
  disabled?: boolean
  size?: 'md' | 'lg'
}) {
  const w = size === 'lg' ? 48 : 40
  const h = size === 'lg' ? 28 : 24
  const knob = h - 6
  return (
    <button
      onClick={onChange}
      disabled={disabled}
      role="switch"
      aria-checked={checked}
      style={{
        position: 'relative', flexShrink: 0,
        width: w, height: h,
        borderRadius: h / 2,
        border: '1px solid var(--border-default)',
        background: checked ? 'var(--accent-orange)' : 'var(--bg-hover)',
        cursor: disabled ? 'wait' : 'pointer',
        transition: 'background .18s ease',
        opacity: disabled ? 0.6 : 1,
        padding: 0,
      }}
    >
      <span style={{
        position: 'absolute',
        top: 2, left: checked ? w - knob - 4 : 2,
        width: knob, height: knob,
        borderRadius: '50%',
        background: '#fff',
        boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
        transition: 'left .2s cubic-bezier(.4,0,.2,1)',
      }} />
    </button>
  )
}
