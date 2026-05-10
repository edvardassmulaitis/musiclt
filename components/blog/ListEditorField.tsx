'use client'
// components/blog/ListEditorField.tsx
//
// Topas tipo įrašo sąrašo editor'ius. Items galima:
//   - pridėti iš music.lt katalogo (artist/album/track) per MusicSearchPicker
//   - pridėti custom įrašu (laisvas tekstas + optional artist + image)
// Reorder per up/down strėles. Per-item komentaras (optional).
//
// Saugom kaip JSONB array blog_posts.list_items.

import { useState } from 'react'
import MusicSearchPicker, { type AttachmentHit } from '@/components/MusicSearchPicker'
import { proxyImg } from '@/lib/img-proxy'

export type ListItem = {
  rank: number
  type: 'artist' | 'album' | 'track' | 'custom'
  entity_id: number | null
  entity_slug: string | null
  title: string
  artist: string | null
  image_url: string | null
  comment: string | null
}

const MAX_ITEMS = 50

// Konvertuojam MusicSearchPicker hit'ą į ListItem'ą
function hitToItem(hit: AttachmentHit, rank: number): ListItem {
  const typeMap: Record<AttachmentHit['type'], ListItem['type']> = {
    grupe: 'artist', albumas: 'album', daina: 'track',
  }
  return {
    rank,
    type: typeMap[hit.type],
    entity_id: hit.id,
    entity_slug: hit.slug,
    title: hit.title,
    artist: hit.artist,
    image_url: hit.image_url ? proxyImg(hit.image_url) : null,
    comment: null,
  }
}

