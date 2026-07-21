'use client'
// Interaktyvus hero: slankiojama juosta + taškų indikatorius + rodyklės.
// Paskutinis elementas — „Daugiau naujienų" (kaip v1). Aktyvus taškas
// skaičiuojamas pagal artimiausią centrą (kad paskutinis, prisiglaudęs prie
// dešinės, irgi būtų pasiekiamas). Hover efektas TIK viduje (be kampų glitch'o).
import { useRef, useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { proxyImgResized } from '@/lib/img-proxy'

type Slide = { href: string; bgImg: string | null; chip: string | null; chipBg: string; title: string; subtitle?: string | null; fresh?: boolean }

export default function HeroCarousel({ slides }: { slides: Slide[] }) {
  const ref = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState(0)
  const count = slides.length + 1 // + „Daugiau naujienų"

  const slots = () => Array.from(ref.current?.querySelectorAll('.v2-hslot') || []) as HTMLElement[]
  const onScroll = useCallback(() => {
    const el = ref.current
    if (!el) return
    const center = el.scrollLeft + el.clientWidth / 2
    let best = 0, bestD = Infinity
    slots().forEach((s, i) => {
      const c = s.offsetLeft + s.offsetWidth / 2
      const d = Math.abs(c - center)
      if (d < bestD) { bestD = d; best = i }
    })
    setActive(best)
  }, [])
  const go = (i: number) => {
    const el = ref.current
    if (!el) return
    const n = Math.max(0, Math.min(count - 1, i))
    const s = slots()[n]
    if (s) el.scrollTo({ left: s.offsetLeft - 4, behavior: 'smooth' })
  }

  useEffect(() => {
    const el = ref.current
    if (!el || slides.length < 2) return
    let paused = false
    const enter = () => { paused = true }
    const leave = () => { paused = false }
    el.addEventListener('pointerenter', enter)
    el.addEventListener('pointerleave', leave)
    const id = setInterval(() => {
      if (paused) return
      const cur = active
      go(cur + 1 >= slides.length ? 0 : cur + 1)
    }, 6000)
    return () => { clearInterval(id); el.removeEventListener('pointerenter', enter); el.removeEventListener('pointerleave', leave) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slides.length, active])

  if (!slides.length) return null
  return (
    <section className="v2-hero">
      <div className="v2-hero-wrap">
        <button className="v2-hero-arrow left" onClick={() => go(active - 1)} aria-label="Ankstesnis">‹</button>
        <div className="v2-htrack" ref={ref} onScroll={onScroll}>
          {slides.map((s, i) => (
            <div key={i} className="v2-hslot">
              <Link href={s.href} className="v2-hcard">
                <span className="v2-hcard-img">
                  {s.bgImg && (/* eslint-disable-next-line @next/next/no-img-element */<img src={proxyImgResized(s.bgImg, 1280)} alt="" decoding="async" />)}
                </span>
                {s.chip && <span className="v2-hcard-chip" style={{ background: s.chipBg }}>{s.chip}</span>}
                <span className="v2-hcard-scrim" />
                <span className="v2-hcard-body">
                  <span className="v2-hcard-title">{s.title}</span>
                  {s.subtitle && (
                    <span className="v2-hcard-sub">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 11h18" /></svg>
                      {s.subtitle}
                    </span>
                  )}
                </span>
              </Link>
            </div>
          ))}
          {/* Daugiau naujienų — dashed kortelė kaip v1 (viena eilutė, apskritas rodyklės ženklas) */}
          <div className="v2-hslot v2-hslot-more">
            <Link href="/naujienos" className="v2-hmore">
              <span className="v2-hmore-ic">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
              </span>
              <span className="v2-hmore-t">Daugiau naujienų</span>
            </Link>
          </div>
        </div>
        <button className="v2-hero-arrow right" onClick={() => go(active + 1)} aria-label="Kitas">›</button>
      </div>
      <div className="v2-hdots">
        {Array.from({ length: count }).map((_, i) => (
          <button key={i} className={`v2-hdot${i === active ? ' on' : ''}`} onClick={() => go(i)} aria-label={`${i + 1}`} />
        ))}
      </div>
    </section>
  )
}
