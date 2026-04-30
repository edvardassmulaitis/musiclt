export default function Loading() {
  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '20px 16px' }}>
      <div style={{ display: 'flex', gap: 18, marginBottom: 18 }}>
        <div className="hp-skel" style={{ width: 240, height: 240, borderRadius: 14, flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <div className="hp-skel" style={{ height: 14, width: 80, borderRadius: 4, marginBottom: 14 }} />
          <div className="hp-skel" style={{ height: 36, width: '60%', borderRadius: 6, marginBottom: 14 }} />
          <div className="hp-skel" style={{ height: 16, width: '40%', borderRadius: 6, marginBottom: 24 }} />
          <div style={{ display: 'flex', gap: 8 }}>
            <div className="hp-skel" style={{ height: 36, width: 110, borderRadius: 8 }} />
            <div className="hp-skel" style={{ height: 36, width: 110, borderRadius: 8 }} />
          </div>
        </div>
      </div>
      <div style={{ marginBottom: 18 }}>
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '10px 12px', borderRadius: 8, marginBottom: 4 }}>
            <div className="hp-skel" style={{ width: 28, height: 14, borderRadius: 4 }} />
            <div className="hp-skel" style={{ flex: 1, height: 16, borderRadius: 4 }} />
            <div className="hp-skel" style={{ width: 60, height: 14, borderRadius: 4 }} />
          </div>
        ))}
      </div>
    </div>
  )
}
