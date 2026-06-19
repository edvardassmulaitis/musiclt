'use client'

import { useEffect, useState } from 'react'
import SocialEmbed from '@/components/SocialEmbed'

type Embed = { id: string; platform: string; url: string; caption: string | null }
type Item = { id: string; url: string; thumb_url: string | null; caption: string | null }

export default function ArtistSocialSection({ artistId }: {
  // slug/name/isClaimed nebenaudojami nuo „Sek {name}" sekimo bloko pašalinimo
  // (2026-06-19). Paliekam tik turinį: socialinius embed'us + naujausius YT.
  artistId: number; slug?: string; name?: string; isClaimed?: boolean
}) {
  const [embeds, setEmbeds] = useState<Embed[]>([])
  const [ytItems, setYtItems] = useState<Item[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let dead = false
    Promise.all([
      fetch(`/api/studija/embeds?artistId=${artistId}`).then((r) => r.json()).catch(() => ({ embeds: [] })),
      fetch(`/api/studija/social-items?artistId=${artistId}&platform=youtube`).then((r) => r.json()).catch(() => ({ items: [] })),
    ]).then(([e, yt]) => {
      if (dead) return
      setEmbeds(e.embeds || [])
      setYtItems(yt.items || [])
      setLoaded(true)
    })
    return () => { dead = true }
  }, [artistId])

  // Nieko nerodom, kol neužsikrovė. Po sekimo bloko pašalinimo sekcija
  // turi turinį TIK kai yra embed'ų ar YT vaizdo įrašų — kitaip return null,
  // kad nelliktų tuščios vietos.
  if (!loaded) return null
  const hasContent = embeds.length > 0 || ytItems.length > 0
  if (!hasContent) return null

  return (
    <section className="mx-auto mt-8 w-full max-w-3xl px-4">
      {ytItems.length > 0 && (
        <div className="mt-2">
          <h3 className="mb-3 font-['Outfit',sans-serif] text-base font-bold text-[var(--text-primary)]">Naujausi vaizdo įrašai</h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {ytItems.map((v) => (
              <a key={v.id} href={v.url} target="_blank" rel="noreferrer" className="group block">
                <div className="relative overflow-hidden rounded-xl bg-[var(--bg-elevated)]" style={{ aspectRatio: '16/9' }}>
                  {v.thumb_url ? <img src={v.thumb_url} alt="" className="h-full w-full object-cover transition group-hover:scale-105" loading="lazy" /> : null}
                  <span className="absolute inset-0 flex items-center justify-center text-3xl opacity-90">▶️</span>
                </div>
                <div className="mt-1.5 line-clamp-2 text-xs text-[var(--text-secondary)]">{v.caption}</div>
              </a>
            ))}
          </div>
        </div>
      )}

      {embeds.length > 0 && (
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {embeds.map((e) => (
            <div key={e.id} className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3">
              <SocialEmbed url={e.url} caption={e.caption} />
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
