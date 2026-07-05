// components/legal/LegalLayout.tsx
//
// Bendras apvalkalas informaciniams/teisiniams puslapiams (Privatumo politika,
// Naudojimo sąlygos, Apie mus, Kontaktai). Vienas šaltinis dizainui, kad
// šitie puslapiai atrodytų kaip natūrali svetainės dalis, o ne pridėta plokštė.
//
// Turinio tipografija — ta pati `.prose-custom` sistema kaip blog'o įrašuose
// (žr. app/blogas/[username]/[slug]/post-content.tsx), kad ilgas tekstas
// (politikos, sąlygos) būtų nuosekliai suformatuotas ir gerbtų temą (dark/light).

import Link from 'next/link'

export function LegalLayout({
  eyebrow,
  title,
  updated,
  intro,
  children,
}: {
  eyebrow: string
  title: string
  updated?: string
  intro?: string
  children: React.ReactNode
}) {
  return (
    <div className="mx-auto max-w-[820px] px-5 lg:px-8 py-12 sm:py-16">
      <div className="mb-8 sm:mb-10">
        <span
          className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium"
          style={{ borderColor: 'var(--border-default)', background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}
        >
          {eyebrow}
        </span>
        <h1
          className="mt-4 font-['Outfit',sans-serif] text-2xl sm:text-3xl font-extrabold leading-tight"
          style={{ color: 'var(--text-primary)' }}
        >
          {title}
        </h1>
        {updated && (
          <p className="mt-3 text-xs" style={{ color: 'var(--text-faint)' }}>
            Paskutinį kartą atnaujinta {updated}
          </p>
        )}
        {intro && (
          <p className="mt-4 text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            {intro}
          </p>
        )}
      </div>

      <div
        className="prose-custom leading-relaxed"
        style={{ color: 'var(--text-secondary)', fontSize: '15px', lineHeight: 1.75 }}
      >
        {children}
      </div>

      <div className="mt-14 pt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm" style={{ borderTop: '1px solid var(--border-default)' }}>
        <Link href="/privatumo-politika" className="hover:underline" style={{ color: 'var(--text-muted)' }}>Privatumo politika</Link>
        <Link href="/naudojimo-salygos" className="hover:underline" style={{ color: 'var(--text-muted)' }}>Naudojimo sąlygos</Link>
        <Link href="/apie-mus" className="hover:underline" style={{ color: 'var(--text-muted)' }}>Apie mus</Link>
        <Link href="/kontaktai" className="hover:underline" style={{ color: 'var(--text-muted)' }}>Kontaktai</Link>
      </div>

      {/* Ta pati prose-custom stilių sistema kaip blog'o post-content.tsx.
          Class pavadinimas identiškas — taisyklės idempotentiškos, jei abu
          puslapiai kada nors susitiktų tame pačiame kliente. */}
      <style jsx global>{`
        .prose-custom h2 { font-size: 1.375em; font-weight: 800; margin: 2em 0 0.6em; color: var(--text-primary); font-family: 'Outfit', sans-serif; letter-spacing: -.01em; }
        .prose-custom h3 { font-size: 1.125em; font-weight: 700; margin: 1.6em 0 0.5em; color: var(--text-primary); font-family: 'Outfit', sans-serif; }
        .prose-custom p { margin: 1em 0; color: var(--text-secondary); }
        .prose-custom a { color: var(--accent-orange); text-decoration: underline; text-underline-offset: 2px; }
        .prose-custom a:hover { color: var(--accent-orange); filter: brightness(1.12); }
        .prose-custom ul { list-style: disc; padding-left: 24px; margin: 14px 0; }
        .prose-custom ol { list-style: decimal; padding-left: 24px; margin: 14px 0; }
        .prose-custom li { margin: 6px 0; color: var(--text-secondary); }
        .prose-custom strong { color: var(--text-primary); font-weight: 700; }
        .prose-custom hr { border: 0; border-top: 1px solid var(--border-subtle); margin: 32px 0; }
        .prose-custom table { width: 100%; border-collapse: collapse; margin: 1.4em 0; font-size: 0.95em; }
        .prose-custom th, .prose-custom td { border: 1px solid var(--border-subtle); padding: 8px 10px; text-align: left; vertical-align: top; }
        .prose-custom th { color: var(--text-primary); font-weight: 700; background: var(--bg-elevated); }
      `}</style>
    </div>
  )
}
