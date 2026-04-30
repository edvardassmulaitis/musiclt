// Homepage loading — minimalistinis švelnus skeleton'as su centriniu
// equalizer'iu. Anksčiau būdavo blokai-skeleton'ai per visą puslapį,
// kurie persikraudavo abrupt — atrodydavo lyg "viskas persikrauna".
// Dabar: faint structural placeholder'iai + viduryje pulsuojantis
// equalizer'is. Page'as įsijungia per 280ms fade-in (.route-enter).
export default function Loading() {
  return (
    <div style={{ maxWidth: 1280, margin: '0 auto', padding: '20px 16px' }}>
      {/* Hero placeholder (žemo kontrasto, lengvai pulsuoja) */}
      <div style={{ position: 'relative', height: 380, borderRadius: 16, marginBottom: 24, overflow: 'hidden' }}>
        <div className="hp-skel-soft" style={{ position: 'absolute', inset: 0, borderRadius: 16 }} />
        <div className="loading-screen-eq" style={{ position: 'absolute', inset: 0, minHeight: 0 }}>
          <div className="eq-loader" aria-label="Loading">
            <span /><span /><span /><span /><span />
          </div>
          <div>music.lt</div>
        </div>
      </div>

      {/* Two-column placeholder structure (very faint) */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
        <div>
          <div className="hp-skel-soft" style={{ height: 16, width: 120, marginBottom: 14 }} />
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10 }}>
              <div className="hp-skel-soft" style={{ width: 40, height: 40, borderRadius: 8 }} />
              <div style={{ flex: 1 }}>
                <div className="hp-skel-soft" style={{ height: 11, width: '70%', marginBottom: 5 }} />
                <div className="hp-skel-soft" style={{ height: 9, width: '45%' }} />
              </div>
            </div>
          ))}
        </div>
        <div>
          <div className="hp-skel-soft" style={{ height: 16, width: 120, marginBottom: 14 }} />
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
              <div className="hp-skel-soft" style={{ width: 70, height: 70, borderRadius: 8, flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div className="hp-skel-soft" style={{ height: 12, width: '85%', marginBottom: 5 }} />
                <div className="hp-skel-soft" style={{ height: 10, width: '60%' }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom grid placeholder */}
      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))' }}>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i}>
            <div className="hp-skel-soft" style={{ aspectRatio: '1', borderRadius: 10, marginBottom: 6 }} />
            <div className="hp-skel-soft" style={{ height: 10, width: '80%', marginBottom: 4 }} />
            <div className="hp-skel-soft" style={{ height: 9, width: '55%' }} />
          </div>
        ))}
      </div>
    </div>
  )
}
