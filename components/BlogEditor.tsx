'use client'

import { useState, useCallback } from 'react'
import dynamic from 'next/dynamic'

// Dynamically import to avoid SSR issues with Tiptap
const RichTextEditor = dynamic(() => import('@/components/RichTextEditor'), { ssr: false })

interface BlogEditorProps {
  value: string
  onChange: (html: string) => void
  placeholder?: string
}

export function BlogEditor({ value, onChange, placeholder }: BlogEditorProps) {
  const [showEmbedModal, setShowEmbedModal] = useState(false)
  const [embedUrl, setEmbedUrl] = useState('')

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
      // Append embed HTML to current content
      onChange(value + embedHtml + '<p></p>')
      setShowEmbedModal(false)
      setEmbedUrl('')
    }
  }, [embedUrl, value, onChange])

  return (
    <div>
      {/* Embed button above editor */}
      <div className="flex items-center gap-2 mb-2">
        <button
          type="button"
          onClick={() => setShowEmbedModal(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all hover:bg-white/[.06]"
          style={{ background: 'rgba(249,115,22,0.1)', border: '1px solid rgba(249,115,22,0.2)', color: '#f97316' }}>
          🎵 Įterpti YouTube / Spotify
        </button>
        <span className="text-[10px]" style={{ color: '#334058' }}>Įklijuok nuorodą ir embed atsiras straipsnyje</span>
      </div>

      {/* Existing Tiptap editor with dark theme override */}
      <div className="blog-editor-dark">
        <RichTextEditor
          value={value}
          onChange={onChange}
          placeholder={placeholder || 'Pradėk rašyti savo straipsnį...'}
        />
      </div>

      {/* Embed modal */}
      {showEmbedModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={() => setShowEmbedModal(false)}>
          <div className="w-full max-w-md rounded-2xl p-6" style={{ background: '#0d1320', border: '1px solid rgba(255,255,255,0.1)' }} onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-black mb-1" style={{ color: '#f2f4f8' }}>Įterpti muzikos embed</h3>
            <p className="text-xs mb-4" style={{ color: '#4a6580' }}>Palaikoma: YouTube, Spotify (track, album, playlist)</p>
            <input
              value={embedUrl}
              onChange={e => setEmbedUrl(e.target.value)}
              placeholder="https://youtube.com/watch?v=... arba https://open.spotify.com/track/..."
              className="w-full h-10 rounded-lg px-3 text-sm focus:outline-none mb-3"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#c8d8f0' }}
              onKeyDown={e => e.key === 'Enter' && insertEmbed()}
              autoFocus
            />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowEmbedModal(false)} className="px-4 py-2 rounded-lg text-xs font-bold" style={{ color: '#5e7290' }}>Atšaukti</button>
              <button onClick={insertEmbed} className="px-4 py-2 rounded-lg text-xs font-bold bg-[#f97316] text-white hover:bg-[#ea580c] transition">Įterpti</button>
            </div>
          </div>
        </div>
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
