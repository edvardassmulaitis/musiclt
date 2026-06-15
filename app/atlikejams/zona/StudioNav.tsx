'use client'

import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

export type NavArtist = { id: number; slug: string; name: string; cover_image_url: string | null }

export default function StudioNav({ artists }: { artists: NavArtist[] }) {
  const pathname = usePathname()
  const router = useRouter()
  const sp = useSearchParams()

  const spA = Number(sp.get('a'))
  const activeId = (Number.isFinite(spA) && artists.some((a) => a.id === spA)) ? spA : (artists[0]?.id ?? null)
  const isDash = pathname === '/atlikejams/zona'
  const backHref = isDash ? '/' : (activeId ? `/atlikejams/zona?a=${activeId}` : '/atlikejams/zona')
  const backLabel = isDash ? 'Į music.lt' : 'Atlikėjo zona'

  return (
    <div className="mb-5 flex items-center gap-3">
      <Link href={backHref} className="text-sm text-[var(--accent-link)]">← {backLabel}</Link>
      {artists.length > 1 && (
        <select
          value={activeId ?? ''}
          onChange={(e) => router.push(`${pathname}?a=${e.target.value}`)}
          className="ml-auto rounded-lg border border-[var(--border-default)] bg-[var(--bg-elevated)] px-3 py-1.5 text-sm text-[var(--text-primary)]"
        >
          {artists.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      )}
    </div>
  )
}
