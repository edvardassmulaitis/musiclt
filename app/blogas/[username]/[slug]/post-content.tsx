'use client'

export function PostContent({ html }: { html: string }) {
  return (
    <>
      <div
        className="prose-custom leading-relaxed text-[16px] mb-10"
        style={{ color: '#b0bdd4' }}
        dangerouslySetInnerHTML={{ __html: html }}
      />
      <style jsx global>{`
        .prose-custom h2 { font-size: 1.5em; font-weight: 800; margin: 1.5em 0 0.5em; color: #f2f4f8; font-family: 'Outfit', sans-serif; }
        .prose-custom h3 { font-size: 1.2em; font-weight: 700; margin: 1em 0 0.4em; color: #dde8f8; font-family: 'Outfit', sans-serif; }
        .prose-custom p { margin: 0.75em 0; }
        .prose-custom blockquote { border-left: 3px solid rgba(249,115,22,0.5); padding-left: 16px; margin: 20px 0; color: rgba(200,215,240,0.55); font-style: italic; }
        .prose-custom a { color: #3b82f6; text-decoration: underline; }
        .prose-custom a:hover { color: #60a5fa; }
        .prose-custom ul { list-style: disc; padding-left: 24px; margin: 12px 0; }
        .prose-custom img { border-radius: 12px; margin: 20px 0; max-width: 100%; }
        .prose-custom .embed-container, .prose-custom .embed-yt { margin: 24px 0; border-radius: 12px; overflow: hidden; }
        .prose-custom iframe { border-radius: 12px; }
      `}</style>
    </>
  )
}
