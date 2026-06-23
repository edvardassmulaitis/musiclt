'use client'

import { useState, useEffect, useCallback } from 'react'
import { proxyImg } from '@/lib/img-proxy'

type Cand = {
  key: string
  typeLabel: string
  title: string
  image: string | null
  href: string
  isCustom: boolean
  customId?: number
  hidden: boolean
  pinned: boolean
  sortOrder: number | null
}

function ytId(url: string | null | undefined): string | null {
  if (!url) return null
  const m = String(url).match(/(?:v=|youtu\.be\/|embed\/|shorts\/)([\w-]{11})/)
  return m ? m[1] : (/^[\w-]{11}$/.test(url) ? url : null)
}
function ytThumb(id: string | null): string | null { return id ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : null }
function strip(s: string | null | undefined): string { return (s || '').replace(/<[^>]*>/g, '').replace(/&[^;]+;/g, ' ').replace(/\s+/g, ' ').trim() }

export default function FeedAdminClient() {
  const [cands, setCands] = useState<Cand[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  // add-custom form
  const [add, setAdd] = useState({ title: '', href: '', image_url: '', chip: '', video_url: '' })
  const [adding, setAdding] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const j = (u: string) => fetch(u).then(r => r.json()).catch(() => ({}))
    const [lt, w, news, blog, winners, noms, disc, recs, verta, events, hev, ov] = await Promise.all([
      j('/api/top/entries?type=lt_top30'), j('/api/top/entries?type=top40'),
      j('/api/news?limit=12&include=songs&since_days=7'), j('/api/blog/home-hero'),
      j('/api/dienos-daina/winners?limit=7'), j('/api/dienos-daina/nominations'),
      j('/api/muzikos-atradimai?featured=1&limit=6'), j('/api/koncertu-irasai?limit=6'),
      j('/api/verta-keliones'), j('/api/events?limit=24'), j('/api/events?home_hero=1&limit=8'),
      j('/api/feed/overrides'),
    ])

    const list: Cand[] = []
    const ms = (s: string | null | undefined) => { const t = s ? new Date(s).getTime() : NaN; return isNaN(t) ? 0 : t }
    const mk = (key: string, typeLabel: string, title: string, image: string | null, href: string): Cand =>
      ({ key, typeLabel, title, image, href, isCustom: false, hidden: false, pinned: false, sortOrder: null })
    const push = (key: string, typeLabel: string, title: string, image: string | null, href: string) =>
      list.push(mk(key, typeLabel, title, image, href))

    // ── Topai + naujienos + įrašai: surikiuota pagal šviežumą (TIKSLIAI kaip homepage) ──
    // Web feed'e topai NEBE visada pirmi — kiekvienas gauna datą (topas → savaitės
    // atsinaujinimas; naujiena/įrašas → publikavimas) ir naujausi rodomi pirmi. Todėl
    // šitas admin sąrašas dabar atspindi realią homepage tvarką (naujienos priekyje).
    const dated: { sortMs: number; add: () => void }[] = []
    const ltE = lt.entries || []; const wE = w.entries || []
    if (ltE.length) dated.push({ sortMs: ms(lt.week?.created_at || lt.week?.week_start), add: () => { const v = ytId(ltE[0]?.tracks?.video_url); push('chart_lt::/top30', 'Topas LT', 'LT TOP 30', ytThumb(v) || ltE[0]?.tracks?.cover_url || null, '/top30') } })
    if (wE.length) dated.push({ sortMs: ms(w.week?.created_at || w.week?.week_start), add: () => { const v = ytId(wE[0]?.tracks?.video_url); push('chart_world::/top40', 'Topas', 'TOP 40', ytThumb(v) || wE[0]?.tracks?.cover_url || null, '/top40') } })
    ;(news.news || []).slice(0, 30).forEach((n: any) => dated.push({ sortMs: ms(n.published_at), add: () => push(`news::/news/${n.slug}`, 'Naujiena', strip(n.title), n.image_title_url || n.image_small_url || null, `/news/${n.slug}`) }))
    ;(blog.posts || []).forEach((p: any) => dated.push({ sortMs: ms(p.published_at), add: () => push(`blog::${p.href}`, 'Įrašas', strip(p.title), p.cover || null, p.href) }))
    dated.sort((a, b) => b.sortMs - a.sortMs)
    dated.forEach(x => x.add())

    // Discoveries
    ;(disc.items || []).slice(0, 2).forEach((d: any) => { const href = d.artist_slug ? `/atlikejai/${d.artist_slug}` : '/muzikos-atradimai'; push(`discovery::${href}`, 'Atradimas', d.artist_name || d.track_name || 'Atradimas', d.artist_cover || null, href) })
    // Recordings
    ;(recs.recordings || []).slice(0, 2).forEach((r: any) => push(`recording::/koncertu-irasai/${r.slug}`, 'Koncerto įrašas', strip(r.title || r.artist_name || ''), r.thumbnail_url || ytThumb(r.youtube_id) || null, `/koncertu-irasai/${r.slug}`))
    // Dienos daina — įsiterpia giliau (po ~3 įrašų), kaip homepage (slides.splice)
    const dailyCands: Cand[] = []
    const nomCount = (noms.nominations || []).filter((x: any) => x.tracks).length
    if (nomCount >= 5) dailyCands.push(mk('daily::/dienos-daina', 'Dienos daina', 'Šiandienos dienos daina', null, '/dienos-daina'))
    if ((winners.winners || []).length) { const ww = winners.winners[0]; const tr = ww?.tracks; if (tr) dailyCands.push(mk('daily_winner::/dienos-daina', 'Vakar laimėjo', strip(tr.title), ytThumb(ytId(tr.video_url)) || tr.cover_url || null, '/dienos-daina')) }
    list.splice(Math.min(3, list.length), 0, ...dailyCands)

    // Verta
    ;(verta.concerts || []).slice(0, 2).forEach((c: any) => push(`verta::/verta-keliones#vk-${c.id}`, 'Verta kelionės', c.isFestival ? (c.festivalName || c.artist) : c.artist, c.image || null, `/verta-keliones#vk-${c.id}`))
    // Events (home_hero first, then latest, max 4, must have image)
    const evSeen = new Set<number>(); const evList: any[] = []
    ;[...(hev.events || []), ...(events.events || [])].forEach((ev: any) => { if (evList.length < 4 && !evSeen.has(ev.id) && (ev.image_small_url || ev.cover_image_url)) { evSeen.add(ev.id); evList.push(ev) } })
    evList.forEach((ev: any) => push(`event::/renginiai/${ev.slug}`, 'Renginys', strip(ev.title), ev.image_small_url || ev.cover_image_url || null, `/renginiai/${ev.slug}`))

    // apply overrides — TIKSLIAI kaip homepage: TIK pin'as kelia į viršų; sort_order
    // vienas nedominuoja (paslėpti įrašai lieka rodomi pilki, kad būtų galima atstatyti).
    const ovMap = new Map((ov.overrides || []).map((o: any) => [o.item_key, o]))
    list.forEach(c => { const o: any = ovMap.get(c.key); if (o) { c.hidden = !!o.hidden; c.pinned = !!o.pinned; c.sortOrder = (typeof o.sort_order === 'number') ? o.sort_order : null } })
    // custom (visada gauna eiliškumą, kaip homepage)
    ;(ov.custom || []).forEach((c: any) => list.push({ key: `custom::${c.href}`, typeLabel: 'Laisvas', title: strip(c.title), image: c.image_url || null, href: c.href, isCustom: true, customId: c.id, hidden: !!c.hidden, pinned: false, sortOrder: typeof c.sort_order === 'number' ? c.sort_order : -1 }))

    // Stabilus: ord turintys įrašai (pin/custom) pirmi pagal ord; kiti — pagal bazinę
    // (šviežumo) tvarką.
    // 3 pakopos (Edvardo pasirinkimas): rankinė tvarka nugali, BET nauji auto-įrašai
    // (be override'o) iškyla į priekį. 0=prisegti (📌, pačiame viršuje), 1=nauji/be
    // override'o (pagal šviežumą — naujausi pirmi), 2=išsaugota rankinė tvarka (apačioje).
    const baseIdx = new Map(list.map((c, i) => [c.key, i]))
    const tier = (c: Cand) => c.pinned ? 0 : (c.sortOrder != null ? 2 : 1)
    list.sort((a, b) => {
      const ta = tier(a), tb = tier(b)
      if (ta !== tb) return ta - tb
      if (ta === 1) return baseIdx.get(a.key)! - baseIdx.get(b.key)!
      return ((a.sortOrder ?? -1) - (b.sortOrder ?? -1)) || (baseIdx.get(a.key)! - baseIdx.get(b.key)!)
    })
    setCands(list)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const setOverride = async (c: Cand, patch: any) => {
    setBusy(true)
    try {
      if (c.isCustom) {
        // custom: hidden valdomas per custom endpoint
        if ('hidden' in patch) await fetch('/api/admin/feed/custom', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: c.customId, title: c.title, href: c.href, image_url: c.image, hidden: patch.hidden }) })
      } else {
        await fetch('/api/admin/feed', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ item_key: c.key, ...patch }) })
      }
    } catch {}
    setBusy(false)
  }

  const toggleHide = async (c: Cand) => {
    const v = !c.hidden
    setCands(p => p.map(x => x.key === c.key ? { ...x, hidden: v } : x))
    await setOverride(c, { hidden: v })
  }
  const togglePin = async (c: Cand) => {
    if (c.isCustom) return
    const v = !c.pinned
    setCands(p => p.map(x => x.key === c.key ? { ...x, pinned: v } : x))
    await setOverride(c, { pinned: v })
  }
  const move = (idx: number, dir: -1 | 1) => {
    setCands(p => {
      const next = [...p]
      const j = idx + dir
      if (j < 0 || j >= next.length) return p
      ;[next[idx], next[j]] = [next[j], next[idx]]
      return next
    })
  }
  const saveOrder = async () => {
    setBusy(true); setMsg('')
    try {
      for (let i = 0; i < cands.length; i++) {
        const c = cands[i]
        if (c.isCustom) await fetch('/api/admin/feed/custom', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: c.customId, title: c.title, href: c.href, image_url: c.image, hidden: c.hidden, sort_order: i }) })
        else await fetch('/api/admin/feed', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ item_key: c.key, sort_order: i }) })
      }
      setMsg('Tvarka išsaugota ✓')
    } catch { setMsg('Klaida saugant') }
    setBusy(false)
    setTimeout(() => setMsg(''), 3000)
  }

  const addCustom = async () => {
    if (!add.title || !add.href) { setMsg('Reikia pavadinimo ir nuorodos'); return }
    setAdding(true)
    try {
      const r = await fetch('/api/admin/feed/custom', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...add, sort_order: -1 }) })
      if (r.ok) { setAdd({ title: '', href: '', image_url: '', chip: '', video_url: '' }); await load(); setMsg('Pridėta ✓') }
      else setMsg('Klaida pridedant')
    } catch { setMsg('Klaida pridedant') }
    setAdding(false)
    setTimeout(() => setMsg(''), 3000)
  }
  const delCustom = async (c: Cand) => {
    if (!c.customId) return
    setCands(p => p.filter(x => x.key !== c.key))
    await fetch(`/api/admin/feed/custom?id=${c.customId}`, { method: 'DELETE' })
  }

  if (loading) return <p className="text-sm text-[var(--text-muted)]">Kraunama…</p>

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button onClick={saveOrder} disabled={busy} className="rounded-lg bg-[var(--accent-orange)] px-4 py-2 text-sm font-bold text-white disabled:opacity-50">Išsaugoti tvarką</button>
        <button onClick={load} disabled={busy} className="rounded-lg border border-[var(--border-default)] px-4 py-2 text-sm font-semibold text-[var(--text-primary)]">↻ Atnaujinti</button>
        {msg && <span className="text-sm text-[var(--text-muted)]">{msg}</span>}
      </div>

      <div className="flex flex-col gap-2">
        {cands.map((c, i) => (
          <div key={c.key} className={`flex items-center gap-3 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-2 ${c.hidden ? 'opacity-45' : ''}`}>
            <div className="flex flex-col">
              <button onClick={() => move(i, -1)} disabled={i === 0} className="px-1 text-[var(--text-muted)] disabled:opacity-30">▲</button>
              <button onClick={() => move(i, 1)} disabled={i === cands.length - 1} className="px-1 text-[var(--text-muted)] disabled:opacity-30">▼</button>
            </div>
            <div className="h-12 w-12 flex-shrink-0 overflow-hidden rounded-lg bg-[var(--bg-hover)]">
              {c.image ? <img src={proxyImg(c.image)} alt="" className="h-full w-full object-cover" /> : null}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-[var(--text-primary)]">{c.pinned ? '📌 ' : ''}{c.title}</p>
              <p className="truncate text-xs text-[var(--text-muted)]">{c.typeLabel}{c.isCustom ? ' · laisvas' : ''}</p>
            </div>
            {!c.isCustom && (
              <button onClick={() => togglePin(c)} disabled={busy} title="Prisegti viršuje" className={`rounded-lg px-2 py-1.5 text-sm ${c.pinned ? 'bg-[var(--accent-orange)] text-white' : 'border border-[var(--border-default)] text-[var(--text-muted)]'}`}>📌</button>
            )}
            <button onClick={() => toggleHide(c)} disabled={busy} title={c.hidden ? 'Rodyti' : 'Slėpti'} className={`rounded-lg px-2 py-1.5 text-sm ${c.hidden ? 'bg-red-500/80 text-white' : 'border border-[var(--border-default)] text-[var(--text-muted)]'}`}>{c.hidden ? '🚫' : '👁'}</button>
            {c.isCustom && (
              <button onClick={() => delCustom(c)} disabled={busy} title="Ištrinti" className="rounded-lg border border-[var(--border-default)] px-2 py-1.5 text-sm text-red-400">✕</button>
            )}
          </div>
        ))}
      </div>

      <div className="mt-6 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-4">
        <h3 className="mb-3 font-['Outfit',sans-serif] text-base font-extrabold text-[var(--text-primary)]">+ Pridėti laisvą įrašą</h3>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <input value={add.title} onChange={e => setAdd({ ...add, title: e.target.value })} placeholder="Pavadinimas *" className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-body)] px-3 py-2 text-sm text-[var(--text-primary)]" />
          <input value={add.href} onChange={e => setAdd({ ...add, href: e.target.value })} placeholder="Nuoroda (pvz. /diskusijos/...) *" className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-body)] px-3 py-2 text-sm text-[var(--text-primary)]" />
          <input value={add.image_url} onChange={e => setAdd({ ...add, image_url: e.target.value })} placeholder="Nuotraukos URL" className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-body)] px-3 py-2 text-sm text-[var(--text-primary)]" />
          <input value={add.video_url} onChange={e => setAdd({ ...add, video_url: e.target.value })} placeholder="YouTube URL (nebūtina)" className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-body)] px-3 py-2 text-sm text-[var(--text-primary)]" />
          <input value={add.chip} onChange={e => setAdd({ ...add, chip: e.target.value })} placeholder="Žymė (pvz. ĮRAŠAS)" className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-body)] px-3 py-2 text-sm text-[var(--text-primary)]" />
        </div>
        <button onClick={addCustom} disabled={adding} className="mt-3 rounded-lg bg-[var(--accent-orange)] px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{adding ? 'Pridedama…' : 'Pridėti'}</button>
      </div>
    </div>
  )
}
