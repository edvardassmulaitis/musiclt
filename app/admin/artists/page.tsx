'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function ArtistsAdmin() {
  const router = useRouter()
  const [mounted, setMounted] = useState(false)
  const [artists, setArtists] = useState<any[]>([])

  useEffect(() => {
    setMounted(true)
    const isLoggedIn = localStorage.getItem('admin_logged_in')
    if (!isLoggedIn) {
      router.push('/admin')
      return
    }

    // Load artists from localStorage
    const stored = localStorage.getItem('artists')
    if (stored) {
      setArtists(JSON.parse(stored))
    }
  }, [router])

  const handleDelete = (id: string) => {
    if (confirm('Ar tikrai norite ištrinti šį atlikėją?')) {
      const updated = artists.filter(a => a.id !== id)
      setArtists(updated)
      localStorage.setItem('artists', JSON.stringify(updated))
    }
  }

  if (!mounted) return null

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-7xl mx-auto">
        
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <Link href="/admin/dashboard" className="text-gray-400 hover:text-white mb-2 inline-block">
              ← Atgal į Dashboard
            </Link>
            <h1 className="text-4xl font-black">🎤 Atlikėjai</h1>
            <p className="text-gray-400 mt-2">Valdyti muzikos atlikėjus</p>
          </div>
          <Link
            href="/admin/artists/new"
            className="px-6 py-3 bg-gradient-to-r from-music-blue to-music-blue-light rounded-lg hover:opacity-90 transition-opacity font-bold"
          >
            + Naujas atlikėjas
          </Link>
        </div>

        {/* Artists List */}
        {artists.length === 0 ? (
          <div className="bg-white/5 border border-white/10 rounded-2xl p-16 text-center">
            <div className="text-6xl mb-4">🎤</div>
            <h3 className="text-2xl font-bold mb-2">Nėra atlikėjų</h3>
            <p className="text-gray-400 mb-6">Pradėkite pridėdami pirmą atlikėją</p>
            <Link
              href="/admin/artists/new"
              className="inline-block px-8 py-3 bg-music-blue rounded-lg hover:opacity-90 transition-opacity font-bold"
            >
              + Pridėti atlikėją
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {artists.map((artist) => (
              <div
                key={artist.id}
                className="bg-white/5 border border-white/10 rounded-2xl p-6 hover:bg-white/10 transition-all"
              >
                <div className="flex justify-between items-start mb-4">
                  <div className="text-4xl">🎤</div>
                  <div className="flex gap-2">
                    <Link
                      href={`/admin/artists/${artist.id}`}
                      className="px-3 py-1 bg-music-blue/20 text-music-blue rounded hover:bg-music-blue/30 text-sm"
                    >
                      Redaguoti
                    </Link>
                    <button
                      onClick={() => handleDelete(artist.id)}
                      className="px-3 py-1 bg-red-500/20 text-red-400 rounded hover:bg-red-500/30 text-sm"
                    >
                      Trinti
                    </button>
                  </div>
                </div>
                <h3 className="text-xl font-bold mb-2">{artist.name}</h3>
                {artist.genre && (
                  <p className="text-sm text-gray-400 mb-1">{artist.genre}</p>
                )}
                {artist.country && (
                  <p className="text-xs text-gray-500 mb-1">{artist.country}</p>
                )}
                {artist.yearStart && (
                  <p className="text-xs text-gray-500">
                    📅 {artist.yearStart}{artist.yearEnd ? ` – ${artist.yearEnd}` : ' – aktyvūs'}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
