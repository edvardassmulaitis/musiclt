'use client'

// app/nariai/page.tsx (2026-06-18, buvęs /vartotojai)
//
// „Bendruomenės nariai" — pilnas narių sąrašas (į jį veda „Daugiau narių"
// kortelė iš /bendruomene „Aktyvūs nariai" sekcijos). Rodom AKTYVIUS narius +
// naujus/suimportuotus (su mėgstamiausių atlikėjų koliažu) — kuo daugiau, kad
// puslapis būtų gyvas, ne tik kelios kortelės.

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { proxyImg } from '@/lib/img-proxy'

type FavArtist = { name: string; image: string | null; slug: string | null }
type Member = { user_id?: string; username: string; name: string | null; avatar: string | null; favArtists?: FavArtist[]; headline?: string | null; isNew?: boolean }

function hue(s: string) { let h = 0; for (let i = 0; i < (s || '').length; i++) h = (h * 31 + s.charCodeAt(i)) % 360; return h }

function Avatar({ src, name, size = 42 }: { src?: string | null; name?: string | null; size?: number }) {
  const nm = name || 'Narys'
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={proxyImg(src)} alt="" width={size} height={size} loading="lazy" className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />
  }
  return (
    <div className="flex shrink-0 items-center justify-center rounded-full font-extrabold"
      style={{ width: size, height: size, fontSize: size * 0.42, background: `hsl(${hue(nm)},32%,20%)`, color: `hsl(${hue(nm)},52%,62%)` }}>
      {nm.charAt(0).toUpperCase()}
    </div>
  )
}

function MemberCard({ m }: { m: Member }) {
  return (
    <Link href={`/@${m.username}`} className="group flex flex-col rounded-[15px] border border-[var(--border-subtle)] bg-[var(--card-bg)] p-3.5 no-underline transition-colors hover:bg-[var(--card-hover)]">
      <div className="flex items-center gap-2.5">
        <div className="relative shrink-0">
          <Avatar src={m.avatar} name={m.username} size={42} />
          {m.isNew && <span title="Naujas narys" className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-[var(--card-bg)] bg-[#22c55e]" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="m-0 truncate font-['Outfit',sans-serif] text-[16px] font-extrabold text-[var(--text-primary)] group-hover:text-[var(--accent-orange)]">{m.username}</p>
          {m.isNew ? (
            <p className="m-0 text-[12px] font-bold uppercase tracking-[0.08em] text-[#22c55e]">naujas narys</p>
          ) : m.headline ? (
            <p className="m-0 truncate text-[12px] text-[var(--text-muted)]">{m.headline}</p>
          ) : null}
        </div>
      </div>
      {m.favArtists && m.favArtists.length > 0 && (
        <div className="mt-3 grid grid-cols-3 gap-1.5">
          {m.favArtists.slice(0, 6).map((a, i) => (
            <span key={`${a.name}-${i}`} title={a.name} className="relative block aspect-square overflow-hidden rounded-[8px] border border-[var(--border-subtle)] bg-[var(--cover-placeholder)]">
              {a.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={proxyImg(a.image)} alt={a.name} loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
              ) : (
                <span className="flex h-full w-full items-center justify-center text-[20px] font-extrabold" style={{ background: `hsl(${hue(a.name)},32%,22%)`, color: `hsl(${hue(a.name)},52%,64%)` }}>{a.name.charAt(0).toUpperCase()}</span>
              )}
            </span>
          ))}
        </div>
      )}
    </Link>
  )
}

export default function NariaiPage() {
  const [list, setList] = useState<Member[] | null>(null)
  useEffect(() => {
    let on = true
    fetch('/api/atradimai/active-members?days=30&limit=48').then(r => r.json()).then(d => {
      if (!on) return
      const actives: Member[] = (d.members || []).map((m: any) => ({ user_id: m.user_id, username: m.username, name: m.name, avatar: m.avatar, favArtists: m.fav_artists || [], headline: m.headline || null, isNew: false }))
      const seen = new Set(actives.map(m => m.username))
      // Įtraukiam IR naujus, IR suimportuotus narius (ne tik realias registracijas) —
      // kad sąrašas būtų pilnas, ne tik kelios kortelės.
      const rest: Member[] = (d.new_members || [])
        .filter((m: any) => !seen.has(m.username))
        .map((m: any) => ({ username: m.username, name: m.name, avatar: m.avatar, favArtists: m.fav_artists || [], isNew: !m.joined_legacy_at }))
      // Rodom TIK narius, kurie turi priskirtų mėgstamų atlikėjų/dainų. Sąrašas
      // savaime augs, kai nariai pasiims/susikurs accountus ir užsipildys mėgstamus.
      const withFavs = [...actives, ...rest].filter(m => (m.favArtists?.length || 0) > 0)
      setList(withFavs)
    }).catch(() => { if (on) setList([]) })
    return () => { on = false }
  }, [])

  return (
    <div className="page-shell">
      <div className="page-head">
        <h1>Bendruomenės nariai</h1>
        <p>Aktyviausi nariai ir jų mėgstamiausi atlikėjai</p>
      </div>
      {list === null ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{Array(12).fill(null).map((_, i) => <div key={i} className="hp-skel h-[188px] rounded-[15px]" />)}</div>
      ) : list.length === 0 ? (
        <div className="py-16 text-center text-[14px] text-[var(--text-muted)]">Narių dar nėra.</div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {list.map(m => <MemberCard key={m.username} m={m} />)}
        </div>
      )}
    </div>
  )
}
