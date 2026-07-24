'use client'
// /v2 MOBILE hero — v1 „story/reels" juostos vizualas: horizontaliai slenkanti
// 156×236 istorijų juosta (chip + antraštė + „nauja per 24h" taškas). Rodoma TIK
// ant mobile (≤768px); desktop rodo HeroSlider korteles. Paspaudus — atidaro
// pilno ekrano v1 reels reader'į (horizontalus swipe + vertikalus skaitymas +
// čartų/dienos dainos balsavimo sheet'ai).
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { proxyImgResized } from '@/lib/img-proxy'
import { useSite } from '@/components/SiteContext'
import type { HeroSlide } from './HeroSlider'
import { ReelsOverlay, ChartBottomSheet, DailyVoteSheet, slideKey } from './reels/ReelsReader'
import { isTopVoted, chartTypeToTop } from '@/lib/top-voted'
import { useHeroSeen } from './useHeroSeen'

export default function MobileHero({ slides: allSlides }: { slides: HeroSlide[] }) {
  const { dk } = useSite()
  // Prabalsuoti topai pasislepia iš juostos/reels iki kitos savaitės (po mount).
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])
  const slides = allSlides.filter((s) => !(mounted && isTopVoted(chartTypeToTop(s.type))))
  const [reelsOpen, setReelsOpen] = useState(false)
  const [reelsIdx, setReelsIdx] = useState(0)
  // „peržiūrėta" žymėjimas — prisijungusiems SURIŠTA per įrenginius (server),
  // svečiams localStorage. Tas pats hook'as kaip desktop HeroSlider.
  const { seen: seenSlides, ready: seenReady, markSeen } = useHeroSeen()
  const [chartSheet, setChartSheet] = useState<{ topType: 'lt_top30' | 'top40'; title: string; accent: string } | null>(null)
  const [dailySheetOpen, setDailySheetOpen] = useState(false)

  if (!slides.length) return null
  return (
    <div className="v2-mhero">
      <style>{`
        .v2-mhero{display:none}
        @media(max-width:768px){.v2-mhero{display:block;margin:0 0 2px}}
        .v2-mhero-strip{display:flex;gap:12px;height:240px;align-items:stretch;overflow-x:auto;padding:2px 0;scrollbar-width:none;-webkit-overflow-scrolling:touch;scroll-snap-type:x mandatory}
        .v2-mhero-strip::-webkit-scrollbar{display:none}
        .v2-mhero-card{flex-shrink:0;position:relative;width:156px;height:236px;border-radius:16px;overflow:hidden;background:#000;display:block;scroll-snap-align:start;box-shadow:var(--hero-card-shadow);text-decoration:none;padding:0;text-align:left;cursor:pointer}
      `}</style>
      <div className="v2-mhero-strip">
        {slides.map((s, i) => {
          const isChart = s.type === 'chart_lt' || s.type === 'chart_world'
          const ytT = (v?: string | null) => v ? `https://img.youtube.com/vi/${v}/hqdefault.jpg` : null
          const bg = s.bgImg || (isChart ? (s.chartTops?.[0]?.cover_url || ytT(s.chartTops?.[0]?.videoId) || s.chartTops?.[0]?.artist_image || null) : null)
          const artistName = s.type === 'event' ? null : (s.artist?.name || null)
          const showArtist = !!artistName && !s.title.toLowerCase().includes(artistName.toLowerCase())
          const showExcerpt = (s.type === 'event' || s.type === 'verta' || s.type === 'recording' || s.type === 'community') && !!s.subtitle && s.subtitle.length > 5
          // Border = „neskaityta" indikatorius: oranžinis kol vartotojas
          // neatidarė (peržiūrėta žymima per reels_seen su slideKey — TAS PAT
          // raktas kaip ReelsOverlay onSeen ir desktop), neutralus po to.
          // Kol seen dar neužkrautas (seenReady=false) — traktuojam kaip „seen"
          // (neutralus borderis), kad neblyksėtų oranžinis ant jau skaitytų.
          const isSeen = !seenReady || seenSlides.has(slideKey(s))
          return (
            <button
              key={`${s.type}-${s.href}`}
              type="button"
              onClick={() => { setReelsIdx(i); setReelsOpen(true) }}
              className="v2-mhero-card"
              style={{ border: isSeen ? '2px solid var(--border-default)' : '2px solid var(--accent-orange)' }}
            >
              {bg
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={proxyImgResized(bg, 480)} alt="" decoding="async" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                : <div style={{ width: '100%', height: '100%', background: 'linear-gradient(135deg,#0a1428,#162040)' }} />}
              <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.55) 35%, rgba(0,0,0,0.10) 60%, rgba(0,0,0,0) 75%)' }} />
              <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '10px 12px 12px', textAlign: 'left' }}>
                <p style={{ fontSize: 13.5, fontWeight: 800, color: '#fff', margin: 0, lineHeight: 1.18, fontFamily: 'Outfit,sans-serif', display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical', overflow: 'hidden', textOverflow: 'ellipsis', letterSpacing: '-0.01em' } as React.CSSProperties}>{s.title}</p>
                {showExcerpt && (
                  <p style={{ fontSize: 12, fontWeight: 500, color: 'rgba(255,255,255,0.82)', margin: '5px 0 0', lineHeight: 1.3, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', textOverflow: 'ellipsis' } as React.CSSProperties}>{s.subtitleShort || s.subtitle}</p>
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
              {(!!s.likeCount || !!s.commentCount) && (
                <div style={{ position: 'absolute', top: 8, right: 8, zIndex: 2, display: 'flex', alignItems: 'center', gap: 8, padding: '3px 8px', borderRadius: 999, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}>
                  {!!s.likeCount && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11.5, fontWeight: 700, color: '#fff', fontFamily: 'Outfit,sans-serif' }}>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="var(--accent-orange)" aria-hidden><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" /></svg>
                      {s.likeCount}
                    </span>
                  )}
                  {!!s.commentCount && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11.5, fontWeight: 700, color: '#fff', fontFamily: 'Outfit,sans-serif' }}>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" /></svg>
                      {s.commentCount}
                    </span>
                  )}
                </div>
              )}
            </button>
          )
        })}
        <Link href="/naujienos" className="v2-mhero-card" style={{ border: '2px dashed var(--border-strong)', background: 'var(--bg-surface)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
          <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 44, height: 44, borderRadius: '50%', border: '1px solid var(--border-strong)', color: 'var(--text-muted)' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
          </span>
          <span style={{ fontFamily: 'Outfit,sans-serif', fontSize: 14, fontWeight: 800, color: 'var(--text-primary)' }}>Daugiau naujienų</span>
        </Link>
      </div>

      {/* ═══════════ REELS OVERLAY — horizontal stories (v1 verbatim) ═══════════ */}
      {reelsOpen && (
        <ReelsOverlay
          slides={slides}
          initialIdx={reelsIdx}
          seenSlides={seenSlides}
          onSeen={markSeen}
          onClose={() => setReelsOpen(false)}
          onChartVote={(s) => setChartSheet({
            topType: s.type === 'chart_lt' ? 'lt_top30' : 'top40',
            title: s.title,
            accent: s.type === 'chart_lt' ? 'var(--accent-orange)' : '#3b82f6',
          })}
          onDailyVote={() => setDailySheetOpen(true)}
          dk={dk}
        />
      )}

      {/* ═══════════ CHART BOTTOM SHEET ═══════════ */}
      <ChartBottomSheet
        open={chartSheet != null}
        onClose={() => setChartSheet(null)}
        topType={chartSheet?.topType || 'lt_top30'}
        title={chartSheet?.title || 'TOPAS'}
        accent={chartSheet?.accent || 'var(--accent-orange)'}
      />

      {/* ═══════════ DIENOS DAINA — balsavimas + siūlymas (sheet) ═══════════ */}
      {dailySheetOpen && <DailyVoteSheet onClose={() => setDailySheetOpen(false)} />}
    </div>
  )
}
