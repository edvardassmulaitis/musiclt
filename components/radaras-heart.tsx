'use client'

// Širdelė (mėgti atlikėją) — naudoja esamą /api/artists/[id]/like (GET būsena,
// POST toggle). Anoniminiam → nukreipia į prisijungimą. Optimistinis state.

import { useState, useEffect, useCallback } from 'react'

export default function RadarHeart({ artistId, size = 36 }: { artistId: number; size?: number }) {
  const [liked, setLiked] = useState(false)
  const [count, setCount] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let on = true
    fetch(`/api/artists/${artistId}/like`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => { if (on) { setLiked(!!j.liked); setCount(typeof j.count === 'number' ? j.count : null) } })
      .catch(() => {})
    return () => { on = false }
  }, [artistId])

  const toggle = useCallback(async (e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation()
    if (busy) return
    setBusy(true)
    const prev = liked
    setLiked(!prev); setCount((c) => (c == null ? c : c + (prev ? -1 : 1)))
    try {
      const res = await fetch(`/api/artists/${artistId}/like`, { method: 'POST' })
      if (res.status === 401) { window.location.href = '/auth/signin'; return }
      const j = await res.json()
      if (typeof j.liked === 'boolean') setLiked(j.liked)
      if (typeof j.count === 'number') setCount(j.count)
    } catch {
      setLiked(prev) // revert
    } finally { setBusy(false) }
  }, [artistId, liked, busy])

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={liked}
      aria-label={liked ? 'Nebemėgti' : 'Mėgti'}
      title={liked ? 'Nebemėgti' : 'Mėgti'}
      className={`rd-heart${liked ? ' on' : ''}`}
      style={{ width: size, height: size }}
    >
      <svg viewBox="0 0 24 24" width={size * 0.5} height={size * 0.5} aria-hidden>
        <path d="M12 21s-7.5-4.6-9.6-9.1C.9 8.5 2.5 5.5 5.6 5.5c1.9 0 3.2 1.1 3.9 2.1.7-1 2-2.1 3.9-2.1 3.1 0 4.7 3 3.2 6.4C19.5 16.4 12 21 12 21z"
          fill={liked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      </svg>
      {count != null && count > 0 && <span className="rd-heart-n">{count.toLocaleString('lt-LT')}</span>}
    </button>
  )
}
