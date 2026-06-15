'use client'

import { useEffect, useState } from 'react'
import SocialEmbed from '@/components/SocialEmbed'

type Embed = { id: string; platform: string; url: string; caption: string | null }

export default function ArtistSocialSection({ artistId, slug, name, isClaimed }: {
  artistId: number; slug: string; name: string; isClaimed?: boolean
}) {
  const [embeds, setEmbeds] = useState<Embed[]>([])
  const [following, setFollowing] = useState(false)
  const [count, setCount] = useState(0)
  const [busy, setBusy] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [emailConsent, setEmailConsent] = useState(false)

  useEffect(() => {
    let dead = false
    Promise.all([
      fetch(`/api/studija/embeds?artistId=${artistId}`).then((r) => r.json()).catch(() => ({ embeds: [] })),
      fetch(`/api/studija/follow?artistId=${artistId}`).then((r) => r.json()).catch(() => ({ following: false, count: 0 })),
    ]).then(([e, f]) => {
      if (dead) return
      setEmbeds(e.embeds || [])
      setFollowing(!!f.following)
      setCount(f.count || 0)
      setEmailConsent(!!f.emailConsent)
      setLoaded(true)
    })
    return () => { dead = true }
  }, [artistId])

  async function toggleFollow() {
    setBusy(true)
    try {
      const r = await fetch('/api/studija/follow', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ artistId, follow: !following }),
      })
      if (r.status === 401) { window.location.href = `/auth/signin?callbackUrl=/atlikejai/${slug}`; return }
      const d = await r.json()
      if (d.ok) { setFollowing(d.following); setCount(d.count); if (!d.following) setEmailConsent(false) }
    } finally { setBusy(false) }
  }

  async function toggleEmail(next: boolean) {
    setEmailConsent(next)
    try {
      await fetch('/api/studija/follow', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ artistId, follow: true, emailConsent: next }),
      })
    } catch { setEmailConsent(!next) }
  }

  // Nieko nerodom, kol neužsikrovė ir nėra ką rodyti (švaru neclaim'intiems).
  if (!loaded) return null
  const hasContent = embeds.length > 0

  return (
    <section className="mx-auto mt-8 w-full max-w-3xl px-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-['Outfit',sans-serif] text-lg font-bold text-[var(--text-primary)]">
          Sek {name}
        </h2>
        <button onClick={toggleFollow} disabled={busy}
          className={`rounded-full px-4 py-1.5 text-sm font-semibold transition disabled:opacity-60 ${
            following ? 'bg-[var(--bg-elevated)] text-[var(--text-secondary)]' : 'bg-[var(--accent-orange)] text-white'
          }`}>
          {following ? '✓ Seki' : '+ Sekti'}{count > 0 ? ` · ${count}` : ''}
        </button>
      </div>
      <p className="mt-1 text-sm text-[var(--text-muted)]">
        Sekdamas gausi pranešimą apie naujus leidinius ir koncertus.
      </p>
      {following && (
        <label className="mt-2 flex cursor-pointer items-center gap-2 text-sm text-[var(--text-secondary)]">
          <input type="checkbox" checked={emailConsent} onChange={(e) => toggleEmail(e.target.checked)} className="h-4 w-4 accent-[var(--accent-orange)]" />
          Gauti naujienas ir el. paštu
        </label>
      )}

      {hasContent && (
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {embeds.map((e) => (
            <div key={e.id} className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3">
              <SocialEmbed url={e.url} caption={e.caption} />
            </div>
          ))}
        </div>
      )}

      {!isClaimed && (
        <div className="mt-4 rounded-xl border border-dashed border-[var(--border-default)] p-3 text-center text-sm text-[var(--text-muted)]">
          Čia tavo profilis? <a href="/atlikejams" className="text-[var(--accent-link)] font-medium">Pasiimk jį</a> ir valdyk pats.
        </div>
      )}
    </section>
  )
}
