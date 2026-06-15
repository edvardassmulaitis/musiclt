'use client'

import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

export type NavArtist = { id: number; slug: string; name: string; cover_image_url: string | null }

const TABS = [
  { href: '/atlikejams/studija', label: 'Apžvalga', icon: '📊' },
  { href: '/atlikejams/studija/profilis', label: 'Profilis', icon: '✏️' },
  { href: '/atlikejams/studija/socialiniai', label: 'Socialiniai', icon: '📷' },
  { href: '/atlikejams/studija/fanai', label: 'Fanai', icon: '❤️' },
  { href: '/atlikejams/studija/zinutes', label: 'Žinutės', icon: '✉️' },
]

export default function StudioNav({ artists }: { artists: NavArtist[] }) {
  const pathname = usePathname()
  const router = useRouter()
  const sp = useSearchParams()

  const spA = Number(sp.get('a'))
  const activeId = (Number.isFinite(spA) && artists.some((a) => a.id === spA)) ? spA : (artists[0]?.id ?? null)
  const withArtist = (href: string) => (activeId ? `${href}?a=${activeId}` : href)
  const active = artists.find((a) => a.id === activeId) || artists[0] || null

  return (
    <div className="mb-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/" className="text-sm text-[var(--accent-link)]">← Į music.lt</Link>
        {artists.length > 1 && (
          <select
            value={activeId ?? ''}
            onChange={(e) => {
              const params = new URLSearchParams(Array.from(sp.entries()))
              params.set('a', e.target.value)
              router.push(`${pathname}?${params.toString()}`)
            }}
            className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-elevated)] px-3 py-1.5 text-sm text-[var(--text-primary)]"
          >
            {artists.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        )}
      </div>

      <div className="mt-3 flex items-center gap-3">
        <div className="h-11 w-11 shrink-0 overflow-hidden rounded-full bg-[var(--bg-elevated)] ring-1 ring-[var(--border-subtle)]">
          {active?.cover_image_url
            ? <img src={active.cover_image_url} alt="" className="h-full w-full object-cover" />
            : <div className="flex h-full w-full items-center justify-center text-lg">🎤</div>}
        </div>
        <div>
          <div className="text-xs uppercase tracking-wide text-[var(--text-muted)]">Atlikėjo studija</div>
          <div className="font-['Outfit',sans-serif] text-lg font-bold leading-tight text-[var(--text-primary)]">
            {active ? active.name : 'Studija'}
          </div>
        </div>
      </div>

      <nav className="mt-4 flex flex-wrap gap-1.5">
        {TABS.map((t) => {
          const isActive = pathname === t.href
          return (
            <Link
              key={t.href}
              href={withArtist(t.href)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[13px] font-semibold font-['Outfit',sans-serif] transition ${
                isActive
                  ? 'border-[var(--accent-orange)] bg-[var(--accent-orange)] text-white'
                  : 'border-[var(--border-default)] bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[rgba(249,115,22,0.4)]'
              }`}
            >
              <span>{t.icon}</span>{t.label}
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
