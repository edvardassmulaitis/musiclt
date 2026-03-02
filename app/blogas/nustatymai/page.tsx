// app/blogas/nustatymai/page.tsx
'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function BlogSettingsPage() {
  const router = useRouter()
  const [mode, setMode] = useState<'loading' | 'create' | 'edit'>('loading')
  const [slug, setSlug] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [coverUrl, setCoverUrl] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [profile, setProfile] = useState<any>(null)

  useEffect(() => {
    // Check profile + blog
    fetch('/api/profile').then(r => r.json()).then(p => {
      setProfile(p)
      if (!p?.username) {
        setError('Pirma nustatyk username')
        setMode('create')
        return
      }
      // Check if blog exists
      // We'll try to get user's blog via a separate endpoint
      fetch('/api/blog/my').then(r => {
        if (r.ok) return r.json()
        return null
      }).then(blog => {
        if (blog) {
          setSlug(blog.slug)
          setTitle(blog.title)
          setDescription(blog.description || '')
          setCoverUrl(blog.cover_image_url || '')
          setMode('edit')
        } else {
          setSlug(p.username || '')
          setMode('create')
        }
      })
    }).catch(() => setError('Prisijunk'))
  }, [])

  async function handleSave() {
    if (!title.trim()) { setError('Įvesk blogo pavadinimą'); return }
    if (!slug.trim()) { setError('Įvesk URL slug'); return }
    setSaving(true); setError(''); setSuccess('')

    try {
      if (mode === 'create') {
        const res = await fetch('/api/blog', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ slug, title, description }),
        })
        if (res.ok) {
          setSuccess('Blogas sukurtas!')
          setMode('edit')
        } else {
          const data = await res.json()
          setError(data.error || 'Klaida')
        }
      } else {
        // Update existing
        const res = await fetch('/api/blog/my', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title, description, cover_image_url: coverUrl || null }),
        })
        if (res.ok) {
          setSuccess('Nustatymai išsaugoti!')
        } else {
          const data = await res.json()
          setError(data.error || 'Klaida')
        }
      }
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  // Also handle username setup
  const [username, setUsername] = useState('')
  const [savingProfile, setSavingProfile] = useState(false)

  async function handleSetUsername() {
    if (!username.trim()) return
    setSavingProfile(true)
    try {
      const res = await fetch('/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username }),
      })
      if (res.ok) {
        setProfile((p: any) => ({ ...p, username }))
        setSlug(username)
        setError('')
      } else {
        const data = await res.json()
        setError(data.error || 'Klaida')
      }
    } finally {
      setSavingProfile(false)
    }
  }

  if (mode === 'loading') return <div className="min-h-screen bg-[#080c12] flex items-center justify-center text-[#334058] text-sm">Kraunasi...</div>

  return (
    <div className="min-h-screen bg-[#080c12] text-[#f0f2f5]">
      <div className="max-w-xl mx-auto px-6 py-8">
        <Link href="/blogas/mano" className="text-xs text-[#5e7290] hover:text-white transition">← Atgal</Link>
        <h1 className="text-xl font-black mt-4 mb-6" style={{ fontFamily: "'Outfit', sans-serif" }}>
          {mode === 'create' ? 'Sukurti blogą' : 'Blogo nustatymai'}
        </h1>

        {/* Username setup if missing */}
        {!profile?.username && (
          <div className="p-4 rounded-xl border border-yellow-900/30 bg-yellow-900/10 mb-6">
            <p className="text-sm text-yellow-400 font-semibold mb-2">Pirma reikia username</p>
            <p className="text-xs text-[#5e7290] mb-3">Username bus naudojamas tavo profilio ir blogo URL adrese</p>
            <div className="flex gap-2">
              <input value={username} onChange={e => setUsername(e.target.value)} placeholder="pvz. jonas" className="flex-1 px-3 py-1.5 rounded-lg bg-white/[.03] border border-white/[.06] text-sm outline-none focus:border-[#f97316]/30" />
              <button onClick={handleSetUsername} disabled={savingProfile} className="px-3 py-1.5 rounded-lg text-xs font-bold bg-[#f97316] text-white hover:bg-[#ea580c] disabled:opacity-40">
                {savingProfile ? '...' : 'Nustatyti'}
              </button>
            </div>
          </div>
        )}

        {error && <div className="text-xs text-red-400 mb-4 p-2 bg-red-900/20 rounded">{error}</div>}
        {success && <div className="text-xs text-green-400 mb-4 p-2 bg-green-900/20 rounded">{success}</div>}

        <div className="space-y-4">
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-[#334058] mb-1 block" style={{ fontFamily: "'Outfit', sans-serif" }}>Blogo pavadinimas</label>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Jono muzikos kampas" className="w-full px-3 py-2 rounded-lg bg-white/[.03] border border-white/[.06] text-sm outline-none focus:border-[#f97316]/30" />
          </div>

          {mode === 'create' && (
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-[#334058] mb-1 block" style={{ fontFamily: "'Outfit', sans-serif" }}>URL slug</label>
              <div className="flex items-center gap-0 rounded-lg overflow-hidden border border-white/[.06]">
                <span className="px-3 py-2 bg-white/[.03] text-xs text-[#334058] border-r border-white/[.06]">music.lt/blogas/</span>
                <input value={slug} onChange={e => setSlug(e.target.value)} className="flex-1 px-3 py-2 bg-white/[.02] text-sm outline-none" />
              </div>
            </div>
          )}

          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-[#334058] mb-1 block" style={{ fontFamily: "'Outfit', sans-serif" }}>Aprašymas</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} placeholder="Apie ką rašysi..." className="w-full px-3 py-2 rounded-lg bg-white/[.03] border border-white/[.06] text-sm outline-none focus:border-[#f97316]/30 resize-none" />
          </div>

          {mode === 'edit' && (
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-[#334058] mb-1 block" style={{ fontFamily: "'Outfit', sans-serif" }}>Cover nuotrauka (URL)</label>
              <input value={coverUrl} onChange={e => setCoverUrl(e.target.value)} placeholder="https://..." className="w-full px-3 py-2 rounded-lg bg-white/[.03] border border-white/[.06] text-sm outline-none focus:border-[#f97316]/30" />
            </div>
          )}

          <button onClick={handleSave} disabled={saving} className="w-full py-2.5 rounded-xl text-sm font-bold bg-[#f97316] text-white hover:bg-[#ea580c] disabled:opacity-40 transition" style={{ fontFamily: "'Outfit', sans-serif" }}>
            {saving ? 'Saugoma...' : mode === 'create' ? 'Sukurti blogą' : 'Išsaugoti'}
          </button>
        </div>

        {mode === 'edit' && (
          <div className="mt-6 pt-4 border-t border-white/[.04]">
            <p className="text-[10px] text-[#334058]">Tavo blogo adresas: <a href={`/blogas/${slug}`} className="text-[#f97316]">music.lt/blogas/{slug}</a></p>
          </div>
        )}
      </div>
    </div>
  )
}
