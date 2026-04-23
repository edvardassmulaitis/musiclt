'use client'

import { useState } from 'react'

export default function EventCoverImage({ src, alt }: { src: string; alt: string }) {
  const [failed, setFailed] = useState(false)
  if (failed) return null

  return (
    <div className="lg:w-[55%] flex-shrink-0">
      <div className="rounded-2xl overflow-hidden aspect-[4/3] lg:aspect-auto lg:h-full relative">
        <img
          src={src}
          alt={alt}
          referrerPolicy="no-referrer"
          className="w-full h-full object-cover"
          onError={() => setFailed(true)}
        />
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: 'linear-gradient(transparent 60%, rgba(8,12,18,0.4))' }}
        />
      </div>
    </div>
  )
}
