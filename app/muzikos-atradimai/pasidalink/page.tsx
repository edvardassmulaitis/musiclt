'use client'

// app/muzikos-atradimai/pasidalink/page.tsx
//
// „Pasidalink atradimu" — wizard'o formato forma (kaip /blogas/rasyti srautai),
// vietoj mažo modalo. 3 žingsniai: nuoroda (su YT preview) → aprašymas →
// atlikėjas/daina (nebūtina) → POST /api/discoveries/submit.

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useSession } from 'next-auth/react'

const YT_RE = /(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:watch\?v=|embed\/|shorts\/|v\/))([A-Za-z0-9_-]{11})/
const SPOTIFY_RE = /open\.spotify\.com\/(?:intl-[a-z]+\/)?track\/([A-Za-z0-9]+)/

const STEPS = ['Nuoroda', 'Aprašymas', 'Detalės']

export default function PasidalinkAtradimuPage() {
  const { data: session } = useSession()
  const [step, setStep] = useState(0)
  const [url, setUrl] = useState('')
  const [desc, setDesc] = useState('')
  const [artist, setArtist] = useState('')
  const [track, setTrack] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [done, setDone] = useState<null | { linked: boolean }>(null)

  const ytId = useMemo(() => url.match(YT_RE)?.[1] || null, [url])
  const spId = useMemo(() => url.match(SPOTIFY_RE)?.[1] || null, [url])
  const urlOk = !!(ytId || spId)

  const canNext = step === 0 ? (urlOk || url.trim() === '') : step === 1 ? (urlOk || desc.trim().length >= 10) : true

  async function submit() {
    if (busy) return
    if (!urlOk && desc.trim().length < 10) { setErr('Įdėk YouTube/Spotify nuorodą arba bent trumpą aprašymą'); return }
    setBusy(true); setErr('')
    try {
      const res = await fetch('/api/discoveries/submit', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ embed_url: url, description: desc, artist_name: artist, track_name: track }),
      })
      if (res.status === 401) { setErr('Reikia prisijungti, kad pasidalintum atradimu'); return }
      const d = await res.json()
      if (res.ok) setDone({ linked: !!d.linked })
      else setErr(d.error || 'Nepavyko')
    } catch { setErr('Nepavyko') } finally { setBusy(false) }
  }

  const input = 'w-full rounded-xl border border-[var(--border-default)] bg-[var(--bg-hover)] px-3.5 py-3 text-[var(--text-primary)] outline-none focus:border-[var(--accent-orange)]'

  return (
    <div className="page-shell" style={{ maxWidth: 640 }}>
      <div className="page-head">
        <h1>Pasidalink atradimu</h1>
        <p>Atradai kažką įdomaus? Parodyk bendruomenei — daina, albumas, atlikėjas ar visai nežinomas perliukas.</p>
      </div>

      {done ? (
        <div className="rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-8 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[rgba(34,197,94,0.15)] text-[22px]">✓</div>
          <p className="m-0 font-['Outfit',sans-serif] text-[17px] font-extrabold text-[var(--text-primary)]">Ačiū! Atradimas pridėtas.</p>
          <p className="m-0 mt-1.5 text-[14px] text-[var(--text-muted)]">{done.linked ? 'Susiejome jį su atlikėju duombazėje.' : 'Atlikėją netrukus susiesime su duombaze.'}</p>
          <div className="mt-5 flex justify-center gap-3">
            <Link href="/muzikos-atradimai" className="rounded-xl bg-[var(--accent-orange)] px-5 py-2.5 font-['Outfit',sans-serif] text-[14px] font-extrabold text-white no-underline">Visi atradimai →</Link>
            <button type="button" onClick={() => { setDone(null); setStep(0); setUrl(''); setDesc(''); setArtist(''); setTrack('') }}
              className="cursor-pointer rounded-xl border border-[var(--border-default)] bg-transparent px-5 py-2.5 font-['Outfit',sans-serif] text-[14px] font-bold text-[var(--text-secondary)]">+ Dar vienas</button>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-5 sm:p-7">
          {/* žingsnių indikatorius */}
          <div className="mb-6 flex items-center gap-2">
            {STEPS.map((s, i) => (
              <div key={s} className="flex flex-1 items-center gap-2">
                <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full font-['Outfit',sans-serif] text-[12px] font-extrabold ${i <= step ? 'bg-[var(--accent-orange)] text-white' : 'bg-[var(--bg-active)] text-[var(--text-faint)]'}`}>{i + 1}</span>
                <span className={`hidden text-[12.5px] font-bold sm:inline ${i <= step ? 'text-[var(--text-primary)]' : 'text-[var(--text-faint)]'}`}>{s}</span>
                {i < STEPS.length - 1 && <span className="h-px flex-1 bg-[var(--border-default)]" />}
              </div>
            ))}
          </div>

          {step === 0 && (
            <>
              <label className="mb-2 block font-['Outfit',sans-serif] text-[13px] font-extrabold uppercase tracking-[0.06em] text-[var(--text-muted)]">YouTube arba Spotify nuoroda</label>
              <input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://youtu.be/… arba https://open.spotify.com/track/…" className={input} style={{ fontSize: 16 }} />
              {ytId && (
                <div className="mt-4 overflow-hidden rounded-xl border border-[var(--border-default)]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`https://img.youtube.com/vi/${ytId}/mqdefault.jpg`} alt="" className="block w-full object-cover" style={{ maxHeight: 220 }} />
                </div>
              )}
              {spId && <p className="m-0 mt-3 text-[13.5px] font-bold text-[#1db954]">✓ Spotify daina atpažinta</p>}
              {url.trim() && !urlOk && <p className="m-0 mt-2 text-[13px] text-[var(--accent-red,#f87171)]">Neatpažinta nuoroda — tinka YouTube arba Spotify track linkai. Gali tęsti ir be nuorodos.</p>}
              <p className="m-0 mt-3 text-[13px] text-[var(--text-faint)]">Neturi nuorodos? Nieko tokio — tęsk, užteks aprašymo.</p>
            </>
          )}

          {step === 1 && (
            <>
              <label className="mb-2 block font-['Outfit',sans-serif] text-[13px] font-extrabold uppercase tracking-[0.06em] text-[var(--text-muted)]">Kuo šis atradimas įdomus?</label>
              <textarea value={desc} onChange={e => setDesc(e.target.value)} rows={6} placeholder="Kaip atradai, kuo patiko, kam patiktų, koks stilius…" className={input + ' resize-none'} style={{ fontSize: 16 }} />
              <p className="m-0 mt-2 text-[13px] text-[var(--text-faint)]">Geras aprašymas = daugiau perklausų. Bent sakinys-kitas apie tai, kodėl verta.</p>
            </>
          )}

          {step === 2 && (
            <>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-2 block font-['Outfit',sans-serif] text-[13px] font-extrabold uppercase tracking-[0.06em] text-[var(--text-muted)]">Atlikėjas <span className="font-normal normal-case text-[var(--text-faint)]">(nebūtina)</span></label>
                  <input value={artist} onChange={e => setArtist(e.target.value)} placeholder="pvz. Radiohead" className={input} style={{ fontSize: 16 }} />
                </div>
                <div>
                  <label className="mb-2 block font-['Outfit',sans-serif] text-[13px] font-extrabold uppercase tracking-[0.06em] text-[var(--text-muted)]">Daina <span className="font-normal normal-case text-[var(--text-faint)]">(nebūtina)</span></label>
                  <input value={track} onChange={e => setTrack(e.target.value)} placeholder="pvz. Creep" className={input} style={{ fontSize: 16 }} />
                </div>
              </div>
              <p className="m-0 mt-3 text-[13px] text-[var(--text-faint)]">Padės susieti atradimą su atlikėjo puslapiu — bet jei nežinai, paliksim adminams.</p>
            </>
          )}

          {err && <p className="m-0 mt-4 text-[13.5px] font-bold text-[var(--accent-red,#f87171)]">{err}</p>}
          {!session?.user && <p className="m-0 mt-4 text-[13.5px] text-[var(--text-muted)]">Pasidalinti gali tik prisijungę nariai — <Link href="/auth/signin" className="font-bold text-[var(--accent-orange)] no-underline">prisijunk →</Link></p>}

          <div className="mt-6 flex items-center justify-between">
            {step > 0 ? (
              <button type="button" onClick={() => setStep(s => s - 1)} className="cursor-pointer border-0 bg-transparent p-0 font-['Outfit',sans-serif] text-[14px] font-bold text-[var(--text-muted)]">← Atgal</button>
            ) : <span />}
            {step < STEPS.length - 1 ? (
              <button type="button" disabled={!canNext} onClick={() => { setErr(''); setStep(s => s + 1) }}
                className="cursor-pointer rounded-xl border-0 bg-[var(--accent-orange)] px-6 py-2.5 font-['Outfit',sans-serif] text-[14px] font-extrabold text-white shadow-[0_4px_16px_rgba(249,115,22,0.3)] disabled:opacity-50">Toliau →</button>
            ) : (
              <button type="button" disabled={busy} onClick={submit}
                className="cursor-pointer rounded-xl border-0 bg-[var(--accent-orange)] px-6 py-2.5 font-['Outfit',sans-serif] text-[14px] font-extrabold text-white shadow-[0_4px_16px_rgba(249,115,22,0.3)] disabled:opacity-50">{busy ? 'Siunčiama…' : 'Pasidalinti atradimu'}</button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
