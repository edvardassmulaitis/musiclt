'use client'

// app/auth/profile/page.tsx
// Modernus paskyros centras (account hub). Pakeitė seną „kortelės" dizainą.
// Centrinė ašis — „Mano muzika" valdymas + greitos nuorodos į profilį, blogą,
// pranešimus. Profilio username gaunamas iš /api/profile.

import { useSession, signOut } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { proxyImg } from '@/lib/img-proxy'

type Profile = { id: string; username: string | null; full_name: string | null; avatar_url: string | null; music_setup_completed_at?: string | null }

export default function ProfilePage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [profile, setProfile] = useState<Profile | null>(null)

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/auth/signin')
  }, [status, router])

  useEffect(() => {
    if (status !== 'authenticated') return
    fetch('/api/profile').then(r => r.json()).then(d => { if (d && !d.error) setProfile(d) }).catch(() => {})
  }, [status])

  if (status === 'loading') {
    return <div className="min-h-screen flex items-center justify-center"><div className="w-8 h-8 border-2 border-music-blue border-t-transparent rounded-full animate-spin" /></div>
  }
  if (!session) return null

  const user = session.user
  const isAdmin = ['editor', 'admin', 'super_admin'].includes(user.role || '')
  const username = profile?.username || null
  const avatar = profile?.avatar_url || user.image || null
  const name = profile?.full_name || user.name || 'Vartotojas'

  const roleLabel = user.role === 'super_admin' ? '★ Super administratorius'
    : user.role === 'admin' ? '⭐ Administratorius'
    : user.role === 'editor' ? '✏️ Redaktorius'
    : user.role === 'moderator' ? '🛡️ Moderatorius' : '👤 Narys'

  return (
    <div className="page-shell" style={{ color: 'var(--text-primary)' }}>
      {/* HEADER CARD */}
      <div className="rounded-2xl p-5 sm:p-6 flex items-center gap-4 sm:gap-5"
        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)' }}>
        {avatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={proxyImg(avatar)} alt={name} referrerPolicy="no-referrer" className="h-16 w-16 sm:h-20 sm:w-20 rounded-2xl object-cover" />
        ) : (
          <div className="h-16 w-16 sm:h-20 sm:w-20 rounded-2xl flex items-center justify-center text-2xl font-black text-white"
            style={{ background: 'linear-gradient(135deg, #2563eb, var(--accent-orange))' }}>
            {name[0]?.toUpperCase() || '?'}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="text-[22px] sm:text-[26px] font-black tracking-tight leading-none truncate">{name}</h1>
          {username && <div className="text-[13px] mt-1" style={{ color: 'var(--text-muted)' }}>@{username}</div>}
          <span className="inline-block mt-2 text-[11px] px-2.5 py-0.5 rounded-full font-bold"
            style={{ background: isAdmin ? 'rgba(249,115,22,0.15)' : 'var(--bg-elevated)', color: isAdmin ? 'var(--accent-orange)' : 'var(--text-muted)' }}>
            {roleLabel}
          </span>
        </div>
        {username && (
          <Link href={`/vartotojas/${username}`} className="hidden sm:inline-flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-[12.5px] font-bold"
            style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)' }}>
            👁 Mano profilis
          </Link>
        )}
      </div>

      {/* MANO MUZIKA — pagrindinė CTA kortelė */}
      <Link href="/mano-muzika"
        className="mt-4 block rounded-2xl p-5 sm:p-6 transition-transform hover:scale-[1.005]"
        style={{ background: 'linear-gradient(135deg, rgba(249,115,22,0.16), rgba(167,139,250,0.13))', border: '1px solid var(--border-default)' }}>
        <div className="flex items-center gap-4">
          <div className="text-3xl sm:text-4xl">🎵</div>
          <div className="flex-1 min-w-0">
            <div className="text-[16px] sm:text-[18px] font-black">Mano muzika</div>
            <div className="text-[12.5px] sm:text-[13px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
              Tvarkyk mėgstamus atlikėjus, albumus, dainas, nuotaikos dainas ir stilius.
            </div>
          </div>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--text-muted)' }}><polyline points="9 18 15 12 9 6"/></svg>
        </div>
      </Link>

      {/* GREITOS NUORODOS */}
      <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-3">
        <HubCard href={username ? `/vartotojas/${username}` : '/mano-muzika'} icon="👤" title="Mano profilis" sub="Vieša peržiūra" />
        <HubCard href="/blogas/mano" icon="✍️" title="Mano blogas" sub="Straipsniai, įrašai" />
        <HubCard href="/blogas/rasyti" icon="📝" title="Rašyti" sub="Naujas įrašas" />
        <HubCard href="/auth/profile/pranesimai" icon="🔔" title="Pranešimai" sub="Nustatymai" />
        <HubCard href="/srautas" icon="🌊" title="Mano srautas" sub="Sekami atlikėjai" />
        {isAdmin && <HubCard href="/admin" icon="⚙️" title="Admin panelė" sub="Valdymas" accent />}
      </div>

      {/* PASKYRA */}
      <div className="mt-5 rounded-2xl p-5" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)' }}>
        <h2 className="text-[13px] font-black uppercase tracking-wider mb-3" style={{ color: 'var(--text-faint)' }}>Paskyra</h2>
        <div className="flex items-center justify-between text-[13px] py-1.5">
          <span style={{ color: 'var(--text-muted)' }}>El. paštas</span>
          <span>{user.email}</span>
        </div>
        <div className="mt-4 flex gap-3">
          <Link href="/" className="flex-1 text-center rounded-xl py-2.5 text-[13px] font-bold"
            style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)' }}>← Pradžia</Link>
          <button onClick={() => signOut({ callbackUrl: '/' })}
            className="flex-1 rounded-xl py-2.5 text-[13px] font-bold"
            style={{ background: 'rgba(244,63,94,0.10)', border: '1px solid rgba(244,63,94,0.30)', color: '#f43f5e' }}>
            Atsijungti
          </button>
        </div>
      </div>
    </div>
  )
}

function HubCard({ href, icon, title, sub, accent }: { href: string; icon: string; title: string; sub: string; accent?: boolean }) {
  return (
    <Link href={href} className="rounded-2xl p-4 transition-colors group"
      style={{ background: 'var(--bg-surface)', border: `1px solid ${accent ? 'rgba(249,115,22,0.35)' : 'var(--border-default)'}` }}>
      <div className="text-2xl mb-2">{icon}</div>
      <div className="text-[13.5px] font-black" style={{ color: accent ? 'var(--accent-orange)' : 'var(--text-primary)' }}>{title}</div>
      <div className="text-[11.5px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{sub}</div>
    </Link>
  )
}
