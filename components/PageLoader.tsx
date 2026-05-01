// Bendras loader — naudojamas:
//   1. /app/**/loading.tsx faile'uose (kliento navigacijai per Link)
//   2. <Suspense fallback={...}> page.tsx viduje (SSR streaming'ui)
//
// Po greitaveikos optimizacijų force-dynamic puslapiai vis dar trunka 1-3s
// SSR — be šio loader'io naudotojas matytų tuščią ekraną tarp top menu ir
// content'o. Dabar — visa SSR atsako early bytes turi šį skeleton'ą,
// vėlesni bytes stream'ina realų content'ą į <Suspense>.
//
// Stilius — toks pat kaip MasterSearch'o BigEqualizer (.eq-loader-big iš
// globals.css). Brand mark + equalizer + subtle structural hint, kad
// naudotojas matytų layout'o formą iš anksto.

export type PageLoaderVariant = 'artist' | 'album' | 'track' | 'generic'

export function PageLoader({ variant = 'generic' }: { variant?: PageLoaderVariant }) {
  return (
    <div style={{ maxWidth: 1280, margin: '0 auto', padding: '20px 16px' }}>
      {/* Centruotas brand + equalizer — visada matomas */}
      <div style={{
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        gap: 18, padding: '60px 16px 40px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', opacity: 0.7 }}>
          <span style={{ fontFamily: 'Outfit,sans-serif', fontWeight: 900, fontSize: 22, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>music.</span>
          <span style={{ fontFamily: 'Outfit,sans-serif', fontWeight: 900, fontSize: 22, color: '#f97316', letterSpacing: '-0.01em' }}>lt</span>
        </div>
        <span className="eq-loader-big" aria-label="Loading">
          <span /><span /><span /><span /><span />
        </span>
      </div>

      {/* Structural hints — match'ina realią page'o struktūrą per variant */}
      {variant === 'artist' && <ArtistHints />}
      {variant === 'album' && <AlbumHints />}
      {variant === 'track' && <TrackHints />}
    </div>
  )
}

function ArtistHints() {
  return (
    <>
      <div style={{ display: 'flex', gap: 16, marginBottom: 24 }}>
        <div className="hp-skel-soft" style={{ width: 130, height: 130, borderRadius: 14, flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <div className="hp-skel-soft" style={{ height: 26, width: '40%', marginBottom: 12 }} />
          <div className="hp-skel-soft" style={{ height: 12, width: '70%', marginBottom: 6 }} />
          <div className="hp-skel-soft" style={{ height: 12, width: '60%' }} />
        </div>
      </div>
      <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))' }}>
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i}>
            <div className="hp-skel-soft" style={{ aspectRatio: '1', borderRadius: 10, marginBottom: 6 }} />
            <div className="hp-skel-soft" style={{ height: 11, width: '80%', marginBottom: 4 }} />
            <div className="hp-skel-soft" style={{ height: 9, width: '55%' }} />
          </div>
        ))}
      </div>
    </>
  )
}

function AlbumHints() {
  return (
    <>
      <div style={{ display: 'flex', gap: 18, marginBottom: 18, maxWidth: 900, marginLeft: 'auto', marginRight: 'auto' }}>
        <div className="hp-skel-soft" style={{ width: 200, height: 200, borderRadius: 14, flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <div className="hp-skel-soft" style={{ height: 12, width: 70, marginBottom: 14 }} />
          <div className="hp-skel-soft" style={{ height: 28, width: '60%', marginBottom: 12 }} />
          <div className="hp-skel-soft" style={{ height: 14, width: '40%' }} />
        </div>
      </div>
      <div style={{ maxWidth: 900, marginLeft: 'auto', marginRight: 'auto' }}>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '9px 12px', marginBottom: 4 }}>
            <div className="hp-skel-soft" style={{ width: 22, height: 12 }} />
            <div className="hp-skel-soft" style={{ flex: 1, height: 14 }} />
          </div>
        ))}
      </div>
    </>
  )
}

function TrackHints() {
  return (
    <div style={{ maxWidth: 900, marginLeft: 'auto', marginRight: 'auto' }}>
      <div style={{ display: 'flex', gap: 18, marginBottom: 18 }}>
        <div className="hp-skel-soft" style={{ width: 200, height: 200, borderRadius: 14, flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <div className="hp-skel-soft" style={{ height: 12, width: 80, marginBottom: 14 }} />
          <div className="hp-skel-soft" style={{ height: 26, width: '70%', marginBottom: 12 }} />
          <div className="hp-skel-soft" style={{ height: 14, width: '40%' }} />
        </div>
      </div>
      <div className="hp-skel-soft" style={{ height: 200, marginBottom: 16, borderRadius: 12 }} />
    </div>
  )
}
