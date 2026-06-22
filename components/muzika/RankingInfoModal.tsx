'use client'

// ℹ️ Modalas, paaiškinantis kaip sudaromi „Populiariausi visų laikų" ir
// „Dabar populiaru" sąrašai. Vizualiai (svorio juostelės) — kad atrodytų solidžiai
// ir aišku. Turinys turi atitikti lib/scoring.ts (computeAllTimeScore / Trending).

import { useState } from 'react'

type Part = { label: string; weight: number; color: string; desc: string }

const ALLTIME: { title: string; intro: string; parts: Part[]; foot: string } = {
  title: 'Kaip sudaromas „Populiariausi visų laikų" sąrašas',
  intro: 'Tai bendras atlikėjo dydis per visą laiką — kiek iš viso klausytas, ne tik dabar. Balas (0–100) susideda iš:',
  parts: [
    { label: 'Bendra aprėptis', weight: 62, color: '#a78bfa', desc: 'Kiek iš viso kartų klausyta jo dainų YouTube — pagrindinis dydžio matas.' },
    { label: 'music.lt palikimas', weight: 20, color: '#14b8a6', desc: 'Populiarumas senajame music.lt („patinka"). Kad legendos, klausytos dar iki YouTube eros, nenugrimztų po dabartinių atlikėjų.' },
    { label: 'Klasika', weight: 10, color: '#0ea5e9', desc: 'Kaip seniai atlikėjas kuria — nedidelis „klasiko" priedas.' },
    { label: 'Katalogas', weight: 10, color: '#3b82f6', desc: 'Dainų gausa — ar gilus kūrybos kelias, ar vienas hitas.' },
  ],
  foot: 'Sąmoningai NEvertinama, kas populiaru būtent dabar — tam yra „Dabar populiaru". Sąrašas atsinaujina automatiškai.',
}

const TRENDING: { title: string; intro: string; parts: Part[]; foot: string } = {
  title: 'Kaip sudaromas „Dabar populiaru" sąrašas',
  intro: 'Tai kas populiaru ŠIUO METU — skaičiuojama tik iš naujausių (maždaug paskutinių metų) dainų. Balas (0–100) susideda iš:',
  parts: [
    { label: 'Dabartiniai topai', weight: 45, color: '#f59e0b', desc: 'Ar atlikėjas šiuo metu pasaulio ir Lietuvos topuose (Billboard, Spotify, Apple Music, M.A.M.A, AGATA…). Atnaujinama kasdien.' },
    { label: 'Peržiūros per dieną', weight: 30, color: '#ec4899', desc: 'Kiek peržiūrų jo naujos dainos surenka kasdien — dabartinis pagreitis.' },
    { label: 'Šviežumas', weight: 25, color: '#22c55e', desc: 'Ar ką tik išleido naują muziką — naujas albumas duoda postūmį net jei peržiūrų dar nedaug.' },
  ],
  foot: 'Senesni hitai į šį sąrašą nepatenka — jie matomi „Populiariausi visų laikų". Atnaujinama kasdien.',
}

export default function RankingInfoModal({ kind }: { kind: 'alltime' | 'trending' }) {
  const [open, setOpen] = useState(false)
  const d = kind === 'trending' ? TRENDING : ALLTIME

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Kaip sudaromas šis sąrašas?"
        title="Kaip sudaromas šis sąrašas?"
        style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 20, height: 20, marginLeft: 7, borderRadius: '50%',
          border: '1.5px solid var(--border-subtle, #d4d4d8)', color: 'var(--text-muted, #71717a)',
          fontSize: 12, fontWeight: 700, lineHeight: 1, cursor: 'pointer', background: 'transparent',
          verticalAlign: 'middle', flex: '0 0 auto',
        }}
      >i</button>

      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,.55)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'var(--card-bg, #fff)', color: 'var(--text-primary, #18181b)',
              borderRadius: 18, maxWidth: 520, width: '100%', maxHeight: '85vh', overflowY: 'auto',
              padding: '22px 22px 18px', boxShadow: '0 24px 60px rgba(0,0,0,.35)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
              <h3 style={{ fontSize: 18, fontWeight: 800, margin: 0, lineHeight: 1.25 }}>{d.title}</h3>
              <button onClick={() => setOpen(false)} aria-label="Uždaryti"
                style={{ background: 'transparent', border: 'none', fontSize: 22, lineHeight: 1, cursor: 'pointer', color: 'var(--text-muted,#71717a)' }}>×</button>
            </div>
            <p style={{ fontSize: 13.5, color: 'var(--text-muted, #52525b)', margin: '8px 0 16px', lineHeight: 1.5 }}>{d.intro}</p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {d.parts.map((p) => (
                <div key={p.label}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 5 }}>
                    <span style={{ fontWeight: 700, fontSize: 14, color: p.color }}>{p.label}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-faint, #a1a1aa)', fontWeight: 600 }}>iki {p.weight} balų</span>
                  </div>
                  <div style={{ height: 6, borderRadius: 4, background: 'var(--bg-elevated, #f4f4f5)', overflow: 'hidden', marginBottom: 5 }}>
                    <div style={{ height: '100%', width: `${p.weight}%`, background: p.color, borderRadius: 4 }} />
                  </div>
                  <p style={{ fontSize: 12.5, color: 'var(--text-muted, #52525b)', margin: 0, lineHeight: 1.45 }}>{p.desc}</p>
                </div>
              ))}
            </div>

            <p style={{ fontSize: 12, color: 'var(--text-faint, #a1a1aa)', margin: '16px 0 0', lineHeight: 1.5, borderTop: '1px solid var(--border-subtle, #e4e4e7)', paddingTop: 12 }}>{d.foot}</p>
          </div>
        </div>
      )}
    </>
  )
}
