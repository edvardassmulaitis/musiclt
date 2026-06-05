'use client'

// app/muzikos-atradimai/missing-form.tsx
// „Matau, kad kažko nėra" — narys praneša apie trūkstamą atlikėją/dainą/albumą.

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

  if (done) {
    return <div className="mf-wrap"><div className="mf-done">Ačiū! Pranešimas gautas — peržiūrėsime ir pridėsime.</div>
      <style jsx>{`.mf-wrap{margin:8px 0 2px}.mf-done{background:rgba(34,197,94,.12);border:1px solid rgba(34,197,94,.3);color:var(--accent-green);border-radius:12px;padding:12px 16px;font-size:13.5px;font-weight:600}`}</style></div>
  }

  return (
    <div className="mf-wrap">
      {!open ? (
        <button className="mf-cta" onClick={() => setOpen(true)}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v8M8 12h8"/></svg>
          Matai, kad kažko trūksta? Pranešk
        </button>
      ) : (
        <div className="mf-box">
          <div className="mf-row">
            <select value={kind} onChange={e => setKind(e.target.value)}>
              <option value="artist">Atlikėjas</option>
              <option value="track">Daina</option>
              <option value="album">Albumas</option>
              <option value="kita">Kita</option>
            </select>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Pavadinimas (pvz. atlikėjas — daina)" />
          </div>
          <textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Pastaba ar nuoroda (nebūtina)" rows={2} />
          {err && <div className="mf-err">{err}</div>}
          <div className="mf-actions">
            <button className="mf-cancel" onClick={() => setOpen(false)}>Atšaukti</button>
            <button className="mf-send" onClick={submit} disabled={busy}>{busy ? 'Siunčiama…' : 'Pranešti'}</button>
          </div>
        </div>
      )}
      <style jsx>{`
        .mf-wrap{margin:6px 0 2px}
        .mf-cta{display:inline-flex;align-items:center;gap:7px;background:var(--bg-hover);border:1px dashed var(--border-default);color:var(--text-secondary);border-radius:100px;padding:8px 15px;font-size:12.5px;font-weight:600;font-family:'Outfit',sans-serif;cursor:pointer}
        .mf-cta:hover{border-color:var(--accent-orange);color:var(--text-primary)}
        .mf-box{background:var(--bg-surface);border:1px solid var(--border-default);border-radius:14px;padding:14px;max-width:560px}
        .mf-row{display:flex;gap:8px;margin-bottom:8px}
        select,input,textarea{background:var(--bg-hover);border:1px solid var(--border-default);border-radius:9px;color:var(--text-primary);font-size:13px;padding:8px 11px;outline:none;font-family:inherit}
        select{flex-shrink:0}
        input{flex:1}
        textarea{width:100%;resize:vertical}
        .mf-err{color:var(--accent-red);font-size:12.5px;margin:6px 0}
        .mf-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:10px}
        .mf-cancel{background:transparent;border:none;color:var(--text-muted);font-size:12.5px;font-weight:600;cursor:pointer;padding:8px 12px}
        .mf-send{background:var(--accent-orange);border:none;color:#fff;border-radius:9px;padding:8px 18px;font-size:13px;font-weight:700;font-family:'Outfit',sans-serif;cursor:pointer}
        .mf-send:disabled{opacity:.6}
      `}</style>
    </div>
  )
}
