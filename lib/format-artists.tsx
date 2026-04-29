// lib/format-artists.tsx
//
// Shared LT-correct artist list formatter. The rule:
//   1 artist  → "Marijonas Mikutavičius"
//   2 artists → "Marijonas Mikutavičius ir Mantas Jankavičius"
//   3+        → "Marijonas Mikutavičius, Mantas Jankavičius ir Mia"
// (commas between non-last items, "ir" before the LAST item — no Oxford comma).
//
// Each name is rendered as a Link to its /atlikejai/{slug} page in orange.
// Used in TrackInfoModal header AND track-page-client header to keep the
// formatting identical across surfaces.

import Link from 'next/link'

export type ArtistRef = { id: number; slug: string; name: string }

export function formatArtistList(
  primary: ArtistRef,
  featuring: ArtistRef[] = [],
  options?: { className?: string },
): React.ReactNode {
  const all = [primary, ...featuring]
  const cls = options?.className || 'font-bold text-[var(--accent-orange)] no-underline hover:underline'
  if (all.length === 1) {
    return <Link href={`/atlikejai/${all[0].slug}`} className={cls}>{all[0].name}</Link>
  }
  if (all.length === 2) {
    return (
      <>
        <Link href={`/atlikejai/${all[0].slug}`} className={cls}>{all[0].name}</Link>
        <span className="text-[var(--text-muted)]"> ir </span>
        <Link href={`/atlikejai/${all[1].slug}`} className={cls}>{all[1].name}</Link>
      </>
    )
  }
  // 3+
  const lastIdx = all.length - 1
  return (
    <>
      {all.map((a, i) => (
        <span key={a.id}>
          <Link href={`/atlikejai/${a.slug}`} className={cls}>{a.name}</Link>
          {i < lastIdx - 1 ? (
            <span className="text-[var(--text-muted)]">, </span>
          ) : i === lastIdx - 1 ? (
            <span className="text-[var(--text-muted)]"> ir </span>
          ) : null}
        </span>
      ))}
    </>
  )
}
