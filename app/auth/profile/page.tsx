'use client'

// app/auth/profile/page.tsx
// Paskyros centras (account hub). V2 (2026-06): solidesnis dizainas,
// suvienodintas su kitais puslapiais — vietoj emoji naudojamos švarios SVG
// ikonos, nuoseklios kortelės ir tarpai. + Numatytojo profilio rodinio
// pasirinkimas (default_profile_tab) — kas rodoma viešame profilyje pirma.

import { useSession, signOut } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { proxyImg } from '@/lib/img-proxy'

type Profile = {
  id: string
  username: string | null
  full_name: string | null
  avatar_url: string | null
  music_setup_completed_at?: string | null
  default_profile_tab?: string | null
}

// ── Švarios stroke ikonos (Lucide stilius, inline — kaip visame projekte) ──
type IconProps = { className?: string }
const sv = (className?: string) => ({
  className, width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none',
  stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
})
const IcUser = ({ className }: IconProps) => <svg {...sv(className)}><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
const IcPen = ({ className }: IconProps) => <svg {...sv(className)}><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
const IcEdit = ({ className }: IconProps) => <svg {...sv(className)}><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4Z" /></svg>
const IcBell = ({ className }: IconProps) => <svg {...sv(className)}><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></svg>
const IcWaves = ({ className }: IconProps) => <svg {...sv(className)}><path d="M2 6c.6.5 1.2 1 2.5 1C7 7 7 5 9.5 5c2.6 0 2.4 2 5 2 1.3 0 1.9-.5 2.5-1" /><path d="M2 12c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 1.3 0 1.9-.5 2.5-1" /><path d="M2 18c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 1.3 0 1.9-.5 2.5-1" /></svg>
const IcSettings = ({ className }: IconProps) => <svg {...sv(className)}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" /></svg>
const IcMusic = ({ className }: IconProps) => <svg {...sv(className)}><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></svg>
const IcEye = ({ className }: IconProps) => <svg {...sv(className)}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></svg>
const IcChevron = ({ className }: IconProps) => <svg {...sv(className)}><polyline points="9 18 15 12 9 6" /></svg>
const IcCheck = ({ className }: IconProps) => <svg {...sv(className)}><polyline points="20 6 9 17 4 12" /></svg>

const DEFAULT_VIEW_OPTIONS: { key: string; label: string; sub: string }[] = [
  { key: 'auto', label: 'Automatinis', sub: 'Turi įrašų → įrašai; jei nėra → Mėgstama muzika' },
  { key: 'all', label: 'Įrašai', sub: 'Tavo srautas — straipsniai, įspūdžiai, dienos dainos' },
  { key: 'likes', label: 'Mėgstama muzika', sub: 'Atlikėjai, albumai ir dainos, kurias pamėgai' },
  { key: 'about', label: 'Apie mane', sub: 'Profilio aprašymas ir informacija' },
]

