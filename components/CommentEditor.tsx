'use client'
// components/CommentEditor.tsx
//
// Compact rich-text editor for comments — used inside EntityCommentsBlock
// inline composer and reply modal. Wraps Tiptap with a small toolbar
// (Bold / Italic / Underline / Link / Quote / List) plus auto-paste for
// YouTube + music.lt URLs. Output is HTML; client display side renders it
// via dangerouslySetInnerHTML for HTML bodies (legacy plain text still goes
// through splitBodyWithYouTube).
//
// Tema: dark, kad atitiktų komentarų sekciją (skirtingai nuo blog editor'iaus,
// kuris šviesus). Toolbar mažas, telpa po composer'iu.

import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import Link from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
import { Iframe } from '@/lib/tiptap-iframe'
import { useEffect, useRef } from 'react'

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
  active, onClick, title, children,
}: {
  active?: boolean; onClick: () => void; title: string; children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => { e.preventDefault(); onClick() }}
      title={title}
      className={[
        'flex h-6 w-6 items-center justify-center rounded text-xs transition-colors',
        active
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

export default function CommentEditor({
  value, onChange, placeholder = 'Tavo komentaras',
  onSubmit, autoFocus = false, minHeight = 80,
}: Props) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: false,                  // no headings in comments
        horizontalRule: false,
        codeBlock: false,
        bulletList: { keepMarks: true },
        orderedList: { keepMarks: true },
      }),
      Underline,
      Link.configure({
        openOnClick: false,
        autolink: true,
        HTMLAttributes: { class: 'text-blue-400 underline hover:text-blue-300', target: '_blank', rel: 'noopener noreferrer' },
      }),
      Placeholder.configure({ placeholder }),
      // Iframe — YT/Spotify auto-paste rules. Composer'yje matysi embed
      // tiesiogiai paste'inant URL'ą.
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

  // Sync external value changes (e.g. when draft resets after submit)
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
    const url = window.prompt('URL:', prev ?? 'https://')
    if (url === null) return
    if (url === '') { editor.chain().focus().unsetLink().run(); return }
    editor.chain().focus().setLink({ href: url }).run()
  }

  return (
    <div
      className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)] focus-within:border-[var(--accent-orange)]"
    >
      {/* Toolbar */}
      <div className="flex items-center gap-0.5 border-b border-[var(--border-subtle)] px-2 py-1">
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
        <Btn active={editor.isActive('blockquote')} onClick={() => editor.chain().focus().toggleBlockquote().run()} title="Citata">
          <span>"</span>
        </Btn>
        <Btn active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()} title="Sąrašas">
          <span>•</span>
        </Btn>
        <Btn active={editor.isActive('link')} onClick={setLink} title="Nuoroda">
          <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.6">
            <path d="M6.5 9.5a3.5 3.5 0 0 0 4.95 0l2-2a3.5 3.5 0 0 0-4.95-4.95l-1 1" />
            <path d="M9.5 6.5a3.5 3.5 0 0 0-4.95 0l-2 2a3.5 3.5 0 0 0 4.95 4.95l1-1" />
          </svg>
        </Btn>
        <span className="ml-auto text-[10px] text-[var(--text-faint)]">
          {onSubmit ? '⌘+Enter siųsti' : ''}
        </span>
      </div>

      {/* Editor content area — paste'inant YT URL, auto-konvertuoja į iframe.
          Galima rašyti tiek plain tekstą, tiek formatuoti su toolbar. */}
      <div className="px-3 py-2 text-[13.5px] leading-snug text-[var(--text-primary)]">
        <EditorContent editor={editor} />
      </div>

      {/* Local styles — Tiptap default white background overrides */}
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
        .comment-tiptap-content ul {
          list-style: disc;
        }
        .comment-tiptap-content ol {
          list-style: decimal;
        }
        .comment-tiptap-content iframe {
          width: 100%;
          max-width: 480px;
          aspect-ratio: 16/9;
          border-radius: 6px;
          border: 0;
          margin: 0.5em 0;
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
