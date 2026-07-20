'use client'
// Interaktyvi Gilyn dėžė — verti albumus (‹ ›) kaip vinilų dėžėje.
import { useState } from 'react'
import Link from 'next/link'
import { proxyImgResized } from '@/lib/img-proxy'

type BoxItem = { cover: string; title: string; artist: string }

export default function GilynCrate({ box }: { box: BoxItem[] }) {
  const [i, setI] = useState(0)
  if (!box.length) return null
  const cur = box[i]
  const go = (d: number) => setI((p) => (p + d + box.length) % box.length)
  // Aplinkinės plokštelės „dėžės" efektui
  const behind = [box[(i + 1) % box.length], box[(i + 2) % box.length]].filter(Boolean)

  return (
    <div className="v2-gc">
      <div className="v2-gc-stage">
        <button className="v2-gc-nav" onClick={() => go(-1)} aria-label="Ankstesnis">‹</button>
        <div className="v2-gc-crate">
          {behind.map((b, k) => (
            <span key={k} className="v2-gc-behind" style={{ transform: `translateX(${(k + 1) * 14}px) rotate(${(k + 1) * 3}deg)`, zIndex: 1 - k }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}<img src={proxyImgResized(b.cover, 200)} alt="" loading="lazy" />
            </span>
          ))}
          <span className="v2-gc-front">
            {/* eslint-disable-next-line @next/next/no-img-element */}<img src={proxyImgResized(cur.cover, 400)} alt="" />
          </span>
        </div>
        <button className="v2-gc-nav" onClick={() => go(1)} aria-label="Kitas">›</button>
      </div>
      <div className="v2-gc-cap"><b>{cur.title}</b><span>{cur.artist}</span></div>
      <div className="v2-gc-meta">{i + 1} / {box.length} · šiandienos dėžė</div>
      <Link href="/zaidimai/gilyn" className="v2-gc-cta">Pradėti žaisti →</Link>
    </div>
  )
}
