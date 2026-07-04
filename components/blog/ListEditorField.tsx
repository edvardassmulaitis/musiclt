'use client'
// components/blog/ListEditorField.tsx
//
// Topas tipo įrašo sąrašo editor'ius. Galima:
//   - pridėti iš music.lt katalogo (artist/album/track) per MusicSearchPicker
//   - pridėti custom įrašu (laisvas tekstas + optional artist + image)
//   - ĮTERPTI bet kurioje pozicijoje (tarpai tarp eilučių „+ Įterpti čia")
//   - pertvarkyti TEMPIANT (drag & drop) arba ↑/↓ strėlėmis (mobile/tikslus)
//   - per-item komentaras — auto-augantis laukas (visada matomas, be scroll'o)
//
// Saugom kaip JSONB array blog_posts.list_items.

import { useState, useRef, useLayoutEffect } from 'react'
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

function hitToItem(hit: AttachmentHit): Omit<ListItem, 'rank'> {
  const typeMap: Record<AttachmentHit['type'], ListItem['type']> = {
    grupe: 'artist', albumas: 'album', daina: 'track',
  }
  return {
    type: typeMap[hit.type],
    entity_id: hit.id,
    entity_slug: hit.slug,
    title: hit.title,
    artist: hit.artist,
    image_url: hit.image_url ? proxyImg(hit.image_url) : null,
    comment: null,
  }
}

const TYPE_LABEL: Record<ListItem['type'], string> = {
  artist: 'atlikėjas', album: 'albumas', track: 'daina', custom: '',
}

// ── Auto-augantis komentaro laukas ──────────────────────────────────────────
function AutoTextarea({ value, onChange, placeholder }: {
  value: string; onChange: (v: string) => void; placeholder: string
}) {
  const ref = useRef<HTMLTextAreaElement>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (el) { el.style.height = 'auto'; el.style.height = `${Math.max(el.scrollHeight, 38)}px` }
  }, [value])
  return (
    <textarea
      ref={ref}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      rows={1}
      className="w-full px-3 py-2 rounded-lg text-sm outline-none focus:border-[#f97316]/40 transition resize-none overflow-hidden leading-relaxed"
      style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }}
    />
  )
}

