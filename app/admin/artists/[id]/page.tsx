// PATCH: Pakeisti DiscographyPanel funkciją app/admin/artists/[id]/page.tsx
// Rasti: function DiscographyPanel({ artistId, artistName, artistType, refreshKey, onImportClose }
// Pakeisti visa funkcija žemiau esančia versija

function DiscographyPanel({ artistId, artistName, artistType, refreshKey, onImportClose }: {
  artistId: string; artistName: string; artistType?: 'solo'|'group'; refreshKey: number; onImportClose: () => void
}) {
  const [albums, setAlbums] = useState<any[]>([])
  const [singles, setSingles] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    Promise.all([
      fetch(`/api/albums?artist_id=${artistId}&limit=100`).then(r => r.json()),
      fetch(`/api/tracks?artist_id=${artistId}&limit=200`).then(r => r.json()),
    ]).then(([albumData, trackData]) => {
      const sorted = (albumData.albums || []).sort((a: any, b: any) => (b.year || 0) - (a.year || 0))
      setAlbums(sorted)
      // Singlai: dainos kurios yra is_single=true arba neturi albumų
      const allTracks = (trackData.tracks || [])
      const singles = allTracks.filter((t: any) => t.is_single || t.album_count === 0)
      setSingles(singles.sort((a: any, b: any) => (b.release_year || 0) - (a.release_year || 0)))
    }).finally(() => setLoading(false))
  }, [artistId, refreshKey])

  return (
    <div className="h-full flex flex-col">
      <div className="shrink-0 flex items-center gap-1.5 flex-wrap px-3 py-2 border-b border-gray-200 bg-white/80 backdrop-blur sticky top-0 z-10">
        <span className="text-sm font-bold text-gray-700 hidden lg:inline">Diskografija</span>
        {albums.length > 0 && (
          <span className="bg-gray-200 text-gray-600 text-xs font-bold px-1.5 py-0.5 rounded-full hidden lg:inline-flex">{albums.length}</span>
        )}
        <div className="flex items-center gap-1.5 ml-auto flex-wrap">
          {artistName && (
            <WikipediaImportDiscography
              artistId={parseInt(artistId)}
              artistName={artistName}
              artistWikiTitle={artistName.replace(/ /g, '_')}
              isSolo={artistType === 'solo'}
              onClose={onImportClose}
              buttonClassName="flex items-center gap-1.5 px-2 py-1 bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-lg text-xs font-medium transition-colors"
              buttonLabel="𝐖 Įkelti iš Wiki"
            />
          )}
          <Link href={`/admin/albums/new?artist_id=${artistId}`}
            className="flex items-center gap-1 px-2 py-1 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-lg text-xs font-medium transition-colors">
            + Naujas albumas
          </Link>
          <Link href={`/admin/tracks/new?artist_id=${artistId}`}
            className="flex items-center gap-1 px-2 py-1 bg-green-50 hover:bg-green-100 text-green-700 rounded-lg text-xs font-medium transition-colors">
            + Nauja daina
          </Link>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {loading ? (
          <div className="flex justify-center py-8">
            <div className="w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : albums.length === 0 && singles.length === 0 ? (
          <div className="py-12 text-center">
            <div className="flex justify-center mb-3">
              <svg viewBox="0 0 48 48" className="w-12 h-12 text-gray-200" fill="currentColor">
                <circle cx="24" cy="24" r="22" opacity=".4"/>
                <circle cx="24" cy="24" r="14" opacity=".6"/>
                <circle cx="24" cy="24" r="5" opacity=".9"/>
                <circle cx="24" cy="24" r="2" fill="white"/>
              </svg>
            </div>
            <p className="text-sm text-gray-400 mb-3">Nėra albumų</p>
            <Link href={`/admin/albums/new?artist_id=${artistId}`}
              className="inline-flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors">
              + Sukurti pirmą albumą
            </Link>
            <Link href={`/admin/tracks/new?artist_id=${artistId}`}
              className="inline-flex items-center gap-1 px-3 py-1.5 border border-green-300 text-green-700 rounded-lg text-sm font-medium hover:bg-green-50 transition-colors mt-2">
              + Pridėti dainą
            </Link>
          </div>
        ) : (
          <>
            {albums.map((album, i) => <AlbumCard key={`${album.id}-${refreshKey}`} album={album} defaultOpen={i === 0 && singles.length === 0} />)}
            {singles.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-100 bg-gray-50/50">
                  <span className="text-sm font-semibold text-gray-700">Singlai ir dainos</span>
                  <span className="text-xs text-gray-400 bg-gray-200 px-1.5 py-0.5 rounded-full font-bold">{singles.length}</span>
                  <Link href={`/admin/tracks?artist_id=${artistId}`}
                    className="ml-auto text-xs text-blue-500 hover:underline">Visos dainos →</Link>
                </div>
                <div className="divide-y divide-gray-50">
                  {singles.slice(0, 30).map((track: any) => (
                    <div key={track.id} className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50/80 group transition-colors">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-1.5 flex-wrap">
                          <span className="text-sm text-gray-800 truncate">{track.title}</span>
                          {track.release_year && <span className="text-xs text-gray-400 shrink-0">{track.release_year}</span>}
                          {track.video_url && <span className="text-blue-400 text-xs shrink-0">▶</span>}
                          {track.has_lyrics && <span className="text-green-500 text-xs font-bold shrink-0">T</span>}
                        </div>
                        {track.albums_list?.[0] && <div className="text-[11px] text-gray-400 truncate">{track.albums_list[0].title}</div>}
                      </div>
                      <a href={`/admin/tracks/${track.id}`} target="_blank" rel="noopener noreferrer"
                        className="opacity-0 group-hover:opacity-100 shrink-0 px-1.5 py-0.5 text-xs text-blue-500 hover:text-blue-700 hover:bg-blue-50 rounded transition-all font-medium">
                        Redaguoti ↗
                      </a>
                    </div>
                  ))}
                  {singles.length > 30 && (
                    <div className="px-3 py-2 text-center">
                      <Link href={`/admin/tracks?artist_id=${artistId}`} className="text-xs text-blue-500 hover:underline">
                        Rodyti visas {singles.length} dainas →
                      </Link>
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
