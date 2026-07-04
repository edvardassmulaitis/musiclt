'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { youtubeId } from '@/lib/social-embed'

type Artist = { id: number; slug: string; name: string; cover_image_url: string | null; cover_image_wide_url: string | null; profile_theme: string; accent_color: string | null; hidden_sections: string[] }
type Genre = { id: number; name: string }
type Song = { id: number; title: string; slug: string | null; video_url: string | null; video_uploaded_at: string | null; release_year: number | null; is_pinned: boolean; state: string; weeks: number }
type Photo = { id: number; url: string; caption: string | null }
type Ev = { id: number; slug: string | null; title: string; start_date: string; venue_name: string | null; city: string | null }
type Stats = { views: number; likes: number; followers: number; temp: number; topPos: { pos: number; title: string } | null; complete: number }

const MONTHS = ['Sau', 'Vas', 'Kov', 'Bal', 'Geg', 'Bir', 'Lie', 'Rugp', 'Rugs', 'Spa', 'Lap', 'Gru']
const ACCENTS = ['#f97316', '#e11d48', '#0ea5e9', '#10b981', '#8b5cf6']
const SECTIONS: { key: string; label: string }[] = [
  { key: 'social', label: 'Soc. įrašai' }, { key: 'events', label: 'Renginiai' },
  { key: 'gallery', label: 'Galerija' }, { key: 'similar', label: 'Panašūs atlikėjai' },
]

const I = {
  ext: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 17 17 7M7 7h10v10" /></svg>,
  plus: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>,
  yt: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m10 17 5-3-5-3z" /><rect x="2" y="5" width="20" height="14" rx="3" /></svg>,
  link: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></svg>,
  music: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></svg>,
  pin: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 17v5M9 10.76V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v5.76l1.5 2.24h-9z" /></svg>,
  trophy: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8a6 6 0 0 1-12 0M6 2h12v6a6 6 0 0 1-12 0V2zM4 22h16" /></svg>,
}

function thumb(url: string | null) { const v = url ? youtubeId(url) : null; return v ? `https://i.ytimg.com/vi/${v}/mqdefault.jpg` : null }

