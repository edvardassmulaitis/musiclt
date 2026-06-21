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

export type PageLoaderVariant =
  | 'artist' | 'album' | 'track' | 'generic'
  | 'list' | 'grid' | 'article'

export function PageLoader({ variant = 'generic' }: { variant?: PageLoaderVariant }) {
  // Browse'o puslapiams (sąrašai / tinkleliai / straipsniai) — skeleton'as
  // VIRŠUJE, ne 70vh centruotas equalizer. Naudotojas iš karto mato būsimo
  // turinio formą, ne tuščią ekraną su krutančiu equalizer'iu.
  if (variant === 'list' || variant === 'grid' || variant === 'article') {
    return (
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: '20px 16px' }}>
        {/* Kompaktiškas antraštės hint'as + mini equalizer dešinėje */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 22 }}>
          <div style={{ flex: 1 }}>
            <div className="hp-skel-soft" style={{ height: 24, width: '34%', maxWidth: 280, marginBottom: 10 }} />
            <div className="hp-skel-soft" style={{ height: 12, width: '52%', maxWidth: 420 }} />
          </div>
          <span className="eq-loader-big" aria-label="Kraunama" style={{ flexShrink: 0, opacity: 0.7 }}>
            <span /><span /><span /><span /><span />
          </span>
        </div>
        {variant === 'list' && <ListHints />}
        {variant === 'grid' && <GridHints />}
        {variant === 'article' && <ArticleHints />}
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 1280, margin: '0 auto', padding: '20px 16px' }}>
      {/* Centruotas equalizer + tagline. Music.lt logo pašalintas — jis
          jau matosi site header'yje, dvigubėdavo per loading state'ą.
          „Tavo muzikos pasaulis" tagline'as suteikia šiltą identitetą.
          2026-05-21: min-height 70vh — kad loader'is sėdėtų vertikaliai
          centruotame viewport'e, ne arti viršaus. Hints'ai lieka apačioje
          (scroll'inant matomi). */}
      <div style={{
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        gap: 16, padding: '20px 16px', minHeight: '70vh',
      }}>
        <span className="eq-loader-big" aria-label="Loading">
          <span /><span /><span /><span /><span />
        </span>
        <div style={{
          fontFamily: 'Outfit,sans-serif', fontWeight: 600, fontSize: 14,
          color: 'var(--text-muted)', letterSpacing: '0.03em', opacity: 0.85,
        }}>
          Tavo muzikos pasaulis
        </div>
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

// Sąrašo skeleton'as — eilutės (topai, diskusijos, naujienų sąrašas, nariai).
function ListHints() {
  return (
    <div>
      {/* Filtrų juostos hint'as */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 18, flexWrap: 'wrap' }}>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="hp-skel-soft" style={{ height: 30, width: 88, borderRadius: 100 }} />
        ))}
      </div>
      {Array.from({ length: 9 }).map((_, i) => (
        <div key={i} style={{ display: 'flex', gap: 14, alignItems: 'center', padding: '10px 12px', marginBottom: 6 }}>
          <div className="hp-skel-soft" style={{ width: 24, height: 16, flexShrink: 0 }} />
          <div className="hp-skel-soft" style={{ width: 52, height: 52, borderRadius: 8, flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div className="hp-skel-soft" style={{ height: 14, width: '46%', marginBottom: 7 }} />
            <div className="hp-skel-soft" style={{ height: 10, width: '28%' }} />
          </div>
        </div>
      ))}
    </div>
  )
}

// Tinklelio skeleton'as — kortelės (muzika, albumai, atlikėjai, galerija).
function GridHints() {
  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 18, flexWrap: 'wrap' }}>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="hp-skel-soft" style={{ height: 30, width: 88, borderRadius: 100 }} />
        ))}
      </div>
      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' }}>
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i}>
            <div className="hp-skel-soft" style={{ aspectRatio: '1', borderRadius: 12, marginBottom: 8 }} />
            <div className="hp-skel-soft" style={{ height: 12, width: '82%', marginBottom: 5 }} />
            <div className="hp-skel-soft" style={{ height: 10, width: '55%' }} />
          </div>
        ))}
      </div>
    </div>
  )
}

// Straipsnio skeleton'as — antraštė + viršelis + teksto eilutės.
function ArticleHints() {
  return (
    <div style={{ maxWidth: 760, marginLeft: 'auto', marginRight: 'auto' }}>
      <div className="hp-skel-soft" style={{ height: 32, width: '85%', marginBottom: 12 }} />
      <div className="hp-skel-soft" style={{ height: 32, width: '55%', marginBottom: 18 }} />
      <div className="hp-skel-soft" style={{ height: 14, width: 180, marginBottom: 22 }} />
      <div className="hp-skel-soft" style={{ aspectRatio: '16 / 9', borderRadius: 14, marginBottom: 24 }} />
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="hp-skel-soft" style={{ height: 13, width: i % 3 === 2 ? '62%' : '100%', marginBottom: 12 }} />
      ))}
    </div>
  )
}
