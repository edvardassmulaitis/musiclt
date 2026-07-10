'use client'

// app/zaidimai/testai/TestaiClient.tsx
//
// Testavimo puslapis — visi žaidimai vienoje vietoje, kiekvieną galima sukti
// neribotai (standalone versijos leidžia žaisti be limito; taškai skiriami tik
// pirmiems kartams per dieną). Vėliau gali tapti vieša „treniruotės" zona.

import Link from 'next/link'
import type { ReactNode } from 'react'
import ZaidimoLangas from '@/components/zaidimai/ZaidimoLangas'

const ic = (paths: ReactNode) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{paths}</svg>
)
const ICONS = {
  zap: ic(<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />),
  headphones: ic(<path d="M3 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H3v-7a9 9 0 0 1 18 0v7h-3a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3" />),
  timer: ic(<><line x1="10" x2="14" y1="2" y2="2" /><line x1="12" x2="15" y1="14" y2="11" /><circle cx="12" cy="14" r="8" /></>),
  disc: ic(<><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="2.5" /></>),
  calendar: ic(<><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" x2="16" y1="2" y2="6" /><line x1="8" x2="8" y1="2" y2="6" /><line x1="3" x2="21" y1="10" y2="10" /></>),
  swords: ic(<><polyline points="14.5 17.5 3 6 3 3 6 3 17.5 14.5" /><line x1="13" x2="19" y1="19" y2="13" /><line x1="16" x2="20" y1="16" y2="20" /><line x1="19" x2="21" y1="21" y2="19" /><polyline points="14.5 6.5 18 3 21 3 21 6 17.5 9.5" /><line x1="5" x2="9" y1="14" y2="18" /><line x1="7" x2="4" y1="17" y2="20" /><line x1="3" x2="5" y1="19" y2="21" /></>),
  briefcase: ic(<><rect x="2" y="7" width="20" height="14" rx="2" /><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" /></>),
  target: ic(<><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" /></>),
  note: ic(<><circle cx="8" cy="18" r="3" /><circle cx="18" cy="16" r="3" /><path d="M11 18V5l10-2v13" /></>),
}

const GAMES = [
  { href: '/zaidimai/ritmas', icon: ICONS.target, title: 'Pataikyk į taktą 🆕', desc: 'Bakstelk taikinius tiksliai ant dainos bitų' },
  { href: '/zaidimai/gaudykle', icon: ICONS.note, title: 'Atlikėjų gaudyklė 🆕', desc: 'Gaudyk populiarius atlikėjus — daugiau taškų už žvaigždes' },
  { href: '/zaidimai/dienos', icon: ICONS.zap, title: 'Dienos iššūkis', desc: 'Visas kasdienis rinkinys iš eilės' },
  { href: '/zaidimai/dainu-kvizas', icon: ICONS.headphones, title: 'Atspėk dainą', desc: 'Audio kvizas, 4 variantai' },
  { href: '/zaidimai/atspek-is-sekundes', icon: ICONS.timer, title: 'Atspėk iš sekundės', desc: '1 s → +3 s → +5 s ištrauka' },
  { href: '/zaidimai/atspek-is-vaizdo', icon: ICONS.disc, title: 'Atspėk iš vaizdo', desc: 'Viršelis / nuotrauka ryškėja' },
  { href: '/zaidimai/kurie-metai', icon: ICONS.calendar, title: 'Kurie metai?', desc: 'Spėk albumo išleidimo metus' },
  { href: '/zaidimai/dvikovos', icon: ICONS.swords, title: 'Dainų dvikovos', desc: 'Spėk, ką rinksis dauguma' },
  { href: '/zaidimai/vadybininkas', icon: ICONS.briefcase, title: 'Muzikos lyga', desc: 'Fantasy komanda iš realių atlikėjų' },
]

export default function TestaiClient() {
  return (
    <ZaidimoLangas title="Testavimas" backHref="/zaidimai" maxWidth={560}>
      <style>{css}</style>
      <p className="tt-lead">Visi žaidimai — žaisk neribotai. Taškai skaičiuojami tik pirmiems kartams per dieną, bet žaisti galima kiek nori.</p>
      <div className="tt-rows">
        {GAMES.map(g => (
          <Link key={g.href} href={g.href} className="tt-row">
            <span className="tt-ic">{g.icon}</span>
            <span className="tt-main">
              <span className="tt-title">{g.title}</span>
              <span className="tt-desc">{g.desc}</span>
            </span>
            <svg className="tt-go" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
          </Link>
        ))}
      </div>
    </ZaidimoLangas>
  )
}

const css = `
.tt-lead { font-size: 13px; color: var(--text-secondary); line-height: 1.5; margin: 0 0 16px; }
.tt-rows { display: flex; flex-direction: column; gap: 8px; }
.tt-row { display: flex; align-items: center; gap: 13px; text-decoration: none; padding: 14px 16px; border-radius: 13px; background: var(--bg-surface); border: 1px solid rgba(140,160,190,0.18); transition: border-color .13s ease; }
.tt-row:hover { border-color: var(--accent-orange); }
.tt-ic { display: flex; color: var(--text-secondary); flex-shrink: 0; }
.tt-main { display: flex; flex-direction: column; gap: 1px; margin-right: auto; min-width: 0; }
.tt-title { font-size: 16px; font-weight: 800; color: var(--text-primary); }
.tt-desc { font-size: 12px; color: var(--text-secondary); }
.tt-go { color: var(--text-muted); flex-shrink: 0; }
`
