'use client'

// components/profile/FollowButton.tsx
//
// „Sekti" mygtukas profilio header'iui. useSession nustato ar žiūrintysis
// prisijungęs / ar tai jo paties profilis. Optimistic toggle per /api/follow.
//
// Būsenos:
//   • own profile (session.user.id === targetId) → null (nerodom)
//   • not signed in → click veda į /auth/signin
//   • signed in → toggle follow/unfollow, rodom sekėjų skaičių
//
// Variantai: 'primary' (užpildytas oranžinis) / 'ghost' (outline, šviesus
// ant hero). Resilient — jei API klysta, grąžina ankstesnę būseną.

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'

export function FollowButton({
  targetId,
  variant = 'primary',
  size = 'md',
  iconOnly = false,
  keepLabel = false,
}: {
  targetId: string
  variant?: 'primary' | 'ghost'
  size?: 'sm' | 'md'
  iconOnly?: boolean
  keepLabel?: boolean
}) {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [following, setFollowing] = useState(false)
  const [count, setCount] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [loaded, setLoaded] = useState(false)

  const isOwn = !!session?.user?.id && session.user.id === targetId

  useEffect(() => {
    let alive = true
    fetch(`/api/follow?target=${encodeURIComponent(targetId)}`)
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return
        setFollowing(!!d.following)
        setCount(typeof d.count === 'number' ? d.count : null)
        setLoaded(true)
      })
      .catch(() => { if (alive) setLoaded(true) })
    return () => { alive = false }
  }, [targetId, session?.user?.id])

  // Savo profilio nerodom (vietoj follow gali būti redaguoti mygtukas kitur)
  if (isOwn) return null

  const onClick = async () => {
    if (status !== 'authenticated') {
      router.push('/auth/signin')
      return
    }
    if (busy) return
    setBusy(true)
    // Optimistic
    const prevF = following
    const prevC = count
    setFollowing(!prevF)
    setCount((c) => (c == null ? c : c + (prevF ? -1 : 1)))
    try {
      const r = await fetch('/api/follow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target: targetId }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d?.error || 'err')
      setFollowing(!!d.following)
      if (typeof d.count === 'number') setCount(d.count)
    } catch {
      setFollowing(prevF)
      setCount(prevC)
    } finally {
      setBusy(false)
    }
  }

  // Dydis kaip „Dalintis" (ShareButton): px-3 py-1 text-[14px], 12px ikona.
  // Stilius kaip atlikėjų „Sekti" širdelė: užpildytas oranžinis kai sekama,
  // subtilus translucent (ghost) / card pill kai dar ne.
  void count; void loaded
  // V18c: kai jau sekama — rodom TIK aktyvią širdelę (be „Seki" teksto),
  // kompaktiškas apskritimas kaip iconOnly. keepLabel (CTA) — IŠJUNGTA: mygtukas
  // lieka stabilios formos pill'as (tik spalva/etiketė keičiasi), kad
  // nešokinėtų po async follow-būsenos pasikrovimo.
  const compactCircle = keepLabel ? false : (iconOnly || following)
  const base = compactCircle
    ? 'inline-flex items-center justify-center rounded-full transition hover:opacity-90 active:scale-[0.97] disabled:opacity-60'
    : 'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[14px] font-bold transition hover:opacity-90 active:scale-[0.97] disabled:opacity-60'

  let style: React.CSSProperties
  if (compactCircle) {
    style = following
      ? { width: '28px', height: '28px', background: 'var(--accent-orange)', border: '1px solid var(--accent-orange)' }
      : { width: '28px', height: '28px', background: 'var(--hero-tag-bg)', border: '1px solid var(--hero-tag-border)' }
  } else if (variant === 'ghost') {
    // V18: theme-aware — light mode hero šviesus, baltas tekstas dingdavo.
    style = { background: 'var(--hero-tag-bg)', color: 'var(--hero-name)', border: '1px solid var(--hero-tag-border)' }
  } else {
    // primary (CTA): sekama → užpildytas oranžinis, dar ne → card pill.
    style = following
      ? { background: 'var(--accent-orange)', color: '#fff', border: '1px solid var(--accent-orange)' }
      : { background: 'var(--card-bg)', color: 'var(--text-primary)', border: '1px solid var(--border-default)' }
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      aria-pressed={following}
      className={base}
      style={{ fontFamily: "'Outfit', sans-serif", ...style }}
      title={following ? 'Nebesekti' : 'Sekti šį narį'}
    >
      <svg viewBox="0 0 24 24" width={compactCircle ? 14 : 12} height={compactCircle ? 14 : 12} aria-hidden
           fill={following ? '#fff' : 'none'}
           stroke={following ? '#fff' : 'var(--accent-orange)'}
           strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
      </svg>
      {!compactCircle && (following ? 'Sekama' : 'Sekti')}
    </button>
  )
}