export default function ProfilePage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [profile, setProfile] = useState<Profile | null>(null)

  // Numatytojo rodinio būsena
  const [defaultTab, setDefaultTab] = useState<string>('auto')
  const [savingTab, setSavingTab] = useState(false)
  const [savedTab, setSavedTab] = useState(false)

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/auth/signin')
  }, [status, router])

  useEffect(() => {
    if (status !== 'authenticated') return
    fetch('/api/profile').then(r => r.json()).then(d => {
      if (d && !d.error) {
        setProfile(d)
        setDefaultTab(d.default_profile_tab || 'auto')
      }
    }).catch(() => {})
  }, [status])

  const saveDefaultTab = async (key: string) => {
    setDefaultTab(key)
    setSavingTab(true)
    setSavedTab(false)
    try {
      const r = await fetch('/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ default_profile_tab: key }),
      })
      if (r.ok) {
        setSavedTab(true)
        setTimeout(() => setSavedTab(false), 2200)
      }
    } catch { /* tylim */ } finally {
      setSavingTab(false)
    }
  }

  if (status === 'loading') {
    return <div className="min-h-screen flex items-center justify-center"><div className="w-8 h-8 border-2 border-music-blue border-t-transparent rounded-full animate-spin" /></div>
  }
  if (!session) return null

  const user = session.user
  const isAdmin = ['editor', 'admin', 'super_admin'].includes(user.role || '')
  const username = profile?.username || null
  const avatar = profile?.avatar_url || user.image || null
  const name = profile?.full_name || user.name || 'Vartotojas'

  const roleLabel = user.role === 'super_admin' ? 'Super administratorius'
    : user.role === 'admin' ? 'Administratorius'
    : user.role === 'editor' ? 'Redaktorius'
    : user.role === 'moderator' ? 'Moderatorius' : 'Narys'

  return (
    <div className="page-shell" style={{ color: 'var(--text-primary)', fontFamily: "'Outfit', sans-serif" }}>

      {/* ── HEADER ── */}
      <section className="rounded-2xl p-5 sm:p-6"
        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)' }}>
        <div className="flex items-center gap-4 sm:gap-5">
          {avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={proxyImg(avatar)} alt={name} referrerPolicy="no-referrer"
              className="h-16 w-16 sm:h-[72px] sm:w-[72px] rounded-2xl object-cover shrink-0"
              style={{ border: '1px solid var(--border-default)' }} />
          ) : (
            <div className="h-16 w-16 sm:h-[72px] sm:w-[72px] rounded-2xl flex items-center justify-center text-2xl font-black text-white shrink-0"
              style={{ background: 'linear-gradient(135deg, #2563eb, var(--accent-orange))' }}>
              {name[0]?.toUpperCase() || '?'}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h1 className="text-[21px] sm:text-[25px] font-black tracking-tight leading-none truncate">{name}</h1>
            {username && <div className="text-[13px] mt-1.5" style={{ color: 'var(--text-muted)' }}>@{username}</div>}
            <span className="inline-flex items-center mt-2.5 text-[11px] px-2.5 py-1 rounded-full font-bold tracking-wide"
              style={{ background: isAdmin ? 'rgba(249,115,22,0.14)' : 'var(--bg-elevated)', color: isAdmin ? 'var(--accent-orange)' : 'var(--text-muted)', border: '1px solid var(--border-subtle)' }}>
              {roleLabel}
            </span>
          </div>
          {username && (
            <Link href={`/vartotojas/${username}`}
              className="hidden sm:inline-flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-[12.5px] font-bold transition hover:opacity-85"
              style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', color: 'var(--text-primary)' }}>
              <IcEye className="opacity-80" /> Mano profilis
            </Link>
          )}
        </div>
      </section>

      {/* ── MANO MUZIKA — pagrindinė CTA ── */}
      <Link href="/mano-muzika"
        className="mt-4 group flex items-center gap-4 rounded-2xl p-5 sm:p-6 transition hover:opacity-95"
        style={{ background: 'linear-gradient(135deg, rgba(249,115,22,0.15), rgba(167,139,250,0.12))', border: '1px solid var(--border-default)' }}>
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl"
          style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)', color: 'var(--accent-orange)' }}>
          <IcMusic />
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-[16px] sm:text-[17px] font-black">Mano muzika</div>
          <div className="text-[12.5px] sm:text-[13px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
            Tvarkyk mėgstamus atlikėjus, albumus, dainas, nuotaikos dainas ir stilius.
          </div>
        </div>
        <IcChevron className="shrink-0 transition group-hover:translate-x-0.5" />
      </Link>

      {/* ── GREITOS NUORODOS ── */}
      <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-3">
        <HubCard href={username ? `/vartotojas/${username}` : '/mano-muzika'} icon={<IcUser />} title="Mano profilis" sub="Vieša peržiūra" />
        <HubCard href="/blogas/mano" icon={<IcPen />} title="Mano blogas" sub="Straipsniai, įrašai" />
        <HubCard href="/blogas/rasyti" icon={<IcEdit />} title="Rašyti" sub="Naujas įrašas" />
        <HubCard href="/auth/profile/pranesimai" icon={<IcBell />} title="Pranešimai" sub="Nustatymai" />
        <HubCard href="/srautas" icon={<IcWaves />} title="Mano srautas" sub="Sekami atlikėjai" />
        {isAdmin && <HubCard href="/admin" icon={<IcSettings />} title="Admin panelė" sub="Valdymas" accent />}
      </div>

      {/* ── PROFILIO RODINYS — numatytasis viešas skirtukas ── */}
      <section className="mt-4 rounded-2xl p-5 sm:p-6" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)' }}>
        <div className="flex items-center justify-between gap-3 mb-1">
          <h2 className="text-[13px] font-black uppercase tracking-wider" style={{ color: 'var(--text-faint)' }}>Profilio rodinys</h2>
          {savedTab && (
            <span className="inline-flex items-center gap-1 text-[11.5px] font-bold" style={{ color: '#34d399' }}>
              <IcCheck className="h-3.5 w-3.5" /> Išsaugota
            </span>
          )}
        </div>
        <p className="text-[12.5px] mb-3.5" style={{ color: 'var(--text-muted)' }}>
          Ką lankytojai mato pirma, atvėrę tavo viešą profilį.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {DEFAULT_VIEW_OPTIONS.map((opt) => {
            const active = defaultTab === opt.key
            return (
              <button key={opt.key} type="button" disabled={savingTab} onClick={() => saveDefaultTab(opt.key)}
                className="text-left rounded-xl p-3.5 transition disabled:opacity-60"
                style={{
                  background: active ? 'rgba(249,115,22,0.10)' : 'var(--bg-elevated)',
                  border: `1px solid ${active ? 'var(--accent-orange)' : 'var(--border-default)'}`,
                }}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[13.5px] font-bold" style={{ color: active ? 'var(--accent-orange)' : 'var(--text-primary)' }}>{opt.label}</span>
                  <span className="flex h-4 w-4 items-center justify-center rounded-full shrink-0"
                    style={{ border: `1.5px solid ${active ? 'var(--accent-orange)' : 'var(--border-default)'}`, background: active ? 'var(--accent-orange)' : 'transparent' }}>
                    {active && <IcCheck className="h-2.5 w-2.5" />}
                  </span>
                </div>
                <div className="text-[11.5px] mt-1 leading-snug" style={{ color: 'var(--text-muted)' }}>{opt.sub}</div>
              </button>
            )
          })}
        </div>
      </section>

      {/* ── PASKYRA ── */}
      <section className="mt-4 rounded-2xl p-5 sm:p-6" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)' }}>
        <h2 className="text-[13px] font-black uppercase tracking-wider mb-3" style={{ color: 'var(--text-faint)' }}>Paskyra</h2>
        <div className="flex items-center justify-between text-[13px] py-1.5">
          <span style={{ color: 'var(--text-muted)' }}>El. paštas</span>
          <span className="truncate ml-3">{user.email}</span>
        </div>
        <div className="mt-4 flex gap-3">
          <Link href="/" className="flex-1 text-center rounded-xl py-2.5 text-[13px] font-bold transition hover:opacity-85"
            style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)' }}>← Pradžia</Link>
          <button onClick={() => signOut({ callbackUrl: '/' })}
            className="flex-1 rounded-xl py-2.5 text-[13px] font-bold transition hover:opacity-85"
            style={{ background: 'rgba(244,63,94,0.10)', border: '1px solid rgba(244,63,94,0.30)', color: '#f43f5e' }}>
            Atsijungti
          </button>
        </div>
      </section>
    </div>
  )
}

function HubCard({ href, icon, title, sub, accent }: { href: string; icon: ReactNode; title: string; sub: string; accent?: boolean }) {
  return (
    <Link href={href} className="group rounded-2xl p-4 transition hover:opacity-95"
      style={{ background: 'var(--bg-surface)', border: `1px solid ${accent ? 'rgba(249,115,22,0.35)' : 'var(--border-default)'}` }}>
      <span className="flex h-10 w-10 items-center justify-center rounded-xl mb-2.5 transition group-hover:scale-105"
        style={{ background: accent ? 'rgba(249,115,22,0.12)' : 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', color: accent ? 'var(--accent-orange)' : 'var(--text-secondary)' }}>
        {icon}
      </span>
      <div className="text-[13.5px] font-black" style={{ color: accent ? 'var(--accent-orange)' : 'var(--text-primary)' }}>{title}</div>
      <div className="text-[11.5px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{sub}</div>
    </Link>
  )
}
