'use client'

// Klientinis radaro valdiklis. Veiksmai POST'inami į /api/admin/radar.
// Optimistinis perkėlimas tarp sąrašų; klaidos atveju grąžinam atgal.

import { useState, useCallback } from 'react'

export type AdminArtist = {
  id: number
  name: string
  slug: string
  country: string | null
  cover_image_url: string | null
  legacy_likes: number | null
  radar_status: 'featured' | 'included' | 'excluded' | null
  radar_blurb: string | null
  radar_sort: number
  latest_title?: string | null
  genres?: string[]
}

type Status = 'featured' | 'included' | 'excluded' | null

const COUNTRY_FLAG: Record<string, string> = { Lietuva: '🇱🇹' }

async function setStatus(artistId: number, status: Status, extra?: { blurb?: string | null; sort?: number }) {
  const res = await fetch('/api/admin/radar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ artistId, status, ...extra }),
  })
  if (!res.ok) {
    const j = await res.json().catch(() => ({}))
    throw new Error(j.error || `HTTP ${res.status}`)
  }
  return res.json()
}

function Thumb({ a }: { a: AdminArtist }) {
  return (
    <div className="h-11 w-11 flex-shrink-0 overflow-hidden rounded-lg bg-[var(--bg-elevated)]">
      {a.cover_image_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={a.cover_image_url} alt="" className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-lg text-[var(--text-faint)]">
          {a.name?.[0] || '?'}
        </div>
      )}
    </div>
  )
}

