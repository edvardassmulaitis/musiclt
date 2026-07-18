'use client'

import { useState } from 'react'

/**
 * NewsPhotoStep — inbox'o Nuotraukų žingsnis (wizard step 4).
 *
 * Aiškiai atskiria nuotraukų ŠALTINIUS pagal prioritetą:
 *   P1 · 📧 Žiniasklaidos press nuotraukos (email_attachment) — su autorium,
 *        kurį galima vietoje paredaguoti (išsaugoma į news_candidate_images).
 *   P2 · 🎤 Profilio nuotraukos (artist_photo / artist_cover / wiki) — + Wikimedia
 *        paieška. Pasirinkus Wikimedia nuotrauką ji papildo ir atlikėjo profilį.
 *   P3 · 🎬 Iš pridėtų embedų (youtube_thumb).
 *
 * Pasirinkimo modelis nekinta: multi-select, pirma pasirinkta = hero, max 5.
 */

export type ImageOption = {
  url: string
  label: string
  source: string
  video_id?: string
  yt_meta?: { title: string | null; channel_title: string | null; view_count: number | null; uploaded_at: string | null } | null
  meta?: { photographer?: string | null; copyright?: string | null; year_taken?: number | null; caption?: string | null; image_id?: number; sourceUrl?: string | null; takenAt?: string | null }
}