export function ListEditorField({
  items, onChange,
}: {
  items: ListItem[]
  onChange: (items: ListItem[]) => void
}) {
  // insertAt = pozicija, į kurią dedam naują įrašą (null = pabaiga)
  const [insertAt, setInsertAt] = useState<number | null>(null)
  const [customMode, setCustomMode] = useState(false)
  const [customTitle, setCustomTitle] = useState('')
  const [customArtist, setCustomArtist] = useState('')
  const [customImage, setCustomImage] = useState('')
  const [openComment, setOpenComment] = useState<number | null>(null)
  const [replaceIdx, setReplaceIdx] = useState<number | null>(null)  // keičiamas susietas įrašas (komentaras išliks)
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null)

  const reindex = (arr: ListItem[]) => arr.map((it, i) => ({ ...it, rank: i + 1 }))

  function insertItem(item: Omit<ListItem, 'rank'>, at: number | null) {
    if (items.length >= MAX_ITEMS) return
    const next = [...items]
    next.splice(at ?? next.length, 0, { ...item, rank: 0 })
    onChange(reindex(next))
  }

  function addFromHit(hit: AttachmentHit) {
    insertItem(hitToItem(hit), insertAt)
    closeAdd()
  }

  function addCustom() {
    if (!customTitle.trim()) return
    insertItem({
      type: 'custom', entity_id: null, entity_slug: null,
      title: customTitle.trim(), artist: customArtist.trim() || null,
      image_url: customImage.trim() || null, comment: null,
    }, insertAt)
    closeAdd()
  }

  function closeAdd() {
    setInsertAt(null); setCustomMode(false)
    setCustomTitle(''); setCustomArtist(''); setCustomImage('')
  }

  function move(idx: number, dir: -1 | 1) {
    const j = idx + dir
    if (j < 0 || j >= items.length) return
    const next = [...items]
    ;[next[idx], next[j]] = [next[j], next[idx]]
    onChange(reindex(next))
  }

  function moveTo(from: number, to: number) {
    if (from === to || from < 0 || to < 0) return
    const next = [...items]
    const [moved] = next.splice(from, 1)
    next.splice(to > from ? to - 1 : to, 0, moved)
    onChange(reindex(next))
  }

  function remove(idx: number) {
    onChange(reindex(items.filter((_, i) => i !== idx)))
    if (openComment === idx) setOpenComment(null)
  }

  function updateComment(idx: number, comment: string) {
    onChange(items.map((it, i) => i === idx ? { ...it, comment: comment || null } : it))
  }

  // Pakeisti susietą music.lt įrašą NEPRARANDANT komentaro (ir pozicijos).
  function replaceEntity(hit: AttachmentHit) {
    if (replaceIdx === null) return
    const e = hitToItem(hit)
    onChange(items.map((it, i) => i === replaceIdx
      ? { ...it, type: e.type, entity_id: e.entity_id, entity_slug: e.entity_slug, title: e.title, artist: e.artist, image_url: e.image_url }
      : it))
    setReplaceIdx(null)
  }

  const atMax = items.length >= MAX_ITEMS

  // ── Add UI (picker + custom) — naudojamas ir tarpuose, ir pabaigoje ──
  const renderAddPanel = (compact: boolean) => (
    <div className="rounded-xl p-3 space-y-2.5" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)' }}>
      {!customMode ? (
        <>
          <MusicSearchPicker attached={[]} onAdd={addFromHit} placeholder="Atlikėjas, albumas ar daina…" compact />
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => setCustomMode(true)} className="text-xs font-semibold hover:opacity-80 transition" style={{ color: 'var(--accent-orange)' }}>
              + Įrašyti ranka (jei nėra music.lt)
            </button>
            {compact && (
              <button type="button" onClick={closeAdd} className="text-xs hover:opacity-80 transition ml-auto" style={{ color: 'var(--text-muted)' }}>Atšaukti</button>
            )}
          </div>
        </>
      ) : (
        <div className="space-y-2">
          <p className="text-[12px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Įrašoma ranka</p>
          <input value={customTitle} onChange={e => setCustomTitle(e.target.value)} placeholder="Pavadinimas (privaloma)" autoFocus
            className="w-full px-2.5 py-2 rounded-lg text-sm outline-none focus:border-[#f97316]/40 transition"
            style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }} />
          <input value={customArtist} onChange={e => setCustomArtist(e.target.value)} placeholder="Atlikėjas (neprivaloma)"
            className="w-full px-2.5 py-2 rounded-lg text-sm outline-none focus:border-[#f97316]/40 transition"
            style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }} />
          <input value={customImage} onChange={e => setCustomImage(e.target.value)} placeholder="Paveikslėlio URL (neprivaloma)"
            className="w-full px-2.5 py-2 rounded-lg text-sm outline-none focus:border-[#f97316]/40 transition"
            style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }} />
          <div className="flex gap-2">
            <button type="button" onClick={addCustom} disabled={!customTitle.trim()}
              className="px-3 py-1.5 rounded-lg text-xs font-bold bg-[#f97316] text-white hover:bg-[#ea580c] disabled:opacity-40 transition">Pridėti</button>
            <button type="button" onClick={() => { setCustomMode(false); setCustomTitle(''); setCustomArtist(''); setCustomImage('') }}
              className="px-3 py-1.5 rounded-lg text-xs hover:bg-[var(--bg-hover)] transition" style={{ color: 'var(--text-muted)' }}>Atgal</button>
          </div>
        </div>
      )}
    </div>
  )

  // ── Tarpas tarp eilučių: „+ Įterpti čia" arba aktyvus add panel ──
  const InsertGap = ({ at }: { at: number }) => (
    insertAt === at ? (
      <div className="my-1.5">{renderAddPanel(true)}</div>
    ) : (
      <div className="group relative h-2 flex items-center justify-center">
        <button type="button" onClick={() => { closeAdd(); setInsertAt(at) }} disabled={atMax}
          className="opacity-0 group-hover:opacity-100 focus:opacity-100 transition text-[12px] font-bold px-2 py-0.5 rounded-full disabled:hidden"
          style={{ background: 'var(--bg-elevated)', border: '1px dashed var(--border-default)', color: 'var(--accent-orange)' }}>
          + Įterpti čia
        </button>
      </div>
    )
  )

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-2">
        <label className="text-[12px] font-bold uppercase tracking-wider block" style={{ color: 'var(--text-muted)', fontFamily: "'Outfit', sans-serif" }}>
          Sąrašas <span className="font-normal normal-case" style={{ color: 'var(--text-faint)' }}>({items.length}/{MAX_ITEMS})</span>
        </label>
        {items.length > 1 && (
          <span className="text-[12px]" style={{ color: 'var(--text-faint)' }}>Tempk ⠿ kad pertvarkytum</span>
        )}
      </div>

      {/* Sąrašas */}
      {items.length > 0 && (
        <div className="mb-3">
          <InsertGap at={0} />
          {items.map((item, idx) => (
            <div key={idx}>
              <div
                onDragOver={e => { e.preventDefault(); if (dragIdx !== null) setDragOverIdx(idx) }}
                onDrop={e => { e.preventDefault(); if (dragIdx !== null) moveTo(dragIdx, idx); setDragIdx(null); setDragOverIdx(null) }}
                className="rounded-xl p-3 transition"
                style={{
                  background: 'var(--bg-surface)',
                  border: `1px solid ${dragOverIdx === idx && dragIdx !== null ? 'var(--accent-orange)' : 'var(--border-subtle)'}`,
                  opacity: dragIdx === idx ? 0.4 : 1,
                }}
              >
                {/* Header (draggable) */}
                <div
                  draggable
                  onDragStart={() => setDragIdx(idx)}
                  onDragEnd={() => { setDragIdx(null); setDragOverIdx(null) }}
                  className="flex items-center gap-2.5 sm:gap-3"
                >
                  {/* Grip */}
                  <span className="hidden sm:flex w-4 flex-shrink-0 items-center justify-center cursor-grab active:cursor-grabbing select-none text-base leading-none" style={{ color: 'var(--text-faint)' }} title="Tempk kad pertvarkytum" aria-hidden>⠿</span>

                  {/* Rank */}
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center text-sm font-black flex-shrink-0" style={{ background: 'rgba(249,115,22,0.15)', color: 'var(--accent-orange)', fontFamily: "'Outfit', sans-serif" }}>
                    {item.rank}
                  </div>

                  {/* Cover */}
                  {item.image_url ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={item.image_url} alt="" className="w-11 h-11 rounded-lg object-cover flex-shrink-0" />
                  ) : (
                    <div className="w-11 h-11 rounded-lg flex-shrink-0 flex items-center justify-center text-base" style={{ background: 'var(--bg-elevated)', color: 'var(--text-faint)' }}>♬</div>
                  )}

                  {/* Title + meta */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold truncate" style={{ color: 'var(--text-primary)', fontFamily: "'Outfit', sans-serif" }}>{item.title}</p>
                    <p className="text-[14px] truncate flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}>
                      {item.artist && <span className="truncate">{item.artist}</span>}
                      {item.type !== 'custom' && (
                        <span className="px-1.5 py-0.5 rounded text-[12px] uppercase tracking-wide flex-shrink-0" style={{ background: 'var(--bg-elevated)', color: 'var(--text-faint)' }}>
                          {TYPE_LABEL[item.type]}
                        </span>
                      )}
                    </p>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-0.5 flex-shrink-0">
                    <button type="button" onClick={() => move(idx, -1)} disabled={idx === 0}
                      className="w-7 h-7 flex items-center justify-center rounded-lg text-sm hover:bg-[var(--bg-hover)] transition disabled:opacity-25" style={{ color: 'var(--text-secondary)' }} aria-label="Aukštyn">↑</button>
                    <button type="button" onClick={() => move(idx, 1)} disabled={idx === items.length - 1}
                      className="w-7 h-7 flex items-center justify-center rounded-lg text-sm hover:bg-[var(--bg-hover)] transition disabled:opacity-25" style={{ color: 'var(--text-secondary)' }} aria-label="Žemyn">↓</button>
                    <button type="button" onClick={() => { closeAdd(); setReplaceIdx(replaceIdx === idx ? null : idx) }}
                      className="w-7 h-7 flex items-center justify-center rounded-lg text-sm hover:bg-[var(--bg-hover)] transition" style={{ color: replaceIdx === idx ? 'var(--accent-orange)' : 'var(--text-secondary)' }} aria-label="Keisti susietą įrašą" title="Pakeisti susietą įrašą (komentaras išliks)">✎</button>
                    <button type="button" onClick={() => remove(idx)}
                      className="w-7 h-7 flex items-center justify-center rounded-lg text-sm hover:bg-red-500/10 hover:text-red-500 transition" style={{ color: 'var(--text-muted)' }} aria-label="Pašalinti">×</button>
                  </div>
                </div>

                {/* Keisti susietą įrašą — komentaras ir pozicija išlieka */}
                {replaceIdx === idx && (
                  <div className="mt-2.5 rounded-lg p-2.5" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)' }}>
                    <p className="text-[12px] font-bold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-muted)' }}>Pakeisti į kitą įrašą <span className="font-normal normal-case" style={{ color: 'var(--text-faint)' }}>· komentaras išliks</span></p>
                    <MusicSearchPicker attached={[]} onAdd={replaceEntity} placeholder="Naujas atlikėjas, albumas ar daina…" compact />
                    <button type="button" onClick={() => setReplaceIdx(null)} className="mt-1.5 text-[14px] hover:opacity-80 transition" style={{ color: 'var(--text-muted)' }}>Atšaukti</button>
                  </div>
                )}

                {/* Komentaras — visada matomas jei yra; kitaip mygtukas */}
                {(item.comment || openComment === idx) ? (
                  <div className="mt-2.5">
                    <AutoTextarea value={item.comment || ''} onChange={v => updateComment(idx, v)} placeholder="Komentaras apie šį įrašą (neprivaloma)…" />
                  </div>
                ) : (
                  <button type="button" onClick={() => setOpenComment(idx)}
                    className="mt-2 text-[14px] font-semibold hover:opacity-80 transition flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
                    <span style={{ color: 'var(--accent-orange)' }}>+</span> Komentaras
                  </button>
                )}
              </div>
              <InsertGap at={idx + 1} />
            </div>
          ))}
        </div>
      )}

      {/* Pridėti pabaigoje (kai neįterpiama kitur) */}
      {!atMax && insertAt === null && (
        <div>
          {items.length === 0 && (
            <p className="text-[12px] font-semibold mb-1.5" style={{ color: 'var(--text-muted)' }}>Pridėk pirmą įrašą</p>
          )}
          {renderAddPanel(false)}
        </div>
      )}
      {atMax && (
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Pasiektas {MAX_ITEMS} įrašų limitas.</p>
      )}
    </div>
  )
}
