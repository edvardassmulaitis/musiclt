'use client'

import { useEffect, useRef, useState } from 'react'

type Photo = { url: string; caption?: string }

export function EditorJsClient({ value, onChange, photos, onUploadedImage }: {
  value: string
  onChange: (v: string) => void
  photos: Photo[]
  onUploadedImage?: (url: string) => void
}) {
  const holderRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<any>(null)
  const initializedRef = useRef(false)
  const [ready, setReady] = useState(false)

  const parseInitialData = (val: string) => {
    if (!val) return undefined
    try {
      const parsed = JSON.parse(val)
      if (parsed.blocks) return parsed
    } catch {}
    if (val.trim()) {
      return { blocks: [{ type: 'paragraph', data: { text: val.replace(/<[^>]+>/g, '') } }] }
    }
    return undefined
  }

  useEffect(() => {
    if (initializedRef.current || !holderRef.current) return
    initializedRef.current = true

    const init = async () => {
      const EditorJS = (await import('@editorjs/editorjs')).default
      const Header = (await import('@editorjs/header')).default
      const List = (await import('@editorjs/list')).default
      const Quote = (await import('@editorjs/quote')).default
      const Delimiter = (await import('@editorjs/delimiter')).default

      const initialData = parseInitialData(value)

      const editor = new EditorJS({
        holder: holderRef.current!,
        data: initialData,
        placeholder: 'Rašykite tekstą... (+ norėdami pridėti bloką)',
        minHeight: 200,
        tools: {
          header: {
            class: Header as any,
            config: { levels: [2, 3, 4], defaultLevel: 2 },
          },
          list: {
            class: List as any,
            inlineToolbar: true,
          },
          quote: {
            class: Quote as any,
            inlineToolbar: true,
            config: { quotePlaceholder: 'Citata...', captionPlaceholder: 'Autorius' },
          },
          delimiter: { class: Delimiter as any },
        },
        onChange: async () => {
          try {
            const data = await editor.save()
            onChange(JSON.stringify(data))
          } catch {}
        },
        onReady: () => setReady(true),
        i18n: {
          messages: {
            ui: {
              blockTunes: { toggler: { 'Click to tune': 'Nustatymai', 'or drag to move': 'arba tempti' } },
              inlineToolbar: { converter: { 'Convert to': 'Konvertuoti į' } },
              toolbar: { toolbox: { Add: 'Pridėti' } },
            },
            toolNames: {
              Text: 'Tekstas', Heading: 'Antraštė', List: 'Sąrašas',
              Quote: 'Citata', Delimiter: 'Skyriklis',
              Bold: 'Paryškintas', Italic: 'Kursyvas', Link: 'Nuoroda',
            },
            tools: {
              list: { Ordered: 'Sunumeruotas', Unordered: 'Nenumeruotas' },
            },
            blockTunes: {
              delete: { Delete: 'Ištrinti', 'Click to delete': 'Spausti ištrinti' },
              moveUp: { 'Move up': 'Kelti aukštyn' },
              moveDown: { 'Move down': 'Leisti žemyn' },
            },
          },
        },
      })

      editorRef.current = editor
    }

    init().catch(console.error)

    return () => {
      if (editorRef.current?.destroy) {
        editorRef.current.destroy()
        editorRef.current = null
        initializedRef.current = false
      }
    }
  }, [])

  return (
    <div className="border border-gray-200 rounded-lg bg-white">
      {/* Gallery thumbnail bar – only for quick reference, no insert */}
      {photos.length > 0 && (
        <div className="flex items-center gap-2 px-3 py-1.5 border-b border-gray-100 bg-gray-50/60 rounded-t-lg">
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider shrink-0">Nuotraukos:</span>
          <div className="flex gap-1.5 overflow-x-auto">
            {photos.slice(0, 12).map((p, i) => (
              <div key={i} className="w-8 h-8 rounded-md overflow-hidden border border-gray-200 shrink-0">
                <img src={p.url} alt="" className="w-full h-full object-cover" />
              </div>
            ))}
          </div>
          <span className="text-[10px] text-gray-300 shrink-0 ml-auto">Valdyk dešinėje →</span>
        </div>
      )}
      {/* Editor – NO overflow-hidden here, toolbar must float freely */}
      <div className="relative" style={{ minHeight: 200 }}>
        {!ready && (
          <div className="absolute inset-0 flex items-center justify-center bg-white z-10 rounded-b-lg">
            <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
          </div>
        )}
        <div ref={holderRef} className="px-4 py-3" />
      </div>
    </div>
  )
}
