'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { COUNTRIES, GENRES } from '@/lib/constants'

export default function ArtistsPage() {
  const [artists, setArtists] = useState<any[]>([])
  const [filteredArtists, setFilteredArtists] = useState<any[]>([])
  const [search, setSearch] = useState('')
  const [countryFilter, setCountryFilter] = useState('Visi')
  const [genreFilter, setGenreFilter] = useState('Visi')

  // Load and refresh artists data
  useEffect(() => {
    const loadArtists = () => {
      const stored = localStorage.getItem('artists')
      if (stored) {
        const parsed = JSON.parse(stored)
        setArtists(parsed)
        setFilteredArtists(parsed)
      }
    }

    loadArtists()
    
    // Auto-refresh every 2 seconds to catch admin updates
    const interval = setInterval(loadArtists, 2000)
    return () => clearInterval(interval)
  }, [])

  // Apply filters
  useEffect(() => {
    let filtered = [...artists]

    // Search filter
    if (search) {
      filtered = filtered.filter(a => 
        a.name.toLowerCase().includes(search.toLowerCase()) ||
        (a.genre && a.genre.toLowerCase().includes(search.toLowerCase())) ||
        (a.description && a.description.toLowerCase().includes(search.toLowerCase()))
      )
    }

    // Country filter
    if (countryFilter !== 'Visi') {
      filtered = filtered.filter(a => a.country === countryFilter)
    }

    // Genre filter
    if (genreFilter !== 'Visi') {
      filtered = filtered.filter(a => a.genre === genreFilter)
    }

    setFilteredArtists(filtered)
  }, [search, countryFilter, genreFilter, artists])

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-black text-white sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-8 py-4 flex justify-between items-center">
          <Link href="/" className="text-2xl font-black">
            <span className="text-white">music</span>
            <span className="text-music-orange">.lt</span>
          </Link>
          <nav className="flex gap-6">
            <Link href="/" className="hover:text-music-orange transition-colors">Pradžia</Link>
            <Link href="/atlikejai" className="text-music-orange">Atlikėjai</Link>
            <Link href="/admin" className="px-4 py-2 bg-music-orange rounded hover:opacity-90">Admin</Link>
          </nav>
        </div>
      </header>

      {/* Blue submenu */}
      <div className="bg-music-blue text-white">
        <div className="max-w-7xl mx-auto px-8 py-3 flex gap-8 text-sm">
          <Link href="/" className="hover:text-music-orange">Naujienos</Link>
          <Link href="/atlikejai" className="text-music-orange">Atlikėjai</Link>
          <a href="#" className="hover:text-music-orange">Albumai</a>
          <a href="#" className="hover:text-music-orange">Dainos</a>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-8 py-12">
        
        {/* Title & Stats */}
        <div className="mb-8">
          <h1 className="text-5xl font-black text-gray-900 mb-2">🎤 Atlikėjai</h1>
          <p className="text-gray-600 text-xl">
            {filteredArtists.length} {filteredArtists.length === 1 ? 'atlikėjas' : 'atlikėjų'}
            {search || countryFilter !== 'Visi' || genreFilter !== 'Visi' ? ' (filtruota)' : ''}
          </p>
        </div>

        {/* Filters */}
        <div className="mb-8 bg-white rounded-xl shadow p-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            
            {/* Search */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                🔍 Paieška
              </label>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Ieškoti pagal pavadinimą, žanrą..."
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:border-music-blue text-gray-900"
              />
            </div>

            {/* Country Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                🌍 Šalis
              </label>
              <select
                value={countryFilter}
                onChange={(e) => setCountryFilter(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:border-music-blue text-gray-900 bg-white"
              >
                <option value="Visi">Visos šalys</option>
                {COUNTRIES.map(country => (
                  <option key={country} value={country}>{country}</option>
                ))}
              </select>
            </div>

            {/* Genre Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                🎵 Žanras
              </label>
              <select
                value={genreFilter}
                onChange={(e) => setGenreFilter(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:border-music-blue text-gray-900 bg-white"
              >
                <option value="Visi">Visi žanrai</option>
                {GENRES.map(genre => (
                  <option key={genre} value={genre}>{genre}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Clear Filters */}
          {(search || countryFilter !== 'Visi' || genreFilter !== 'Visi') && (
            <button
              onClick={() => {
                setSearch('')
                setCountryFilter('Visi')
                setGenreFilter('Visi')
              }}
              className="mt-4 px-4 py-2 text-sm text-music-blue hover:text-music-orange font-medium"
            >
              ✕ Išvalyti filtrus
            </button>
          )}
        </div>

        {/* Artists Grid */}
        {filteredArtists.length === 0 ? (
          <div className="bg-white rounded-xl shadow p-16 text-center">
            <div className="text-6xl mb-4">🎤</div>
            <h3 className="text-2xl font-bold text-gray-900 mb-2">
              {artists.length === 0 ? 'Nėra atlikėjų' : 'Nerasta atlikėjų'}
            </h3>
            <p className="text-gray-600 mb-6">
              {artists.length === 0 
                ? 'Pridėk pirmus atlikėjus admin panelėje'
                : 'Pabandyk pakeisti paieškos kriterijus'
              }
            </p>
            {artists.length === 0 && (
              <Link
                href="/admin/artists/new"
                className="inline-block px-6 py-3 bg-music-blue text-white rounded-lg hover:opacity-90 font-medium"
              >
                + Pridėti atlikėją
              </Link>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
            {filteredArtists.map((artist) => (
              <div
                key={artist.id}
                className="bg-white rounded-xl shadow hover:shadow-lg transition-all group cursor-pointer"
              >
                <div className="p-6">
                  <div className="w-full aspect-square bg-gradient-to-br from-music-blue to-purple-600 rounded-lg mb-4 flex items-center justify-center text-6xl group-hover:scale-105 transition-transform">
                    🎤
                  </div>
                  <h3 className="text-lg font-bold text-gray-900 mb-1 group-hover:text-music-blue transition-colors truncate">
                    {artist.name}
                  </h3>
                  {artist.genre && (
                    <p className="text-sm text-gray-600 mb-1">{artist.genre}</p>
                  )}
                  {artist.country && (
                    <p className="text-xs text-gray-500">{artist.country}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="bg-gray-900 text-gray-400 mt-16 py-8">
        <div className="max-w-7xl mx-auto px-8 text-center text-sm">
          <div className="mb-4">
            <span className="text-white font-bold text-xl">music</span>
            <span className="text-music-orange font-bold text-xl">.lt</span>
          </div>
          <p>© 2026 Music.lt</p>
        </div>
      </footer>
    </div>
  )
}
