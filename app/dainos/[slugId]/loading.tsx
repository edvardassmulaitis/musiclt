export default function Loading() {
  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '20px 16px' }}>
      <div style={{ display: 'flex', gap: 18, marginBottom: 18 }}>
        <div className="hp-skel" style={{ width: 220, height: 220, borderRadius: 14, flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <div className="hp-skel" style={{ height: 14, width: 100, borderRadius: 4, marginBottom: 14 }} />
          <div className="hp-skel" style={{ height: 32, width: '70%', borderRadius: 6, marginBottom: 12 }} />
          <div className="hp-skel" style={{ height: 18, width: '50%', borderRadius: 6, marginBottom: 24 }} />
          <div style={{ display: 'flex', gap: 8 }}>
            <div className="hp-skel" style={{ height: 36, width: 110, borderRadius: 8 }} />
            <div className="hp-skel" style={{ height: 36, width: 110, borderRadius: 8 }} />
          </div>
        </div>
      </div>
      <div className="hp-skel" style={{ height: 260, borderRadius: 12, marginBottom: 18 }} />
      <div className="hp-skel" style={{ height: 200, borderRadius: 12 }} />
    </div>
  )
}
