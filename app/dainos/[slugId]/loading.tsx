// Song page loading — albumo cover'is kaip focal point su equalizer'iu
// vidury. Layout'as match'ina realią dainos kortelę (cover + meta dešinėje),
// kad nepashokčiotų kai tikras content'as fade'inasi (.route-enter, 280ms).
export default function Loading() {
  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '20px 16px' }}>
      <div style={{ display: 'flex', gap: 18, marginBottom: 18 }}>
        {/* Cover placeholder + equalizer overlay */}
        <div style={{ position: 'relative', width: 220, height: 220, borderRadius: 14, flexShrink: 0, overflow: 'hidden' }}>
          <div className="hp-skel-soft" style={{ position: 'absolute', inset: 0, borderRadius: 14 }} />
          <div className="loading-screen-eq" style={{ position: 'absolute', inset: 0, minHeight: 0 }}>
            <div className="eq-loader" aria-label="Loading">
              <span /><span /><span /><span /><span />
            </div>
          </div>
        </div>
        <div style={{ flex: 1 }}>
          <div className="hp-skel-soft" style={{ height: 12, width: 90, marginBottom: 14 }} />
          <div className="hp-skel-soft" style={{ height: 28, width: '70%', marginBottom: 12 }} />
          <div className="hp-skel-soft" style={{ height: 14, width: '50%', marginBottom: 22 }} />
          <div style={{ display: 'flex', gap: 8 }}>
            <div className="hp-skel-soft" style={{ height: 32, width: 100, borderRadius: 8 }} />
            <div className="hp-skel-soft" style={{ height: 32, width: 100, borderRadius: 8 }} />
          </div>
        </div>
      </div>

      <div className="hp-skel-soft" style={{ height: 220, marginBottom: 16, borderRadius: 12 }} />
      <div className="hp-skel-soft" style={{ height: 160, borderRadius: 12 }} />
    </div>
  )
}
