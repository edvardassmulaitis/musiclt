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
}: {
  targetId: string
  variant?: 'primary' | 'ghost'
  size?: 'sm' | 'md'
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

  const pad = size === 'sm' ? 'px-3 py-1 text-[11px]' : 'px-4 py-1.5 text-[12px]'

  const base =
    `inline-flex items-center justify-center gap-1.5 rounded-full font-extrabold transition active:scale-[0.97] disabled:opacity-60 ${pad}`

  let cls: string
  let style: React.CSSProperties
  if (following) {
    // Sekama — subtilus „outline" stilius
    cls = base
    style = variant === 'ghost'
      ? { background: 'rgba(255,255,255,0.10)', color: '#fff', border: '1px solid rgba(255,255,255,0.28)' }
      : { background: 'var(--card-bg)', color: 'var(--text-secondary)', border: '1px solid var(--border-default)' }
  } else {
    cls = base
    style = { background: 'var(--accent-orange)', color: '#1a1206', border: '1px solid var(--accent-orange)' }
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      aria-pressed={following}
      className={cls}
      style={{ fontFamily: "'Outfit', sans-serif", ...style }}
      title={following ? 'Nebesekti' : 'Sekti šį narį'}
    >
      {following ? (
        <>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <polyline points="20 6 9 17 4 12" />
          </svg>
          Sekama
        </>
      ) : (
        <>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Sekti
          {loaded && count != null && count > 0 && (
            <span className="opacity-70 font-bold">· {count}</span>
          )}
        </>
      )}
    </button>
  )
}
