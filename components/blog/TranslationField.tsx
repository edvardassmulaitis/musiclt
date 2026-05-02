'use client'
// components/blog/TranslationField.tsx
//
// Vertimo formoje renkamės dainą iš music.lt katalogo. Originalo autorius
// implicit'iškai = track.artist; kalba = "EN" (defaultas — vertimai
// daugumoje Lietuvos atvejų EN→LT). Vartotojas neturi pildyti laisvo
// teksto laukų, tik pasirinkti track'ą iš dropdown'o.

import MusicSearchPicker, { type AttachmentHit } from '@/components/MusicSearchPicker'
import { proxyImg } from '@/lib/img-proxy'

export type TranslationTarget = {
  track_id: number | null
  display: AttachmentHit | null
}

export function TranslationField({
  target, onChange,
}: {
  target: TranslationTarget
  onChange: (t: TranslationTarget) => void
}) {
  function handlePick(hit: AttachmentHit) {
    if (hit.type !== 'daina') return
    onChange({ track_id: hit.id, display: hit })
  }

  function clear() {
    onChange({ track_id: null, display: null })
  }

  return (
    <div className="mb-6">
      <label className="text-[10px] font-bold uppercase tracking-wider mb-2 block" style={{ color: '#5e7290', fontFamily: "'Outfit', sans-serif" }}>
        Verčiama daina
      </label>

      {target.display ? (
        <div className="flex items-center gap-3 px-3 py-2 rounded-lg" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
          {target.display.image_url && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={proxyImg(target.display.image_url)} alt="" className="w-10 h-10 rounded object-cover" />
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate" style={{ color: '#dde8f8' }}>
              {target.display.title}
              {target.display.artist && <span style={{ color: '#5e7290' }} className="font-normal"> — {target.display.artist}</span>}
            </p>
          </div>
          <button
            type="button"
            onClick={clear}
            className="px-2 py-1 rounded text-xs hover:text-white transition"
            style={{ color: '#5e7290' }}
          >
            ×
          </button>
        </div>
      ) : (
        <MusicSearchPicker
          attached={[]}
          onAdd={handlePick}
          placeholder="Pasirink dainą iš music.lt..."
          typeFilter="daina"
          compact
        />
      )}
    </div>
  )
}
