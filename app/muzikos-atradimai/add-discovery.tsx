'use client'

// app/muzikos-atradimai/add-discovery.tsx
// „Pridėti atradimą" — narys įdeda embed nuorodą (YT/Spotify) + aprašymą.
// Sistema bando susieti atlikėją su DB; nesusietus admin sujungia rankiniu.

import { useState } from 'react'

export default function AddDiscovery() {
  const [open, setOpen] = useState(false)
  const [url, setUrl] = useState('')
  const [desc, setDesc] = useState('')
  const [artist, setArtist] = useState('')
  const [track, setTrack] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<null | { linked: boolean }>(null)
  const [err, setErr] = useState('')

  async function submit() {
    if (!url.trim() && desc.trim().length < 10) { setErr('Įdėk YouTube/Spotify nuorodą arba bent trumpą aprašymą'); return }
    setBusy(true); setErr('')
    try {
      const res = await fetch('/api/discoveries/submit', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ embed_url: url, description: desc, artist_name: artist, track_name: track }),
      })
      if (res.status === 401) { setErr('Reikia prisijungti, kad pridėtum atradimą'); return }
      const d = await res.json()
      if (res.ok) { setDone({ linked: !!d.linked }); setUrl(''); setDesc(''); setArtist(''); setTrack('') }
      else setErr(d.error || 'Nepavyko')
    } catch { setErr('Nepavyko') } finally { setBusy(false) }
  }
  function close() { setOpen(false); setTimeout(() => { setDone(null); setErr('') }, 200) }

  return (
    <>
      <button className="ad-cta" onClick={() => setOpen(true)}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M12 5v14M5 12h14"/></svg>
        Pridėti atradimą
      </button>

      {open && (
        <div className="ad-overlay" onClick={close}>
          <div className="ad-modal" onClick={e => e.stopPropagation()}>
            <div className="ad-head">
              <strong>Pridėti muzikos atradimą</strong>
              <button className="ad-x" onClick={close} aria-label="Uždaryti">✕</button>
            </div>
            {done ? (
              <div className="ad-done">
                {done.linked ? 'Ačiū! Atradimas pridėtas ir susietas su atlikėju.' : 'Ačiū! Atradimas pridėtas. Atlikėją netrukus susiesime su duombaze.'}
                <div style={{ marginTop: 12 }}><button className="ad-send" onClick={close}>Gerai</button></div>
              </div>
            ) : (
              <>
                <p className="ad-sub">Pasidalink tuo, ką atradai — įdėk YouTube ar Spotify nuorodą ir parašyk, kuo įdomu.</p>
                <label className="ad-lbl">Nuoroda (YouTube arba Spotify)</label>
                <input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://open.spotify.com/track/… arba https://youtu.be/…" />
                <label className="ad-lbl">Aprašymas</label>
                <textarea value={desc} onChange={e => setDesc(e.target.value)} placeholder="Kaip atradai, kuo patiko, koks stilius…" rows={3} />
                <div className="ad-row">
                  <div style={{ flex: 1 }}>
                    <label className="ad-lbl">Atlikėjas (nebūtina)</label>
                    <input value={artist} onChange={e => setArtist(e.target.value)} placeholder="pvz. Radiohead" />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label className="ad-lbl">Daina (nebūtina)</label>
                    <input value={track} onChange={e => setTrack(e.target.value)} placeholder="pvz. Creep" />
                  </div>
                </div>
                {err && <div className="ad-err">{err}</div>}
                <div className="ad-actions">
                  <button className="ad-cancel" onClick={close}>Atšaukti</button>
                  <button className="ad-send" onClick={submit} disabled={busy}>{busy ? 'Pridedama…' : 'Pridėti'}</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <style jsx>{`
        .ad-cta{display:inline-flex;align-items:center;gap:6px;background:var(--accent-orange);border:1px solid var(--accent-orange);color:#fff;border-radius:100px;padding:8px 16px;font-size:12.5px;font-weight:700;font-family:'Outfit',sans-serif;cursor:pointer;white-space:nowrap}
        .ad-cta:hover{filter:brightness(1.05)}
        .ad-overlay{position:fixed;inset:0;z-index:200;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;padding:20px}
        .ad-modal{background:var(--bg-surface);border:1px solid var(--border-default);border-radius:16px;padding:20px;width:100%;max-width:500px;box-shadow:0 20px 60px rgba(0,0,0,.4);max-height:90vh;overflow-y:auto}
        .ad-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:4px}
        .ad-head strong{font-family:'Outfit',sans-serif;font-size:18px}
        .ad-x{background:none;border:none;color:var(--text-muted);font-size:16px;cursor:pointer;padding:4px}
        .ad-sub{color:var(--text-muted);font-size:13px;margin:2px 0 14px}
        .ad-lbl{display:block;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:var(--text-faint);margin:10px 0 5px;font-family:'Outfit',sans-serif}
        input,textarea{width:100%;background:var(--bg-hover);border:1px solid var(--border-default);border-radius:9px;color:var(--text-primary);font-size:13.5px;padding:9px 11px;outline:none;font-family:inherit}
        input:focus,textarea:focus{border-color:var(--accent-orange)}
        textarea{resize:vertical}
        .ad-row{display:flex;gap:10px}
        .ad-err{color:var(--accent-red);font-size:12.5px;margin-top:8px}
        .ad-done{font-size:14px;color:var(--text-primary);line-height:1.5;padding:6px 0}
        .ad-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:14px}
        .ad-cancel{background:transparent;border:none;color:var(--text-muted);font-size:12.5px;font-weight:600;cursor:pointer;padding:8px 12px}
        .ad-send{background:var(--accent-orange);border:none;color:#fff;border-radius:9px;padding:9px 20px;font-size:13px;font-weight:700;font-family:'Outfit',sans-serif;cursor:pointer}
        .ad-send:disabled{opacity:.6}
      `}</style>
    </>
  )
}
