'use client'

import { useState, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import dynamic from 'next/dynamic'
import MusicSearchPicker, { type AttachmentHit } from '@/components/MusicSearchPicker'
import { proxyImg } from '@/lib/img-proxy'

// Dynamically import to avoid SSR issues with Tiptap
const RichTextEditor = dynamic(() => import('@/components/RichTextEditor'), { ssr: false })

interface BlogEditorProps {
  value: string
  onChange: (html: string) => void
  placeholder?: string
}

export function BlogEditor({ value, onChange, placeholder }: BlogEditorProps) {
  const [showEmbedModal, setShowEmbedModal] = useState(false)
  const [showMusicModal, setShowMusicModal] = useState(false)
  const [embedUrl, setEmbedUrl] = useState('')
  const [uploadingImage, setUploadingImage] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ── YouTube / Spotify embed ─────────────────────────────────────────────
  const insertEmbed = useCallback(() => {
    if (!embedUrl.trim()) return
    let embedHtml = ''

    // YouTube
    const ytMatch = embedUrl.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([\w-]+)/)
    if (ytMatch) {
      embedHtml = `<div class="embed-yt" style="position:relative;padding-bottom:56.25%;height:0;margin:24px 0;border-radius:12px;overflow:hidden"><iframe src="https://www.youtube.com/embed/${ytMatch[1]}" style="position:absolute;top:0;left:0;width:100%;height:100%;border:0" allowfullscreen></iframe></div>`
    }

    // Spotify track
    const spotifyTrackMatch = embedUrl.match(/open\.spotify\.com\/track\/([\w]+)/)
    if (spotifyTrackMatch) {
      embedHtml = `<iframe src="https://open.spotify.com/embed/track/${spotifyTrackMatch[1]}?theme=0" width="100%" height="152" frameBorder="0" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" loading="lazy" style="border-radius:12px;margin:24px 0"></iframe>`
    }

    // Spotify album
    const spotifyAlbumMatch = embedUrl.match(/open\.spotify\.com\/album\/([\w]+)/)
    if (spotifyAlbumMatch) {
      embedHtml = `<iframe src="https://open.spotify.com/embed/album/${spotifyAlbumMatch[1]}?theme=0" width="100%" height="352" frameBorder="0" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" loading="lazy" style="border-radius:12px;margin:24px 0"></iframe>`
    }

    // Spotify playlist
    const spotifyPlaylistMatch = embedUrl.match(/open\.spotify\.com\/playlist\/([\w]+)/)
    if (spotifyPlaylistMatch) {
      embedHtml = `<iframe src="https://open.spotify.com/embed/playlist/${spotifyPlaylistMatch[1]}?theme=0" width="100%" height="352" frameBorder="0" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" loading="lazy" style="border-radius:12px;margin:24px 0"></iframe>`
    }

    if (embedHtml) {
      onChange(value + embedHtml + '<p></p>')
      setShowEmbedModal(false)
      setEmbedUrl('')
    }
  }, [embedUrl, value, onChange])

  // ── music.lt entity card ────────────────────────────────────────────────
  // Įterpia 'a' link'ą su data-attribute'ais į editor'iaus turinį. Single
  // post page'as (post-content.tsx) gali šituos ateityje render'inti kaip
  // gražias korteles per CSS — kol kas tiesiog stiliaus link card'as inline.
  const insertMusicCard = useCallback((hit: AttachmentHit) => {
    const typePath = hit.type === 'grupe' ? 'atlikejai' : hit.type === 'albumas' ? 'albumai' : 'dainos'
    const url = `/${typePath}/${hit.slug || hit.id}`
    const img = hit.image_url ? `<img src="${proxyImg(hit.image_url)}" alt="" style="width:56px;height:56px;border-radius:6px;object-fit:cover;flex-shrink:0" />` : ''
    const typeLabel = hit.type === 'grupe' ? 'Atlikėjas' : hit.type === 'albumas' ? 'Albumas' : 'Daina'
    const card =
      `<a href="${url}" class="ml-card" style="display:flex;gap:12px;align-items:center;padding:12px;margin:16px 0;border-radius:10px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);text-decoration:none;color:inherit" data-ml-type="${hit.type}" data-ml-id="${hit.id}">` +
        img +
        `<span style="display:flex;flex-direction:column;gap:2px;min-width:0">` +
          `<span style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#5e7290">${typeLabel}</span>` +
          `<span style="font-size:14px;font-weight:700;color:#dde8f8">${escapeHtml(hit.title)}</span>` +
          (hit.artist ? `<span style="font-size:12px;color:#5e7290">${escapeHtml(hit.artist)}</span>` : '') +
        `</span>` +
      `</a>`
    onChange(value + card + '<p></p>')
    setShowMusicModal(false)
  }, [value, onChange])

  // ── Inline image upload ─────────────────────────────────────────────────
  async function handleImageUpload(file: File) {
    if (!file.type.startsWith('image/')) return
    if (file.size > 5 * 1024 * 1024) {
      alert('Failas per didelis (max 5MB)')
      return
    }
    setUploadingImage(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/upload', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Upload nepavyko')
      const imgHtml = `<img src="${data.url}" alt="" style="border-radius:12px;margin:20px 0;max-width:100%" /><p></p>`
      onChange(value + imgHtml)
    } catch (e: any) {
      alert(e.message)
    } finally {
      setUploadingImage(false)
    }
  }

  return (
    <div>
      {/* Toolbar above editor */}
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <button
          type="button"
          onClick={() => setShowEmbedModal(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all"
          style={{ background: 'rgba(249,115,22,0.1)', border: '1px solid rgba(249,115,22,0.2)', color: 'var(--accent-orange)' }}>
          🎵 YouTube / Spotify
        </button>

        <button
          type="button"
          onClick={() => setShowMusicModal(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all"
          style={{ background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.2)', color: '#60a5fa' }}>
          💿 music.lt
        </button>

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploadingImage}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all disabled:opacity-50"
          style={{ background: 'rgba(168,85,247,0.1)', border: '1px solid rgba(168,85,247,0.2)', color: '#c084fc' }}>
          {uploadingImage ? '⏳ įkeliama...' : '🖼 Nuotrauka'}
        </button>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={e => {
            const file = e.target.files?.[0]
            if (file) handleImageUpload(file)
            e.target.value = ''
          }}
        />
      </div>

      {/* Existing Tiptap editor with dark theme override */}
      <div className="blog-editor-dark">
        <RichTextEditor
          value={value}
          onChange={onChange}
          placeholder={placeholder || 'Pradėk rašyti savo straipsnį...'}
        />
      </div>

      {/* YouTube/Spotify embed modal */}
      {showEmbedModal && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={() => setShowEmbedModal(false)}>
          <div className="w-full max-w-md mx-4 rounded-2xl p-6" style={{ background: 'var(--modal-bg)', border: '1px solid var(--modal-border)' }} onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-black mb-1" style={{ color: 'var(--text-primary)' }}>Įterpti muzikos embed</h3>
            <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>Palaikoma: YouTube, Spotify (track, album, playlist)</p>
            <input
              value={embedUrl}
              onChange={e => setEmbedUrl(e.target.value)}
              placeholder="https://youtube.com/watch?v=... arba https://open.spotify.com/track/..."
              className="w-full h-10 rounded-lg px-3 text-sm focus:outline-none mb-3"
              style={{ background: 'var(--input-bg)', border: '1px solid var(--input-border)', color: 'var(--input-text)' }}
              onKeyDown={e => e.key === 'Enter' && insertEmbed()}
              autoFocus
            />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowEmbedModal(false)} className="px-4 py-2 rounded-lg text-xs font-bold" style={{ color: 'var(--text-muted)' }}>Atšaukti</button>
              <button onClick={insertEmbed} className="px-4 py-2 rounded-lg text-xs font-bold transition" style={{ background: 'var(--accent-orange)', color: 'var(--text-primary)' }}>Įterpti</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* music.lt picker modal */}
      {showMusicModal && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={() => setShowMusicModal(false)}>
          <div className="w-full max-w-lg mx-4 rounded-2xl p-6" style={{ background: 'var(--modal-bg)', border: '1px solid var(--modal-border)' }} onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-black mb-1" style={{ color: 'var(--text-primary)' }}>Įterpti iš music.lt</h3>
            <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>Susirask atlikėją, albumą ar dainą — bus įterpta kaip kortelė tekste</p>
            <MusicSearchPicker
              attached={[]}
              onAdd={insertMusicCard}
              placeholder="Pasirink iš music.lt katalogo..."
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
        .blog-editor-dark .ProseMirror { color: #b0bdd4; min-height: 300px; }
        .blog-editor-dark .ProseMirror p.is-editor-empty:first-child::before { color: rgba(255,255,255,0.15) !important; }
        .blog-editor-dark .ProseMirror blockquote { border-left-color: rgba(249,115,22,0.5); color: rgba(200,215,240,0.55); }
        .blog-editor-dark .w-px.bg-gray-200 { background: rgba(255,255,255,0.08) !important; }
      `}</style>
    </div>
  )
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
