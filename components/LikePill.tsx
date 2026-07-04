'use client'
// components/LikePill.tsx
//
// Single reusable like element with two click zones: the heart (toggles the
// current viewer's like) and the count (opens the likers modal). Used in the
// artist hero and inside LikesModal's header — identical behavior so the user
// is never looking at two different "like" controls.

type Props = {
  likes: number
  selfLiked?: boolean
  onToggle: () => void
  /** If provided, the count zone is clickable and opens the modal. If omitted
   *  (e.g. we're already inside the modal), the count is a passive display. */
  onOpenModal?: () => void
  pending?: boolean
  /** 'light' — white glass look for overlay on photo.
   *  'surface' — solid look for normal theme backgrounds. */
  variant?: 'light' | 'surface'
  /** 'md' — default; 'sm' — compact for tab bars / dense action rows. */
  size?: 'sm' | 'md'
}

export function LikePill({
  likes, selfLiked, onToggle, onOpenModal, pending = false, variant = 'light', size = 'md',
}: Props) {
  const heartFilled = !!selfLiked
  const sm = size === 'sm'
  const heartPad = sm ? 'px-2.5 py-1' : 'px-3.5 py-2'
  const countPad = sm ? 'px-2.5 py-1 text-[13px]' : 'px-4 py-2 text-[14px]'
  const heartSize = sm ? 'h-[14px] w-[14px]' : 'h-[17px] w-[17px]'
  const baseWrap = variant === 'light'
    ? 'border border-white/20 bg-white/10 backdrop-blur-md text-white'
    : 'border border-[var(--border-default)] bg-[var(--card-bg)] text-[var(--text-primary)]'
  const dividerColor = variant === 'light' ? 'border-white/15' : 'border-[var(--border-subtle)]'
  const countClickable = !!onOpenModal && likes > 0

  return (
    <div
      className={[
        'inline-flex overflow-hidden rounded-full transition-colors',
        baseWrap,
        heartFilled ? '!border-[var(--accent-orange)] !bg-[var(--accent-orange)] !text-white shadow-[0_6px_18px_rgba(249,115,22,0.4)]' : '',
      ].join(' ')}
    >
      {/* Heart zone — toggles like */}
      <button
        onClick={onToggle}
        disabled={pending}
        title={heartFilled ? 'Tau patinka — atšaukti' : 'Paspausk „Patinka"'}
        aria-label={heartFilled ? 'Atšaukti patinka' : 'Pažymėti patinka'}
        aria-pressed={heartFilled}
        className={[
          'flex items-center justify-center transition-colors',
          heartPad,
          pending ? 'cursor-wait opacity-70' : 'cursor-pointer',
          !heartFilled && variant === 'light' ? 'hover:bg-white/10' : '',
          !heartFilled && variant === 'surface' ? 'hover:bg-[var(--bg-hover)]' : '',
          heartFilled ? 'hover:opacity-90' : '',
        ].join(' ')}
      >
        <svg
          viewBox="0 0 24 24"
          fill={heartFilled ? '#fff' : 'currentColor'}
          className={[heartSize, 'transition-transform', heartFilled ? 'scale-110 text-white' : 'text-[var(--accent-orange)]'].join(' ')}
        >
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
        </svg>
      </button>

      {/* Count zone — opens modal when clickable */}
      {countClickable ? (
        <button
          onClick={onOpenModal}
          title="Pamatyk kam patinka"
          aria-label="Pamatyk kam patinka"
          className={[
            'flex items-center border-l font-["Outfit",sans-serif] font-extrabold tabular-nums tracking-wide transition-colors',
            countPad,
            dividerColor,
            heartFilled ? '!border-white/30' : '',
            !heartFilled && variant === 'light' ? 'hover:bg-white/10' : '',
            !heartFilled && variant === 'surface' ? 'hover:bg-[var(--bg-hover)]' : '',
            heartFilled ? 'hover:opacity-90' : '',
          ].join(' ')}
        >
          {likes.toLocaleString('lt-LT')}
        </button>
      ) : (
        <span
          className={[
            'flex items-center border-l font-["Outfit",sans-serif] font-extrabold tabular-nums tracking-wide',
            countPad,
            dividerColor,
            heartFilled ? '!border-white/30' : '',
            likes === 0 ? 'opacity-70' : '',
          ].join(' ')}
        >
          {likes.toLocaleString('lt-LT')}
        </span>
      )}
    </div>
  )
}