function fmtViews(n: number | null | undefined): string {
  if (!n || n <= 0) return ''
  if (n < 1000) return String(n)
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}K`
  if (n < 1_000_000_000) return `${(n / 1_000_000).toFixed(n < 10_000_000 ? 1 : 0)}M`
  return `${(n / 1_000_000_000).toFixed(1)}B`
}

const PROFILE_SOURCES = ['artist_photo', 'artist_cover', 'wiki']

export default function NewsPhotoStep({
  candidateId, options, selected, onToggle, onClear,
  wikiArtistName, onOpenWiki, wikiProfileMsg, onUpdateOptionAuthor,
}: {
  candidateId: number
  options: ImageOption[]
  selected: string[]
  onToggle: (url: string) => void
  onClear: () => void
  wikiArtistName: string
  onOpenWiki: () => void
  wikiProfileMsg?: string
  /** Po press-foto autoriaus išsaugojimo — atnaujina option meta parent'e. */
  onUpdateOptionAuthor: (url: string, photographer: string) => void
}) {
  const press = options.filter(o => o.source === 'email_attachment')
  const profile = options.filter(o => PROFILE_SOURCES.includes(o.source))
  const embeds = options.filter(o => o.source === 'youtube_thumb')
  const other = options.filter(o => !['email_attachment', 'youtube_thumb', ...PROFILE_SOURCES].includes(o.source))

  const orderOf = (url: string) => selected.indexOf(url)

  const renderCard = (opt: ImageOption, showAuthorEditor?: boolean) => {
    const idx = orderOf(opt.url)
    const isSel = idx >= 0
    const isPrimary = idx === 0
    return (
      <div key={opt.url} className="flex flex-col gap-1">
        <button
          type="button"
          onClick={() => onToggle(opt.url)}
          className={`relative aspect-square rounded-lg overflow-hidden border-2 transition-all ${
            isPrimary ? 'border-emerald-500 ring-2 ring-emerald-200'
              : isSel ? 'border-blue-500 ring-1 ring-blue-200'
              : 'border-transparent hover:border-[var(--input-border)]'
          }`}>
          <img src={opt.url} alt={opt.label}
            className="absolute inset-0 w-full h-full object-cover bg-[var(--bg-elevated)]"
            onError={e => ((e.target as HTMLImageElement).style.display = 'none')} />
          {isSel && (
            <div className={`absolute top-1 left-1 min-w-5 h-5 px-1 rounded-full flex items-center justify-center text-[12px] font-bold text-white ${isPrimary ? 'bg-emerald-600' : 'bg-blue-600'}`}>
              {isPrimary ? `1 · hero` : idx + 1}
            </div>
          )}
          {/* YT embed thumb — title + channel/views overlay */}
          {opt.source === 'youtube_thumb' && (
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/60 to-transparent text-white text-[11px] px-1.5 py-1">
              <div className="opacity-95 leading-tight truncate" title={opt.yt_meta?.title || ''}>{opt.yt_meta?.title || opt.label}</div>
              {(opt.yt_meta?.channel_title || opt.yt_meta?.view_count) && (
                <div className="opacity-70 leading-tight truncate">
                  {opt.yt_meta?.channel_title}{opt.yt_meta?.view_count ? ` · 👁 ${fmtViews(opt.yt_meta.view_count)}` : ''}
                </div>
              )}
            </div>
          )}
        </button>
        {/* Press foto — autorius po kortele (redaguojamas) */}
        {showAuthorEditor && (
          <PressAuthor candidateId={candidateId} opt={opt} onSaved={p => onUpdateOptionAuthor(opt.url, p)} />
        )}
        {/* Profilio (wiki) autorius — read-only + nuoroda į Wikimedia */}
        {!showAuthorEditor && opt.source === 'wiki' && opt.meta?.photographer && (
          <div className="text-[11px] text-[var(--text-muted)] truncate px-0.5">
            📷 {opt.meta.photographer}
            {opt.meta.sourceUrl && (
              <a href={opt.meta.sourceUrl} target="_blank" rel="noopener noreferrer"
                onClick={e => e.stopPropagation()} className="ml-1 text-blue-600 hover:underline">↗</a>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide">
          Nuotraukos {selected.length > 0 && <span className="normal-case font-normal opacity-70">({selected.length} pasirinkta · pirma = hero)</span>}
        </div>
        {selected.length > 0 && (
          <button type="button" onClick={onClear}
            className="text-[11px] text-[var(--text-muted)] hover:text-red-500 font-medium">Išvalyti</button>
        )}
      </div>

      {options.length === 0 && (
        <p className="text-sm text-[var(--text-muted)] italic">Nuotraukų šaltinių nėra. Ieškok per Wikimedia žemiau.</p>
      )}

      {/* ── P1 · Press nuotraukos (žiniasklaidos) ───────────────────── */}
      {press.length > 0 && (
        <section>
          <div className="flex items-center gap-1.5 mb-1.5">
            <span className="text-[12px] font-semibold text-[var(--text-primary)]">📧 Press nuotraukos</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-medium">1 prioritetas</span>
            <span className="text-[11px] text-[var(--text-muted)]">iš žiniasklaidos · su autorium</span>
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            {press.map(opt => renderCard(opt, true))}
          </div>
        </section>
      )}

      {/* ── P2 · Profilio nuotraukos (+ Wikimedia) ──────────────────── */}
      <section>
        <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
          <span className="text-[12px] font-semibold text-[var(--text-primary)]">🎤 Profilio nuotraukos</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">2 prioritetas</span>
          {wikiArtistName && (
            <button type="button" onClick={onOpenWiki}
              className="ml-auto px-2.5 py-1 bg-amber-50 hover:bg-amber-100 text-amber-700 rounded-lg text-[11px] font-medium border border-amber-200">
              🔍 Wikimedia: {wikiArtistName}
            </button>
          )}
        </div>
        {wikiProfileMsg && <div className="text-[11px] text-emerald-600 mb-1.5">{wikiProfileMsg}</div>}
        {profile.length > 0 ? (
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            {profile.map(opt => renderCard(opt))}
          </div>
        ) : (
          <p className="text-[12px] text-[var(--text-muted)] italic">Profilio nuotraukų DB nėra — pridėk per Wikimedia.</p>
        )}
      </section>

      {/* ── P3 · Iš embedų ──────────────────────────────────────────── */}
      {embeds.length > 0 && (
        <section>
          <div className="flex items-center gap-1.5 mb-1.5">
            <span className="text-[12px] font-semibold text-[var(--text-primary)]">🎬 Iš pridėtų embedų</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--bg-elevated)] text-[var(--text-muted)] font-medium">3 prioritetas</span>
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            {embeds.map(opt => renderCard(opt))}
          </div>
        </section>
      )}

      {other.length > 0 && (
        <section>
          <div className="text-[12px] font-semibold text-[var(--text-primary)] mb-1.5">🖼 Kitos</div>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            {other.map(opt => renderCard(opt))}
          </div>
        </section>
      )}
    </div>
  )
}

/* ── Press-foto autorius (redaguojamas) ─────────────────────────────── */
function PressAuthor({ candidateId, opt, onSaved }: {
  candidateId: number; opt: ImageOption; onSaved: (photographer: string) => void
}) {
  const imageId = opt.meta?.image_id
  const current = opt.meta?.photographer || ''
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(current)
  const [saving, setSaving] = useState(false)

  const save = async () => {
    if (!imageId) return
    const val = draft.trim()
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/news-candidates/${candidateId}/images/${imageId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ photographer_override: val }),
      })
      const d = await res.json()
      if (d.ok) { onSaved(val); setEditing(false) }
    } finally { setSaving(false) }
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1 px-0.5">
        <span className="text-[11px] shrink-0">📷</span>
        <input autoFocus type="text" value={draft} onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); save() } if (e.key === 'Escape') setEditing(false) }}
          disabled={saving} placeholder="Autorius"
          className="flex-1 min-w-0 px-1 py-0.5 rounded border border-blue-400 text-[11px] bg-[var(--bg-surface)] text-[var(--text-primary)] focus:outline-none" />
        <button type="button" onClick={save} disabled={saving} className="shrink-0 text-emerald-600 text-[12px] font-bold px-0.5">{saving ? '…' : '✓'}</button>
        <button type="button" onClick={() => setEditing(false)} disabled={saving} className="shrink-0 text-[var(--text-muted)] text-[12px] px-0.5">×</button>
      </div>
    )
  }

  return (
    <button type="button" onClick={() => { setDraft(current); setEditing(true) }}
      title="Taisyti autorių"
      className={`text-[11px] truncate px-0.5 text-left flex items-center gap-1 ${current ? 'text-[var(--text-muted)]' : 'text-amber-600'} hover:text-blue-600`}>
      <span className="truncate">📷 {current || 'Nurodyk autorių'}</span>
      <span className="shrink-0 opacity-70">✎</span>
    </button>
  )
}
