'use client'

export function PostContent({ html }: { html: string }) {
  return (
    <>
      <div
        className="prose-custom leading-relaxed mb-10"
        style={{ color: 'var(--text-primary, #dde8f8)', fontSize: '17px', lineHeight: 1.75 }}
        dangerouslySetInnerHTML={{ __html: html }}
      />
      <style jsx global>{`
        .prose-custom h2 { font-size: 1.625em; font-weight: 800; margin: 2em 0 0.6em; color: #f2f4f8; font-family: 'Outfit', sans-serif; letter-spacing: -.02em; }
        .prose-custom h3 { font-size: 1.25em; font-weight: 700; margin: 1.4em 0 0.4em; color: #dde8f8; font-family: 'Outfit', sans-serif; }
        .prose-custom p { margin: 1em 0; color: #c8d8f0; }
        .prose-custom blockquote { border-left: 3px solid rgba(249,115,22,0.5); padding: 4px 0 4px 18px; margin: 24px 0; color: rgba(200,215,240,0.65); font-style: italic; font-size: 1.05em; }
        .prose-custom a { color: #f97316; text-decoration: underline; text-underline-offset: 2px; }
        .prose-custom a:hover { color: #fb923c; }
        .prose-custom ul { list-style: disc; padding-left: 28px; margin: 14px 0; }
        .prose-custom ol { list-style: decimal; padding-left: 28px; margin: 14px 0; }
        .prose-custom li { margin: 6px 0; }
        .prose-custom strong { color: #f2f4f8; font-weight: 700; }
        .prose-custom em { color: #dde8f8; }
        .prose-custom img { border-radius: 14px; margin: 28px auto; max-width: 100%; display: block; box-shadow: 0 1px 0 rgba(255,255,255,0.04); }
        .prose-custom .embed-container, .prose-custom .embed-yt { margin: 28px auto; border-radius: 14px; overflow: hidden; }
        .prose-custom iframe { border-radius: 14px; margin: 28px auto; display: block; }
        .prose-custom .ml-card { transition: background .15s ease; }
        .prose-custom .ml-card:hover { background: rgba(255,255,255,0.06) !important; }
        .prose-custom hr { border: 0; border-top: 1px solid rgba(255,255,255,0.08); margin: 36px 0; }
      `}</style>
    </>
  )
}
