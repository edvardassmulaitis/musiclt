'use client'

import { useRef, useEffect, useState } from 'react'

type Props = {
  value: string
  onChange: (html: string) => void
  placeholder?: string
}

const TOOLS = [
  { cmd: 'bold',                icon: 'B',  title: 'Pusjuodis',  cls: 'font-bold' },
  { cmd: 'italic',              icon: 'I',  title: 'Kursyvas',   cls: 'italic' },
  { cmd: 'underline',           icon: 'U',  title: 'Pabrauktas', cls: 'underline' },
  { cmd: 'insertUnorderedList', icon: '≡',  title: 'Sąrašas',    cls: '' },
]

export default function RichTextEditor({ value, onChange, placeholder = 'Aprašymas...' }: Props) {
  const editorRef = useRef<HTMLDivElement>(null)
  const [linkMode, setLinkMode] = useState(false)
  const [linkUrl, setLinkUrl] = useState('')
  const savedSel = useRef<Range | null>(null)
  const isInternal = useRef(false)

  // Sync external value changes (e.g. from Wikipedia import)
  useEffect(() => {
    const el = editorRef.current
    if (!el || isInternal.current) return
    // Only update DOM if content actually differs
    if (el.innerHTML !== (value || '')) {
      el.innerHTML = value || ''
    }
  }, [value])

  const exec = (cmd: string, val?: string) => {
    editorRef.current?.focus()
    document.execCommand(cmd, false, val)
    isInternal.current = true
    onChange(editorRef.current?.innerHTML || '')
    setTimeout(() => { isInternal.current = false }, 0)
  }

  const handleInput = () => {
    isInternal.current = true
    onChange(editorRef.current?.innerHTML || '')
    setTimeout(() => { isInternal.current = false }, 0)
  }

  const saveSelection = () => {
    const sel = window.getSelection()
    if (sel && sel.rangeCount > 0) savedSel.current = sel.getRangeAt(0).cloneRange()
  }

  const insertLink = () => {
    if (!linkUrl) return
    editorRef.current?.focus()
    if (savedSel.current) {
      const sel = window.getSelection()
      sel?.removeAllRanges()
      sel?.addRange(savedSel.current)
    }
    exec('createLink', linkUrl.startsWith('http') ? linkUrl : `https://${linkUrl}`)
    setLinkMode(false)
    setLinkUrl('')
  }

  return (
    <div className="border border-gray-300 rounded-lg overflow-hidden focus-within:border-music-blue transition-colors">
      {/* Toolbar */}
      <div className="flex items-center gap-0.5 p-2 bg-gray-50 border-b border-gray-200">
        {TOOLS.map(t => (
          <button key={t.cmd} type="button"
            onMouseDown={e => { e.preventDefault(); exec(t.cmd) }}
            title={t.title}
            className={`w-8 h-8 flex items-center justify-center rounded text-sm hover:bg-gray-200 text-gray-700 ${t.cls}`}>
            {t.icon}
          </button>
        ))}
        <div className="w-px h-5 bg-gray-300 mx-1" />
        <button type="button"
          onMouseDown={e => { e.preventDefault(); saveSelection(); setLinkMode(m => !m) }}
          title="Nuoroda"
          className={`w-8 h-8 flex items-center justify-center rounded text-sm hover:bg-gray-200 ${linkMode ? 'bg-blue-100 text-music-blue' : 'text-gray-700'}`}>
          🔗
        </button>
        <button type="button"
          onMouseDown={e => { e.preventDefault(); exec('unlink') }}
          title="Pašalinti nuorodą"
          className="w-8 h-8 flex items-center justify-center rounded text-sm text-gray-700 hover:bg-gray-200">
          ✂️
        </button>
        <div className="w-px h-5 bg-gray-300 mx-1" />
        <button type="button"
          onMouseDown={e => { e.preventDefault(); exec('removeFormat') }}
          title="Išvalyti formatavimą"
          className="px-2 h-8 flex items-center justify-center rounded text-xs text-gray-500 hover:bg-gray-200">
          Tx
        </button>
      </div>

      {/* Link input */}
      {linkMode && (
        <div className="flex gap-2 px-3 py-2 bg-blue-50 border-b border-blue-200">
          <input type="url" value={linkUrl} onChange={e => setLinkUrl(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && insertLink()}
            className="flex-1 px-3 py-1.5 border border-blue-300 rounded-lg text-sm text-gray-900 focus:outline-none bg-white"
            placeholder="https://..." autoFocus />
          <button type="button" onClick={insertLink}
            className="px-3 py-1.5 bg-music-blue text-white rounded-lg text-sm font-medium">Pridėti</button>
          <button type="button" onClick={() => setLinkMode(false)}
            className="px-3 py-1.5 bg-white border border-gray-300 text-gray-600 rounded-lg text-sm">✕</button>
        </div>
      )}

      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onInput={handleInput}
        className="min-h-36 p-4 text-gray-900 text-sm leading-relaxed focus:outline-none [&_a]:text-music-blue [&_a]:underline [&_ul]:list-disc [&_ul]:ml-4"
        data-placeholder={placeholder}
        style={{ wordBreak: 'break-word' }}
      />
      <style>{`[contenteditable]:empty:before{content:attr(data-placeholder);color:#9ca3af;pointer-events:none}`}</style>
    </div>
  )
}
