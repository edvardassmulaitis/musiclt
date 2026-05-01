'use client'
// components/BlogEditor.tsx
//
// Wrapper around RichTextEditor specially blog'ui:
//   - Įjungia auto-embed paste (YouTube/Spotify/SoundCloud) — user'is
//     tiesiog įklijuoja URL kažkur straipsnyje, ir jis virsta iframe'u
//   - Image paste/drop iš screenshot tool'ų ar Finder'io į /api/upload
//   - Vienas mygtukas viršuje — `+ Pridėti music.lt įrašą` — open'ina
//     MusicSearchPicker modal'ą ir įterpia entity card'ą į turinį
//
// Visi kiti embed'ai/upload'ai dirba per paste. Norėjom paprastinti — vietoj
// 3 atskirų toolbar mygtukų (YT/SP, music.lt, image), paliekam tik vieną
// kuris reikalauja explicit pasirinkimo iš mūsų DB.

import { useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import dynamic from 'next/dynamic'
import MusicSearchPicker, { type AttachmentHit } from '@/components/MusicSearchPicker'
import { proxyImg } from '@/lib/img-proxy'

const RichTextEditor = dynamic(() => import('@/components/RichTextEditor'), { ssr: false })

interface BlogEditorProps {
  value: string
  onChange: (html: string) => void
  placeholder?: string
}

export function BlogEditor({ value, onChange, placeholder }: BlogEditorProps) {
  const [showMusicModal, setShowMusicModal] = useState(false)

  // Insertinam HTML su data-attrs — MusicCard Tiptap extension'as parseHTML'u
  // sumatch'ina `a.ml-card` ir konvertuoja į custom node'ą, kuris per
  // serializaciją išlieka kaip atomiška kortelė (ne flattin'tas tekstas).
  const insertMusicCard = useCallback((hit: AttachmentHit) => {
    const proxiedImg = hit.image_url ? proxyImg(hit.image_url) : ''
    const card =
      `<a class="ml-card" ` +
        `data-ml-type="${hit.type}" ` +
        `data-ml-id="${hit.id}" ` +
        `data-ml-slug="${escapeAttr(hit.slug || '')}" ` +
        `data-ml-title="${escapeAttr(hit.title)}" ` +
        `data-ml-artist="${escapeAttr(hit.artist || '')}" ` +
        `data-ml-img="${escapeAttr(proxiedImg)}"></a>`
    onChange(value + card + '<p></p>')
    setShowMusicModal(false)
  }, [value, onChange])

  return (
    <div>
      {/* Subtle hint above editor */}
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px]" style={{ color: '#5e7290' }}>
          Įklijuok YouTube / Spotify nuorodą — auto-embed. Numesk nuotrauką — auto-upload.
        </p>
        <button
          type="button"
          onClick={() => setShowMusicModal(true)}
          className="px-2.5 py-1 rounded-md text-[10px] font-bold transition"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#8aa8cc' }}
        >
          + music.lt
        </button>
      </div>

      <div className="blog-editor-dark">
        <RichTextEditor
          value={value}
          onChange={onChange}
          placeholder={placeholder || 'Pradėk rašyti...'}
          enableMediaPaste
        />
      </div>

      {showMusicModal && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={() => setShowMusicModal(false)}>
          <div className="w-full max-w-lg mx-4 rounded-2xl p-6" style={{ background: 'var(--modal-bg)', border: '1px solid var(--modal-border)' }} onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-black mb-1" style={{ color: 'var(--text-primary)' }}>Pridėti įrašą iš music.lt</h3>
            <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>Susirask atlikėją, albumą ar dainą — bus įterpta kaip kortelė</p>
            <MusicSearchPicker
              attached={[]}
              onAdd={insertMusicCard}
              placeholder="Rašyk pavadinimą..."
            />
            <div className="flex justify-end mt-4">
              <button onClick={() => setShowMusicModal(false)} className="px-4 py-2 rounded-lg text-xs font-bold" style={{ color: 'var(--text-muted)' }}>Uždaryti</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      <style jsx global>{`
        .blog-editor-dark .border-gray-200 { border-color: rgba(255,255,255,0.08) !important; }
        .blog-editor-dark .bg-white { background: rgba(255,255,255,0.02) !important; }
        .blog-editor-dark .bg-gray-50 { background: rgba(255,255,255,0.03) !important; }
        .blog-editor-dark .border-gray-100 { border-color: rgba(255,255,255,0.06) !important; }
        .blog-editor-dark .text-gray-500 { color: #5e7290 !important; }
        .blog-editor-dark .text-gray-800 { color: #c8d8f0 !important; }
        .blog-editor-dark .text-gray-300 { color: #334058 !important; }
        .blog-editor-dark .hover\\:bg-gray-100:hover { background: rgba(255,255,255,0.06) !important; }
        .blog-editor-dark .hover\\:text-gray-800:hover { color: #c8d8f0 !important; }
        .blog-editor-dark .bg-blue-100 { background: rgba(29,78,216,0.2) !important; }
        .blog-editor-dark .text-blue-700 { color: #60a5fa !important; }
        .blog-editor-dark .prose { color: #b0bdd4 !important; }
        .blog-editor-dark .prose h2 { color: #f2f4f8 !important; }
        .blog-editor-dark .prose h3 { color: #dde8f8 !important; }
        .blog-editor-dark .ProseMirror { color: #b0bdd4; min-height: 280px; }
        .blog-editor-dark .ProseMirror p.is-editor-empty:first-child::before { color: rgba(255,255,255,0.15) !important; }
        .blog-editor-dark .ProseMirror blockquote { border-left-color: rgba(249,115,22,0.5); color: rgba(200,215,240,0.55); }
        .blog-editor-dark .ProseMirror img { border-radius: 10px; margin: 16px 0; max-width: 100%; }
        .blog-editor-dark .ProseMirror iframe { border-radius: 10px; margin: 20px 0; }
        .blog-editor-dark .w-px.bg-gray-200 { background: rgba(255,255,255,0.08) !important; }
      `}</style>
    </div>
  )
}

function escapeAttr(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
