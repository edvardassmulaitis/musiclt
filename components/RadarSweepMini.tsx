/* ─────────────── RadarSweepMini ───────────────
   Bendrinis radaro + ekvalaizerio ženkliukas. Vienas dizainas, naudojamas
   visur per `size` prop: top-nav (~32px), Muzika dropdown badge (36px) ir
   /nauji-atlikejai hero (150px). Dideliam dydžiui (size >= 72) papildomai
   piešiamas vidinis žiedas ir plonesni brūkšniai, kad atrodytų rafinuotai.

   Dizainas: oranžinis radaras (žiedas + sukamasis sweep + skenavimo linija) su
   oranžiniu ekvalaizeriu apačioje-centre (atitinka loader'io EQ) ir vienu žaliu
   „blip" tašku = aptikta nauja muzika. Spalvos per CSS kintamuosius
   (--accent-orange / --accent-green). EQ animacija per lokalų <style>; sweep ir
   blip — per SMIL animateTransform/animate (veikia visuose browser'iuose).
*/

const RDM_BARS = [
  { x: 20, h: 8, d: '.1s' },
  { x: 25.5, h: 12, d: '.3s' },
  { x: 31, h: 16, d: '0s' },
  { x: 36.5, h: 11, d: '.35s' },
  { x: 42, h: 7, d: '.2s' },
]

export function RadarSweepMini({ size = 40, className }: { size?: number; className?: string }) {
  const big = size >= 72
  const ringW = big ? 1.6 : 2.6
  const lineW = big ? 1.6 : 2.4
  const blipR = big ? 2.2 : 2.4
  return (
    <>
      <style>{`
        .rdm-eq rect { animation: rdm-eq 1s ease-in-out infinite alternate; }
        @keyframes rdm-eq { from { transform: scaleY(0.32); } to { transform: scaleY(1); } }
      `}</style>
      <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden className={className} style={{ flexShrink: 0 }}>
        {/* radaro žiedai */}
        <circle cx="32" cy="32" r="28" fill="none" stroke="var(--accent-orange)" strokeWidth={ringW} opacity={big ? 0.5 : 0.55} />
        {big && <circle cx="32" cy="32" r="19" fill="none" stroke="var(--accent-orange)" strokeWidth={1} opacity={0.3} />}
        {/* besisukantis sweep + skenavimo linija + žalias blip */}
        <g>
          <animateTransform attributeName="transform" type="rotate" from="0 32 32" to="360 32 32" dur="3s" repeatCount="indefinite" />
          <path d="M32 32 L32 4 A28 28 0 0 1 54 13 Z" fill="var(--accent-orange)" opacity="0.2" />
          <line x1="32" y1="32" x2="32" y2="4" stroke="var(--accent-orange)" strokeWidth={lineW} strokeLinecap="round" />
          <circle cx="51" cy="16" r={blipR} fill="var(--accent-green)">
            <animate attributeName="opacity" values="0;0;1;1;0.1" keyTimes="0;0.18;0.3;0.8;1" dur="3s" repeatCount="indefinite" />
          </circle>
        </g>
        {/* ekvalaizeris (banga) apačioje-centre */}
        <g className="rdm-eq" fill="var(--accent-orange)">
          {RDM_BARS.map((b, i) => (
            <rect key={i} x={b.x} y={42 - b.h} width="3" height={b.h} rx="1.4"
              style={{ transformBox: 'fill-box', transformOrigin: 'center bottom', animationDelay: b.d }} />
          ))}
        </g>
      </svg>
    </>
  )
}
