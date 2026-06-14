'use client'

import { useEffect, useRef } from 'react'
import { detectPlatform, youtubeId, PLATFORM_LABEL, type SocialPlatform } from '@/lib/social-embed'

// Įkrauna platformos embed scriptą tik vieną kartą.
function loadScript(src: string, id: string): Promise<void> {
  return new Promise((resolve) => {
    if (typeof document === 'undefined') return resolve()
    if (document.getElementById(id)) return resolve()
    const s = document.createElement('script')
    s.id = id; s.async = true; s.src = src
    s.onload = () => resolve()
    document.body.appendChild(s)
  })
}

const ICON: Record<SocialPlatform, string> = {
  instagram: '📷', facebook: '📘', tiktok: '🎵', youtube: '▶️', x: '𝕏', unknown: '🔗',
}

export default function SocialEmbed({ url, caption }: { url: string; caption?: string | null }) {
  const platform = detectPlatform(url)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    async function go() {
      if (platform === 'instagram') {
        await loadScript('https://www.instagram.com/embed.js', 'ig-embed-js')
        if (!cancelled) (window as any).instgrm?.Embeds?.process?.()
      } else if (platform === 'tiktok') {
        await loadScript('https://www.tiktok.com/embed.js', 'tt-embed-js')
      } else if (platform === 'x') {
        await loadScript('https://platform.twitter.com/widgets.js', 'tw-embed-js')
        if (!cancelled) (window as any).twttr?.widgets?.load?.(ref.current)
      }
    }
    go()
    return () => { cancelled = true }
  }, [platform, url])

  if (platform === 'youtube') {
    const id = youtubeId(url)
    if (id) return (
      <div className="overflow-hidden rounded-xl" style={{ aspectRatio: '16/9' }}>
        <iframe src={`https://www.youtube.com/embed/${id}`} title="YouTube" allowFullScreen
          className="h-full w-full" loading="lazy"
          allow="accelerator; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" />
      </div>
    )
  }

  if (platform === 'instagram') {
    return (
      <div ref={ref}>
        <blockquote className="instagram-media" data-instgrm-permalink={url} data-instgrm-version="14"
          style={{ background: '#fff', border: 0, borderRadius: 12, margin: 0, padding: 0, width: '100%' }}>
          <a href={url} target="_blank" rel="noreferrer">Žiūrėti Instagram</a>
        </blockquote>
      </div>
    )
  }

  if (platform === 'tiktok') {
    return (
      <div ref={ref}>
        <blockquote className="tiktok-embed" cite={url} style={{ margin: 0 }}>
          <a href={url} target="_blank" rel="noreferrer">Žiūrėti TikTok</a>
        </blockquote>
      </div>
    )
  }

  if (platform === 'x') {
    return (
      <div ref={ref}>
        <blockquote className="twitter-tweet"><a href={url} target="_blank" rel="noreferrer">Žiūrėti X</a></blockquote>
      </div>
    )
  }

  // Facebook + unknown → kortelė su nuoroda (FB post plugin reikalauja app SDK).
  return (
    <a href={url} target="_blank" rel="noreferrer"
      className="flex items-center gap-3 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-4 hover:border-[var(--border-strong)]">
      <span className="text-2xl">{ICON[platform]}</span>
      <span className="min-w-0">
        <span className="block text-sm font-medium text-[var(--text-primary)]">{PLATFORM_LABEL[platform]}</span>
        <span className="block truncate text-xs text-[var(--text-muted)]">{caption || url}</span>
      </span>
    </a>
  )
}
