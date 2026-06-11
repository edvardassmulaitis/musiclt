'use client'

import { useSite } from '@/components/SiteContext'

export function SiteFooter() {
  return (
    <footer style={{ borderTop: '1px solid var(--border-default)', background: 'var(--bg-body)' }}>
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
            { t: 'Bendruomenė', l: [['Atrasti', '/atrasti'], ['Diskusijos', '/diskusijos'], ['Muzikos atradimai', '/muzikos-atradimai'], ['Narių įrašai', '/blogas'], ['Dienos daina', '/dienos-daina'], ['Pokalbiai', '/pokalbiai']] },
            { t: 'Informacija', l: [['Naujienos', '/naujienos'], ['Atlikėjams', '/nauji-atlikejai'], ['Muzikos stiliai', '/muzikos-stilius'], ['Balsavimai', '/balsavimai']] },
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
          <span className="text-xs" style={{ color: 'var(--text-faint)' }}>© 2026 Music.lt — Visos teisės saugomos</span>
          {/* Socialiniai grįš, kai turėsim realius profilių URL — negyvi „#" išimti. */}
        </div>
      </div>
    </footer>
  )
}
