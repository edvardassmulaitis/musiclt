'use client'

// components/GroupPlayModal.tsx (2026-06-18)
//
// Grupės (atlikėjo) „top dainų" grotuvas modale — atidaromas iš /bendruomene
// Pulso įrašų/diskusijų, kai jie susieti su grupe. Logika kaip atlikėjo
// puslapio grotuvo: paprastas YT <iframe> (ChartYtPlayer), dainų sąrašas šone,
// paspaudus dainą — groja vietoje. Dainos imamos iš /api/tracks?artist_id=…,
// rikiuojamos pagal peržiūras (populiariausios pirma).

import { useEffect, useState } from 'react'
import { HomeListModal } from '@/components/HomeListModal'
import { ChartYtPlayer } from '@/components/ChartYtPlayer'
import { proxyImg } from '@/lib/img-proxy'

function ytId(url?: string | null): string | null {
  if (!url) return null
  const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([^&?\s]{11})/)
  return m?.[1] || null
}

type Tr = {
  id: number; title: string; cover_url: string | null; video_url: string | null
  video_views: number | null; artists?: { name?: string | null } | null
}

export function GroupPlayModal({ artistId, artistName, onClose }: { artistId: number; artistName: string; onClose: () => void }) {
  const [tracks, setTracks] = useState<Tr[] | null>(null)
  const [cur, setCur] = useState(0)
  const [playing, setPlaying] = useState(false)

  useEffect(() => {
    let on = true
    fetch(`/api/tracks?artist_id=${artistId}&limit=60`).then(r => r.json()).then(d => {
      if (!on) return
      const list: Tr[] = ((d.tracks || []) as Tr[])
        .filter(t => ytId(t.video_url))
        .sort((a, b) => (b.video_views || 0) - (a.video_views || 0))
        .slice(0, 20)
      setTracks(list)
      // Auto-start nuo populiariausios.
      if (list.length) setPlaying(true)
    }).catch(() => { if (on) setTracks([]) })
    return () => { on = false }
  }, [artistId])

  const current = tracks && tracks[cur] ? tracks[cur] : null
  const curVid = current ? ytId(current.video_url) : null
  const poster = curVid ? `https://i.ytimg.com/vi/${curVid}/hqdefault.jpg` : (current?.cover_url ? proxyImg(current.cover_url) : null)

  return (
    <HomeListModal open onClose={onClose} title={artistName} subtitle="Grupės dainos">
      {tracks === null ? (
        <div className="py-10 text-center text-[13px] text-[var(--text-muted)]">Kraunama…</div>
      ) : tracks.length === 0 ? (
        <div className="py-10 text-center text-[14px] text-[var(--text-muted)]">Šios grupės dainų su vaizdo įrašu kol kas nėra.</div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-[1.3fr_1fr]">
          {/* Kairė: grotuvas (mažesnis) + dabar grojama */}
          <div className="min-w-0">
            <div className="overflow-hidden rounded-xl border border-[var(--border-default)]">
              <ChartYtPlayer videoId={curVid} playing={playing} posterUrl={poster} title={current?.title} onActivate={() => setPlaying(true)} />
            </div>
            {current && (
              <p className="m-0 mt-2.5 px-0.5 text-[14.5px] font-bold text-[var(--text-primary)]">
                {current.title}
                {current.artists?.name && <span className="ml-1.5 font-medium text-[var(--text-muted)]">· {current.artists.name}</span>}
              </p>
            )}
          </div>
          {/* Dešinė: top dainų sąrašas (matomas vienu metu su grotuvu) */}
          <div className="flex max-h-[58vh] min-w-0 flex-col gap-1 overflow-y-auto pr-0.5 sm:max-h-[430px]">
            {tracks.map((t, i) => {
              const active = i === cur
              return (
                <button key={t.id} type="button" onClick={() => { setCur(i); setPlaying(true) }}
                  className={`flex cursor-pointer items-center gap-2.5 rounded-lg border-0 px-2 py-1.5 text-left transition-colors ${active ? 'bg-[rgba(249,115,22,0.12)]' : 'bg-transparent hover:bg-[var(--card-hover)]'}`}>
                  <span className={`w-5 shrink-0 text-center font-['Outfit',sans-serif] text-[13px] font-black ${active ? 'text-[var(--accent-orange)]' : 'text-[var(--text-faint)]'}`}>{i + 1}</span>
                  {t.cover_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={proxyImg(t.cover_url)} alt="" loading="lazy" className="h-9 w-9 shrink-0 rounded-md object-cover" />
                  ) : <div className="h-9 w-9 shrink-0 rounded-md bg-[var(--cover-placeholder)]" />}
                  <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-[var(--text-primary)]">{t.title}</span>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" className={`shrink-0 ${active ? 'text-[var(--accent-orange)]' : 'text-[var(--text-faint)]'}`}><polygon points="6 4 20 12 6 20 6 4" /></svg>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </HomeListModal>
  )
}
