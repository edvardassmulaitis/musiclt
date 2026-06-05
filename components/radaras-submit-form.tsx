'use client'

// Radaro pateikimo forma. Anti-spam: honeypot (`website`), time-trap (`ts`).
// Serveris dar daro IP/email rate-limit (žr. /api/radar/submit).

import { useState, useRef } from 'react'
import Link from 'next/link'

type State = 'idle' | 'sending' | 'done' | 'error'

const lbl: React.CSSProperties = {
  display: 'block', fontFamily: "'Outfit',sans-serif", fontSize: 12.5, fontWeight: 700,
  color: 'var(--text-secondary)', marginBottom: 6,
}
const field: React.CSSProperties = {
  width: '100%', borderRadius: 11, border: '1px solid var(--border-default)',
  background: 'var(--bg-elevated)', color: 'var(--text-primary)', padding: '11px 13px',
  fontSize: 14, outline: 'none', fontFamily: "'DM Sans',sans-serif",
}

export default function RadarSubmitForm() {
  const [state, setState] = useState<State>('idle')
  const [err, setErr] = useState<string | null>(null)
  const tsRef = useRef<number>(Date.now())

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (state === 'sending') return
    setState('sending'); setErr(null)
    const f = e.currentTarget
    const data = {
      artist_name: (f.elements.namedItem('artist_name') as HTMLInputElement)?.value || '',
      contact_email: (f.elements.namedItem('contact_email') as HTMLInputElement)?.value || '',
      links: (f.elements.namedItem('links') as HTMLTextAreaElement)?.value || '',
      genre: (f.elements.namedItem('genre') as HTMLInputElement)?.value || '',
      city: (f.elements.namedItem('city') as HTMLInputElement)?.value || '',
      bio: (f.elements.namedItem('bio') as HTMLTextAreaElement)?.value || '',
      message: (f.elements.namedItem('message') as HTMLTextAreaElement)?.value || '',
      website: (f.elements.namedItem('website') as HTMLInputElement)?.value || '', // honeypot
      ts: tsRef.current,
    }
    try {
      const res = await fetch('/api/radar/submit', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { setErr(j.error || 'Nepavyko išsiųsti. Pabandyk dar kartą.'); setState('error'); return }
      setState('done')
    } catch {
      setErr('Tinklo klaida. Pabandyk dar kartą.'); setState('error')
    }
  }

  if (state === 'done') {
    return (
      <div style={{
        borderRadius: 16, border: '1px solid rgba(34,197,94,0.35)', background: 'rgba(34,197,94,0.07)',
        padding: '26px 24px', textAlign: 'center',
      }}>
        <div style={{ fontSize: 34, marginBottom: 6 }}>✅</div>
        <h2 style={{ fontFamily: "'Outfit',sans-serif", fontWeight: 800, fontSize: 19, color: 'var(--text-primary)' }}>Ačiū! Gavome.</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: 14, marginTop: 8, lineHeight: 1.55 }}>
          Peržiūrėsime pasiūlymą ir, jei tinka, įtrauksime į radarą. Tinkamiems parašysime el. paštu.
        </p>
        <Link href="/nauji-atlikejai" style={{
          display: 'inline-block', marginTop: 16, fontFamily: "'Outfit',sans-serif", fontWeight: 700,
          fontSize: 14, color: '#fff', background: 'var(--accent-orange)', padding: '10px 18px', borderRadius: 11, textDecoration: 'none',
        }}>← Atgal į radarą</Link>
      </div>
    )
  }

  return (
    <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Honeypot — paslėptas nuo žmonių, botai užpildo */}
      <div aria-hidden style={{ position: 'absolute', left: '-9999px', width: 1, height: 1, overflow: 'hidden' }}>
        <label>Tavo svetainė<input type="text" name="website" tabIndex={-1} autoComplete="off" /></label>
      </div>

      <div>
        <label style={lbl} htmlFor="artist_name">Atlikėjo / grupės pavadinimas *</label>
        <input id="artist_name" name="artist_name" required maxLength={120} style={field} placeholder="Pvz. Saulės Kliošas" />
      </div>

      <div>
        <label style={lbl} htmlFor="contact_email">El. paštas (susisiekimui) *</label>
        <input id="contact_email" name="contact_email" type="email" required style={field} placeholder="vardas@pastas.lt" />
      </div>

      <div>
        <label style={lbl} htmlFor="links">Nuorodos (Spotify, YouTube, Instagram…)</label>
        <textarea id="links" name="links" rows={3} maxLength={1000} style={{ ...field, resize: 'vertical' }} placeholder={'Po vieną eilutėje:\nhttps://open.spotify.com/...\nhttps://youtube.com/...'} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div>
          <label style={lbl} htmlFor="genre">Stilius / žanras</label>
          <input id="genre" name="genre" maxLength={80} style={field} placeholder="Pvz. indie, repas…" />
        </div>
        <div>
          <label style={lbl} htmlFor="city">Miestas</label>
          <input id="city" name="city" maxLength={80} style={field} placeholder="Pvz. Kaunas" />
        </div>
      </div>

      <div>
        <label style={lbl} htmlFor="bio">Trumpai apie kūrybą</label>
        <textarea id="bio" name="bio" rows={4} maxLength={1500} style={{ ...field, resize: 'vertical' }} placeholder="Kas tu/jūs, ką kuriate, kuo įdomu?" />
      </div>

      <div>
        <label style={lbl} htmlFor="message">Žinutė redakcijai (nebūtina)</label>
        <textarea id="message" name="message" rows={2} maxLength={1000} style={{ ...field, resize: 'vertical' }} placeholder="Pvz. ką tik išleidau singlą…" />
      </div>

      {err && <div style={{ borderRadius: 10, background: 'rgba(248,113,113,0.12)', color: 'var(--accent-red)', padding: '10px 12px', fontSize: 13.5 }}>{err}</div>}

      <button type="submit" disabled={state === 'sending'} style={{
        fontFamily: "'Outfit',sans-serif", fontWeight: 700, fontSize: 15, color: '#fff',
        background: 'linear-gradient(92deg,var(--accent-orange),#fb923c)', border: 0,
        padding: '13px 22px', borderRadius: 12, cursor: state === 'sending' ? 'default' : 'pointer',
        opacity: state === 'sending' ? 0.6 : 1, alignSelf: 'flex-start',
      }}>
        {state === 'sending' ? 'Siunčiama…' : 'Pateikti radarui'}
      </button>

      <p style={{ fontSize: 11.5, color: 'var(--text-faint)', lineHeight: 1.5 }}>
        Pateikdami sutinkate, kad su jumis susisieksime nurodytu el. paštu. Pateikimai peržiūrimi rankiniu būdu.
      </p>
    </form>
  )
}