export default function DashboardClient({ artist, genres, songs, photos, events, stats }: {
  artist: Artist; genres: Genre[]; songs: Song[]; photos: Photo[]; events: Ev[]; stats: Stats
}) {
  const router = useRouter()
  const [dainaUrl, setDainaUrl] = useState('')
  const [socUrl, setSocUrl] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [toast, setToast] = useState<{ ok: boolean; t: string } | null>(null)
  const [theme, setTheme] = useState(artist.profile_theme)
  const [accent, setAccent] = useState(artist.accent_color || '#f97316')
  const [hidden, setHidden] = useState<string[]>(artist.hidden_sections || [])

  const flash = (ok: boolean, t: string) => { setToast({ ok, t }); setTimeout(() => setToast(null), 3500) }
  async function post(url: string, body: any) {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    return r.json().catch(() => ({}))
  }

  async function addDaina() {
    if (!dainaUrl.trim()) return; setBusy('daina')
    const d = await post('/api/studija/track', { artistId: artist.id, url: dainaUrl })
    if (d.ok) { setDainaUrl(''); flash(true, d.already ? 'Tokia daina jau yra' : 'Daina pridėta ✓'); router.refresh() }
    else flash(false, d.error || 'Nepavyko'); setBusy(null)
  }
  async function addSoc() {
    if (!socUrl.trim()) return; setBusy('soc')
    const d = await post('/api/studija/embeds', { artistId: artist.id, url: socUrl })
    if (d.ok) { setSocUrl(''); flash(true, 'Įrašas pridėtas ✓'); router.refresh() }
    else flash(false, d.error || 'Nepavyko'); setBusy(null)
  }
  async function togglePin(s: Song) { await post('/api/studija/pin', { artistId: artist.id, trackId: s.id, pinned: !s.is_pinned }); router.refresh() }
  async function suggest(s: Song) {
    setBusy('s' + s.id)
    const d = await post('/api/studija/suggest-top', { artistId: artist.id, trackId: s.id })
    if (d.ok) { flash(true, 'Pasiūlyta į Top 40 ✓'); router.refresh() } else flash(false, d.error || 'Nepavyko')
    setBusy(null)
  }
  async function photoAct(action: string, url: string, photoId?: number) {
    await post('/api/studija/photo', { artistId: artist.id, action, url, photoId }); flash(true, action === 'delete' ? 'Pašalinta' : 'Nustatyta ✓'); router.refresh()
  }
  async function saveAppearance(patch: any) { const d = await post('/api/studija/appearance', { artistId: artist.id, ...patch }); if (d.ok) flash(true, 'Išsaugota ✓'); else flash(false, d.error || 'Nepavyko') }

  const card = 'rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)]'
  const fld = 'flex-1 min-w-0 flex items-center gap-2 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2.5'
  const inp = 'flex-1 min-w-0 bg-transparent outline-none text-sm text-[var(--text-primary)] placeholder:text-[var(--text-faint)]'
  const addb = 'shrink-0 inline-flex items-center gap-1.5 rounded-xl bg-[#f97316] px-4 text-sm font-bold text-white font-[Outfit,sans-serif] disabled:opacity-60'
  const gt = "mt-7 mb-3 flex items-center gap-2 text-[14px] font-extrabold uppercase tracking-wider text-[var(--text-faint)] font-[Outfit,sans-serif]"

  return (
    <div>
      {/* HEADER */}
      <div className="flex flex-wrap items-start gap-4">
        <div className="h-14 w-14 shrink-0 overflow-hidden rounded-full bg-[var(--bg-elevated)]">
          {artist.cover_image_url ? <img src={artist.cover_image_url} alt="" className="h-full w-full object-cover" /> : null}
        </div>
        <div>
          <a href={`/atlikejai/${artist.slug}`} target="_blank" rel="noreferrer" className="group inline-flex items-center gap-2 font-[Outfit,sans-serif] text-2xl font-extrabold text-[var(--text-primary)]">
            {artist.name}<span className="text-[var(--text-muted)] opacity-0 transition group-hover:opacity-100">{I.ext}</span>
          </a>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {genres.map((g, i) => (
              <span key={g.id} className={`rounded-full border px-2.5 py-1 text-xs font-semibold font-[Outfit,sans-serif] ${i === 0 ? 'border-[rgba(249,115,22,0.25)] bg-[rgba(249,115,22,0.13)] text-[#f97316]' : 'border-[var(--border-default)] bg-[var(--bg-hover)] text-[var(--text-secondary)]'}`}>{g.name}</span>
            ))}
            {genres.length === 0 && <span className="text-xs text-[var(--text-muted)]">Pridėk stilių per „Profilio info"</span>}
          </div>
        </div>
        {/* MINI DASHBOARD */}
        <div className="ml-auto flex flex-wrap gap-2.5">
          <Mini label="Peržiūros" value={stats.views.toLocaleString('lt-LT')} spark="#f97316" />
          <Mini label="Temperatūra" value={`${stats.temp}°`} sub="vs LT atlikėjai" />
          <Mini label="Top 40 vieta" value={stats.topPos ? `#${stats.topPos.pos}` : '—'} sub={stats.topPos?.title || 'dar ne topе'} accent />
        </div>
      </div>

      {/* TWO ADD BOXES */}
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <div className={`${card} p-4`}>
          <div className="mb-2.5 flex items-center gap-2.5 font-[Outfit,sans-serif] text-[15px] font-bold text-[var(--text-primary)]">
            <span className="grid h-8 w-8 place-items-center rounded-[9px] text-[#f87171]" style={{ background: 'rgba(248,113,113,.14)' }}>{I.music}</span>Nauja daina
          </div>
          <div className="flex gap-2">
            <div className={fld}><span className="text-[var(--text-muted)]">{I.yt}</span><input value={dainaUrl} onChange={(e) => setDainaUrl(e.target.value)} placeholder="YouTube nuoroda…" className={inp} /></div>
            <button onClick={addDaina} disabled={busy === 'daina'} className={addb}>{busy === 'daina' ? '…' : <>{I.plus} Pridėti</>}</button>
          </div>
        </div>
        <div className={`${card} p-4`}>
          <div className="mb-2.5 flex items-center gap-2.5 font-[Outfit,sans-serif] text-[15px] font-bold text-[var(--text-primary)]">
            <span className="grid h-8 w-8 place-items-center rounded-[9px] text-[#5a8ec8]" style={{ background: 'rgba(90,142,200,.16)' }}>{I.link}</span>Soc. įrašas
          </div>
          <div className="flex gap-2">
            <div className={fld}><span className="text-[var(--text-muted)]">{I.link}</span><input value={socUrl} onChange={(e) => setSocUrl(e.target.value)} placeholder="Insta / FB / TikTok nuoroda…" className={inp} /></div>
            <button onClick={addSoc} disabled={busy === 'soc'} className={addb}>{busy === 'soc' ? '…' : <>{I.plus} Pridėti</>}</button>
          </div>
        </div>
      </div>

      {/* GALLERY STRIP */}
      <div className={`${card} mt-3 p-3.5`}>
        <div className="mb-2.5 flex items-center"><b className="font-[Outfit,sans-serif] text-sm font-bold text-[var(--text-primary)]">Galerija</b><span className="ml-2 text-[13px] text-[var(--text-muted)]">užvesk → hero / profilis · arba įkelk naują</span></div>
        <div className="flex gap-2.5 overflow-x-auto pb-1">
          <label className="grid h-[92px] w-[124px] shrink-0 cursor-pointer place-items-center rounded-[10px] border border-dashed border-[var(--border-strong)] text-center text-[13px] text-[var(--text-muted)]" onClick={() => flash(true, 'Nuotraukų įkėlimas — netrukus')}>
            <span>{I.plus}<br />Įkelti</span>
          </label>
          {photos.map((p) => {
            const isHero = artist.cover_image_wide_url === p.url, isProf = artist.cover_image_url === p.url
            return (
              <div key={p.id} className="group relative h-[92px] w-[124px] shrink-0 overflow-hidden rounded-[10px] border border-[var(--border-subtle)] bg-[var(--bg-surface)]">
                <img src={p.url} alt="" className="h-full w-full object-cover" />
                {(isHero || isProf) && <span className={`absolute left-1.5 top-1.5 rounded-full px-1.5 py-0.5 text-[11px] font-bold text-white ${isHero ? 'bg-[#f97316]' : 'bg-black/60'}`}>{isHero ? 'Hero' : 'Profilis'}</span>}
                <button onClick={() => { if (confirm('Pašalinti nuotrauką?')) photoAct('delete', p.url, p.id) }} title="Pašalinti" className="absolute right-1.5 top-1.5 z-10 grid h-6 w-6 place-items-center rounded-full bg-black/60 text-white opacity-0 transition group-hover:opacity-100">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
                </button>
                <div className="absolute inset-0 flex flex-col justify-end gap-1 bg-gradient-to-t from-black/85 to-transparent p-1.5 opacity-0 transition group-hover:opacity-100">
                  <button onClick={() => photoAct('hero', p.url)} className="rounded-md bg-[#f97316] py-1 text-[12px] font-semibold text-white">Hero</button>
                  <button onClick={() => photoAct('profile', p.url)} className="rounded-md border border-white/20 bg-white/10 py-1 text-[12px] font-semibold text-white">Profilis</button>
                </div>
              </div>
            )
          })}
          {photos.length === 0 && <div className="grid h-[92px] flex-1 place-items-center text-xs text-[var(--text-muted)]">Dar nėra nuotraukų</div>}
        </div>
      </div>

      {/* SONGS + EVENTS */}
      <div className="grid items-start gap-4 sm:grid-cols-2">
        <div>
          <div className={gt}>Naujausios dainos <a href={`/atlikejams/zona/muzika?a=${artist.id}`} className="ml-auto text-[14px] font-semibold normal-case tracking-normal text-[var(--accent-link)]">Visa muzika →</a></div>
          {songs.length === 0 && <p className="text-sm text-[var(--text-muted)]">Pridėk pirmą dainą iš YouTube ↑</p>}
          {songs.map((s) => (
            <div key={s.id} className={`mb-2 flex items-center gap-3 rounded-xl border p-2.5 ${s.is_pinned ? 'border-[rgba(249,115,22,0.35)] bg-[rgba(249,115,22,0.05)]' : 'border-[var(--border-subtle)] bg-[var(--bg-elevated)]'}`}>
              <button onClick={() => togglePin(s)} title="Prisegti" className={`grid h-7 w-7 shrink-0 place-items-center rounded-md ${s.is_pinned ? 'text-[#f97316]' : 'text-[var(--text-muted)] bg-[var(--bg-hover)]'}`}>{I.pin}</button>
              <div className="h-[34px] w-[54px] shrink-0 overflow-hidden rounded-md bg-[var(--bg-surface)]">{thumb(s.video_url) ? <img src={thumb(s.video_url)!} alt="" className="h-full w-full object-cover" /> : null}</div>
              <div className="min-w-0 flex-1"><b className="block truncate text-[14px] font-semibold text-[var(--text-primary)]">{s.title}</b><small className="text-[12.5px] text-[var(--text-muted)]">{s.is_pinned ? 'Prisegta · ' : ''}{s.video_uploaded_at ? new Date(s.video_uploaded_at).toLocaleDateString('lt-LT') : (s.release_year || '—')}</small></div>
              {s.state === 'eligible' && <button onClick={() => suggest(s)} disabled={busy === 's' + s.id} className="inline-flex items-center gap-1.5 rounded-full bg-[#f97316] px-3 py-1.5 text-[12.5px] font-bold text-white font-[Outfit,sans-serif]">{I.trophy} Top 40</button>}
              {s.state === 'in' && <span className="rounded-full bg-[rgba(34,197,94,.14)] px-3 py-1.5 text-[12.5px] font-bold text-[var(--accent-green)]">Topе · {s.weeks} sav.</span>}
              {s.state === 'pending' && <span className="rounded-full bg-[rgba(251,191,36,.13)] px-3 py-1.5 text-[12.5px] font-bold text-[#fbbf24]">Pasiūlyta</span>}
              {s.state === 'wait' && <span className="rounded-full bg-[rgba(251,191,36,.13)] px-3 py-1.5 text-[12.5px] font-bold text-[#fbbf24]">Palauk</span>}
              {s.state === 'too_old' && <span className="rounded-full border border-[var(--border-subtle)] bg-[var(--bg-hover)] px-3 py-1.5 text-[12.5px] font-bold text-[var(--text-faint)]">Per sena</span>}
            </div>
          ))}
          <p className="mt-1.5 text-[12.5px] text-[var(--text-faint)]">Prisegtos rodomos viršuje, atlikėjo playeryje. Į Top 40 — tik per 3 mėn. įkeltos.</p>
        </div>
        <div>
          <div className={gt}>Renginiai <span className="ml-auto inline-flex items-center gap-1 text-[14px] font-semibold normal-case tracking-normal text-[var(--text-faint)]">Pridėti — netrukus</span></div>
          {events.map((e) => { const d = new Date(e.start_date); return (
            <div key={e.id} className="mb-2 flex items-center gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-2.5">
              <div className="w-[42px] shrink-0 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] py-1 text-center"><b className="block font-[Outfit,sans-serif] text-base font-extrabold leading-none">{d.getDate()}</b><span className="text-[11px] uppercase text-[var(--text-muted)]">{MONTHS[d.getMonth()]}</span></div>
              <div className="min-w-0 flex-1"><b className="block truncate text-[14px] text-[var(--text-primary)]">{e.venue_name || e.title}</b><small className="text-[12.5px] text-[var(--text-muted)]">{e.city || e.title}</small></div>
            </div>
          )})}
          {events.length === 0 && <div className="rounded-xl border border-dashed border-[var(--border-default)] p-4 text-center text-xs text-[var(--text-muted)]">Dar nėra renginių</div>}
        </div>
      </div>

      {/* APPEARANCE */}
      <div className={gt}>Išvaizda <span className="ml-2 normal-case tracking-normal font-medium text-[13px] text-[var(--text-muted)]">— tavo viešos anketos</span></div>
      <div className="grid gap-3.5 sm:grid-cols-3">
        <div className={`${card} p-4`}>
          <h4 className="mb-2.5 font-[Outfit,sans-serif] text-[14px] font-bold text-[var(--text-primary)]">Anketos tema</h4>
          <div className="flex rounded-[9px] border border-[var(--border-default)] bg-[var(--bg-surface)] p-0.5">
            {['dark', 'light'].map((t) => <button key={t} onClick={() => { setTheme(t); saveAppearance({ profile_theme: t }) }} className={`flex-1 rounded-[7px] py-1.5 text-xs font-semibold font-[Outfit,sans-serif] ${theme === t ? 'bg-[#f97316] text-white' : 'text-[var(--text-muted)]'}`}>{t === 'dark' ? 'Tamsi' : 'Šviesi'}</button>)}
          </div>
        </div>
        <div className={`${card} p-4`}>
          <h4 className="mb-2.5 font-[Outfit,sans-serif] text-[14px] font-bold text-[var(--text-primary)]">Akcento spalva</h4>
          <div className="flex items-center gap-2.5">
            {ACCENTS.map((c) => <button key={c} onClick={() => { setAccent(c); saveAppearance({ accent_color: c }) }} className="h-6 w-6 rounded-full" style={{ background: c, outline: accent === c ? '2px solid #fff' : 'none', outlineOffset: '1px' }} />)}
            <label className="grid h-6 w-6 cursor-pointer place-items-center rounded-full text-white" style={{ background: 'conic-gradient(from 0deg,#f43f5e,#f59e0b,#22c55e,#3b82f6,#a855f7,#f43f5e)' }}>
              <input type="color" value={accent} onChange={(e) => { setAccent(e.target.value); saveAppearance({ accent_color: e.target.value }) }} className="h-0 w-0 opacity-0" />{I.plus}
            </label>
          </div>
        </div>
        <div className={`${card} p-4`}>
          <h4 className="mb-2.5 font-[Outfit,sans-serif] text-[14px] font-bold text-[var(--text-primary)]">Ką rodyti anketoje</h4>
          <div className="flex flex-wrap gap-1.5">
            {SECTIONS.map((s) => { const on = !hidden.includes(s.key); return (
              <button key={s.key} onClick={() => { const nh = on ? [...hidden, s.key] : hidden.filter((x) => x !== s.key); setHidden(nh); saveAppearance({ hidden_sections: nh }) }}
                className={`rounded-full border px-2.5 py-1 text-[13px] font-semibold font-[Outfit,sans-serif] ${on ? 'border-[rgba(249,115,22,0.3)] bg-[rgba(249,115,22,0.13)] text-[#f97316]' : 'border-[var(--border-default)] text-[var(--text-muted)]'}`}>{s.label}</button>
            )})}
          </div>
        </div>
      </div>

      {/* MORE */}
      <div className={gt}>Daugiau</div>
      <div className="grid gap-2.5 sm:grid-cols-4">
        <More href={`/atlikejams/zona/profilis?a=${artist.id}`} title="Profilio info" sub="Aprašymas, metai, nariai" />
        <More href={`/atlikejams/zona/fanai?a=${artist.id}`} title="Fanai ir žinutės" sub={`${stats.likes} patinka · rašyk`} />
        <More href={`/atlikejams/zona/profilis?a=${artist.id}`} title="Soc. nuorodos" sub="Spotify, svetainė…" />
        <More href={`/atlikejams/zona/socialiniai?a=${artist.id}`} title="Soc. įrašai / YouTube" sub="Auto-feed, embed" />
      </div>

      {/* COMPLETENESS */}
      <div className="mt-4 flex items-center gap-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-4 py-3 text-[14.5px] text-[var(--text-secondary)]">
        <span className="whitespace-nowrap">Profilis {stats.complete}% užbaigtas</span>
        <div className="h-[7px] flex-1 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full" style={{ width: `${stats.complete}%`, background: 'linear-gradient(90deg,#f97316,#fbbf24)' }} /></div>
      </div>

      {toast && <div className={`fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-full px-5 py-2.5 text-sm font-semibold text-white shadow-lg ${toast.ok ? 'bg-[var(--accent-green)]' : 'bg-[var(--accent-red)]'}`}>{toast.t}</div>}
    </div>
  )
}

function Mini({ label, value, sub, spark, accent }: { label: string; value: string; sub?: string; spark?: string; accent?: boolean }) {
  return (
    <div className="min-w-[112px] rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-4 py-2.5">
      <div className="text-[13px] text-[var(--text-muted)]">{label}</div>
      <div className={`mt-0.5 font-[Outfit,sans-serif] text-[22px] font-extrabold ${accent ? 'text-[#f97316]' : 'text-[var(--text-primary)]'}`}>{value}</div>
      {spark && <svg width="100" height="18" viewBox="0 0 100 18" className="mt-1"><polyline points="0,14 13,11 26,12 39,8 52,10 65,5 78,6 91,2 100,4" fill="none" stroke={spark} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
      {sub && <div className="mt-1.5 text-[12px] text-[var(--text-muted)]">{sub}</div>}
    </div>
  )
}

function More({ href, title, sub }: { href: string; title: string; sub: string }) {
  return (
    <a href={href} className="flex items-center gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-3.5 py-3 transition hover:border-[rgba(249,115,22,0.35)]">
      <div><b className="font-[Outfit,sans-serif] text-[14px] font-semibold text-[var(--text-primary)]">{title}</b><span className="block text-[13px] text-[var(--text-muted)]">{sub}</span></div>
    </a>
  )
}
