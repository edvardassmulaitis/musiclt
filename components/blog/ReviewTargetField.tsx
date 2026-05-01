'use client'
// components/blog/ReviewTargetField.tsx
//
// Recenzijos formoje — pasirenkam vieną music.lt entity (atlikėją, albumą
// arba dainą) ir balą 1–10. Naudojam egzistuojantį MusicSearchPicker, tiesiog
// keičiam į single-select (pirmas pasirinkimas perrašo).

import MusicSearchPicker, { type AttachmentHit } from '@/components/MusicSearchPicker'
import { proxyImg } from '@/lib/img-proxy'

export type ReviewTarget = {
  artist_id: number | null
  album_id: number | null
  track_id: number | null
  /** Cached display info — neserveriuojam, tik UI'iui */
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
    <div className="space-y-4 mb-6 p-4 rounded-xl" style={{ background: 'rgba(234,179,8,0.05)', border: '1px solid rgba(234,179,8,0.15)' }}>
      <div>
        <label className="text-[10px] font-bold uppercase tracking-wider mb-2 block" style={{ color: '#eab308', fontFamily: "'Outfit', sans-serif" }}>
          Ką recenzuoji?
        </label>

        {target.display ? (
          <div className="flex items-center gap-3 px-3 py-2 rounded-lg" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
            {target.display.image_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={proxyImg(target.display.image_url)} alt="" className="w-10 h-10 rounded object-cover" />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-bold uppercase" style={{ color: '#5e7290' }}>
                {target.display.type === 'grupe' ? 'Atlikėjas' : target.display.type === 'albumas' ? 'Albumas' : 'Daina'}
              </p>
              <p className="text-sm font-bold truncate" style={{ color: '#dde8f8' }}>
                {target.display.title}
                {target.display.artist && <span className="text-[#5e7290] font-normal"> — {target.display.artist}</span>}
              </p>
            </div>
            <button
              type="button"
              onClick={clear}
              className="px-2 py-1 rounded text-xs"
              style={{ color: '#5e7290' }}
            >
              ×
            </button>
          </div>
        ) : (
          <MusicSearchPicker
            attached={[]}
            onAdd={handlePick}
            placeholder="Pasirink atlikėją, albumą ar dainą iš music.lt..."
            compact
          />
        )}
      </div>

      <div>
        <label className="text-[10px] font-bold uppercase tracking-wider mb-2 block" style={{ color: '#eab308', fontFamily: "'Outfit', sans-serif" }}>
          Balas {rating !== null && <span className="text-white font-black">{rating}/10</span>}
        </label>
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={1}
            max={10}
            value={rating ?? 5}
            onChange={e => onRatingChange(parseInt(e.target.value))}
            className="flex-1 accent-[#eab308]"
          />
          {rating !== null ? (
            <button type="button" onClick={() => onRatingChange(null)} className="text-[10px]" style={{ color: '#5e7290' }}>
              išvalyt
            </button>
          ) : (
            <button type="button" onClick={() => onRatingChange(5)} className="text-[10px] text-[#eab308]">
              nustatyti
            </button>
          )}
        </div>
        <div className="flex justify-between text-[9px] mt-1" style={{ color: '#334058' }}>
          <span>1 (silpnai)</span>
          <span>5 (vid.)</span>
          <span>10 (genialu)</span>
        </div>
      </div>
    </div>
  )
}
