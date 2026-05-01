// lib/embed-detect.ts
//
// URL → embed metadata. Naudojam ir server-side (kai POST'inam blog įrašą),
// ir client-side (kai vartotojas įklijuoja link'ą į quick mode). Greitas,
// regex-based — jokio network call'o; tik fingerprint'ina URL'ą.
//
// Specialiai grąžiname `html` lauką su jau pre-rendered iframe'u, kad single
// post puslapis galėtų tiesiog `dangerouslySetInnerHTML`'inti. Tai tas pats
// pattern'as kaip ir BlogEditor'io embed modal'e.

export type EmbedType =
  | 'youtube'
  | 'spotify-track'
  | 'spotify-album'
  | 'spotify-playlist'
  | 'spotify-episode'
  | 'soundcloud'
  | 'bandcamp'
  | 'instagram'
  | 'twitter'
  | 'other'

export type DetectedEmbed = {
  type: EmbedType
  /** Embeddable iframe URL (jeigu turim) */
  embedUrl: string | null
  /** Pre-rendered iframe HTML — gali tiesiog įmest į puslapį */
  html: string | null
  /** Thumbnail (jei turim be network call'o, kitaip null) */
  thumbnailUrl: string | null
  /** Title — paprastai null, kad parsint reikia oEmbed call'o */
  title: string | null
}

const YT_REGEX = /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([\w-]{11})/

const SPOTIFY_REGEX = /open\.spotify\.com\/(track|album|playlist|episode|show)\/([a-zA-Z0-9]+)/

export function detectEmbed(rawUrl: string): DetectedEmbed | null {
  if (!rawUrl) return null
  const url = rawUrl.trim()

  // ── YouTube ───────────────────────────────────────────────────────────
  const yt = url.match(YT_REGEX)
  if (yt) {
    const videoId = yt[1]
    return {
      type: 'youtube',
      embedUrl: `https://www.youtube.com/embed/${videoId}`,
      thumbnailUrl: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
      title: null,
      html:
        `<div class="embed-yt" style="position:relative;padding-bottom:56.25%;height:0;margin:24px 0;border-radius:12px;overflow:hidden">` +
        `<iframe src="https://www.youtube.com/embed/${videoId}" style="position:absolute;top:0;left:0;width:100%;height:100%;border:0" allowfullscreen></iframe>` +
        `</div>`,
    }
  }

  // ── Spotify (visi tipai) ──────────────────────────────────────────────
  const sp = url.match(SPOTIFY_REGEX)
  if (sp) {
    const kind = sp[1]
    const id = sp[2]
    const height = kind === 'track' ? 152 : 352
    const html =
      `<iframe src="https://open.spotify.com/embed/${kind}/${id}?theme=0" width="100%" height="${height}" frameBorder="0" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" loading="lazy" style="border-radius:12px;margin:24px 0"></iframe>`
    const typeMap: Record<string, EmbedType> = {
      track: 'spotify-track',
      album: 'spotify-album',
      playlist: 'spotify-playlist',
      episode: 'spotify-episode',
      show: 'spotify-episode',
    }
    return {
      type: typeMap[kind] || 'other',
      embedUrl: `https://open.spotify.com/embed/${kind}/${id}`,
      thumbnailUrl: null,
      title: null,
      html,
    }
  }

  // ── SoundCloud — placeholder, naudojam jų plačią API kai reikia ──────
  if (url.includes('soundcloud.com/')) {
    const html =
      `<iframe width="100%" height="166" scrolling="no" frameborder="no" allow="autoplay" src="https://w.soundcloud.com/player/?url=${encodeURIComponent(url)}&color=%23f97316&auto_play=false" style="border-radius:12px;margin:24px 0"></iframe>`
    return { type: 'soundcloud', embedUrl: null, thumbnailUrl: null, title: null, html }
  }

  // ── Bandcamp — naudoja site-specific embed'us, čia tik fallback link ──
  if (url.includes('bandcamp.com')) {
    return {
      type: 'bandcamp',
      embedUrl: null,
      thumbnailUrl: null,
      title: null,
      html: `<p style="margin:24px 0"><a href="${url}" target="_blank" rel="noreferrer" style="color:#f97316">${url}</a></p>`,
    }
  }

  // ── Instagram / Twitter — neturi tiesioginio iframe, paliekam plain link ─
  if (/instagram\.com\/(p|reel)\//.test(url)) {
    return {
      type: 'instagram',
      embedUrl: null,
      thumbnailUrl: null,
      title: null,
      html: `<blockquote class="instagram-media" data-instgrm-permalink="${url}" data-instgrm-version="14"><a href="${url}">${url}</a></blockquote>`,
    }
  }

  if (/(twitter|x)\.com\/[^/]+\/status\//.test(url)) {
    return {
      type: 'twitter',
      embedUrl: null,
      thumbnailUrl: null,
      title: null,
      html: `<blockquote class="twitter-tweet"><a href="${url}">${url}</a></blockquote>`,
    }
  }

  return null
}
