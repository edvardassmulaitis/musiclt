'use client'
// components/CommentEditor.tsx
//
// Rich-text editor for comments — used inside EntityCommentsBlock inline
// composer and reply modal. Wraps Tiptap with a richer toolbar than the
// initial v1 (B/I/U/S, alignment, lists, blockquote, link, image upload,
// YouTube embed, horizontal rule, undo/redo).
//
// Output is HTML; client display side renders it via dangerouslySetInnerHTML
// for HTML bodies (legacy plain text still goes through splitBodyWithYouTube).
//
// SEO / spam protection:
//   • All user-inserted links carry rel="nofollow ugc noopener noreferrer"
//     so the comment system can't be exploited for link-building.
//   • target="_blank" forces external opens in new tab.
//
// Tema: dark, kad atitiktų komentarų sekciją (skirtingai nuo blog editor'iaus,
// kuris šviesus). Toolbar gali wrap'intis ant siauresnių screen'ų.

import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import Link from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
import Image from '@tiptap/extension-image'
import TextAlign from '@tiptap/extension-text-align'
import { Iframe } from '@/lib/tiptap-iframe'
import { useEffect, useRef, useState } from 'react'

interface Props {
  value: string
  onChange: (html: string) => void
  placeholder?: string
  /** ⌘+Enter shortcut callback — composer submit. */
  onSubmit?: () => void
  /** Auto-focus editor on mount. */
  autoFocus?: boolean
  /** Min/max content height. Komentarai kompaktiški. */
  minHeight?: number
}

function Btn({
  active, onClick, title, children, disabled,
}: {
  active?: boolean
  onClick: () => void
  title: string
  children: React.ReactNode
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => { e.preventDefault(); if (!disabled) onClick() }}
      title={title}
      disabled={disabled}
      className={[
        'flex h-7 w-7 items-center justify-center rounded text-xs transition-colors',
        disabled
          ? 'cursor-not-allowed text-[var(--text-faint)] opacity-40'
          : active
            ? 'bg-[var(--accent-orange)] text-white'
            : 'text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]',
      ].join(' ')}
    >
      {children}
    </button>
  )
}

function Divider() {
  return <span className="mx-0.5 h-4 w-px bg-[var(--border-subtle)]" />
}

// SVG icon helpers — reduces clutter
const I = ({ children }: { children: React.ReactNode }) => (
  <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    {children}
  </svg>
)

