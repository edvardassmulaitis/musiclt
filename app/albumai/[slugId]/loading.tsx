// Album page loading — cover + tracklist outline. Equalizer'is sėdi
// virš cover'io kaip focal point, žemiau structural hint'ai dainoms.
// Page'as įsitraukia per .route-enter (280ms fade-in).
export default function Loading() {
  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '20px 16px' }}>
      <div style={{ display: 'flex', gap: 18, marginBottom: 18 }}>
        <div style={{ position: 'relative', width: 240, height: 240, borderRadius: 14, flexShrink: 0, overflow: 'hidden' }}>
          <div className="hp-skel-soft" style={{ position: 'absolute', inset: 0, borderRadius: 14 }} />
          <div className="loading-screen-eq" style={{ position: 'absolute', inset: 0, minHeight: 0 }}>
            <div className="eq-loader" aria-label="Loading">
              <span /><span /><span /><span /><span />
            </div>
          </div>
        </div>
        <div style={{ flex: 1 }}>
          <div className="hp-skel-soft" style={{ height: 12, width: 70, marginBottom: 14 }} />
          <div className="hp-skel-soft" style={{ height: 32, width: '60%', marginBottom: 12 }} />
          <div className="hp-skel-soft" style={{ height: 14, width: '40%', marginBottom: 22 }} />
          <div style={{ display: 'flex', gap: 8 }}>
            <div className="hp-skel-soft" style={{ height: 32, width: 100, borderRadius: 8 }} />
            <div className="hp-skel-soft" style={{ height: 32, width: 100, borderRadius: 8 }} />
          </div>
        </div>
      </div>

      <div style={{ marginBottom: 18 }}>
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '9px 12px', marginBottom: 4 }}>
            <div className="hp-skel-soft" style={{ width: 22, height: 12 }} />
            <div className="hp-skel-soft" style={{ flex: 1, height: 14 }} />
            <div className="hp-skel-soft" style={{ width: 50, height: 11 }} />
          </div>
        ))}
      </div>
    </div>
  )
}
