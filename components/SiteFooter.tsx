'use client'

import { usePathname } from 'next/navigation'
import { useSite } from '@/components/SiteContext'

export function SiteFooter() {
  // Bendruomenės hub'e mobiliajame footeris nereikalingas — puslapis baigiasi
  // ties „Aktyvūs nariai" (2026-06-17). Desktop'e footeris lieka.
  const pathname = usePathname()
  const hideOnMobile = !!pathname && (pathname === '/bendruomene' || pathname.startsWith('/bendruomene/'))
  return (
    <footer className={hideOnMobile ? 'hidden lg:block' : undefined} style={{ borderTop: '1px solid var(--border-default)', background: 'var(--bg-body)' }}>
      <div className="max-w-[1360px] mx-auto px-5 lg:px-8 py-12">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-8 mb-10">
          <div>
            <div className="font-black text-xl mb-3"><span style={{ color: 'var(--text-primary)' }}>music</span><span style={{ color: 'var(--accent-orange)' }}>.lt</span></div>
            <p className="text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>Lietuvos muzikos ekosistemos platforma nuo 1999 m.</p>
          </div>
          {/* 2026-06-11 consistency: tik realios nuorodos — negyvi „Apie mus"/
              „Reklama"/„Kontaktai" (vedę į /) pašalinti, kol nėra puslapių. */}
          {[
            { t: 'Platforma', l: [['Topai', '/topai'], ['Nauja muzika', '/muzika'], ['Koncertai', '/koncertai'], ['Atlikėjai', '/atlikejai'], ['Albumai', '/albumai'], ['Skelbimai', '/skelbimai']] },
            { t: 'Bendruomenė', l: [['Atrasti', '/bendruomene'], ['Diskusijos', '/diskusijos'], ['Muzikos atradimai', '/muzikos-atradimai'], ['Narių įrašai', '/blogas'], ['Dienos daina', '/dienos-daina'], ['Pokalbiai', '/pokalbiai']] },
            { t: 'Informacija', l: [['Naujienos', '/naujienos'], ['Music.lt atlikėjams', '/atlikejams'], ['Naujų atlikėjų radaras', '/nauji-atlikejai'], ['Muzikos stiliai', '/muzikos-stilius'], ['Balsavimai', '/balsavimai']] },
          ].map(col => (
            <div key={col.t}>
              <h4 className="text-[10px] font-black uppercase tracking-[0.12em] mb-4" style={{ color: 'var(--text-faint)' }}>{col.t}</h4>
              <ul className="space-y-2.5">
                {col.l.map(([label, href]) => (
                  <li key={label}><a href={href} className="text-sm transition-colors" style={{ color: 'var(--text-muted)' }} onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-primary)')} onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}>{label}</a></li>
                ))}
              </ul>
            </div>
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