export default function CommentEditor({
  value, onChange, placeholder = 'Tavo komentaras',
  onSubmit, autoFocus = false, minHeight = 90,
}: Props) {
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: false,
        // We use our own HorizontalRule via manual `setHorizontalRule()` (StarterKit's is fine)
        codeBlock: false,
        bulletList: { keepMarks: true },
        orderedList: { keepMarks: true },
      }),
      Underline,
      Link.configure({
        openOnClick: false,
        autolink: true,
        // KRITIŠKA: nofollow + ugc + noopener + noreferrer — kad komentarų sistema
        // netaptų link-building'o įrankiu (SEO spam'as).
        HTMLAttributes: {
          class: 'text-blue-400 underline hover:text-blue-300',
          target: '_blank',
          rel: 'nofollow ugc noopener noreferrer',
        },
      }),
      Placeholder.configure({ placeholder }),
      Image.configure({
        HTMLAttributes: {
          class: 'comment-image',
        },
      }),
      TextAlign.configure({
        types: ['paragraph'],
        alignments: ['left', 'center', 'right', 'justify'],
        defaultAlignment: 'left',
      }),
      Iframe,
    ],
    content: value || '',
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
    autofocus: autoFocus,
    editorProps: {
      attributes: {
        class: 'comment-tiptap-content focus:outline-none',
        style: `min-height: ${minHeight}px;`,
      },
      handleKeyDown(_view, event) {
        if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && onSubmit) {
          event.preventDefault()
          onSubmit()
          return true
        }
        return false
      },
    },
  })

  const lastSetRef = useRef<string>(value)
  useEffect(() => {
    if (!editor) return
    if (value === lastSetRef.current) return
    const current = editor.getHTML()
    if (value !== current) {
      editor.commands.setContent(value || '', false)
      lastSetRef.current = value
    }
  }, [value, editor])

  if (!editor) return null

  const setLink = () => {
    const prev = editor.getAttributes('link').href as string | undefined
    const url = window.prompt('Įvesk URL (paliek tuščią — pašalinti):', prev ?? 'https://')
    if (url === null) return
    if (url === '') { editor.chain().focus().unsetLink().run(); return }
    // Basic URL sanitization — only allow http(s):// schemes
    const safe = /^(https?:\/\/|\/)/i.test(url) ? url : `https://${url}`
    editor.chain().focus().extendMarkRange('link').setLink({ href: safe }).run()
  }

  const insertYouTube = () => {
    const url = window.prompt('YouTube URL:')
    if (!url) return
    const m = url.match(/(?:v=|\/|youtu\.be\/)([\w-]{11})/)
    const videoId = m?.[1]
    if (!videoId) {
      alert('Negaliu rasti YouTube video ID. Įsitikink, kad URL teisingas.')
      return
    }
    // Use Iframe node insert via insertContent (extension nepriklauso komanda
    // setIframe — tik nodePasteRule auto-paste'ui). insertContent išparser'ina
    // <iframe> tag'ą per parseHTML ir įdeda Iframe node'ą į editor schema.
    editor.chain().focus().insertContent({
      type: 'iframe',
      attrs: {
        src: `https://www.youtube.com/embed/${videoId}`,
        width: '480',
        height: '270',
        'data-type': 'youtube',
      },
    }).run()
  }

  const insertImage = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      alert('Tik nuotraukų failai (JPG, PNG, GIF, WEBP).')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      alert('Nuotrauka per didelė — max 5MB.')
      return
    }
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/upload', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Upload nepavyko')
      editor.chain().focus().setImage({ src: data.url }).run()
    } catch (e: any) {
      alert(`Klaida: ${e.message || 'Upload nepavyko'}`)
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  return (
    <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)] focus-within:border-[var(--accent-orange)]">
      {/* Toolbar — wraps on narrow screens */}
      <div className="flex flex-wrap items-center gap-0.5 border-b border-[var(--border-subtle)] px-2 py-1">
        <Btn onClick={() => editor.chain().focus().undo().run()} title="Atšaukti (⌘Z)" disabled={!editor.can().undo()}>
          <I><path d="M3 8h7a4 4 0 0 1 0 8H7" /><path d="M6 5 3 8l3 3" /></I>
        </Btn>
        <Btn onClick={() => editor.chain().focus().redo().run()} title="Pakartoti (⌘⇧Z)" disabled={!editor.can().redo()}>
          <I><path d="M13 8H6a4 4 0 0 0 0 8h3" /><path d="m10 5 3 3-3 3" /></I>
        </Btn>
        <Divider />

        <Btn active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()} title="Paryškintas (⌘B)">
          <strong>B</strong>
        </Btn>
        <Btn active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()} title="Kursyvas (⌘I)">
          <em>I</em>
        </Btn>
        <Btn active={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()} title="Pabrauktas (⌘U)">
          <span className="underline">U</span>
        </Btn>
        <Btn active={editor.isActive('strike')} onClick={() => editor.chain().focus().toggleStrike().run()} title="Perbrauktas">
          <span className="line-through">S</span>
        </Btn>
        <Divider />

        <Btn active={editor.isActive({ textAlign: 'left' })} onClick={() => editor.chain().focus().setTextAlign('left').run()} title="Lygiuoti į kairę">
          <I><path d="M2 4h12" /><path d="M2 8h8" /><path d="M2 12h12" /><path d="M2 16h8" /></I>
        </Btn>
        <Btn active={editor.isActive({ textAlign: 'center' })} onClick={() => editor.chain().focus().setTextAlign('center').run()} title="Centruoti">
          <I><path d="M2 4h12" /><path d="M4 8h8" /><path d="M2 12h12" /><path d="M4 16h8" /></I>
        </Btn>
        <Btn active={editor.isActive({ textAlign: 'right' })} onClick={() => editor.chain().focus().setTextAlign('right').run()} title="Lygiuoti į dešinę">
          <I><path d="M2 4h12" /><path d="M6 8h8" /><path d="M2 12h12" /><path d="M6 16h8" /></I>
        </Btn>
        <Btn active={editor.isActive({ textAlign: 'justify' })} onClick={() => editor.chain().focus().setTextAlign('justify').run()} title="Lygiuoti į abi puses">
          <I><path d="M2 4h12" /><path d="M2 8h12" /><path d="M2 12h12" /><path d="M2 16h12" /></I>
        </Btn>
        <Divider />

        <Btn active={editor.isActive('blockquote')} onClick={() => editor.chain().focus().toggleBlockquote().run()} title="Citata">
          <span className="text-base leading-none">&rdquo;</span>
        </Btn>
        <Btn active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()} title="Sąrašas (•)">
          <I><path d="M5 5h9" /><path d="M5 11h9" /><circle cx="2" cy="5" r="0.6" fill="currentColor" /><circle cx="2" cy="11" r="0.6" fill="currentColor" /></I>
        </Btn>
        <Btn active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()} title="Numeruotas sąrašas">
          <I><path d="M5 5h9" /><path d="M5 11h9" /><text x="0" y="6" fontSize="5" fill="currentColor" stroke="none">1.</text><text x="0" y="13" fontSize="5" fill="currentColor" stroke="none">2.</text></I>
        </Btn>
        <Btn onClick={() => editor.chain().focus().setHorizontalRule().run()} title="Horizontalus brūkšnys">
          <I><path d="M2 8h12" /></I>
        </Btn>
        <Divider />

        <Btn active={editor.isActive('link')} onClick={setLink} title="Nuoroda (rel=nofollow)">
          <I>
            <path d="M6.5 9.5a3.5 3.5 0 0 0 4.95 0l2-2a3.5 3.5 0 0 0-4.95-4.95l-1 1" />
            <path d="M9.5 6.5a3.5 3.5 0 0 0-4.95 0l-2 2a3.5 3.5 0 0 0 4.95 4.95l1-1" />
          </I>
        </Btn>
        <Btn onClick={() => fileInputRef.current?.click()} title={uploading ? 'Keliama…' : 'Įkelti nuotrauką'} disabled={uploading}>
          <I>
            <rect x="2" y="3" width="12" height="10" rx="1" />
            <circle cx="6" cy="6.5" r="1.2" />
            <path d="m2 11 3.5-3.5L9 11l2-2 3 3" />
          </I>
        </Btn>
        <Btn onClick={insertYouTube} title="Įdėti YouTube video">
          <I>
            <rect x="1" y="3" width="14" height="10" rx="2" />
            <path d="M7 6.5v3l3-1.5z" fill="currentColor" />
          </I>
        </Btn>

        <span className="ml-auto whitespace-nowrap text-[10px] text-[var(--text-faint)]">
          {onSubmit ? '⌘+Enter siųsti' : ''}
        </span>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) insertImage(f)
        }}
      />

      {/* Editor content area — paste'inant YT URL, auto-konvertuoja į iframe. */}
      <div className="px-3 py-2 text-[13.5px] leading-snug text-[var(--text-primary)]">
        <EditorContent editor={editor} />
      </div>

      {/* Global styles for Tiptap content */}
      <style jsx global>{`
        .comment-tiptap-content p {
          margin: 0 0 0.4em 0;
        }
        .comment-tiptap-content p:last-child {
          margin-bottom: 0;
        }
        .comment-tiptap-content blockquote {
          border-left: 3px solid var(--accent-orange);
          padding-left: 0.6em;
          color: var(--text-muted);
          font-style: italic;
          margin: 0.4em 0;
        }
        .comment-tiptap-content ul, .comment-tiptap-content ol {
          padding-left: 1.2em;
          margin: 0.3em 0;
        }
        .comment-tiptap-content ul { list-style: disc; }
        .comment-tiptap-content ol { list-style: decimal; }
        .comment-tiptap-content hr {
          border: 0;
          border-top: 1px solid var(--border-subtle);
          margin: 0.7em 0;
        }
        .comment-tiptap-content iframe {
          width: 100%;
          max-width: 480px;
          aspect-ratio: 16/9;
          border-radius: 6px;
          border: 0;
          margin: 0.5em 0;
        }
        .comment-tiptap-content img.comment-image,
        .comment-tiptap-content img {
          max-width: 100%;
          max-height: 360px;
          height: auto;
          border-radius: 6px;
          margin: 0.4em 0;
          display: inline-block;
        }
        .comment-tiptap-content p.is-editor-empty:first-child::before {
          content: attr(data-placeholder);
          float: left;
          color: var(--text-faint);
          pointer-events: none;
          height: 0;
        }
        .comment-tiptap-content a {
          color: #60a5fa;
          text-decoration: underline;
        }
      `}</style>
    </div>
  )
}
