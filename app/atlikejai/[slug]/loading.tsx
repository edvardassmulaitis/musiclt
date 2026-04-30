// Artist page loading — full-bleed hero placeholder su centriniu
// equalizer'iu. Po hero'aus — labai švelnūs structural hint'ai
// (avatar + biografija + dainų gridas), kad layout'as nešokčiotų,
// kai tikras content'as įsitraukia (.route-enter, 280ms fade-in).
export default function Loading() {
  return (
    <div style={{ maxWidth: 1280, margin: '0 auto', padding: '20px 16px' }}>
      <div style={{ position: 'relative', height: 320, borderRadius: 14, marginBottom: 24, overflow: 'hidden' }}>
        <div className="hp-skel-soft" style={{ position: 'absolute', inset: 0, borderRadius: 14 }} />
        <div className="loading-screen-eq" style={{ position: 'absolute', inset: 0, minHeight: 0 }}>
          <div className="eq-loader" aria-label="Loading">
            <span /><span /><span /><span /><span />
          </div>
          <div>kraunama</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 16, marginBottom: 24 }}>
        <div className="hp-skel-soft" style={{ width: 130, height: 130, borderRadius: 14, flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <div className="hp-skel-soft" style={{ height: 26, width: '40%', marginBottom: 12 }} />
          <div className="hp-skel-soft" style={{ height: 12, width: '70%', marginBottom: 6 }} />
          <div className="hp-skel-soft" style={{ height: 12, width: '60%', marginBottom: 6 }} />
          <div className="hp-skel-soft" style={{ height: 12, width: '40%' }} />
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
    </div>
  )
}