export default function RadarAdminClient({
  initialFeatured, initialIncluded, initialExcluded, initialCandidates,
}: {
  initialFeatured: AdminArtist[]
  initialIncluded: AdminArtist[]
  initialExcluded: AdminArtist[]
  initialCandidates: AdminArtist[]
}) {
  const [featured, setFeatured] = useState(initialFeatured)
  const [included, setIncluded] = useState(initialIncluded)
  const [excluded, setExcluded] = useState(initialExcluded)
  const [candidates, setCandidates] = useState(initialCandidates)
  const [busy, setBusy] = useState<number | null>(null)
  const [err, setErr] = useState<string | null>(null)

  // search-to-add
  const [q, setQ] = useState('')
  const [results, setResults] = useState<AdminArtist[]>([])
  const [searching, setSearching] = useState(false)

  const removeFrom = (id: number) => {
    setFeatured((l) => l.filter((a) => a.id !== id))
    setIncluded((l) => l.filter((a) => a.id !== id))
    setExcluded((l) => l.filter((a) => a.id !== id))
    setCandidates((l) => l.filter((a) => a.id !== id))
  }

  const apply = useCallback(async (a: AdminArtist, status: Status, extra?: { blurb?: string | null; sort?: number }) => {
    setBusy(a.id); setErr(null)
    try {
      await setStatus(a.id, status, extra)
      removeFrom(a.id)
      const updated: AdminArtist = { ...a, radar_status: status, radar_blurb: extra?.blurb ?? a.radar_blurb }
      if (status === 'featured') setFeatured((l) => [updated, ...l.filter((x) => x.id !== a.id)])
      else if (status === 'included') setIncluded((l) => [updated, ...l])
      else if (status === 'excluded') setExcluded((l) => [updated, ...l])
      else setCandidates((l) => [updated, ...l]) // auto
      setResults((l) => l.filter((x) => x.id !== a.id))
    } catch (e: any) {
      setErr(e?.message || 'Klaida')
    } finally {
      setBusy(null)
    }
  }, [])

  const saveBlurb = useCallback(async (a: AdminArtist, blurb: string) => {
    setBusy(a.id); setErr(null)
    try {
      await setStatus(a.id, 'featured', { blurb })
      setFeatured((l) => l.map((x) => x.id === a.id ? { ...x, radar_blurb: blurb } : x))
    } catch (e: any) {
      setErr(e?.message || 'Klaida')
    } finally {
      setBusy(null)
    }
  }, [])

  const doSearch = useCallback(async (term: string) => {
    setQ(term)
    if (term.trim().length < 2) { setResults([]); return }
    setSearching(true)
    try {
      const res = await fetch(`/api/admin/artists/search?q=${encodeURIComponent(term.trim())}`)
      const j = await res.json()
      const known = new Set([...featured, ...included, ...excluded].map((a) => a.id))
      const norm: AdminArtist[] = (j.results || [])
        .filter((r: any) => !known.has(r.id))
        .map((r: any): AdminArtist => ({
          id: r.id, name: r.name, slug: r.slug, country: r.country ?? null,
          cover_image_url: r.cover_image_url ?? null, legacy_likes: null,
          radar_status: null, radar_blurb: null, radar_sort: 0,
        }))
      setResults(norm)
    } catch { setResults([]) } finally { setSearching(false) }
  }, [featured, included, excluded])

  const ActionBtns = ({ a }: { a: AdminArtist }) => (
    <div className="flex flex-wrap gap-1.5">
      {a.radar_status === 'excluded' ? (
        // Jei atmesta — tik „Atstatyti" mygtukas
        <button onClick={() => apply(a, null)} disabled={busy === a.id}
          className="rounded-md bg-[var(--bg-elevated)] px-2.5 py-1 text-xs font-semibold text-[var(--text-secondary)] ring-1 ring-[var(--border-default)] disabled:opacity-50">↺ Atstatyti</button>
      ) : (
        <>
          {a.radar_status !== 'featured' ? (
            <button onClick={() => apply(a, 'featured')} disabled={busy === a.id}
              className="rounded-md bg-[var(--accent-orange)] px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-50">⭐ Featured</button>
          ) : (
            <button onClick={() => apply(a, null)} disabled={busy === a.id} title="Nuimti featured"
              className="rounded-md bg-[var(--bg-elevated)] px-2.5 py-1 text-xs font-semibold text-[var(--accent-orange)] ring-1 ring-[rgba(249,115,22,0.4)] disabled:opacity-50">⭐ Nuimti</button>
          )}
          {a.radar_status !== 'included' ? (
            <button onClick={() => apply(a, 'included')} disabled={busy === a.id}
              className="rounded-md bg-[var(--bg-elevated)] px-2.5 py-1 text-xs font-semibold text-[var(--text-secondary)] ring-1 ring-[var(--border-default)] disabled:opacity-50">＋ Įtraukti</button>
          ) : (
            <button onClick={() => apply(a, null)} disabled={busy === a.id} title="Nuimti įtraukimą"
              className="rounded-md bg-[var(--bg-elevated)] px-2.5 py-1 text-xs font-semibold text-[var(--text-primary)] ring-1 ring-[var(--border-strong)] disabled:opacity-50">＋ Nuimti</button>
          )}
          <button onClick={() => apply(a, 'excluded')} disabled={busy === a.id}
            className="rounded-md bg-[var(--bg-elevated)] px-2.5 py-1 text-xs font-semibold text-[var(--accent-red)] ring-1 ring-[rgba(248,113,113,0.3)] disabled:opacity-50">🚫 Atmesti</button>
        </>
      )}
    </div>
  )

  const Row = ({ a, showBlurb }: { a: AdminArtist; showBlurb?: boolean }) => (
    <li className="flex flex-col gap-2 rounded-xl bg-[var(--bg-surface)] p-3 ring-1 ring-[var(--border-subtle)]">
      <div className="flex items-center gap-3">
        <Thumb a={a} />
        <div className="min-w-0 flex-1">
          <a href={`/atlikejai/${a.slug}`} target="_blank" rel="noreferrer"
            className="block truncate font-['Outfit',sans-serif] font-semibold text-[var(--text-primary)] hover:text-[var(--accent-orange)]">
            {COUNTRY_FLAG[a.country || ''] || ''} {a.name}
          </a>
          <div className="truncate text-xs text-[var(--text-muted)]">
            {(a.genres && a.genres.length > 0) ? a.genres.join(' · ') + ' · ' : ''}
            {a.legacy_likes != null ? `${a.legacy_likes} ♥` : ''}
            {a.latest_title ? ` · „${a.latest_title}"` : ''}
          </div>
        </div>
        <ActionBtns a={a} />
      </div>
      {showBlurb && (
        <BlurbEditor a={a} onSave={saveBlurb} busy={busy === a.id} />
      )}
    </li>
  )

  const Section = ({ title, hint, items, showBlurb, empty }: {
    title: string; hint: string; items: AdminArtist[]; showBlurb?: boolean; empty: string
  }) => (
    <section className="mt-7">
      <h2 className="font-['Outfit',sans-serif] text-lg font-bold text-[var(--text-primary)]">
        {title} <span className="text-sm font-normal text-[var(--text-faint)]">· {items.length}</span>
      </h2>
      <p className="mb-3 text-xs text-[var(--text-muted)]">{hint}</p>
      {items.length === 0 ? (
        <p className="rounded-lg border border-dashed border-[var(--border-default)] p-4 text-center text-sm text-[var(--text-faint)]">{empty}</p>
      ) : (
        <ul className="flex flex-col gap-2">{items.map((a) => <Row key={a.id} a={a} showBlurb={showBlurb} />)}</ul>
      )}
    </section>
  )

  return (
    <div>
      {err && <div className="mb-3 rounded-lg bg-[rgba(248,113,113,0.12)] px-3 py-2 text-sm text-[var(--accent-red)]">{err}</div>}

      {/* search-to-add — pridėti BET KURĮ atlikėją iš visos DB */}
      <div className="rounded-xl bg-[var(--bg-surface)] p-3.5 ring-1 ring-[rgba(249,115,22,0.35)]">
        <label className="block font-['Outfit',sans-serif] text-sm font-bold text-[var(--text-primary)]">
          ➕ Pridėti bet kurį atlikėją iš DB
        </label>
        <p className="mb-2 mt-0.5 text-xs text-[var(--text-muted)]">
          Ieškok visoje bazėje (ne tik radare) ir spausk <b>Featured</b> arba <b>Įtraukti</b> — atsiras /nauji-atlikejai.
        </p>
        <input
          value={q}
          onChange={(e) => doSearch(e.target.value)}
          placeholder="Įvesk atlikėjo vardą…"
          className="w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-elevated)] px-3 py-2.5 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent-orange)]"
        />
        {searching && <p className="mt-2 text-xs text-[var(--text-faint)]">Ieškoma…</p>}
        {q.trim().length >= 2 && !searching && results.length === 0 && (
          <p className="mt-2 text-xs text-[var(--text-faint)]">Nieko nerasta (arba jau radare).</p>
        )}
        {results.length > 0 && (
          <ul className="mt-2 flex flex-col gap-2">{results.map((a) => <Row key={a.id} a={a} />)}</ul>
        )}
      </div>

      <Section title="⭐ Featured (spotlight)" showBlurb
        hint="Rodomi viršuje su redakcijos prierašu. Pridėk blurb'ą, kad kortelė atrodytų pilnai."
        items={featured} empty="Nieko nepriskirta — surask atlikėją viršuje ir spausk „Featured“." />

      <Section title="＋ Įtraukti į tinklelį"
        hint="Priverstinai rodomi „Nauji ir kylantys“ tinklelyje, net jei auto signalai silpni."
        items={included} empty="Tuščia — auto kandidatai (žemiau) ir taip rodomi tinklelyje." />

      <Section title="📡 Auto kandidatai"
        hint="Algoritmo rasti: naujas LT atlikėjas (pirmas YT įkėlimas ≤1 m. + maža auditorija). Jau rodomi /nauji-atlikejai. Seni atlikėjai čia nepatenka automatiškai."
        items={candidates} empty="Nėra kandidatų (gali būti DB ryšio problema arba langas tuščias)." />

      <Section title="🚫 Atmesti"
        hint="Algoritmas jų nebesiūlys automatiškai. Spausk „Atstatyti", kad grąžintum į auto-pool."
        items={excluded} empty="Nėra atmestų atlikėjų." />
    </div>
  )
}

function BlurbEditor({ a, onSave, busy }: { a: AdminArtist; onSave: (a: AdminArtist, blurb: string) => void; busy: boolean }) {
  const [v, setV] = useState(a.radar_blurb || '')
  const dirty = v.trim() !== (a.radar_blurb || '').trim()
  return (
    <div className="flex items-center gap-2 pl-14">
      <input
        value={v}
        onChange={(e) => setV(e.target.value)}
        maxLength={280}
        placeholder="Redakcijos prierašas (kodėl verta klausyti)…"
        className="flex-1 rounded-lg border border-[var(--border-default)] bg-[var(--bg-elevated)] px-3 py-1.5 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent-orange)]"
      />
      <button onClick={() => onSave(a, v.trim())} disabled={!dirty || busy}
        className="rounded-md bg-[var(--accent-green)] px-3 py-1.5 text-xs font-semibold text-[#04130a] disabled:opacity-40">
        Išsaugoti
      </button>
    </div>
  )
}
