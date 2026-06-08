'use client';

// components/ui/Scroller.tsx
//
// Lengva horizontali eilė — vienas bendras apvalkalas visoms „karuselėms".
// Pakeičia storą „Visi" mygtuką-kortelę eilės gale:
//   • peek (paskutinė kortelė matosi pusiau)
//   • krašto fade (mask-image) — tik tose pusėse, kur dar yra ką slinkti
//   • scroll-snap
//   • desktop: ◀ ▶ rodyklės ant hover (mobile — tik svaipymas)
//
// SVARBU: kortelės paduodamos kaip `children` ir NEKEIČIAMOS. Layout'as flex,
// todėl kiekviena kortelė išlaiko savo pločio (w-[...]) klases — nieko
// nepertapetuoja. Vizualinis etalonas — HANDOFF-scroller.md.

import { useEffect, useRef, useState, type ReactNode } from 'react';

type ScrollerProps = {
  children: ReactNode;
  /** tarpas tarp kortelių px. default 16 */
  gap?: number;
  /** papildomos klasės track'ui (pvz. pakeisti padding) */
  trackClassName?: string;
  className?: string;
  ariaLabel?: string;
};

export default function Scroller({
  children,
  gap = 16,
  trackClassName = '',
  className = '',
  ariaLabel = 'Slinkti',
}: ScrollerProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(true);

  const update = () => {
    const el = trackRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth - 2;
    setAtStart(el.scrollLeft <= 2);
    setAtEnd(el.scrollLeft >= max);
  };

  useEffect(() => {
    update();
    const el = trackRef.current;
    if (!el) return;
    el.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    // turinys gali užsikrauti vėliau (fetch) — perskaičiuojam kai keičiasi dydis
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null;
    if (ro) ro.observe(el);
    return () => {
      el.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
      ro?.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const nudge = (dir: 1 | -1) => {
    const el = trackRef.current;
    if (!el) return;
    el.scrollBy({ left: Math.round(el.clientWidth * 0.8) * dir, behavior: 'smooth' });
  };

  return (
    <div className={`hrow ${atStart ? 'at-start' : ''} ${atEnd ? 'at-end' : ''} ${className}`}>
      <button
        type="button"
        className="hrow-arrow prev"
        aria-label={`${ariaLabel} atgal`}
        tabIndex={-1}
        onClick={() => nudge(-1)}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4}>
          <path d="m15 18-6-6 6-6" />
        </svg>
      </button>
      <button
        type="button"
        className="hrow-arrow next"
        aria-label={`${ariaLabel} pirmyn`}
        tabIndex={-1}
        onClick={() => nudge(1)}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4}>
          <path d="m9 18 6-6-6-6" />
        </svg>
      </button>
      <div
        ref={trackRef}
        className={`hrow-track ${trackClassName}`}
        style={{ ['--gap' as string]: `${gap}px` }}
      >
        {children}
      </div>
    </div>
  );
}
