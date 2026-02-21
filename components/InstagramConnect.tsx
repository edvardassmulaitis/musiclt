'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

type Props = {
  artistId: string
  artistName: string
}

type Connection = {
  artistId: string
  platform: string
  username: string
  accessToken: string
  tokenExpiresAt: number
  connectedAt: number
}

export default function InstagramConnect({ artistId, artistName }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [connection, setConnection] = useState<Connection | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    // Load existing connection from localStorage
    const stored = localStorage.getItem('social_connections')
    if (stored) {
      const connections: Connection[] = JSON.parse(stored)
      const igConn = connections.find(c => c.artistId === artistId && c.platform === 'instagram')
      setConnection(igConn || null)
    }

    // Handle OAuth callback
    const connectedData = searchParams.get('instagram_connected')
    if (connectedData) {
      try {
        const decoded: Connection = JSON.parse(atob(connectedData))
        
        // Save to localStorage
        const stored = localStorage.getItem('social_connections')
        const connections: Connection[] = stored ? JSON.parse(stored) : []
        const filtered = connections.filter(c => !(c.artistId === artistId && c.platform === 'instagram'))
        filtered.push(decoded)
        localStorage.setItem('social_connections', JSON.stringify(filtered))
        
        setConnection(decoded)
        
        // Clean URL
        router.replace(`/admin/artists/${artistId}`)
      } catch (err) {
        console.error('Failed to process Instagram connection:', err)
      }
    }
  }, [artistId, searchParams, router])

  const connect = () => {
    setLoading(true)
    const clientId = process.env.NEXT_PUBLIC_INSTAGRAM_CLIENT_ID || 'YOUR_CLIENT_ID'
    const redirectUri = `${window.location.origin}/api/instagram/callback`
    const state = btoa(JSON.stringify({ artistId, timestamp: Date.now() }))
    
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: 'user_profile,user_media',
      response_type: 'code',
      state,
    })

    window.location.href = `https://api.instagram.com/oauth/authorize?${params.toString()}`
  }

  const disconnect = () => {
    const stored = localStorage.getItem('social_connections')
    if (stored) {
      const connections: Connection[] = JSON.parse(stored)
      const filtered = connections.filter(c => !(c.artistId === artistId && c.platform === 'instagram'))
      localStorage.setItem('social_connections', JSON.stringify(filtered))
    }
    setConnection(null)
  }

  const daysUntilExpiry = connection
    ? Math.floor((connection.tokenExpiresAt - Date.now()) / (1000 * 60 * 60 * 24))
    : 0

  return (
    <div className="bg-gradient-to-r from-purple-50 to-pink-50 border border-purple-200 rounded-xl p-4">
      <div className="flex items-start gap-3">
        <span className="text-2xl">📸</span>
        <div className="flex-1">
          <h3 className="font-bold text-gray-900 text-sm mb-1">Instagram integracija</h3>
          
          {!connection ? (
            <>
              <p className="text-xs text-gray-600 mb-3 leading-relaxed">
                Prijunk savo Instagram paskyrą ir tavo naujausi įrašai automatiškai atsiduos music.lt,
                sugrupuoti pagal muzikos stilių.
              </p>
              <button onClick={connect} disabled={loading}
                className="px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-lg text-sm font-bold hover:from-purple-600 hover:to-pink-600 transition-all disabled:opacity-50">
                {loading ? '⏳ Jungiamasi...' : '📸 Prijungti Instagram'}
              </button>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full font-bold">
                  ✓ Prijungta
                </span>
                <span className="text-xs text-gray-500">
                  @{connection.username}
                </span>
              </div>
              <p className="text-xs text-gray-600 mb-2">
                Token galioja dar <span className="font-bold text-purple-600">{daysUntilExpiry} d.</span>
                {daysUntilExpiry < 7 && <span className="text-orange-600"> (reikės atnaujinti)</span>}
              </p>
              <div className="flex gap-2">
                <button onClick={disconnect}
                  className="px-3 py-1.5 bg-white border border-gray-300 text-gray-600 rounded-lg text-xs font-medium hover:bg-gray-50 transition-colors">
                  Atjungti
                </button>
                <a href={`https://instagram.com/${connection.username}`} target="_blank" rel="noopener noreferrer"
                  className="px-3 py-1.5 bg-purple-500 text-white rounded-lg text-xs font-medium hover:bg-purple-600 transition-colors">
                  Peržiūrėti profilį →
                </a>
              </div>
            </>
          )}
        </div>
      </div>

      {connection && (
        <div className="mt-3 pt-3 border-t border-purple-200">
          <p className="text-[10px] text-gray-500 leading-relaxed">
            💡 Tavo Instagram įrašai automatiškai atsinaujins kas 24h ir matysis music.lt puslapyje
            „{artistName}" profilyje bei stilių agregavimo skiltyje.
          </p>
        </div>
      )}
    </div>
  )
}
