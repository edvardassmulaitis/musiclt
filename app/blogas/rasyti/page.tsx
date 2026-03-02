// app/blogas/rasyti/page.tsx (also used for editing: /blogas/redaguoti/[id])
'use client'
import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'

export default function BlogEditorPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const editId = searchParams.get('id') // ?id=xxx for editing

  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [summary, setSummary] = useState('')
  const [coverUrl, setCoverUrl] = useState('')
  const [status, setStatus] = useState<'draft' | 'published'>('draft')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [hasBlog, setHasBlog] = useState<boolean | null>(null)

  // Check if user has a blog
  useEffect(() => {
    fetch('/api/profile').then(r => r.json()).then(p => {
      if (!p?.username) {
        setError('Pirma nustatyk username savo profilyje')
        setHasBlog(false)
        return
      }
      fetch('/api/blog').then(r => {
        if (r.status === 404) setHasBlog(false)
        else setHasBlog(true)
      }).catch(() => setHasBlog(false))
    }).catch(() => setError('Prisijunk'))
  }, [])

  // Load existing post if editing
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

  if (hasBlog === false) {
    return (
      <div className="min-h-screen bg-[#080c12] text-[#f0f2f5] flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-bold mb-2" style={{ fontFamily: "'Outfit', sans-serif" }}>Pirma sukurk blogą</h2>
          <p className="text-sm text-[#5e7290] mb-4">Eik į blogo nustatymus ir sukurk savo muzikos blogą</p>
          <Link href="/blogas/nustatymai" className="px-4 py-2 bg-[#f97316] text-white rounded-full text-sm font-bold hover:bg-[#ea580c] transition">
            Sukurti blogą
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#080c12] text-[#f0f2f5]">
      <div className="max-w-3xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <Link href="/blogas/mano" className="text-xs text-[#5e7290] hover:text-white transition">← Atgal</Link>
          <div className="flex gap-2">
            <button onClick={() => handleSave('draft')} disabled={saving} className="px-4 py-1.5 rounded-full text-xs font-bold text-[#b0bdd4] bg-white/[.04] border border-white/[.06] hover:bg-white/[.06] transition disabled:opacity-40" style={{ fontFamily: "'Outfit', sans-serif" }}>
              {saving ? '...' : 'Išsaugoti juodraštį'}
            </button>
            <button onClick={() => handleSave('published')} disabled={saving} className="px-4 py-1.5 rounded-full text-xs font-bold text-white bg-[#f97316] hover:bg-[#ea580c] transition disabled:opacity-40" style={{ fontFamily: "'Outfit', sans-serif" }}>
              {saving ? '...' : 'Publikuoti'}
            </button>
          </div>
        </div>

        {error && <div className="text-xs text-red-400 mb-4 p-2 bg-red-900/20 rounded">{error}</div>}

        {/* Title */}
        <input
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="Straipsnio pavadinimas"
          className="w-full text-3xl font-black bg-transparent border-none outline-none placeholder:text-[#1e293b] mb-4"
          style={{ fontFamily: "'Outfit', sans-serif", letterSpacing: '-.03em' }}
        />

        {/* Summary */}
        <input
          value={summary}
          onChange={e => setSummary(e.target.value)}
          placeholder="Trumpa santrauka (rodoma sąraše)"
          className="w-full text-sm bg-transparent border-none outline-none placeholder:text-[#1e293b] text-[#5e7290] mb-4"
        />

        {/* Cover URL */}
        <input
          value={coverUrl}
          onChange={e => setCoverUrl(e.target.value)}
          placeholder="Cover nuotraukos URL (neprivaloma)"
          className="w-full text-xs bg-white/[.03] border border-white/[.06] rounded-lg px-3 py-2 outline-none placeholder:text-[#1e293b] text-[#5e7290] mb-6 focus:border-[#f97316]/30"
        />

        {/* Content editor (basic textarea — Tiptap integration later) */}
        <textarea
          value={content}
          onChange={e => setContent(e.target.value)}
          placeholder="Rašyk straipsnį... (HTML palaikomas)"
          rows={20}
          className="w-full bg-white/[.02] border border-white/[.04] rounded-xl px-4 py-3 text-[15px] text-[#b0bdd4] leading-relaxed placeholder:text-[#1e293b] focus:outline-none focus:border-white/[.08] resize-y"
        />

        <p className="text-[10px] text-[#334058] mt-2">
          💡 Ateityje čia bus pilnas Tiptap redaktorius su muzikos embed'ais. Kol kas gali rašyti HTML.
        </p>
      </div>
    </div>
  )
}
