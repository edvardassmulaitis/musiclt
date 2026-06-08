/* ─────────────── RadarSweepMini ───────────────
   Bendrinis radaro „sweep" SVG — identiškas /nauji-atlikejai puslapio
   RadarSweep (components/radaras-ui.tsx) dekorui, tik dydis valdomas per
   `size` prop. Naudojamas nav dropdown'e (Muzika → Naujos muzikos radaras)
   ir gali būti naudojamas kitur.

   Vizualas: 3 koncentriniai žiedai (radialGradient), besisukantis sweep
   spindulys (linearGradient, animateTransform), oranžinis blip sekantis
   spindulį, ir centrinis ekvalaizeris (CSS animuojami bar'ai).

   SVG id'ai (rdm-rg / rdm-sw) tyčia kiti nei puslapio (rdg / rdsweep), kad
   nebūtų <defs> id kolizijos kai abu komponentai egzistuoja tame pačiame DOM.
*/

const RDM_BARS = [
  { x: 88, h: 14, d: '0s' },
  { x: 94, h: 26, d: '.25s' },
  { x: 100, h: 34, d: '.1s' },
  { x: 106, h: 22, d: '.4s' },
  { x: 112, h: 16, d: '.2s' },
]

export function RadarSweepMini({ size = 40 }: { size?: number }) {
  return (
    <>
      <style>{`
        .rdm-eq rect { animation: rdm-eq 1.1s ease-in-out infinite alternate; }
        @keyframes rdm-eq { from { transform: scaleY(0.35); } to { transform: scaleY(1); } }
      `}</style>
      <svg width={size} height={size} viewBox="0 0 200 200" aria-hidden style={{ flexShrink: 0 }}>
        <defs>
          <radialGradient id="rdm-rg" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(34,197,94,0)" />
            <stop offset="78%" stopColor="rgba(34,197,94,0)" />
            <stop offset="100%" stopColor="rgba(34,197,94,0.5)" />
          </radialGradient>
          <linearGradient id="rdm-sw" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="rgba(249,115,22,0)" />
            <stop offset="100%" stopColor="rgba(249,115,22,0.4)" />
          </linearGradient>
        </defs>
        {[44, 68, 92].map((r) => (
          <circle key={r} cx="100" cy="100" r={r} fill="none" stroke="url(#rdm-rg)" strokeWidth="1" opacity="0.7" />
        ))}
        {/* besisukantis skenavimo spindulys */}
        <g>
          <animateTransform attributeName="transform" type="rotate" from="0 100 100" to="360 100 100" dur="6s" repeatCount="indefinite" />
          <path d="M100 100 L100 8 A92 92 0 0 1 165 35 Z" fill="url(#rdm-sw)" />
        </g>
        {/* blip seka spindulį */}
        <g>
          <animateTransform attributeName="transform" type="rotate" from="0 100 100" to="360 100 100" dur="6s" repeatCount="indefinite" />
          <circle cx="156" cy="78" r="3.2" fill="var(--accent-orange)" />
        </g>
        {/* centro ekvalaizeris */}
        <g className="rdm-eq">
          {RDM_BARS.map((b, i) => (
            <rect key={i} x={b.x} width="3.4" rx="1.4" y={100 - b.h / 2} height={b.h}
              fill="var(--accent-green)" style={{ transformOrigin: `${b.x + 1.7}px 100px`, animationDelay: b.d }} />
          ))}
        </g>
      </svg>
    </>
  )
}
