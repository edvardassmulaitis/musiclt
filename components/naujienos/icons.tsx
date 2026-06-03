// components/naujienos/icons.tsx
//
// Inline SVG ikonos /naujienos komponentams. Projektas NENAUDOJA jokios ikonų
// bibliotekos (lucide/heroicons nėra package.json) — visos ikonos yra inline SVG
// (žr. SiteHeader.tsx lokalų ArrowRight). Šitas modulis laikosi tos pačios
// konvencijos: stroke=currentColor, 24×24 viewBox, `size` + `className` props.

type IconProps = { size?: number; className?: string }

const base = (size: number) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
})

export const Heart = ({ size = 16, className }: IconProps) => (
  <svg {...base(size)} className={className} aria-hidden>
    <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.29 1.51 4.04 3 5.5l7 7Z" />
  </svg>
)

export const MessageCircle = ({ size = 16, className }: IconProps) => (
  <svg {...base(size)} className={className} aria-hidden>
    <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5Z" />
  </svg>
)

export const Eye = ({ size = 16, className }: IconProps) => (
  <svg {...base(size)} className={className} aria-hidden>
    <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
)

export const Search = ({ size = 16, className }: IconProps) => (
  <svg {...base(size)} className={className} aria-hidden>
    <circle cx="11" cy="11" r="8" />
    <path d="m21 21-4.3-4.3" />
  </svg>
)

export const X = ({ size = 16, className }: IconProps) => (
  <svg {...base(size)} className={className} aria-hidden>
    <path d="M18 6 6 18M6 6l12 12" />
  </svg>
)

export const ArrowRight = ({ size = 16, className }: IconProps) => (
  <svg {...base(size)} className={className} aria-hidden>
    <path d="M5 12h14M12 5l7 7-7 7" />
  </svg>
)

export const ChevronRight = ({ size = 16, className }: IconProps) => (
  <svg {...base(size)} className={className} aria-hidden>
    <path d="m9 18 6-6-6-6" />
  </svg>
)

export const Loader2 = ({ size = 16, className }: IconProps) => (
  <svg {...base(size)} className={className} aria-hidden>
    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
  </svg>
)
