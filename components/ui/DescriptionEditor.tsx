'use client'

import { useRef, useEffect } from 'react'

type Props = {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  minHeight?: string
}

export default function DescriptionEditor({ value, onChange, placeholder = 'Aprašymas...', minHeight = '100px' }: Props) {
  const editorRef = useRef<HTMLDivElement>(null)
  const isUpdating = useRef(false)

  useEffect(() => {
    if (!editorRef.current || isUpdating.current) return
    if (editorRef.current.innerHTML !== value) {
      editorRef.current.innerHTML = value
    }
  }, [value])

  const exec = (cmd: string, val?: string) => {
    document.execCommand(cmd, false, val)
    editorRef.current?.focus()
    syncContent()
  }

  const syncContent = () => {
    isUpdating.current = true
    onChange(editorRef.current?.innerHTML || '')
    setTimeout(() => { isUpdating.current = false }, 0)
  }

  const tools = [
    { cmd: 'bold', icon: <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 4h8a4 4 0 014 4 4 4 0 01-4 4H6z M6 12h9a4 4 0 014 4 4 4 0 01-4 4H6z"/></svg>, title: 'Bold' },
    { cmd: 'italic', icon: <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><line x1="19" y1="4" x2="10" y2="4" strokeWidth={2} strokeLinecap="round"/><line x1="14" y1="20" x2="5" y2="20" strokeWidth={2} strokeLinecap="round"/><line x1="15" y1="4" x2="9" y2="20" strokeWidth={2} strokeLinecap="round"/></svg>, title: 'Italic' },
    { cmd: 'insertUnorderedList', icon: <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>, title: 'Sąrašas' },
    { cmd: 'insertOrderedList', icon: <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6h11M10 12h11M10 18h11M4 6h.01M4 12h.01M4 18h.01"/></svg>, title: 'Numeruotas sąrašas' },
    { cmd: 'removeFormat', icon: <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>, title: 'Išvalyti formatą' },
  ]

  return (
    <div className="border rounded-lg overflow-hidden transition-colors
      border-[var(--input-border)] focus-within:border-blue-400">
      <div className="flex items-center gap-0.5 px-1.5 py-1 border-b
        border-[var(--border-subtle)] bg-[var(--bg-elevated)]">
        {tools.map(t => (
          <button key={t.cmd} type="button" title={t.title}
            onMouseDown={e => { e.preventDefault(); exec(t.cmd) }}
            className="p-1.5 rounded transition-colors
              text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]">
            {t.icon}
          </button>
        ))}
        <div className="w-px h-4 mx-1 bg-[var(--border-subtle)]" />
        <button type="button" title="Nuoroda"
          onMouseDown={e => {
            e.preventDefault()
            const url = prompt('URL:')
            if (url) exec('createLink', url)
          }}
          className="p-1.5 rounded transition-colors
            text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"/></svg>
        </button>
        {value && (
          <button type="button" title="Išvalyti viską"
            onMouseDown={e => { e.preventDefault(); onChange(''); if (editorRef.current) editorRef.current.innerHTML = '' }}
            className="ml-auto p-1.5 rounded transition-colors text-[var(--text-faint)] hover:text-red-500 hover:bg-red-500/10">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
          </button>
        )}
      </div>
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onInput={syncContent}
        className="max-h-[300px] overflow-y-auto p-2.5 text-sm focus:outline-none prose prose-sm max-w-none
          text-[var(--text-secondary)]"
        style={{ lineHeight: '1.6', minHeight }}
        data-placeholder={placeholder}
      />
      {!value && (
        <style>{`[data-placeholder]:empty:before { content: attr(data-placeholder); color: var(--text-faint); pointer-events: none; }`}</style>
      )}
    </div>
  )
}
