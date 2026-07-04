'use client'

// „Pasiūlyk atlikėją" — atidaro MINIMALŲ modalą. Tik pavadinimas + trumpas
// aprašymas (placeholder primena žanrą/nuorodas) + el. paštas (NEBŪTINAS, o jei
// prisijungęs — visai nerodom). Anti-spam: honeypot + time-trap (serveris dar
// daro IP/email rate-limit).

import { useState, useRef, useEffect } from 'react'
import { useSession } from 'next-auth/react'

const field: React.CSSProperties = {
  width: '100%', borderRadius: 11, border: '1px solid var(--border-default)',
  background: 'var(--bg-elevated)', color: 'var(--text-primary)', padding: '11px 13px',
  fontSize: 14.5, outline: 'none', fontFamily: "'DM Sans',sans-serif",
}

export default function RadarSubmitButton() {
  const { status } = useSession()
  const loggedIn = status === 'authenticated'
  const [open, setOpen] = useState(false)
  const [state, setState] = useState<'idle' | 'sending' | 'done' | 'error'>('idle')
  const [err, setErr] = useState<string | null>(null)
  const tsRef = useRef<number>(0)

  useEffect(() => {
    if (!open) return
    tsRef.current = Date.now()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = '' }
  }, [open])

  function close() { setOpen(false); setState('idle'); setErr(null) }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (state === 'sending') return
    setState('sending'); setErr(null)
    const f = e.currentTarget
    const data = {
      artist_name: (f.elements.namedItem('artist_name') as HTMLInputElement)?.value || '',
      bio: (f.elements.namedItem('bio') as HTMLTextAreaElement)?.value || '',
      contact_email: (f.elements.namedItem('contact_email') as HTMLInputElement)?.value || '',
      website: (f.elements.namedItem('website') as HTMLInputElement)?.value || '',
      ts: tsRef.current,
    }
    try {
      const res = await fetch('/api/radar/submit', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { setErr(j.error || 'Nepavyko išsiųsti.'); setState('error'); return }
      setState('done')
    } catch { setErr('Tinklo klaida.'); setState('error') }
  }

  return (
    <>
      <button type="button" className="rd-btn rd-btn-primary" onClick={() => setOpen(true)}>Pasiūlyk atlikėją</button>

      {open && (
        <div className="rd-modal" onClick={close} role="dialog" aria-modal="true" aria-label="Pasiūlyk atlikėją">
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%', maxWidth: 480, background: 'var(--bg-surface)', borderRadius: 18,
              border: '1px solid var(--border-default)', padding: '22px 22px 24px',
              boxShadow: '0 24px 70px rgba(0,0,0,.45)',
            }}
          >
            {state === 'done' ? (
              <div style={{ textAlign: 'center', padding: '8px 0 6px' }}>
                <div style={{ fontSize: 32 }}>✅</div>
                <h3 style={{ fontFamily: "'Outfit',sans-serif", fontWeight: 800, fontSize: 18, color: 'var(--text-primary)', marginTop: 6 }}>Ačiū! Gavome.</h3>
                <p style={{ color: 'var(--text-muted)', fontSize: 14.5, marginTop: 8, lineHeight: 1.5 }}>
                  Peržiūrėsime ir, jei tinka, įtrauksime į radarą.
                </p>
                <button onClick={close} className="rd-btn rd-btn-primary" style={{ marginTop: 16 }}>Gerai</button>
              </div>
            ) : (
              <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                  <h3 style={{ fontFamily: "'Outfit',sans-serif", fontWeight: 800, fontSize: 19, color: 'var(--text-primary)' }}>Pasiūlyk atlikėją</h3>
                  <button type="button" onClick={close} aria-label="Uždaryti" style={{ width: 32, height: 32, borderRadius: '50%', border: '1px solid var(--border-default)', background: 'var(--bg-hover)', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 14, flexShrink: 0 }}>✕</button>
                </div>

                {/* honeypot */}
                <div aria-hidden style={{ position: 'absolute', left: '-9999px', width: 1, height: 1, overflow: 'hidden' }}>
                  <input type="text" name="website" tabIndex={-1} autoComplete="off" />
                </div>

                <input name="artist_name" required maxLength={120} autoFocus style={field} placeholder="Atlikėjo / grupės pavadinimas *" />

                <textarea name="bio" rows={4} maxLength={1500} style={{ ...field, resize: 'vertical' }}
                  placeholder="Trumpai apie kūrybą — stilius, miestas, ką ką tik išleidot. Nuorodas (Spotify, YouTube, IG) gali įklijuoti čia." />

                {!loggedIn && (
                  <input name="contact_email" type="email" style={field} placeholder="El. paštas (nebūtina, bet padės susisiekti)" />
                )}

                {err && <div style={{ borderRadius: 10, background: 'rgba(248,113,113,0.12)', color: 'var(--accent-red)', padding: '9px 12px', fontSize: 14 }}>{err}</div>}

                <button type="submit" disabled={state === 'sending'} className="rd-btn rd-btn-primary" style={{ opacity: state === 'sending' ? 0.6 : 1 }}>
                  {state === 'sending' ? 'Siunčiama…' : 'Pateikti'}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  )
}
