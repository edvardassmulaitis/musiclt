'use client'

// app/muzikos-atradimai/missing-form.tsx
// „Matai, kad kažko trūksta?" — chip filtrų eilutėje, atidaro modalą.

import { useState } from 'react'

export default function MissingForm() {
  const [open, setOpen] = useState(false)
  const [kind, setKind] = useState('artist')
  const [name, setName] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [err, setErr] = useState('')

  async function submit() {
    if (name.trim().length < 2) { setErr('Įrašyk pavadinimą'); return }
    setBusy(true); setErr('')
    try {
      const res = await fetch('/api/missing-reports', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, name, note, context: 'muzikos-atradimai' }),
      })
      if (res.ok) { setDone(true); setName(''); setNote('') }
      else { const d = await res.json().catch(() => ({})); setErr(d.error || 'Nepavyko') }
    } catch { setErr('Nepavyko') } finally { setBusy(false) }
  }

  function close() { setOpen(false); setTimeout(() => { setDone(false); setErr('') }, 200) }

  return (
    <>
      <button className="mf-chip" onClick={() => setOpen(true)}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v8M8 12h8"/></svg>
        Trūksta atlikėjo?
      </button>

      {open && (
        <div className="mf-overlay" onClick={close}>
          <div className="mf-modal" onClick={e => e.stopPropagation()}>
            <div className="mf-mhead">
              <strong>Matai, kad kažko trūksta?</strong>
              <button className="mf-x" onClick={close} aria-label="Uždaryti">✕</button>
            </div>
            {done ? (
              <div className="mf-done">Ačiū! Pranešimas gautas — peržiūrėsime ir pridėsime.</div>
            ) : (
              <>
                <p className="mf-sub">Pranešk apie trūkstamą atlikėją, dainą ar albumą — pridėsime į duombazę.</p>
                <div className="mf-row">
                  <select value={kind} onChange={e => setKind(e.target.value)}>
                    <option value="artist">Atlikėjas</option>
                    <option value="track">Daina</option>
                    <option value="album">Albumas</option>
                    <option value="kita">Kita</option>
                  </select>
                  <input value={name} onChange={e => setName(e.target.value)} placeholder="Pavadinimas (pvz. atlikėjas — daina)" autoFocus />
                </div>
                <textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Pastaba ar nuoroda (nebūtina)" rows={2} />
                {err && <div className="mf-err">{err}</div>}
                <div className="mf-actions">
                  <button className="mf-cancel" onClick={close}>Atšaukti</button>
                  <button className="mf-send" onClick={submit} disabled={busy}>{busy ? 'Siunčiama…' : 'Pranešti'}</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <style jsx>{`
        .mf-chip{display:inline-flex;align-items:center;gap:6px;background:var(--bg-hover);border:1px dashed var(--border-default);color:var(--text-secondary);border-radius:100px;padding:7px 13px;font-size:12.5px;font-weight:600;font-family:'Outfit',sans-serif;cursor:pointer;white-space:nowrap}
        .mf-chip:hover{border-color:var(--accent-orange);color:var(--text-primary)}
        .mf-overlay{position:fixed;inset:0;z-index:200;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;padding:20px}
        .mf-modal{background:var(--bg-surface);border:1px solid var(--border-default);border-radius:16px;padding:20px;width:100%;max-width:460px;box-shadow:0 20px 60px rgba(0,0,0,.4)}
        .mf-mhead{display:flex;justify-content:space-between;align-items:center;margin-bottom:4px}
        .mf-mhead strong{font-family:'Outfit',sans-serif;font-size:17px}
        .mf-x{background:none;border:none;color:var(--text-muted);font-size:16px;cursor:pointer;padding:4px}
        .mf-sub{color:var(--text-muted);font-size:13px;margin:2px 0 14px}
        .mf-done{background:rgba(34,197,94,.12);border:1px solid rgba(34,197,94,.3);color:var(--accent-green);border-radius:12px;padding:14px 16px;font-size:13.5px;font-weight:600;margin-top:8px}
        .mf-row{display:flex;gap:8px;margin-bottom:8px}
        select,input,textarea{background:var(--bg-hover);border:1px solid var(--border-default);border-radius:9px;color:var(--text-primary);font-size:13px;padding:9px 11px;outline:none;font-family:inherit}
        select{flex-shrink:0}
        input{flex:1;min-width:0}
        textarea{width:100%;resize:vertical}
        .mf-err{color:var(--accent-red);font-size:12.5px;margin:6px 0}
        .mf-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:12px}
        .mf-cancel{background:transparent;border:none;color:var(--text-muted);font-size:12.5px;font-weight:600;cursor:pointer;padding:8px 12px}
        .mf-send{background:var(--accent-orange);border:none;color:#fff;border-radius:9px;padding:9px 20px;font-size:13px;font-weight:700;font-family:'Outfit',sans-serif;cursor:pointer}
        .mf-send:disabled{opacity:.6}
      `}</style>
    </>
  )
}
