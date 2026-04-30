// Instant skeleton, kol artist puslapis SSR'ina (TTFB ~1.5-3s).
// Naudotojas iš karto mato struktūrą, ne baltą ekraną.
export default function Loading() {
  return (
    <div style={{ maxWidth: 1280, margin: '0 auto', padding: '20px 16px' }}>
      <div className="hp-skel" style={{ height: 320, borderRadius: 14, marginBottom: 24 }} />
      <div style={{ display: 'flex', gap: 16, marginBottom: 24 }}>
        <div className="hp-skel" style={{ width: 140, height: 140, borderRadius: 14, flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <div className="hp-skel" style={{ height: 28, width: '40%', borderRadius: 6, marginBottom: 12 }} />
          <div className="hp-skel" style={{ height: 16, width: '70%', borderRadius: 6, marginBottom: 8 }} />
          <div className="hp-skel" style={{ height: 16, width: '55%', borderRadius: 6 }} />
        </div>
      </div>
      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))' }}>
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i}>
            <div className="hp-skel" style={{ aspectRatio: '1', borderRadius: 10, marginBottom: 8 }} />
            <div className="hp-skel" style={{ height: 14, width: '80%', borderRadius: 4, marginBottom: 4 }} />
            <div className="hp-skel" style={{ height: 12, width: '60%', borderRadius: 4 }} />
          </div>
        ))}
      </div>
    </div>
  )
}
