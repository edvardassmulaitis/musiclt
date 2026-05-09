'use client'
import { useEffect } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import Link from '@tiptap/extension-link'
import TextAlign from '@tiptap/extension-text-align'
import Placeholder from '@tiptap/extension-placeholder'
import CharacterCount from '@tiptap/extension-character-count'

// ── Types ────────────────────────────────────────────────────────────────────
interface RichTextEditorProps {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  maxLength?: number
}

// ── Toolbar button ────────────────────────────────────────────────────────────
function Btn({
  active, disabled, onClick, title, children,
}: {
  active?: boolean; disabled?: boolean; onClick: () => void; title: string; children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onMouseDown={e => { e.preventDefault(); onClick() }}
      disabled={disabled}
      title={title}
      className={`w-7 h-7 flex items-center justify-center rounded text-sm transition-colors
        ${active
          ? 'bg-blue-100 text-blue-700'
          : 'text-gray-500 hover:bg-gray-100 hover:text-gray-800'}
        ${disabled ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      {children}
    </button>
  )
}

function Divider() {
  return <div className="w-px h-5 bg-gray-200 mx-0.5" />
}

// ── Main component ────────────────────────────────────────────────────────────
export default function RichTextEditor({ value, onChange, placeholder, maxLength, showToolbar = true }: RichTextEditorProps & { showToolbar?: boolean }) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        bulletList: { keepMarks: true },
        orderedList: { keepMarks: true },
      }),
      Underline,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { class: 'text-blue-600 underline hover:text-blue-800 cursor-pointer' },
      }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Placeholder.configure({ placeholder: placeholder || 'Rašykite aprašymą...' }),
      ...(maxLength ? [CharacterCount.configure({ limit: maxLength })] : []),
    ],
    content: value || '',
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
    editorProps: {
      attributes: {
        class: 'prose prose-sm max-w-none min-h-[200px] px-4 py-3 focus:outline-none text-gray-800',
      },
    },
  })

  // Sync external value changes (e.g. when draft resets)
  useEffect(() => {
    if (!editor) return
    const current = editor.getHTML()
    if (value !== current) {
      editor.commands.setContent(value || '', false)
    }
  }, [value]) // eslint-disable-line

  if (!editor) return null

  const setLink = () => {
    const prev = editor.getAttributes('link').href as string | undefined
    const url = window.prompt('URL:', prev ?? 'https://')
    if (url === null) return
    if (url === '') { editor.chain().focus().unsetLink().run(); return }
    editor.chain().focus().setLink({ href: url }).run()
  }

  const chars = editor.storage.characterCount?.characters?.() ?? 0

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden bg-white flex flex-col">
      {/* ── Toolbar ── */}
      {showToolbar && <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-gray-100 bg-gray-50 flex-wrap">

        {/* Headings */}
        <Btn active={editor.isActive('heading', { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} title="Antraštė H2">
          <span className="font-bold text-xs">H2</span>
        </Btn>
        <Btn active={editor.isActive('heading', { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} title="Antraštė H3">
          <span className="font-bold text-xs">H3</span>
        </Btn>

        <Divider />

        {/* Inline formatting */}
        <Btn active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()} title="Paryškintas (Ctrl+B)">
          <strong className="text-xs">B</strong>
        </Btn>
        <Btn active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()} title="Kursyvas (Ctrl+I)">
          <em className="text-xs">I</em>
        </Btn>
        <Btn active={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()} title="Pabrauktas (Ctrl+U)">
          <span className="text-xs underline">U</span>
        </Btn>
        <Btn active={editor.isActive('strike')} onClick={() => editor.chain().focus().toggleStrike().run()} title="Perbrauktas">
          <span className="text-xs line-through">S</span>
        </Btn>

        <Divider />

        {/* Lists */}
        <Btn active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()} title="Sąrašas">
          <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="currentColor">
            <circle cx="2" cy="4" r="1.5"/><rect x="5" y="3" width="9" height="2" rx="1"/>
            <circle cx="2" cy="8" r="1.5"/><rect x="5" y="7" width="9" height="2" rx="1"/>
            <circle cx="2" cy="12" r="1.5"/><rect x="5" y="11" width="9" height="2" rx="1"/>
          </svg>
        </Btn>
        <Btn active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()} title="Numeruotas sąrašas">
          <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="currentColor">
            <text x="0" y="5" fontSize="5" fontWeight="bold">1.</text>
            <rect x="5" y="3" width="9" height="2" rx="1"/>
            <text x="0" y="9" fontSize="5" fontWeight="bold">2.</text>
            <rect x="5" y="7" width="9" height="2" rx="1"/>
            <text x="0" y="13" fontSize="5" fontWeight="bold">3.</text>
            <rect x="5" y="11" width="9" height="2" rx="1"/>
          </svg>
        </Btn>
        <Btn active={editor.isActive('blockquote')} onClick={() => editor.chain().focus().toggleBlockquote().run()} title="Citata">
          <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="currentColor">
            <path d="M3 4h2v4H3zm0 0c0 2.5 1 4 3 5M9 4h2v4H9zm0 0c0 2.5 1 4 3 5"/>
          </svg>
        </Btn>

        <Divider />

        {/* Alignment */}
        <Btn active={editor.isActive({ textAlign: 'left' })} onClick={() => editor.chain().focus().setTextAlign('left').run()} title="Kairė">
          <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="currentColor">
            <rect x="1" y="2" width="14" height="2" rx="1"/><rect x="1" y="6" width="9" height="2" rx="1"/>
            <rect x="1" y="10" width="14" height="2" rx="1"/><rect x="1" y="14" width="9" height="2" rx="1"/>
          </svg>
        </Btn>
        <Btn active={editor.isActive({ textAlign: 'center' })} onClick={() => editor.chain().focus().setTextAlign('center').run()} title="Centre">
          <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="currentColor">
            <rect x="1" y="2" width="14" height="2" rx="1"/><rect x="3.5" y="6" width="9" height="2" rx="1"/>
            <rect x="1" y="10" width="14" height="2" rx="1"/><rect x="3.5" y="14" width="9" height="2" rx="1"/>
          </svg>
        </Btn>

        <Divider />

        {/* Link */}
        <Btn active={editor.isActive('link')} onClick={setLink} title="Nuoroda">
          <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M6.5 9.5a3.5 3.5 0 0 0 4.95 0l2-2a3.5 3.5 0 0 0-4.95-4.95l-1 1"/>
            <path d="M9.5 6.5a3.5 3.5 0 0 0-4.95 0l-2 2a3.5 3.5 0 0 0 4.95 4.95l1-1"/>
          </svg>
        </Btn>
        {editor.isActive('link') && (
          <Btn active={false} onClick={() => editor.chain().focus().unsetLink().run()} title="Pašalinti nuorodą">
            <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M6.5 9.5a3.5 3.5 0 0 0 4.95 0l2-2a3.5 3.5 0 0 0-4.95-4.95l-1 1"/>
              <path d="M9.5 6.5a3.5 3.5 0 0 0-4.95 0l-2 2a3.5 3.5 0 0 0 4.95 4.95l1-1"/>
              <line x1="2" y1="2" x2="14" y2="14"/>
            </svg>
          </Btn>
        )}

        <Divider />

        {/* Undo/Redo */}
        <Btn active={false} disabled={!editor.can().undo()} onClick={() => editor.chain().focus().undo().run()} title="Atšaukti (Ctrl+Z)">
          <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M3 7H10a4 4 0 0 1 0 8H7"/><path d="M3 7L6 4M3 7L6 10"/>
          </svg>
        </Btn>
        <Btn active={false} disabled={!editor.can().redo()} onClick={() => editor.chain().focus().redo().run()} title="Pakartoti (Ctrl+Y)">
          <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M13 7H6a4 4 0 0 0 0 8H9"/><path d="M13 7L10 4M13 7L10 10"/>
          </svg>
        </Btn>

        {/* Spacer + char count */}
        <div className="flex-1" />
        {maxLength && <span className={`text-xs tabular-nums ${chars > maxLength * 0.9 ? 'text-orange-500' : 'text-gray-300'}`}>{chars}/{maxLength}</span>}
      </div>}

      {/* ── Editor area ── */}
      <EditorContent editor={editor} className="flex-1" />
    </div>
  )
}
