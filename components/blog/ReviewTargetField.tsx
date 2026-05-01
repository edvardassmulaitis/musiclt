'use client'
// components/blog/ReviewTargetField.tsx
//
// Recenzijos meta: pasirenkam vieną music.lt entity (atlikėją, albumą,
// dainą) ir balą 1–10. Be colored cards — paprastas inline laukas matching
// /blogas/mano stiliaus.

import MusicSearchPicker, { type AttachmentHit } from '@/components/MusicSearchPicker'
import { proxyImg } from '@/lib/img-proxy'

export type ReviewTarget = {
  artist_id: number | null
  album_id: number | null
  track_id: number | null
  display: AttachmentHit | null
}

export function ReviewTargetField({
  target, rating, onTargetChange, onRatingChange,
}: {
  target: ReviewTarget
  rating: number | null
  onTargetChange: (t: ReviewTarget) => void
  onRatingChange: (r: number | null) => void
}) {
  function handlePick(hit: AttachmentHit) {
    onTargetChange({
      artist_id: hit.type === 'grupe'   ? hit.id : null,
      album_id:  hit.type === 'albumas' ? hit.id : null,
      track_id:  hit.type === 'daina'   ? hit.id : null,
      display: hit,
    })
  }

  function clear() {
    onTargetChange({ artist_id: null, album_id: null, track_id: null, display: null })
  }

  return (
    <div className="space-y-4 mb-6">
      <div>
        <label className="text-[10px] font-bold uppercase tracking-wider mb-2 block" style={{ color: '#5e7290', fontFamily: "'Outfit', sans-serif" }}>
          Ką recenzuoji
        </label>

        {target.display ? (
          <div className="flex items-center gap-3 px-3 py-2 rounded-lg" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
            {target.display.image_url && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={proxyImg(target.display.image_url)} alt="" className="w-10 h-10 rounded object-cover" />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-[9px] font-bold uppercase tracking-wider" style={{ color: '#5e7290' }}>
                {target.display.type === 'grupe' ? 'Atlikėjas' : target.display.type === 'albumas' ? 'Albumas' : 'Daina'}
              </p>
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
            placeholder="Pasirink atlikėją, albumą ar dainą..."
            compact
          />
        )}
      </div>

      <div>
        <label className="text-[10px] font-bold uppercase tracking-wider mb-2 block" style={{ color: '#5e7290', fontFamily: "'Outfit', sans-serif" }}>
          Balas {rating !== null && <span style={{ color: '#f97316' }}>{rating}/10</span>}
        </label>
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={1}
            max={10}
            value={rating ?? 5}
            onChange={e => onRatingChange(parseInt(e.target.value))}
            className="flex-1 accent-[#f97316]"
          />
          {rating !== null ? (
            <button type="button" onClick={() => onRatingChange(null)} className="text-[10px] hover:text-white transition" style={{ color: '#5e7290' }}>
              išvalyti
            </button>
          ) : (
            <button type="button" onClick={() => onRatingChange(5)} className="text-[10px] font-bold" style={{ color: '#f97316' }}>
              nustatyti
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
