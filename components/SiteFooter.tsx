'use client'

import { useSite } from '@/components/SiteContext'

export function SiteFooter() {
  const { dk } = useSite()

  return (
    <footer style={{ borderTop: dk ? '1px solid rgba(255,255,255,0.05)' : '1px solid rgba(0,0,0,0.1)', background: dk ? '#080b11' : '#e4eaf5' }}>
      <div className="max-w-[1360px] mx-auto px-5 lg:px-8 py-12">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-8 mb-10">
          <div>
            <div className="font-black text-xl mb-3"><span style={{ color: dk ? '#f2f4f8' : '#0f1a2e' }}>music</span><span className="text-orange-400">.lt</span></div>
            <p className="text-sm leading-relaxed" style={{ color: dk ? '#2a3a50' : '#6a85a8' }}>Lietuvos muzikos ekosistemos platforma nuo 1999 m.</p>
          </div>
          {[
            { t: 'Platforma', l: [['Topai', '/'], ['Nauja muzika', '/'], ['Renginiai', '/'], ['Atlikėjai', '/atlikejai'], ['Albumai', '/']] },
            { t: 'Bendruomenė', l: [['Diskusijos', '/'], ['Blogai', '/blogas/mano'], ['Gyvi pokalbiai', '/'], ['Dienos daina', '/']] },
            { t: 'Informacija', l: [['Apie mus', '/'], ['Atlikėjams', '/'], ['Reklama', '/'], ['Kontaktai', '/'], ['Privatumas', '/privatumas']] },
          ].map(col => (
            <div key={col.t}>
              <h4 className="text-[10px] font-black uppercase tracking-[0.12em] mb-4" style={{ color: dk ? '#1e2e42' : '#6a85a8' }}>{col.t}</h4>
              <ul className="space-y-2.5">
                {col.l.map(([label, href]) => (
                  <li key={label}><a href={href} className="text-sm transition-colors" style={{ color: dk ? '#2a3a50' : '#4a6080' }} onMouseEnter={e => (e.currentTarget.style.color = dk ? '#f2f4f8' : '#0f1a2e')} onMouseLeave={e => (e.currentTarget.style.color = dk ? '#2a3a50' : '#4a6080')}>{label}</a></li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="flex flex-col sm:flex-row justify-between items-center gap-3 pt-8" style={{ borderTop: dk ? '1px solid rgba(255,255,255,0.04)' : '1px solid rgba(0,0,0,0.08)' }}>
          <span className="text-xs" style={{ color: dk ? '#1a2535' : '#6a85a8' }}>© 2026 Music.lt — Visos teisės saugomos</span>
          <div className="flex gap-5">
            {['Facebook', 'Instagram', 'YouTube', 'Spotify'].map(sn => (
              <a key={sn} href="#" className="text-xs transition-colors" style={{ color: dk ? '#1a2535' : '#6a85a8' }} onMouseEnter={e => (e.currentTarget.style.color = dk ? '#f2f4f8' : '#0f1a2e')} onMouseLeave={e => (e.currentTarget.style.color = dk ? '#1a2535' : '#6a85a8')}>{sn}</a>
            ))}
          </div>
        </div>
      </div>
    </footer>
  )
}
