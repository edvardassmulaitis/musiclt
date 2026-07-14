'use client'
// components/gilyn/ArtistCard.tsx
//
// Atlikėjo kortelė ŽEMĖLAPIO VIDUJE — kad kelias nenutrūktų.
//
// Anksčiau paspaudus atlikėją žmogus iškrisdavo į bendrą atlikėjo puslapį ir
// prarasdavo vietą žemėlapyje. Dabar kortelė atsidaro sluoksniu VIRŠ teritorijos
// lapo: uždarai — grįžti tiksliai ten, kur buvai.
//
// Ir svarbiausia: rodom TOS EROS albumus, iš kurios teritorijos atėjai.
// Metallica iš „Bay Area thrash" — 1983–1988 albumai, ne „St. Anger".

import { useEffect, useState } from 'react'
import Link from 'next/link'

type Album = { id: number; t: string; slug: string; y: number; img: string | null }
type Data = {
  artist: { id: number; name: string; slug: string; country: string; img: string | null; from: number | null; to: number | null; fame: number; bio: string }
  state: { liked: boolean; heard: boolean; visited: boolean }
  eraAlbums: Album[]
  otherAlbums: Album[]
}

export default function ArtistCard({ artistId, terrName, eraFrom, eraTo, onBack, onDig }: {
  artistId: number
  terrName: string
  eraFrom?: number | null
  eraTo?: number | null
  onBack: () => void
  onDig: (id: number, name: string) => void
}) {
  const [d, setD] = useState<Data | null>(null)

  useEffect(() => {
    let alive = true
    setD(null)
    const p = new URLSearchParams({ id: String(artistId) })
    if (eraFrom) p.set('from', String(eraFrom))
    if (eraTo) p.set('to', String(eraTo))
    fetch(`/api/zaidimai/gilyn/atlikejas?${p}`, { cache: 'no-store' })
      .then(r => r.json()).then(j => { if (alive && !j.error) setD(j) })
      .catch(() => {})
    return () => { alive = false }
  }, [artistId, eraFrom, eraTo])

  const eraLbl = eraFrom && eraTo ? `${eraFrom}–${eraTo}` : eraFrom ? `nuo ${eraFrom}` : ''

  return (
    <div className="ac-back" onClick={onBack}>
      <div className="ac" onClick={e => e.stopPropagation()}>
        <button className="ac-back-btn" onClick={onBack}>← {terrName}</button>

        {!d ? (
          <div className="ac-load"><span /><span /><span /></div>
        ) : (
          <>
            <div className="ac-hero">
              {d.artist.img
                ? <img src={d.artist.img} alt="" referrerPolicy="no-referrer" />
                : <span className="ac-ph">♪</span>}
              <div className="ac-heroin">
                <h3>{d.artist.name}</h3>
                <p className="ac-sub">
                  {d.artist.country}
                  {d.artist.from ? ` · ${d.artist.from}${d.artist.to ? `–${d.artist.to}` : '–'}` : ''}
                </p>
                <div className="ac-state">
                  {d.state.liked && <span className="on liked">❤ pamėgtas</span>}
                  {!d.state.liked && (d.state.heard || d.state.visited) && <span className="on heard">✓ susipažinęs</span>}
                  {!d.state.liked && !d.state.heard && !d.state.visited && <span>dar nepažįstamas</span>}
                </div>
              </div>
            </div>

            {d.artist.bio && <p className="ac-bio">{d.artist.bio}…</p>}

            <div className="ac-sec">
              <span className="ac-lbl">
                Šios teritorijos era{eraLbl ? ` · ${eraLbl}` : ''}
                <b>{terrName}</b>
              </span>
              {d.eraAlbums.length ? (
                <div className="ac-albums">
                  {d.eraAlbums.map(al => (
                    <Link key={al.id} href={`/albumai/${al.slug}`} target="_blank" className="ac-alb">
                      {al.img ? <img src={al.img} alt="" referrerPolicy="no-referrer" loading="lazy" /> : <span className="ac-ph sm">♪</span>}
                      <span className="ac-albt">{al.t}</span>
                      <span className="ac-alby">{al.y}</span>
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="ac-empty">Šios eros albumų bazėje nėra.</p>
              )}
            </div>

            {d.otherAlbums.length > 0 && (
              <p className="ac-other">
                Dar {d.otherAlbums.length} albumai už šios eros ribų — ten atlikėjas jau kitoje teritorijoje.
              </p>
            )}

            <div className="ac-cta">
              <button className="dig" onClick={() => onDig(d.artist.id, d.artist.name)}>Kastis gilyn nuo čia →</button>
              <Link href={`/atlikejai/${d.artist.slug}`} target="_blank" className="full">Visas puslapis ↗</Link>
            </div>
          </>
        )}
      </div>

      <style>{`
.ac-back { position: fixed; inset: 0; z-index: 80; background: rgba(6,9,14,0.8); backdrop-filter: blur(5px); display: flex; align-items: flex-end; justify-content: center; }
.ac { width: 100%; max-width: 560px; max-height: 90vh; overflow-y: auto; overscroll-behavior: contain; background: #151b24; border-radius: 20px 20px 0 0; padding: 12px 16px calc(18px + env(safe-area-inset-bottom)); }
@media (min-width: 640px) { .ac-back { align-items: center; } .ac { border-radius: 20px; max-height: 86vh; } }
.ac-back-btn { background: transparent; border: 0; color: #8794a6; font-size: 12.5px; font-weight: 700; cursor: pointer; padding: 4px 0 10px; min-height: 32px; }
.ac-back-btn:hover { color: #dbe4ef; }
.ac-hero { display: flex; gap: 12px; align-items: center; }
.ac-hero > img { width: 84px; height: 84px; border-radius: 14px; object-fit: cover; flex-shrink: 0; }
.ac-ph { width: 84px; height: 84px; border-radius: 14px; background: #0e1219; color: #3c4653; display: flex; align-items: center; justify-content: center; font-size: 26px; flex-shrink: 0; }
.ac-ph.sm { width: 100%; aspect-ratio: 1; height: auto; border-radius: 10px; font-size: 18px; }
.ac-heroin h3 { margin: 0; font-size: 20px; font-weight: 800; color: #eef3f9; letter-spacing: -0.01em; }
.ac-sub { margin: 2px 0 6px; font-size: 12px; font-weight: 700; color: #7f8b9c; }
.ac-state span { display: inline-block; font-size: 11.5px; font-weight: 700; color: #7f8b9c; padding: 3px 9px; border-radius: 999px; background: rgba(255,255,255,0.05); }
.ac-state .on.liked { color: #ffb694; background: rgba(224,99,44,0.18); }
.ac-state .on.heard { color: #a9cdf5; background: rgba(59,134,216,0.18); }
.ac-bio { margin: 12px 0 0; font-size: 13px; line-height: 1.55; color: #a8b3c2; }
.ac-sec { margin-top: 16px; }
.ac-lbl { display: flex; align-items: baseline; gap: 6px; font-size: 11px; font-weight: 700; color: #7f8b9c; margin-bottom: 8px; }
.ac-lbl b { color: #e0632c; }
.ac-albums { display: grid; grid-template-columns: repeat(auto-fill, minmax(92px, 1fr)); gap: 9px; }
.ac-alb { display: block; text-decoration: none; }
.ac-alb img { width: 100%; aspect-ratio: 1; object-fit: cover; border-radius: 10px; display: block; }
.ac-alb:hover img { outline: 2px solid #e0632c; outline-offset: -2px; }
.ac-albt { display: block; margin-top: 5px; font-size: 11px; font-weight: 700; color: #dbe4ef; line-height: 1.25; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ac-alby { display: block; font-size: 10.5px; color: #6d7889; font-family: ui-monospace, monospace; }
.ac-empty, .ac-other { margin: 8px 0 0; font-size: 12px; color: #6d7889; }
.ac-cta { display: flex; gap: 8px; margin-top: 18px; }
.ac-cta .dig { flex: 1; padding: 13px; border: 0; border-radius: 12px; background: #e0632c; color: #fff; font-size: 13.5px; font-weight: 800; cursor: pointer; min-height: 46px; }
.ac-cta .dig:hover { background: #ef7440; }
.ac-cta .full { display: flex; align-items: center; justify-content: center; padding: 13px 15px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.12); color: #b6c1d0; font-size: 12.5px; font-weight: 700; text-decoration: none; }
.ac-load { display: flex; gap: 8px; justify-content: center; padding: 46px 0; }
.ac-load span { width: 9px; height: 9px; border-radius: 50%; background: #2b3441; animation: acp 1s ease-in-out infinite; }
.ac-load span:nth-child(2) { animation-delay: 0.15s } .ac-load span:nth-child(3) { animation-delay: 0.3s }
@keyframes acp { 0%,100% { opacity: 0.3 } 50% { opacity: 1 } }
`}</style>
    </div>
  )
}
