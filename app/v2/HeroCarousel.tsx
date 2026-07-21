'use client'
// Interaktyvus hero: slankiojama juosta + taškų indikatorius + rodyklės.
// Hover efektas TIK kortelės viduje (nuotraukos zoom), be kampų glitch'o
// (nekeičiam kortelės transform, todėl border-radius nesikapoja).
import { useRef, useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { proxyImgResized } from '@/lib/img-proxy'

type Slide = { href: string; bgImg: string | null; chip: string | null; chipBg: string; title: string; subtitle?: string | null; fresh?: boolean }

export default function HeroCarousel({ slides }: { slides: Slide[] }) {
  const ref = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState(0)

  const slotW = () => {
    const el = ref.current
    const slot = el?.querySelector('.v2-hslot') as HTMLElement | null
    return slot ? slot.offsetWidth + 16 : (el?.clientWidth || 1)
  }
  const onScroll = useCallback(() => {
    const el = ref.current
    if (!el) return
    setActive(Math.round(el.scrollLeft / slotW()))
  }, [])
  const go = (i: number) => {
    const el = ref.current
    if (!el) return
    const n = Math.max(0, Math.min(slides.length - 1, i))
    el.scrollTo({ left: n * slotW(), behavior: 'smooth' })
  }

  // Švelnus autoplay — sustoja ties užvedimu; nekliūva jei vartotojas slankioja.
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
      const w = slotW()
      const next = (Math.round(el.scrollLeft / w) + 1) % slides.length
      el.scrollTo({ left: next * w, behavior: 'smooth' })
    }, 6000)
    return () => { clearInterval(id); el.removeEventListener('pointerenter', enter); el.removeEventListener('pointerleave', leave) }
  }, [slides.length])

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
        </div>
        <button className="v2-hero-arrow right" onClick={() => go(active + 1)} aria-label="Kitas">›</button>
      </div>
      <div className="v2-hdots">
        {slides.map((_, i) => (
          <button key={i} className={`v2-hdot${i === active ? ' on' : ''}`} onClick={() => go(i)} aria-label={`Slide ${i + 1}`} />
        ))}
      </div>
    </section>
  )
}
