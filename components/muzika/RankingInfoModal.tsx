'use client'

// ℹ️ Modalas, paaiškinantis kaip sudaromi „Populiariausi visų laikų" ir
// „Dabar populiaru" sąrašai. Paprastas: tuščiavidurė diagrama (donut) + trumpa
// legenda, BE tikslių skaičių — tik bendras vaizdas, kas sudaro balą.

import { useState } from 'react'

type Part = { label: string; weight: number; color: string; hint: string }

const ALLTIME: { title: string; intro: string; parts: Part[] } = {
  title: 'Kaip sudaromas „Populiariausi visų laikų" sąrašas',
  intro: 'Bendras atlikėjo dydis per visą laiką. Daugiausiai lemia:',
  parts: [
    { label: 'Bendras klausomumas', weight: 62, color: '#a78bfa', hint: 'kiek iš viso klausyta' },
    { label: 'music.lt palikimas', weight: 20, color: '#14b8a6', hint: 'populiarumas dar iki YouTube' },
    { label: 'Klasika', weight: 10, color: '#0ea5e9', hint: 'kaip seniai kuria' },
    { label: 'Katalogas', weight: 10, color: '#3b82f6', hint: 'kūrybos gausa' },
  ],
}

const TRENDING: { title: string; intro: string; parts: Part[] } = {
  title: 'Kaip sudaromas „Dabar populiaru" sąrašas',
  intro: 'Kas populiaru šiuo metu — iš naujausių dainų. Lemia:',
  parts: [
    { label: 'Dabartiniai topai', weight: 45, color: '#f59e0b', hint: 'ar dabar pasaulio / LT topuose' },
    { label: 'Klausomumas dabar', weight: 30, color: '#ec4899', hint: 'naujų dainų pagreitis' },
    { label: 'Šviežumas', weight: 25, color: '#22c55e', hint: 'ar ką tik išleido' },
  ],
}

function Donut({ parts }: { parts: Part[] }) {
  const total = parts.reduce((s, p) => s + p.weight, 0)
  let acc = 0
  const stops = parts.map((p) => {
    const from = (acc / total) * 100
    acc += p.weight
    const to = (acc / total) * 100
    return `${p.color} ${from}% ${to}%`
  })
  return (
    <div style={{ position: 'relative', width: 132, height: 132, flex: '0 0 auto' }}>
      <div style={{ width: '100%', height: '100%', borderRadius: '50%', background: `conic-gradient(${stops.join(', ')})` }} />
      <div style={{
        position: 'absolute', inset: 0, margin: 'auto', width: 66, height: 66, borderRadius: '50%',
        background: 'var(--modal-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <span style={{ fontSize: 20 }}>🎵</span>
      </div>
    </div>
  )
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
          border: '1.5px solid var(--modal-border, #d4d4d8)', color: 'var(--text-muted, #71717a)',
          fontSize: 14, fontWeight: 700, lineHeight: 1, cursor: 'pointer', background: 'transparent',
          verticalAlign: 'middle', flex: '0 0 auto',
        }}
      >i</button>

      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,.6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'var(--modal-bg, #0d1320)', color: 'var(--text-primary, #fff)',
              border: '1px solid var(--modal-border, rgba(255,255,255,.1))',
              borderRadius: 18, maxWidth: 460, width: '100%', padding: '22px 22px 20px',
              boxShadow: 'var(--modal-shadow, 0 8px 32px rgba(0,0,0,.5))',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
              <h3 style={{ fontSize: 17, fontWeight: 800, margin: 0, lineHeight: 1.3 }}>{d.title}</h3>
              <button onClick={() => setOpen(false)} aria-label="Uždaryti"
                style={{ background: 'transparent', border: 'none', fontSize: 22, lineHeight: 1, cursor: 'pointer', color: 'var(--text-muted,#a1a1aa)', flex: '0 0 auto' }}>×</button>
            </div>
            <p style={{ fontSize: 14, color: 'var(--text-muted, #a1a1aa)', margin: '8px 0 18px', lineHeight: 1.5 }}>{d.intro}</p>

            <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
              <Donut parts={d.parts} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 11, flex: 1, minWidth: 0 }}>
                {d.parts.map((p) => (
                  <div key={p.label} style={{ display: 'flex', alignItems: 'flex-start', gap: 9 }}>
                    <span style={{ width: 11, height: 11, borderRadius: 3, background: p.color, flex: '0 0 auto', marginTop: 3 }} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 14.5, fontWeight: 700, lineHeight: 1.25 }}>{p.label}</div>
                      <div style={{ fontSize: 14, color: 'var(--text-muted, #a1a1aa)', lineHeight: 1.3 }}>{p.hint}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <p style={{ fontSize: 13.5, color: 'var(--text-faint, #71717a)', margin: '18px 0 0', lineHeight: 1.5, borderTop: '1px solid var(--modal-border, rgba(255,255,255,.1))', paddingTop: 11 }}>
              Atnaujinama automatiškai.
            </p>
          </div>
        </div>
      )}
    </>
  )
}
