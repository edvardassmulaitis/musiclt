'use client'

// Lengvas inline emoji picker — be jokių bibliotekų. Slack ir kitose
// produktuose populiariausios reakcijos pirmoje eilėje, antroje — extras.

const POPULAR = ['👍', '❤️', '😂', '🎉', '🔥', '😮', '😢', '👏', '🙏', '💯', '👌', '🤔']
const EXTRA   = ['✅', '❌', '⭐', '🚀', '🎵', '🎸', '🎤', '🥁', '🎹', '🎧', '🤘', '😎', '😅', '🥲', '😴', '👀']

type Props = {
  onSelect: (emoji: string) => void
}

export function ReactionPicker({ onSelect }: Props) {
  return (
    <div
      style={{
        background: 'var(--modal-bg)', border: '1px solid var(--modal-border)',
        borderRadius: 12, padding: 8, width: 240,
        boxShadow: 'var(--modal-shadow, 0 8px 32px rgba(0,0,0,0.4))',
        zIndex: 100,
      }}
    >
      <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase', padding: '4px 6px 6px' }}>
        Populiariausios
      </div>
      <Grid emojis={POPULAR} onSelect={onSelect} />
      <div style={{ height: 1, background: 'var(--border-subtle)', margin: '8px 4px' }} />
      <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase', padding: '0 6px 6px' }}>
        Daugiau
      </div>
      <Grid emojis={EXTRA} onSelect={onSelect} />
    </div>
  )
}

function Grid({ emojis, onSelect }: { emojis: string[]; onSelect: (e: string) => void }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 2 }}>
      {emojis.map(e => (
        <button
          key={e}
          onClick={() => onSelect(e)}
          style={{
            width: 26, height: 26, borderRadius: 6, border: 'none',
            background: 'transparent', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 16, transition: 'background .1s, transform .1s',
          }}
          onMouseEnter={ev => { ev.currentTarget.style.background = 'var(--bg-hover)'; ev.currentTarget.style.transform = 'scale(1.15)' }}
          onMouseLeave={ev => { ev.currentTarget.style.background = 'transparent'; ev.currentTarget.style.transform = 'scale(1)' }}
        >
          {e}
        </button>
      ))}
    </div>
  )
}
