// Homepage skeleton — naudotojui pirmoji vizualinė reakcija (<100ms),
// kol bundle'as load'inasi ir useEffect'ai paleidžia data fetch'us.
// Anksčiau buvo balta TVOROS — dabar matosi struktūra, kuri matchina realią.
export default function Loading() {
  return (
    <div style={{ maxWidth: 1280, margin: '0 auto', padding: '20px 16px' }}>
      {/* Hero */}
      <div className="hp-skel" style={{ height: 380, borderRadius: 16, marginBottom: 24 }} />

      {/* TOP + Naujienos two-column */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
        <div>
          <div className="hp-skel" style={{ height: 18, width: 140, borderRadius: 4, marginBottom: 12 }} />
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 8 }}>
              <div className="hp-skel" style={{ width: 22, height: 16, borderRadius: 4 }} />
              <div className="hp-skel" style={{ width: 44, height: 44, borderRadius: 8 }} />
              <div style={{ flex: 1 }}>
                <div className="hp-skel" style={{ height: 12, width: '70%', borderRadius: 4, marginBottom: 4 }} />
                <div className="hp-skel" style={{ height: 10, width: '45%', borderRadius: 4 }} />
              </div>
            </div>
          ))}
        </div>
        <div>
          <div className="hp-skel" style={{ height: 18, width: 140, borderRadius: 4, marginBottom: 12 }} />
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
              <div className="hp-skel" style={{ width: 80, height: 80, borderRadius: 8, flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div className="hp-skel" style={{ height: 14, width: '85%', borderRadius: 4, marginBottom: 4 }} />
                <div className="hp-skel" style={{ height: 12, width: '60%', borderRadius: 4 }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Atrask atlikėjus grid */}
      <div className="hp-skel" style={{ height: 18, width: 180, borderRadius: 4, marginBottom: 12 }} />
      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', marginBottom: 24 }}>
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i}>
            <div className="hp-skel" style={{ aspectRatio: '1', borderRadius: 12, marginBottom: 6 }} />
            <div className="hp-skel" style={{ height: 12, width: '70%', borderRadius: 4 }} />
          </div>
        ))}
      </div>

      {/* Naujausios dainos grid */}
      <div className="hp-skel" style={{ height: 18, width: 180, borderRadius: 4, marginBottom: 12 }} />
      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))' }}>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i}>
            <div className="hp-skel" style={{ aspectRatio: '1', borderRadius: 10, marginBottom: 6 }} />
            <div className="hp-skel" style={{ height: 12, width: '80%', borderRadius: 4, marginBottom: 4 }} />
            <div className="hp-skel" style={{ height: 10, width: '55%', borderRadius: 4 }} />
          </div>
        ))}
      </div>
    </div>
  )
}