export function ListEditorField({
  items, onChange,
}: {
  items: ListItem[]
  onChange: (items: ListItem[]) => void
}) {
  const [showCustomForm, setShowCustomForm] = useState(false)
  const [customTitle, setCustomTitle] = useState('')
  const [customArtist, setCustomArtist] = useState('')
  const [customImage, setCustomImage] = useState('')
  const [editingComment, setEditingComment] = useState<number | null>(null)

  function addFromHit(hit: AttachmentHit) {
    if (items.length >= MAX_ITEMS) return
    onChange([...items, hitToItem(hit, items.length + 1)])
  }

  function addCustom() {
    if (!customTitle.trim()) return
    if (items.length >= MAX_ITEMS) return
    onChange([
      ...items,
      {
        rank: items.length + 1,
        type: 'custom',
        entity_id: null,
        entity_slug: null,
        title: customTitle.trim(),
        artist: customArtist.trim() || null,
        image_url: customImage.trim() || null,
        comment: null,
      },
    ])
    setCustomTitle(''); setCustomArtist(''); setCustomImage(''); setShowCustomForm(false)
  }

  function move(idx: number, dir: -1 | 1) {
    const newIdx = idx + dir
    if (newIdx < 0 || newIdx >= items.length) return
    const next = [...items]
    ;[next[idx], next[newIdx]] = [next[newIdx], next[idx]]
    onChange(next.map((it, i) => ({ ...it, rank: i + 1 })))
  }

  function remove(idx: number) {
    onChange(items.filter((_, i) => i !== idx).map((it, i) => ({ ...it, rank: i + 1 })))
    if (editingComment === idx) setEditingComment(null)
  }

  function updateComment(idx: number, comment: string) {
    onChange(items.map((it, i) => i === idx ? { ...it, comment: comment || null } : it))
  }

  return (
    <div className="mb-6">
      <label className="text-[10px] font-bold uppercase tracking-wider mb-2 block" style={{ color: '#5e7290', fontFamily: "'Outfit', sans-serif" }}>
        Sąrašas <span className="font-normal text-[#334058] normal-case">({items.length}/{MAX_ITEMS})</span>
      </label>

      {/* Esami items */}
      {items.length > 0 && (
        <div className="space-y-1.5 mb-3">
          {items.map((item, idx) => (
            <div key={idx} className="rounded-lg p-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <div className="flex items-center gap-3">
                {/* Rank */}
                <div className="w-7 h-7 rounded flex items-center justify-center text-sm font-black flex-shrink-0" style={{ background: 'rgba(249,115,22,0.15)', color: '#f97316', fontFamily: "'Outfit', sans-serif" }}>
                  {item.rank}
                </div>

                {/* Cover */}
                {item.image_url ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={item.image_url} alt="" className="w-10 h-10 rounded object-cover flex-shrink-0" />
                ) : (
                  <div className="w-10 h-10 rounded flex-shrink-0" style={{ background: 'rgba(255,255,255,0.04)' }} />
                )}

                {/* Title + meta */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate" style={{ color: '#dde8f8' }}>{item.title}</p>
                  <p className="text-[10px] truncate" style={{ color: '#5e7290' }}>
                    {item.artist || ''}
                    {item.type !== 'custom' && (
                      <span className="ml-2 px-1.5 py-0.5 rounded" style={{ background: 'rgba(255,255,255,0.04)' }}>
                        {item.type === 'artist' ? 'atlikėjas' : item.type === 'album' ? 'albumas' : 'daina'}
                      </span>
                    )}
                  </p>
                </div>

                {/* Action buttons */}
                <div className="flex items-center gap-0.5 flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => move(idx, -1)}
                    disabled={idx === 0}
                    className="w-6 h-6 flex items-center justify-center rounded text-xs hover:bg-white/[.06] transition disabled:opacity-30"
                    style={{ color: '#8aa8cc' }}
                    aria-label="Aukštyn"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => move(idx, 1)}
                    disabled={idx === items.length - 1}
                    className="w-6 h-6 flex items-center justify-center rounded text-xs hover:bg-white/[.06] transition disabled:opacity-30"
                    style={{ color: '#8aa8cc' }}
                    aria-label="Žemyn"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingComment(editingComment === idx ? null : idx)}
                    className="w-6 h-6 flex items-center justify-center rounded text-xs hover:bg-white/[.06] transition"
                    style={{ color: editingComment === idx ? '#f97316' : (item.comment ? '#dde8f8' : '#5e7290') }}
                    aria-label="Komentaras"
                    title={item.comment ? 'Su komentaru' : 'Pridėti komentarą'}
                  >
                    💬
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(idx)}
                    className="w-6 h-6 flex items-center justify-center rounded text-xs hover:bg-red-500/10 hover:text-red-400 transition"
                    style={{ color: '#5e7290' }}
                    aria-label="Pašalinti"
                  >
                    ×
                  </button>
                </div>
              </div>

              {/* Optional comment */}
              {(editingComment === idx || item.comment) && (
                <textarea
                  value={item.comment || ''}
                  onChange={e => updateComment(idx, e.target.value)}
                  placeholder="Trumpas komentaras (neprivaloma)"
                  rows={2}
                  className="w-full mt-2 px-2 py-1.5 rounded text-xs outline-none focus:border-[#f97316]/30 transition resize-none"
                  style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', color: '#b0bdd4' }}
                />
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add controls */}
      {items.length < MAX_ITEMS && (
        <div className="space-y-2">
          {/* Music.lt picker — visada matomas */}
          <div>
            <p className="text-[10px] font-semibold mb-1.5" style={{ color: '#5e7290' }}>Pridėti iš music.lt</p>
            <MusicSearchPicker
              attached={[]}
              onAdd={addFromHit}
              placeholder="Atlikėjas, albumas ar daina..."
              compact
            />
          </div>

          {/* Custom toggle */}
          {!showCustomForm ? (
            <button
              type="button"
              onClick={() => setShowCustomForm(true)}
              className="text-xs font-semibold transition hover:text-white"
              style={{ color: '#5e7290' }}
            >
              + Pridėti custom įrašą (kažko nėra music.lt)
            </button>
          ) : (
            <div className="rounded-lg p-3 space-y-2" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#5e7290' }}>Custom įrašas</p>
              <input
                value={customTitle}
                onChange={e => setCustomTitle(e.target.value)}
                placeholder="Pavadinimas (privaloma)"
                className="w-full px-2 py-1.5 rounded text-xs outline-none focus:border-[#f97316]/30 transition"
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', color: '#dde8f8' }}
                autoFocus
              />
              <input
                value={customArtist}
                onChange={e => setCustomArtist(e.target.value)}
                placeholder="Atlikėjas (neprivaloma)"
                className="w-full px-2 py-1.5 rounded text-xs outline-none focus:border-[#f97316]/30 transition"
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', color: '#dde8f8' }}
              />
              <input
                value={customImage}
                onChange={e => setCustomImage(e.target.value)}
                placeholder="Image URL (neprivaloma)"
                className="w-full px-2 py-1.5 rounded text-xs outline-none focus:border-[#f97316]/30 transition"
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', color: '#dde8f8' }}
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={addCustom}
                  disabled={!customTitle.trim()}
                  className="px-3 py-1 rounded text-xs font-bold bg-[#f97316] text-white hover:bg-[#ea580c] disabled:opacity-40 transition"
                >
                  Pridėti
                </button>
                <button
                  type="button"
                  onClick={() => { setShowCustomForm(false); setCustomTitle(''); setCustomArtist(''); setCustomImage('') }}
                  className="px-3 py-1 rounded text-xs hover:bg-white/[.06] transition"
                  style={{ color: '#5e7290' }}
                >
                  Atšaukti
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
