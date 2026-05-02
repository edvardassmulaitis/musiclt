'use client'

// Lengvas inline emoji picker — be jokių bibliotekų. Sluoksniuoti į
// kategorijas, populiariausi viršuje. Naudojamas ir reactions, ir
// composer'iui (insert į text'ą).

// Populiariausi — trending tarp jaunimo (skull, goat, no-cap, sparkles, pleading, etc.)
const POPULAR = ['😂', '🤣', '😭', '❤️', '🔥', '💀', '🐐', '🧢', '🥺', '😎', '👍', '👀', '🙏', '😍', '✨', '💯', '🤔', '🥹', '😩', '😳', '😅', '😤']
const FACES   = ['😀', '😅', '😊', '😇', '🙃', '😌', '😏', '😴', '🤤', '😋', '😜', '🤪', '🥲', '🥰', '😘', '😡', '🤯', '😱', '🤡', '🥶']
const HANDS   = ['🤘', '🤟', '👏', '🙌', '👌', '✌️', '🤞', '🫶', '🫡', '🤝', '👊', '✊', '🤜', '🤛', '🫵', '👋']
const HEART   = ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝']
const PARTY   = ['🎉', '🎊', '🥳', '🎈', '🎁', '🍾', '🥂', '🍻', '🌟', '⭐', '✨', '💫', '🎵', '🎶', '🎤', '🎸', '🎹', '🥁', '🎧', '🎷']
const FOOD    = ['🍕', '🍔', '🍟', '🌭', '🍿', '🥨', '🍩', '🍪', '🎂', '🍰', '🍫', '🍬', '🍭', '☕', '🍺', '🍷', '🍹']
const ANIMALS = ['🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯', '🦁', '🐮', '🐷', '🐵', '🦄', '🐸', '🐐', '🦅', '🦋', '🐝', '🐢', '🐬']
const SYMBOLS = ['✅', '❌', '⚠️', '❓', '❗', '💬', '💭', '🚀', '⚡', '💥', '💢', '💦', '💨', '🎯', '🏆', '⚽']

type Group = { label: string; emojis: string[] }
const GROUPS: Group[] = [
  { label: 'Populiariausi', emojis: POPULAR },
  { label: 'Veidai',       emojis: FACES },
  { label: 'Rankos',       emojis: HANDS },
  { label: 'Širdys',       emojis: HEART },
  { label: 'Šventė & muzika', emojis: PARTY },
  { label: 'Maistas',      emojis: FOOD },
  { label: 'Gyvūnai',      emojis: ANIMALS },
  { label: 'Simboliai',    emojis: SYMBOLS },
]

type Props = {
  onSelect: (emoji: string) => void
  // Compact mode — composer'iui (be header'io, mažesnis grid).
  compact?: boolean
}

export function ReactionPicker({ onSelect, compact }: Props) {
  return (
    <div
      style={{
        background: 'var(--modal-bg)', border: '1px solid var(--modal-border)',
        borderRadius: 12, padding: 8, width: compact ? 280 : 300,
        boxShadow: 'var(--modal-shadow, 0 8px 32px rgba(0,0,0,0.4))',
        zIndex: 100,
        maxHeight: 360, overflowY: 'auto',
      }}
    >
      {GROUPS.map((g, i) => (
        <div key={g.label} style={{ marginTop: i === 0 ? 0 : 10 }}>
          <div style={{
            fontSize: 9, fontWeight: 800, color: 'var(--text-muted)',
            letterSpacing: '0.08em', textTransform: 'uppercase',
            padding: '4px 6px 4px',
          }}>
            {g.label}
          </div>
          <Grid emojis={g.emojis} onSelect={onSelect} />
        </div>
      ))}
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
            width: 28, height: 28, borderRadius: 6, border: 'none',
            background: 'transparent', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 17, transition: 'background .1s, transform .1s',
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
