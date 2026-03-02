// app/blogas/mano/page.tsx
'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'

type Post = {
  id: string; slug: string; title: string; summary?: string; status: string
  published_at?: string; view_count: number; like_count: number; comment_count: number
  created_at: string; updated_at: string
}

export default function MyPostsPage() {
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'all' | 'published' | 'draft'>('all')

  useEffect(() => {
    fetch('/api/blog/posts').then(r => r.json()).then(d => {
      setPosts(Array.isArray(d) ? d : [])
    }).finally(() => setLoading(false))
  }, [])

  const filtered = tab === 'all' ? posts : posts.filter(p => p.status === tab)

  async function handleDelete(id: string) {
    if (!confirm('Tikrai ištrinti šį straipsnį?')) return
    const res = await fetch(`/api/blog/posts/${id}`, { method: 'DELETE' })
    if (res.ok) setPosts(posts.filter(p => p.id !== id))
  }

  return (
    <div className="min-h-screen bg-[#080c12] text-[#f0f2f5]">
      <div className="max-w-3xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-black" style={{ fontFamily: "'Outfit', sans-serif" }}>Mano straipsniai</h1>
          <Link href="/blogas/rasyti" className="px-4 py-1.5 rounded-full text-xs font-bold text-white bg-[#f97316] hover:bg-[#ea580c] transition" style={{ fontFamily: "'Outfit', sans-serif" }}>
            + Naujas straipsnis
          </Link>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6">
          {(['all', 'published', 'draft'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} className={`px-3 py-1 rounded-full text-xs font-bold transition ${tab === t ? 'bg-[#f97316] text-white' : 'text-[#5e7290] bg-white/[.04] hover:bg-white/[.06]'}`} style={{ fontFamily: "'Outfit', sans-serif" }}>
              {t === 'all' ? `Visi (${posts.length})` : t === 'published' ? `Publikuoti (${posts.filter(p => p.status === 'published').length})` : `Juodraščiai (${posts.filter(p => p.status === 'draft').length})`}
            </button>
          ))}
        </div>

        {loading ? (
          <p className="text-sm text-[#334058] text-center py-8">Kraunasi...</p>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-sm text-[#334058] mb-4">Nėra straipsnių</p>
            <Link href="/blogas/rasyti" className="text-xs text-[#f97316] font-bold hover:underline">Parašyk pirmąjį →</Link>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map(p => (
              <div key={p.id} className="flex items-center gap-4 p-3 rounded-lg border border-white/[.04] bg-white/[.02] hover:border-white/[.06] transition">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`text-[8px] font-bold uppercase px-1.5 py-0.5 rounded ${p.status === 'published' ? 'bg-green-900/30 text-green-400' : 'bg-yellow-900/30 text-yellow-400'}`}>{p.status === 'published' ? 'Publikuotas' : 'Juodraštis'}</span>
                    <h3 className="text-sm font-bold truncate">{p.title}</h3>
                  </div>
                  <div className="text-[10px] text-[#334058] mt-1 flex gap-3">
                    <span>{new Date(p.updated_at).toLocaleDateString('lt-LT')}</span>
                    {p.status === 'published' && <><span>👁 {p.view_count}</span><span>♥ {p.like_count}</span><span>💬 {p.comment_count}</span></>}
                  </div>
                </div>
                <Link href={`/blogas/rasyti?id=${p.id}`} className="text-xs text-[#5e7290] hover:text-white transition px-2 py-1">✏️</Link>
                <button onClick={() => handleDelete(p.id)} className="text-xs text-[#5e7290] hover:text-red-400 transition px-2 py-1">🗑</button>
              </div>
            ))}
          </div>
        )}

        {/* Quick links */}
        <div className="mt-8 flex gap-3 text-xs">
          <Link href="/blogas/nustatymai" className="text-[#5e7290] hover:text-white transition">⚙️ Blogo nustatymai</Link>
        </div>
      </div>
    </div>
  )
}
