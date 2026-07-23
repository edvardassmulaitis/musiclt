'use client'
// /v2 MOBILE hero — v1 „story/reels" juostos vizualas: horizontaliai slenkanti
// 156×236 istorijų juosta (chip + antraštė + „nauja per 24h" taškas). Rodoma TIK
// ant mobile (≤768px); desktop rodo HeroSlider korteles. Paspaudus — atidaro
// straipsnį/puslapį (pilno ekrano swipe reader'is — kitas žingsnis).
import Link from 'next/link'
import { proxyImgResized } from '@/lib/img-proxy'
import type { HeroSlide } from './HeroSlider'

export default function MobileHero({ slides }: { slides: HeroSlide[] }) {
  if (!slides.length) return null
  return (
    <div className="v2-mhero">
      <style>{`
        .v2-mhero{display:none}
        @media(max-width:768px){.v2-mhero{display:block;margin:0 0 2px}}
        .v2-mhero-strip{display:flex;gap:12px;height:240px;align-items:stretch;overflow-x:auto;padding:2px 0;scrollbar-width:none;-webkit-overflow-scrolling:touch;scroll-snap-type:x mandatory}
        .v2-mhero-strip::-webkit-scrollbar{display:none}
        .v2-mhero-card{flex-shrink:0;position:relative;width:156px;height:236px;border-radius:16px;overflow:hidden;background:#000;display:block;scroll-snap-align:start;box-shadow:var(--hero-card-shadow);text-decoration:none}
        .v2-mhero-freshdot{width:8px;height:8px;border-radius:50%;background:var(--accent-green);box-shadow:0 0 0 2px #000,0 0 6px 1.5px rgba(34,197,94,.85)}
      `}</style>
      <div className="v2-mhero-strip">
        {slides.map((s) => {
          const isChart = s.type === 'chart_lt' || s.type === 'chart_world'
          const bg = s.bgImg || (isChart ? (s.chartTops?.[0]?.cover_url || s.chartTops?.[0]?.artist_image || null) : null)
          const artistName = s.type === 'event' ? null : (s.artist?.name || null)
          const showArtist = !!artistName && !s.title.toLowerCase().includes(artistName.toLowerCase())
          const showExcerpt = s.type === 'event' && !!s.subtitle && s.subtitle.length > 5
          return (
            <Link
              key={`${s.type}-${s.href}`}
              href={s.href}
              className="v2-mhero-card"
              style={{ border: s.fresh24 ? '2px solid var(--accent-green)' : '2px solid var(--accent-orange)' }}
            >
              {bg
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={proxyImgResized(bg, 480)} alt="" decoding="async" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                : <div style={{ width: '100%', height: '100%', background: 'linear-gradient(135deg,#0a1428,#162040)' }} />}
              <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.55) 35%, rgba(0,0,0,0.10) 60%, rgba(0,0,0,0) 75%)' }} />
              <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '10px 12px 12px', textAlign: 'left' }}>
                <p style={{ fontSize: 14, fontWeight: 800, color: '#fff', margin: 0, lineHeight: 1.2, fontFamily: 'Outfit,sans-serif', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden', textOverflow: 'ellipsis', letterSpacing: '-0.01em' } as React.CSSProperties}>{s.title}</p>
                {showExcerpt && (
                  <p style={{ fontSize: 12, fontWeight: 500, color: 'rgba(255,255,255,0.82)', margin: '5px 0 0', lineHeight: 1.3, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', textOverflow: 'ellipsis' } as React.CSSProperties}>{s.subtitle}</p>
                )}
                {showArtist && (
                  <p style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.78)', margin: '4px 0 0', lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{artistName}</p>
                )}
              </div>
              {s.chip !== 'NAUJIENA' && (
                <div style={{ position: 'absolute', top: 10, left: 10, zIndex: 2 }}>
                  <span style={{ padding: '3px 7px', borderRadius: 6, fontSize: 12, fontWeight: 700, color: '#fff', background: s.chipBg, fontFamily: 'Outfit,sans-serif', letterSpacing: '0.025em', textTransform: 'uppercase' }}>{s.chip}</span>
                </div>
              )}
              {s.fresh24 && <span className="v2-mhero-freshdot" style={{ position: 'absolute', top: 10, right: 10, zIndex: 3 }} />}
            </Link>
          )
        })}
        <Link href="/naujienos" className="v2-mhero-card" style={{ border: '2px dashed var(--border-strong)', background: 'var(--bg-surface)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
          <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 44, height: 44, borderRadius: '50%', border: '1px solid var(--border-strong)', color: 'var(--text-muted)' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
          </span>
          <span style={{ fontFamily: 'Outfit,sans-serif', fontSize: 14, fontWeight: 800, color: 'var(--text-primary)' }}>Daugiau naujienų</span>
        </Link>
      </div>
    </div>
  )
}
