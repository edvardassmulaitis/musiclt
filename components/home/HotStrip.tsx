'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import Scroller from '@/components/ui/Scroller'
import { proxyImg } from '@/lib/img-proxy'
import type { HotItem, HotKind } from '@/lib/home/getHotItems'

const TAG: Record<HotKind, { label: string; color: string }> = {
  daily_winner:     { label: '🗳️ Dienos daina',  color: 'var(--accent-orange, #f2641a)' },
  daily_suggestion: { label: '✨ Naujas siūlymas', color: '#3cca7e' },
  discussion:       { label: '💬 Aptariama',       color: '#a87be0' },
  review:           { label: '⭐ Apžvalga',        color: '#caa23c' },
  rising:           { label: '📈 Kyla',            color: '#5b9be8' },
}

function CoverBox({ coverUrl, emoji }: { coverUrl?: string | null; emoji?: string }) {
  if (coverUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={proxyImg(coverUrl)}
        alt=""
        loading="lazy"
        className="pc-cover"
        style={{ backgroundImage: 'none', objectFit: 'cover' }}
      />
    )
  }
  return (
    <div className="pc-cover" style={{ background: 'linear-gradient(135deg,#3a2f7a,#6d4bd1)', display: 'grid', placeItems: 'center', fontSize: 19, color: '#fff' }}>
      {emoji ?? '🎵'}
    </div>
  )
}

function Chip({ it }: { it: HotItem }) {
  const tag = TAG[it.kind]
  return (
    <Link href={it.href} className="pchip" style={{ width: 260, flexShrink: 0 }}>
      <CoverBox coverUrl={it.coverUrl} emoji={it.emoji} />
      <div style={{ minWidth: 0 }}>
        <span className="pc-tag" style={{ color: tag.color }}>{tag.label}</span>
        <div className="pc-title">{it.title}</div>
        <div className="pc-meta">{it.meta}</div>
      </div>
    </Link>
  )
}

function ChipSkel() {
  return (
    <div className="pchip" style={{ width: 260, flexShrink: 0 }}>
      <div className="pc-cover hp-skel" style={{ flexShrink: 0 }} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div className="hp-skel" style={{ width: '55%', height: 9, borderRadius: 4 }} />
        <div className="hp-skel" style={{ width: '85%', height: 12, borderRadius: 4, marginTop: 5 }} />
        <div className="hp-skel" style={{ width: '60%', height: 9, borderRadius: 4, marginTop: 4 }} />
      </div>
    </div>
  )
}

export default function HotStrip() {
  const [items, setItems] = useState<HotItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    fetch('/api/home/hot')
      .then(r => r.json())
      .then((data: HotItem[]) => {
        if (!alive) return
        setItems(Array.isArray(data) ? data : [])
        setLoading(false)
      })
      .catch(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [])

  // tuščia → sekcija visai nerodo (po užkrovimo)
  if (!loading && items.length === 0) return null

  return (
    <section>
      <div className="mb-3.5 flex items-center justify-between">
        <h2 className="m-0 font-['Outfit',sans-serif] text-[17px] font-extrabold tracking-[-0.01em] text-[var(--text-primary)] sm:text-[18px]">
          Karšta dabar
        </h2>
        <Link
          href="/bendruomene"
          className="font-['Outfit',sans-serif] text-[13.5px] font-bold text-[var(--accent-orange)] no-underline transition-opacity hover:opacity-70"
        >
          Atrasti →
        </Link>
      </div>
      <Scroller gap={12} ariaLabel="Karšta dabar">
        {loading
          ? Array(4).fill(null).map((_, i) => <ChipSkel key={i} />)
          : items.map(it => <Chip key={it.id} it={it} />)}
      </Scroller>
    </section>
  )
}
