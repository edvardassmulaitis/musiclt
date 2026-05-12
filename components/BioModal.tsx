'use client'
// components/BioModal.tsx
//
// Full-screen-ish modal for reading a long bio/description. Uses portal,
// ESC-to-close, scroll lock. Matches LikesModal visual language.

import { useEffect } from 'react'
import { createPortal } from 'react-dom'

/** Normalize bio HTML:
 *  1. Replace known mojibake artifacts (Ġ et al.) — wiki import sometimes
 *     leaves BPE tokenizer relics or Latin-1/UTF-8 round-trip corruption.
 *     `Ġ` (U+0120) in machine-translated text → usually a space (BPE space
 *     marker). E.g. 'IlgĠlaikĠSpears' → 'Ilg laik Spears' (still imperfect
 *     LT but more readable than raw artifacts).
 *  2. If no <p> tags present, wrap paragraphs (split by 2+ newlines or
 *     ' ... ' double-period sentence ends) so the modal renders distinct
 *     paragraphs instead of a single wall of text.
 */
function normalizeBio(html: string): string {
  if (!html) return ''
  // 1) Mojibake fixes
  let out = html
    // Ġ (U+0120, BPE space marker) → space
    .replace(/Ġ/g, ' ')
    // Ī (U+012A) → į (educated guess for LT)
    .replace(/Ī/g, 'į')
    // Other common artifacts (best-effort)
    .replace(/Â/g, '')
    .replace(/Ã„/g, 'Ä')
    .replace(/Ãª/g, 'ê')
    // Collapse multi-spaces created by Ġ replacement
    .replace(/[ \t]{2,}/g, ' ')

  // 2) Wrap paragraphs if no <p> present
  const hasP = /<p[\s>]/i.test(out)
  if (!hasP) {
    // Split by double-newlines (most common paragraph separator). Fallback:
    // also split after `. ` (period + space + capital), which catches
    // single-line bio with sentence breaks but no newlines.
    let paragraphs: string[]
    if (/\n\s*\n/.test(out)) {
      paragraphs = out.split(/\n\s*\n+/).map(p => p.trim()).filter(Boolean)
    } else {
      // Sentence-based split, capping at 3-4 sentences per paragraph.
      // Heuristic: chunk every 3 sentences (`. ` followed by capital).
      const sentences = out.split(/(?<=\.) +(?=[A-ZĄČĘĖĮŠŲŪŽ])/)
      paragraphs = []
      for (let i = 0; i < sentences.length; i += 3) {
        paragraphs.push(sentences.slice(i, i + 3).join(' ').trim())
      }
      paragraphs = paragraphs.filter(Boolean)
    }
    out = paragraphs.map(p => `<p>${p}</p>`).join('\n')
  }
  return out
}

type Props = {
  open: boolean
  onClose: () => void
  title: string
  subtitle?: string
  html: string
}

export default function BioModal({ open, onClose, title, subtitle, html }: Props) {
  useEffect(() => {
    if (!open) return
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', h)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  if (!open || typeof document === 'undefined') return null

  return createPortal(
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '32px 16px',
        background: 'rgba(0,0,0,0.78)', backdropFilter: 'blur(8px)',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        style={{
          width: '100%', maxWidth: 760, maxHeight: '88vh',
          display: 'flex', flexDirection: 'column',
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-default)',
          borderRadius: 20, overflow: 'hidden',
          boxShadow: '0 40px 80px -20px rgba(0,0,0,0.6)',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '18px 24px', borderBottom: '1px solid var(--border-subtle)',
            flexShrink: 0,
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontFamily: 'Outfit,sans-serif', fontWeight: 800, fontSize: 18,
                color: 'var(--text-primary)', lineHeight: 1.15,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}
            >
              {title}
            </div>
            {subtitle && (
              <div
                style={{
                  marginTop: 4, fontSize: 12, color: 'var(--text-muted)', fontWeight: 600,
                  fontFamily: 'Outfit,sans-serif',
                }}
              >
                {subtitle}
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="Uždaryti"
            style={{
              width: 34, height: 34, borderRadius: 10, border: '1px solid var(--border-subtle)',
              background: 'var(--card-bg)', color: 'var(--text-secondary)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', transition: 'all .15s', flexShrink: 0, marginLeft: 16,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text-primary)'; e.currentTarget.style.borderColor = 'var(--border-strong)' }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.borderColor = 'var(--border-subtle)' }}
          >
            <svg viewBox="0 0 16 16" width={14} height={14} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
              <path d="M3 3l10 10M13 3L3 13" />
            </svg>
          </button>
        </div>

        {/* Body — scrollable readable prose. Normalize HTML:
            • Replace mojibake artifacts (Ġ → ė, etc) — duomenys is wiki
              importo kartais turi UTF-8 round-trip corruption (BPE tokenizer
              relics ar Latin-1 misinterpretation).
            • Wrap raw text į <p> jei <p> tag'ų visai nėra — anksčiau bio
              read'inosi kaip viena pastraipa, sunku skaityti.
        */}
        <div
          style={{
            flex: 1, overflowY: 'auto',
            padding: '22px 28px 28px 28px',
            fontSize: 15, lineHeight: 1.78, color: 'var(--text-secondary)',
          }}
          className="bio-modal-content"
          dangerouslySetInnerHTML={{ __html: normalizeBio(html) }}
        />

        <style>{`
          .bio-modal-content p { margin-bottom: 1em; }
          .bio-modal-content a { color: var(--accent-link); text-decoration: underline; }
          .bio-modal-content a:hover { color: var(--accent-blue); }
          .bio-modal-content strong { color: var(--text-primary); font-weight: 700; }
          .bio-modal-content em { font-style: italic; }
          .bio-modal-content ul, .bio-modal-content ol { padding-left: 1.5em; margin-bottom: 1em; }
          .bio-modal-content ul { list-style: disc; }
          .bio-modal-content ol { list-style: decimal; }
          .bio-modal-content h2, .bio-modal-content h3 {
            color: var(--text-primary);
            font-family: Outfit, sans-serif;
            font-weight: 800;
            margin-top: 1.2em; margin-bottom: .4em;
          }
          .bio-modal-content h2 { font-size: 1.25em; }
          .bio-modal-content h3 { font-size: 1.08em; }
        `}</style>
      </div>
    </div>,
    document.body,
  )
}
