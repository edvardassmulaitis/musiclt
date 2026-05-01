'use client'

// Žinutės embed'ai — paskenuojame body tekste pasitaikiusius URL'us
// ir parodom embed'ą po žinutės teksto:
//   • YouTube: iframe player
//   • Image: paveiksliuko thumbnail (klick'as atidaro full-size lightbox'e)
//   • Spotify track/album/playlist: Spotify embed iframe
// Vienai žinutei rodom max 3 embed'us (kad nepertvinkdytų UI).

import { proxyImg } from '@/lib/img-proxy'

const URL_REGEX_GLOBAL = /\bhttps?:\/\/[^\s]+/gi

const YT_RE = /^https?:\/\/(?:www\.)?(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/i
const IMG_RE = /\.(?:png|jpe?g|gif|webp|bmp|svg)(?:\?|#|$)/i
const SPOTIFY_RE = /^https?:\/\/open\.spotify\.com\/(track|album|playlist|episode|show)\/([a-zA-Z0-9]+)/i

export type Embed =
  | { kind: 'youtube'; videoId: string; url: string }
  | { kind: 'image';   url: string }
  | { kind: 'spotify'; type: string; id: string; url: string }

export function extractEmbeds(body: string): Embed[] {
  if (!body) return []
  const matches = body.match(URL_REGEX_GLOBAL)
  if (!matches) return []
  const out: Embed[] = []
  const seen = new Set<string>()

  for (const url of matches) {
    if (seen.has(url)) continue
    seen.add(url)

    const yt = url.match(YT_RE)
    if (yt) {
      out.push({ kind: 'youtube', videoId: yt[1], url })
      continue
    }
    const sp = url.match(SPOTIFY_RE)
    if (sp) {
      out.push({ kind: 'spotify', type: sp[1].toLowerCase(), id: sp[2], url })
      continue
    }
    if (IMG_RE.test(url)) {
      out.push({ kind: 'image', url })
      continue
    }

    // Kitos URL'os — neembedinam (jos jau bus linkified inline).
    if (out.length >= 3) break
  }

  return out.slice(0, 3)
}

export function MessageEmbeds({ embeds }: { embeds: Embed[] }) {
  if (!embeds || embeds.length === 0) return null
  return (
    <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 6 }}>
      {embeds.map((e, i) => {
        if (e.kind === 'youtube') return <YouTubeEmbed key={i} videoId={e.videoId} />
        if (e.kind === 'spotify') return <SpotifyEmbed key={i} type={e.type} id={e.id} />
        if (e.kind === 'image')   return <ImageEmbed key={i} url={e.url} />
        return null
      })}
    </div>
  )
}

function YouTubeEmbed({ videoId }: { videoId: string }) {
  return (
    <div style={{
      width: '100%', maxWidth: 480, aspectRatio: '16 / 9',
      borderRadius: 10, overflow: 'hidden',
      background: '#000',
      border: '1px solid var(--border-default)',
    }}>
      <iframe
        src={`https://www.youtube.com/embed/${videoId}?rel=0`}
        title="YouTube"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        loading="lazy"
        style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
      />
    </div>
  )
}

function SpotifyEmbed({ type, id }: { type: string; id: string }) {
  // Spotify oficialus embed — nereikia auth, paima visa info.
  // height: 152 — single track variantas. Albums/playlists naudoja didesnį.
  const height = type === 'track' || type === 'episode' ? 152 : 352
  return (
    <div style={{
      width: '100%', maxWidth: 480,
      borderRadius: 12, overflow: 'hidden',
    }}>
      <iframe
        src={`https://open.spotify.com/embed/${type}/${id}`}
        title="Spotify"
        allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
        loading="lazy"
        style={{ width: '100%', height, border: 'none', display: 'block', borderRadius: 12 }}
      />
    </div>
  )
}

function ImageEmbed({ url }: { url: string }) {
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" style={{ display: 'block', maxWidth: 360 }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={proxyImg(url)}
        alt=""
        loading="lazy"
        style={{
          maxWidth: '100%', maxHeight: 360,
          borderRadius: 10,
          border: '1px solid var(--border-default)',
          display: 'block',
        }}
      />
    </a>
  )
}
