'use client'
// app/admin/genres/page.tsx
//
// Žanrų valdymas — kiekvienam main žanrui galima sukelti / paste'inti
// stoko vizualą (gitara prie roko, mikrofonas prie hip-hop, etc.).
// Naudojamas nav Stiliai sekcijoje + zanro page'e.

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { GENRE_COLORS } from '@/lib/genre-colors'
import ImageInput from '@/components/ImageInput'

type Genre = {
  id: number
  name: string
  cover_image_url: string | null
}

export default function AdminGenresPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [genres, setGenres] = useState<Genre[]>([])
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<number | null>(null)
  const [editingUrls, setEditingUrls] = useState<Record<number, string>>({})

  const isAdmin = session?.user?.role === 'admin' || session?.user?.role === 'super_admin'

  useEffect(() => { if (status === 'unauthenticated') router.push('/') }, [status, router])

  useEffect(() => {
    if (!isAdmin) return
    fetch('/api/admin/genres')
      .then(r => r.json())
      .then(d => setGenres(d.genres || []))
      .finally(() => setLoading(false))
  }, [isAdmin])

  const save = async (id: number, url: string) => {
    setSavingId(id)
    const r = await fetch('/api/admin/genres', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, cover_image_url: url || null }),
    })
    const d = await r.json()
    if (d.genre) {
      setGenres(prev => prev.map(g => g.id === id ? d.genre : g))
      setEditingUrls(prev => { const n = { ...prev }; delete n[id]; return n })
    }
    setSavingId(null)
  }

  if (status === 'loading' || loading) {
    return <div className="p-8 text-center text-sm text-gray-400">Kraunasi…</div>
  }
  if (!isAdmin) return null

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-black tracking-tight" style={{ color: 'var(--text-primary)' }}>
              Žanrai (stiliai)
            </h1>
            <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
              Kiekvienam main žanrui sukelk realų vizualą — naudojamas nav Stiliai sekcijoje ir žanro page'e.
            </p>
          </div>
          <Link
            href="/admin"
            className="text-xs px-3 py-1.5 rounded-lg border"
            style={{ color: 'var(--text-secondary)', borderColor: 'var(--border-default)', background: 'var(--bg-surface)' }}
          >
            ← Admin
          </Link>
        </div>

        {/* Genre cards grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {genres.map(g => {
            const colorMeta = GENRE_COLORS.find(c => c.name === g.name)
            const accent = colorMeta?.hex || '#64748b'
            const rgb = colorMeta?.rgb || '100, 116, 139'
            const editingUrl = editingUrls[g.id]
            const currentUrl = editingUrl !== undefined ? editingUrl : (g.cover_image_url || '')

            return (
              <div
                key={g.id}
                className="rounded-2xl p-4 border"
                style={{
                  background: 'var(--bg-surface)',
                  borderColor: 'var(--border-default)',
                }}
              >
                {/* Preview kortelė — kaip ji atrodys nav'e */}
                <div
                  className="relative rounded-xl overflow-hidden mb-3"
                  style={{
                    aspectRatio: '16/10',
                    background: g.cover_image_url
                      ? `linear-gradient(to top, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0.15) 50%, transparent 100%), url(${g.cover_image_url}) center/cover`
                      : `radial-gradient(circle at 20% 0%, rgba(255,255,255,0.18) 0%, transparent 60%), linear-gradient(135deg, rgb(${rgb}) 0%, rgba(${rgb}, 0.78) 100%)`,
                    boxShadow: `0 4px 14px rgba(${rgb}, 0.30)`,
                  }}
                >
                  <div className="absolute bottom-3 left-3">
                    <span
                      className="font-extrabold text-lg tracking-tight text-white"
                      style={{ fontFamily: "'Outfit', sans-serif", textShadow: '0 1px 3px rgba(0,0,0,0.4)' }}
                    >
                      {colorMeta?.short || g.name}
                    </span>
                  </div>
                  {!g.cover_image_url && (
                    <div className="absolute top-2 right-2 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-black/40 text-white">
                      No image
                    </div>
                  )}
                </div>

                {/* Genre name */}
                <div className="mb-2 flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full" style={{ background: accent }} />
                  <span className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                    {g.name}
                  </span>
                </div>

                {/* URL input */}
                <input
                  type="text"
                  placeholder="Image URL (https://…)"
                  value={currentUrl}
                  onChange={e => setEditingUrls(prev => ({ ...prev, [g.id]: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg text-xs border mb-2"
                  style={{
                    background: 'var(--input-bg)',
                    borderColor: 'var(--input-border)',
                    color: 'var(--input-text)',
                  }}
                />

                {/* Actions */}
                <div className="flex gap-2">
                  <button
                    onClick={() => save(g.id, currentUrl)}
                    disabled={savingId === g.id || currentUrl === (g.cover_image_url || '')}
                    className="flex-1 px-3 py-1.5 rounded-lg text-xs font-bold transition disabled:opacity-40"
                    style={{
                      background: 'var(--accent-orange)',
                      color: '#fff',
                    }}
                  >
                    {savingId === g.id ? 'Saugoma…' : 'Išsaugoti'}
                  </button>
                  {g.cover_image_url && (
                    <button
                      onClick={() => save(g.id, '')}
                      className="px-3 py-1.5 rounded-lg text-xs font-bold border"
                      style={{
                        color: 'var(--text-muted)',
                        borderColor: 'var(--border-default)',
                      }}
                    >
                      Išvalyti
                    </button>
                  )}
                </div>

                <p className="mt-2 text-[10px]" style={{ color: 'var(--text-muted)' }}>
                  Patarimas: 800×500 ar didesnis (16:10), JPEG/PNG/WebP.
                  Įdėk Unsplash ar bet kokio CDN URL.
                </p>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
