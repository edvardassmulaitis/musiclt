'use client'
import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { RichEditor } from '@/components/RichEditor'

function EditorInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const editId = searchParams.get('id')

  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [summary, setSummary] = useState('')
  const [coverUrl, setCoverUrl] = useState('')
  const [status, setStatus] = useState<'draft' | 'published'>('draft')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [ready, setReady] = useState(false)

  useEffect(() => {
    fetch('/api/profile').then(r => r.json()).then(p => {
      if (!p?.username) {
        setError('Pirma nustatyk username savo profilyje')
        return
      }
      setReady(true)
    }).catch(() => setError('Prisijunk'))
  }, [])

  useEffect(() => {
    if (editId) {
      fetch(`/api/blog/posts/${editId}`).then(r => r.json()).then(p => {
        if (p?.title) {
          setTitle(p.title)
          setContent(p.content || '')
          setSummary(p.summary || '')
          setCoverUrl(p.cover_image_url || '')
          setStatus(p.status || 'draft')
        }
      })
    }
  }, [editId])

  async function handleSave(publishStatus: 'draft' | 'published') {
    if (!title.trim()) { setError('Įvesk pavadinimą'); return }
    setSaving(true); setError('')
    try {
      const body = { title, content, summary, cover_image_url: coverUrl || null, status: publishStatus }
      let res
      if (editId) {
        res = await fetch(`/api/blog/posts/${editId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      } else {
        res = await fetch('/api/blog/posts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      }
      if (res.ok) {
        router.push('/blogas/mano')
      } else {
        const data = await res.json()
        setError(data.error || 'Klaida')
      }
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  if (!ready && !error) {
    return <div className="min-h-[50vh] flex items-center justify-center text-sm" style={{ color: '#334058' }}>Kraunasi...</div>
  }

  if (error && !ready) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <div className="text-center">
          <p className="text-sm text-red-400 mb-4">{error}</p>
          <Link href="/" className="text-xs text-[#4a6fa5] hover:text-white transition">← Grįžti</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-8">
        <Link href="/blogas/mano" className="text-xs hover:text-white transition" style={{ color: '#5e7290' }}>← Mano straipsniai</Link>
        <div className="flex gap-2">
          <button onClick={() => handleSave('draft')} disabled={saving}
            className="px-4 py-1.5 rounded-full text-xs font-bold transition disabled:opacity-40"
            style={{ color: '#b0bdd4', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
            {saving ? '...' : 'Išsaugoti juodraštį'}
          </button>
          <button onClick={() => handleSave('published')} disabled={saving}
            className="px-4 py-1.5 rounded-full text-xs font-bold text-white bg-[#f97316] hover:bg-[#ea580c] transition disabled:opacity-40">
            {saving ? '...' : 'Publikuoti'}
          </button>
        </div>
      </div>

      {error && ready && <div className="text-xs text-red-400 mb-4 p-2 bg-red-900/20 rounded">{error}</div>}

      <input
        value={title}
        onChange={e => setTitle(e.target.value)}
        placeholder="Straipsnio pavadinimas"
        className="w-full text-3xl font-black bg-transparent border-none outline-none mb-4"
        style={{ fontFamily: "'Outfit', sans-serif", letterSpacing: '-.03em', color: '#f2f4f8' }}
      />

      <input
        value={summary}
        onChange={e => setSummary(e.target.value)}
        placeholder="Trumpa santrauka (rodoma sąraše)"
        className="w-full text-sm bg-transparent border-none outline-none mb-4"
        style={{ color: '#5e7290' }}
      />

      <input
        value={coverUrl}
        onChange={e => setCoverUrl(e.target.value)}
        placeholder="Cover nuotraukos URL (neprivaloma)"
        className="w-full text-xs rounded-lg px-3 py-2 outline-none mb-6 focus:border-[#f97316]/30"
        style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', color: '#5e7290' }}
      />

      <RichEditor
        value={content}
        onChange={setContent}
        placeholder="Pradėk rašyti savo straipsnį... Naudok toolbar'ą formatavimui ir 🎵 Embed mygtuką muzikos įterpimui."
      />

      <p className="text-[10px] mt-3" style={{ color: '#334058' }}>
        💡 Naudok toolbar&apos;ą teksto formatavimui. Spausk &quot;🎵 Embed&quot; norėdamas įterpti YouTube ar Spotify grotuvo.
      </p>
    </div>
  )
}

export default function BlogEditorPage() {
  return (
    <Suspense fallback={<div className="min-h-[50vh] flex items-center justify-center text-sm" style={{ color: '#334058' }}>Kraunasi...</div>}>
      <EditorInner />
    </Suspense>
  )
}
