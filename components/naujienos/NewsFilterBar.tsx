// components/naujienos/NewsFilterBar.tsx
//
// Filtrų juosta — chip'ai yra TIKRI <a> link'ai į dedikuotus SEO landing'us
// (/naujienos/tipas/{slug}, /naujienos/stilius/{slug}, /naujienos/lietuva).
// Crawl'inamas nuorodų tinklas + shareable URL'ai, ne tik client state.
//
// Trys eilutės: Naršyti (Visos + LT/Pasaulis), Tipas (redakciniai tipai —
// rodoma tik kai bent vienas klasifikuotas), Stilius (8 žanrai).
//
// Server komponentas.

import Link from 'next/link'
import { NEWS_STYLES, NEWS_TYPES, NEWS_SCOPES } from '@/lib/news-taxonomy'
import type { NewsFacets } from '@/lib/news-feed'

type Active = { type?: string; style?: number; scope?: string }

function Chip({
  href, active, accent, icon, label, count,
}: {
  href: string
  active: boolean
  accent?: string
  icon?: string
  label: string
  count?: number
}) {
  return (
    <Link
      href={href}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[13px] font-semibold transition-all"
      style={
        active
          ? { background: accent || 'var(--accent-orange,#f59e0b)', borderColor: accent || 'var(--accent-orange,#f59e0b)', color: '#fff' }
          : { background: 'var(--bg-elevated)', borderColor: 'var(--border-default)', color: 'var(--text-secondary)' }
      }
    >
      {icon && <span aria-hidden>{icon}</span>}
      <span>{label}</span>
      {typeof count === 'number' && count > 0 && (
        <span className="text-[11px] font-bold opacity-55">{count.toLocaleString('lt-LT')}</span>
      )}
    </Link>
  )
}

function Row({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="px-0.5 text-[10.5px] font-bold uppercase tracking-[0.12em] text-[var(--text-faint)]">{title}</span>
      <div className="-mx-1 flex flex-wrap gap-2 px-1">{children}</div>
    </div>
  )
}

export default function NewsFilterBar({
  facets,
  active = {},
}: {
  facets: NewsFacets
  active?: Active
}) {
  const anyActive = active.type != null || active.style != null || active.scope != null
  // Tipų chip'ai rodomi tik kai bent vienas tipas jau klasifikuotas (kitaip
  // eilutė būtų tuščia — tipai užsipildo po AI klasifikacijos).
  const typesPresent = NEWS_TYPES.filter((t) => (facets.categories[t.key] || 0) > 0)

  return (
    <div className="flex flex-col gap-3.5">
      <Row title="Naršyti">
        <Chip href="/naujienos" active={!anyActive} icon="📰" label="Visos naujienos" count={facets.total} />
        {NEWS_SCOPES.map((s) => (
          <Chip
            key={s.key}
            href={`/naujienos/${s.slug}`}
            active={active.scope === s.key}
            icon={s.key === 'lt' ? '🇱🇹' : '🌍'}
            label={s.label}
            count={facets.scope[s.key]}
          />
        ))}
      </Row>

      {typesPresent.length > 0 && (
        <Row title="Tipas">
          {typesPresent.map((t) => (
            <Chip
              key={t.key}
              href={`/naujienos/tipas/${t.slug}`}
              active={active.type === t.key}
              accent={t.accent}
              icon={t.icon}
              label={t.labelPlural}
              count={facets.categories[t.key]}
            />
          ))}
        </Row>
      )}

      <Row title="Stilius">
        {NEWS_STYLES.map((s) => (
          <Chip
            key={s.id}
            href={`/naujienos/stilius/${s.slug}`}
            active={active.style === s.id}
            accent={s.accent}
            icon={s.icon}
            label={s.name.replace(' muzika', '')}
            count={facets.styles[String(s.id)]}
          />
        ))}
      </Row>
    </div>
  )
}
