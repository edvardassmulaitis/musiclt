'use client'

/**
 * DienesDainaClient — /dienos-daina puslapis (2026-06-14).
 *
 * PILNAI perpanaudoja tą patį „Dienos daina" hero komponentą kaip /atrasti
 * (components/DienosDainaHero.tsx). Jokio atskiro stiliaus/layout'o tai pačiai
 * funkcijai. fullPage=true → kortelė auga natūraliai (visi šiandienos kandidatai
 * matomi be scroll'o) ir „Vakar" sekcija rodo PILNAI — laimėtoją + visus tos
 * dienos dalyvius. Jokio Spotify player'io.
 *
 * page.tsx vis dar SSR-fetchina duomenis dėl OG metadata; hero pats fetchina
 * gyvą būseną klientiškai (kaip /atrasti).
 */

import { DienosDainaHero } from '@/components/DienosDainaHero'
import DienosDainaArchive from '@/components/DienosDainaArchive'

export default function DienesDainaClient(_props: {
  nominations?: unknown
  winners?: unknown
  today?: string
  yesterday?: string
}) {
  return (
    <div className="min-h-screen bg-[var(--bg-primary)]">
      <div className="mx-auto max-w-[920px] px-[var(--page-px,20px)] pb-16 pt-7">
        <div className="mb-5">
          <h1 className="m-0 font-['Outfit',sans-serif] text-[clamp(24px,4vw,32px)] font-extrabold tracking-[-0.01em] text-[var(--text-primary)]">Dienos daina</h1>
          <p className="m-0 mt-1.5 max-w-[600px] text-[14px] text-[var(--text-muted)]">Siūlyk savo favoritą ir balsuok už geriausią šios dienos dainą. Laimėtojas paaiškėja kiekvieną vidurnaktį.</p>
        </div>
        <DienosDainaHero fullPage />
        <DienosDainaArchive />
      </div>
    </div>
  )
}
