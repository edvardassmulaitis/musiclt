'use client'

import { usePathname } from 'next/navigation'
import { useSite } from '@/components/SiteContext'

// 2026-07-05: „Apie mus" / „Kontaktai" / „Privatumo politika" / „Naudojimo
// sąlygos" puslapiai jau egzistuoja (žr. app/apie-mus, app/kontaktai,
// app/privatumo-politika, app/naudojimo-salygos) — grąžinta į footer'į +
// pridėta apatinė teisinė juosta (dabar įprastas profesionalių svetainių
// pattern'as) bei Organization JSON-LD paieškos sistemoms.
const FOOTER_COLUMNS: { t: string; l: [string, string][] }[] = [
  { t: 'Platforma', l: [['Topai', '/topai'], ['Nauja muzika', '/muzika'], ['Koncertai', '/koncertai'], ['Atlikėjai', '/atlikejai'], ['Albumai', '/albumai'], ['Skelbimai', '/skelbimai']] },
  { t: 'Bendruomenė', l: [['Atrasti', '/bendruomene'], ['Diskusijos', '/diskusijos'], ['Muzikos atradimai', '/muzikos-atradimai'], ['Narių įrašai', '/blogas'], ['Dienos daina', '/dienos-daina'], ['Pokalbiai', '/pokalbiai']] },
  { t: 'Informacija', l: [['Naujienos', '/naujienos'], ['Music.lt atlikėjams', '/atlikejams'], ['Naujų atlikėjų radaras', '/nauji-atlikejai'], ['Muzikos stiliai', '/muzikos-stilius'], ['Balsavimai', '/balsavimai']] },
  { t: 'Music.lt', l: [['Apie mus', '/apie-mus'], ['Kontaktai', '/kontaktai'], ['Privatumo politika', '/privatumo-politika'], ['Naudojimo sąlygos', '/naudojimo-salygos']] },
]

const ORG_JSONLD = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'Music.lt',
  url: 'https://music.lt',
  logo: 'https://music.lt/icon.svg',
  contactPoint: [{ '@type': 'ContactPoint', contactType: 'customer support', url: 'https://music.lt/kontaktai' }],
}

export function SiteFooter() {
  // Bendruomenės hub'e mobiliajame footeris nereikalingas — puslapis baigiasi
  // ties „Aktyvūs nariai" (2026-06-17). Desktop'e footeris lieka.
  const pathname = usePathname()
  const hideOnMobile = !!pathname && (pathname === '/bendruomene' || pathname.startsWith('/bendruomene/'))
  return (
    <footer className={hideOnMobile ? 'hidden lg:block' : undefined} style={{ borderTop: '1px solid var(--border-default)', background: 'var(--bg-body)' }}>
      {/* Organization structured data — vienas šaltinis visai svetainei, kad
          paieškos sistemos (Google Knowledge Panel ir pan.) turėtų aiškų
          tapatybės/kontakto signalą. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(ORG_JSONLD) }}
      />
      <div className="max-w-[1360px] mx-auto px-5 lg:px-8 py-12">
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-8 mb-10">
          <div className="col-span-2 sm:col-span-1">
            <div className="font-black text-xl mb-3"><span style={{ color: 'var(--text-primary)' }}>music</span><span style={{ color: 'var(--accent-orange)' }}>.lt</span></div>
            <p className="text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>Lietuvos muzikos ekosistemos platforma nuo 1999 m.</p>
          </div>
          {FOOTER_COLUMNS.map(col => (
            <nav key={col.t} aria-label={col.t}>
              <h4 className="text-[12px] font-black uppercase tracking-[0.12em] mb-4" style={{ color: 'var(--text-faint)' }}>{col.t}</h4>
              <ul className="space-y-2.5">
                {col.l.map(([label, href]) => (
                  <li key={label}><a href={href} className="text-sm transition-colors" style={{ color: 'var(--text-muted)' }} onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-primary)')} onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}>{label}</a></li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
        <div className="flex flex-col sm:flex-row justify-between items-center gap-3 pt-8" style={{ borderTop: '1px solid var(--border-default)' }}>
          <span className="text-xs" style={{ color: 'var(--text-faint)' }}>© {new Date().getFullYear()} Music.lt — Visos teisės saugomos</span>
          {/* Socialiniai grįš, kai turėsim realius profilių URL — negyvi „#" išimti. */}
        </div>
      </div>
    </footer>
  )
}
