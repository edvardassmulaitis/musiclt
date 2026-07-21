'use client'
// Kompaktiška albumų naršyklė — versk plokšteles (‹ ›). Rodyklės šonuose,
// neužeina ant viršelio.
import { useState } from 'react'
import Link from 'next/link'
import { proxyImgResized } from '@/lib/img-proxy'

type BoxItem = { cover: string; title: string; artist: string }

export default function GilynCrate({ box }: { box: BoxItem[] }) {
  const [i, setI] = useState(0)
  if (!box.length) return null
  const cur = box[i]
  const go = (d: number) => setI((p) => (p + d + box.length) % box.length)
  return (
    <div className="v2-gc">
      <div className="v2-gc-stage">
        <button className="v2-gc-nav" onClick={() => go(-1)} aria-label="Ankstesnis">‹</button>
        <Link href="/zaidimai/gilyn" className="v2-gc-cover">
          {/* eslint-disable-next-line @next/next/no-img-element */}<img src={proxyImgResized(cur.cover, 320)} alt="" />
        </Link>
        <button className="v2-gc-nav" onClick={() => go(1)} aria-label="Kitas">›</button>
      </div>
      <div className="v2-gc-cap"><b>{cur.title}</b><span> · {cur.artist}</span></div>
      <div className="v2-gc-row"><span className="v2-gc-meta">{i + 1} / {box.length}</span><Link href="/zaidimai/gilyn" className="v2-gc-cta">Pradėti →</Link></div>
    </div>
  )
}
