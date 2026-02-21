'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

type InstagramPost = {
  id: string
  media_type: 'IMAGE' | 'VIDEO' | 'CAROUSEL_ALBUM'
  media_url: string
  permalink: string
  caption?: string
  timestamp: string
  thumbnail_url?: string
  artistName: string
  artistId: string
  genre: string
}

export default function InstagramFeed() {
  const [posts, setPosts] = useState<InstagramPost[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedGenre, setSelectedGenre] = useState<string>('Visi')
  const [genres, setGenres] = useState<string[]>([])

  useEffect(() => {
    loadPosts()
  }, [])

  const loadPosts = async () => {
    setLoading(true)
    
    // Get all social connections
    const stored = localStorage.getItem('social_connections')
    const connections = stored ? JSON.parse(stored) : []
    const igConnections = connections.filter((c: any) => c.platform === 'instagram')

    // Get artist data
    const artistsData = localStorage.getItem('artists')
    const artists = artistsData ? JSON.parse(artistsData) : []

    const allPosts: InstagramPost[] = []
    const genreSet = new Set<string>(['Visi'])

    // Fetch posts for each connected artist
    for (const conn of igConnections) {
      const artist = artists.find((a: any) => a.id === conn.artistId)
      if (!artist) continue

      const genre = artist.genre || 'Kita'
      genreSet.add(genre)

      try {
        const res = await fetch('/api/instagram/media', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ accessToken: conn.accessToken, limit: 9 }),
        })

        if (res.ok) {
          const { media } = await res.json()
          
          for (const post of media) {
            allPosts.push({
              ...post,
              artistName: artist.name,
              artistId: artist.id,
              genre,
            })
          }
        }
      } catch (err) {
        console.error(`Failed to fetch posts for ${artist.name}:`, err)
      }
    }

    // Sort by timestamp (newest first)
    allPosts.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

    setPosts(allPosts)
    setGenres(Array.from(genreSet))
    setLoading(false)
  }

  const filteredPosts = selectedGenre === 'Visi'
    ? posts
    : posts.filter(p => p.genre === selectedGenre)

  const formatDate = (timestamp: string) => {
    const date = new Date(timestamp)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
    
    if (diffDays === 0) return 'Šiandien'
    if (diffDays === 1) return 'Vakar'
    if (diffDays < 7) return `Prieš ${diffDays} d.`
    return date.toLocaleDateString('lt-LT', { month: 'short', day: 'numeric' })
  }

  return (
    <div className="min-h-screen bg-[#f2f2f0]">
      
      {/* Header */}
      <header className="bg-black border-b-[3px] border-music-orange">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Link href="/" className="text-3xl font-black">
              <span className="text-white">music</span><span className="text-music-orange">.lt</span>
            </Link>
            <span className="text-gray-600">/</span>
            <span className="text-gray-400 text-lg">Instagram</span>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        
        {/* Title & Genre filter */}
        <div className="mb-6">
          <h1 className="text-2xl font-black text-gray-900 mb-2">📸 Atlikėjų Instagram</h1>
          <p className="text-sm text-gray-600 mb-4">
            Naujausi įrašai iš lietuviškų atlikėjų Instagram paskyrų
          </p>

          {/* Genre pills */}
          <div className="flex flex-wrap gap-2">
            {genres.map(g => (
              <button key={g} onClick={() => setSelectedGenre(g)}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-colors
                  ${selectedGenre === g
                    ? 'bg-music-blue text-white'
                    : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'}`}>
                {g}
              </button>
            ))}
          </div>
        </div>

        {/* Loading */}
        {loading && (
          <div className="text-center py-12">
            <div className="inline-block w-8 h-8 border-4 border-music-blue border-t-transparent rounded-full animate-spin" />
            <p className="text-gray-500 mt-3">Kraunami įrašai...</p>
          </div>
        )}

        {/* No posts */}
        {!loading && filteredPosts.length === 0 && (
          <div className="text-center py-12 bg-white rounded-xl">
            <span className="text-5xl mb-3 block">📸</span>
            <h3 className="font-bold text-gray-900 mb-2">Nėra prijungtų Instagram paskyrų</h3>
            <p className="text-gray-500 text-sm mb-4">
              Atlikėjai gali prijungti savo Instagram paskyras admin panelėje
            </p>
            <Link href="/admin/artists"
              className="inline-block px-4 py-2 bg-music-orange text-white rounded-lg font-bold hover:bg-orange-500 transition-colors">
              Eiti į Admin →
            </Link>
          </div>
        )}

        {/* Posts grid */}
        {!loading && filteredPosts.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredPosts.map(post => (
              <article key={post.id} className="bg-white rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                
                {/* Media */}
                <a href={post.permalink} target="_blank" rel="noopener noreferrer" className="block relative group">
                  {post.media_type === 'VIDEO' ? (
                    <div className="aspect-square bg-gray-900 relative overflow-hidden">
                      <img src={post.thumbnail_url || post.media_url} alt="" className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                        <span className="text-white text-4xl">▶</span>
                      </div>
                    </div>
                  ) : (
                    <div className="aspect-square bg-gray-100 relative overflow-hidden">
                      <img src={post.media_url} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                      {post.media_type === 'CAROUSEL_ALBUM' && (
                        <span className="absolute top-2 right-2 w-6 h-6 bg-black/60 rounded-full flex items-center justify-center text-white text-xs">
                          📷
                        </span>
                      )}
                    </div>
                  )}
                </a>

                {/* Content */}
                <div className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Link href={`/admin/artists/${post.artistId}`}
                      className="font-bold text-sm text-gray-900 hover:text-music-blue transition-colors">
                      {post.artistName}
                    </Link>
                    <span className="text-xs text-gray-400">·</span>
                    <span className="text-xs text-gray-400">{formatDate(post.timestamp)}</span>
                  </div>
                  
                  {post.caption && (
                    <p className="text-sm text-gray-600 leading-relaxed line-clamp-3">
                      {post.caption}
                    </p>
                  )}

                  <div className="flex items-center gap-2 mt-3">
                    <span className="text-xs px-2 py-0.5 bg-music-blue/10 text-music-blue rounded-full font-medium">
                      {post.genre}
                    </span>
                    <a href={post.permalink} target="_blank" rel="noopener noreferrer"
                      className="ml-auto text-xs text-purple-600 hover:text-purple-700 font-medium">
                      Instagram →
                    </a>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}

      </main>
    </div>
  )
}
