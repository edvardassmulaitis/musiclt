'use client'

import { useState } from 'react'

// Renginio plakatas: blur-fill fonas + object-contain priekis, su FIKSUOTU
// kraštinių santykiu ir max aukščiu — kad portretiniai/dideli plakatai nebūtų
// rodomi per dideli (anksčiau object-cover + lg:h-full ištempdavo iki info
// stulpelio aukščio). Bet koks paveikslėlis dabar atrodo tvarkingai.
export default function EventCoverImage({ src, alt }: { src: string; alt: string }) {
  const [failed, setFailed] = useState(false)
  if (failed) return null

  return (
    <div className="w-full lg:w-[42%] lg:max-w-[420px] flex-shrink-0">
      <div className="relative w-full overflow-hidden rounded-2xl aspect-[4/5] max-h-[460px] mx-auto"
        style={{ background: 'var(--bg-elevated)' }}>
        {/* Blur fill */}
        <span
          className="absolute inset-0"
          style={{ backgroundImage: `url(${src})`, backgroundSize: 'cover', backgroundPosition: 'center', filter: 'blur(24px) brightness(0.6)', transform: 'scale(1.25)' }}
        />
        {/* Contained foreground */}
        <img
          src={src}
          alt={alt}
          referrerPolicy="no-referrer"
          className="absolute inset-0 w-full h-full object-contain z-[1]"
          onError={() => setFailed(true)}
        />
        <div className="absolute inset-0 pointer-events-none z-[2]" style={{ background: 'linear-gradient(transparent 70%, rgba(8,12,18,0.45))' }} />
      </div>
    </div>
  )
}
