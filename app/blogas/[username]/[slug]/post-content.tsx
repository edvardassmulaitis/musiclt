'use client'

// proxyImg per weserv.nl — kad legacy music.lt nuotraukos
// (https://www.music.lt/... arba relative paths) išvengtų hotlink/CORS
// block'o. weserv.nl rewrite'ina + cache'ina visus URL'us.
function proxyImg(url: string): string {
  if (!url) return url
  // Data URLs ir relative `./` paveiksliukai praleidžiami
  if (url.startsWith('data:') || url.startsWith('blob:')) return url
  // Relatyvūs path'ai (kaip `/images/...`) — paverčiam į absolute music.lt
  let absoluteUrl = url
  if (url.startsWith('/')) {
    absoluteUrl = `https://www.music.lt${url}`
  } else if (!url.startsWith('http')) {
    absoluteUrl = `https://www.music.lt/${url}`
  }
  // Jau proxy'intų netinkam pakartotinai
  if (absoluteUrl.includes('wsrv.nl') || absoluteUrl.includes('weserv.nl')) return absoluteUrl
  return `https://wsrv.nl/?url=${encodeURIComponent(absoluteUrl)}`
}

/** Rewrite'ina visus `<img src="...">` per proxyImg() prieš dangerouslySetInnerHTML. */
function rewriteImageSrcs(html: string): string {
  if (!html) return html
  return html.replace(/(<img[^>]+src=)["']([^"']+)["']/gi, (m, prefix, src) => {
    const proxied = proxyImg(src)
    return `${prefix}"${proxied}"`
  })
}

// Pašalina kabutes, apsupančias enrichintą nuorodą („<a bp-enrich>…</a>" → <a>…</a>).
function stripEnrichQuotes(html: string): string {
  if (!html || html.indexOf('bp-enrich') < 0) return html
  return html.replace(/[„“”‘’"'](\s*<a class="bp-enrich"[\s\S]*?<\/a>\s*)[„“”‘’"']/g, '$1')
}

export function PostContent({ html }: { html: string }) {
  const processedHtml = stripEnrichQuotes(rewriteImageSrcs(html))
  return (
    <>
      <div
        className="prose-custom leading-relaxed mb-10"
        style={{ color: 'var(--text-secondary, #dde8f8)', fontSize: '17px', lineHeight: 1.75 }}
        dangerouslySetInnerHTML={{ __html: processedHtml }}
      />
      <style jsx global>{`
        .prose-custom h2 { font-size: 1.625em; font-weight: 800; margin: 2em 0 0.6em; color: var(--text-primary); font-family: 'Outfit', sans-serif; letter-spacing: -.02em; }
        .prose-custom h3 { font-size: 1.25em; font-weight: 700; margin: 1.4em 0 0.4em; color: var(--text-primary); font-family: 'Outfit', sans-serif; }
        .prose-custom p { margin: 1em 0; color: var(--text-secondary); }
        .prose-custom blockquote { border-left: 3px solid rgba(249,115,22,0.5); padding: 4px 0 4px 18px; margin: 24px 0; color: var(--text-muted); font-style: italic; font-size: 1.05em; }
        .prose-custom a { color: var(--accent-orange); text-decoration: underline; text-underline-offset: 2px; }
        .prose-custom a:hover { color: var(--accent-orange); filter: brightness(1.12); }
        .prose-custom ul { list-style: disc; padding-left: 28px; margin: 14px 0; }
        .prose-custom ol { list-style: decimal; padding-left: 28px; margin: 14px 0; }
        .prose-custom li { margin: 6px 0; color: var(--text-secondary); }
        .prose-custom strong { color: var(--text-primary); font-weight: 700; }
        .prose-custom em { color: var(--text-primary); }
        .prose-custom img { border-radius: 14px; margin: 28px auto; max-width: 100%; height: auto; display: block; box-shadow: 0 1px 0 var(--border-subtle); }
        /* IFrame embed'ai (Spotify/YouTube) — autoriaus įdėti tarp paragraph'ų;
           lieka inline body'je natūralioje vietoje. Responsive wrapper'is per
           aspect-ratio kad mobile'e neperviršytų plotis. */
        .prose-custom iframe { display: block; margin: 28px auto; border-radius: 14px;
                                max-width: 100%; border: 0; }
        .prose-custom iframe[src*="youtube.com/embed"],
        .prose-custom iframe[src*="youtube-nocookie.com/embed"] {
          width: 100%; max-width: 720px; aspect-ratio: 16/9; height: auto; }
        .prose-custom iframe[src*="spotify.com/embed"] {
          width: 100%; max-width: 720px; height: 152px; }
        .prose-custom .embed-container, .prose-custom .embed-yt { margin: 28px auto; border-radius: 14px; overflow: hidden; }
        .prose-custom .ml-card { transition: background .15s ease; }
        .prose-custom .ml-card:hover { background: var(--bg-hover) !important; }
        .prose-custom hr { border: 0; border-top: 1px solid var(--border-subtle); margin: 36px 0; }
        /* Enrichintos nuorodos prozoje — tiesiog bold, be oranžinės/pabraukimo (kaip teksto dalis) */
        .prose-custom a.bp-enrich { color: inherit; text-decoration: none; font-weight: 700; cursor: pointer; }
        .prose-custom a.bp-enrich:hover { color: var(--accent-orange); }
        .prose-custom img.bp-enrich-thumb { display: none; }
      `}</style>
    </>
  )
}
