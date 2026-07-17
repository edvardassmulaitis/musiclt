'use client'

import { useEffect, useState, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import InboxTabs from '@/components/InboxTabs'
import { useInboxCounts } from '@/components/useInboxCounts'

type MatchedArtist = {
  id: number
  name: string
  slug: string
  cover_image_url: string | null
}

type WikiAlbumCandidate = {
  id: number
  source_url: string | null
  artist_raw: string
  album_title: string
  album_wiki_link: string | null
  release_year: number
  release_month: number
  release_day: number
  genres_raw: string[]
  label_raw: string | null
  matched_artist_id: number | null
  match_score: number | null
  status: string
  created_at: string
  rescanned_at: string | null
  matched_artist: MatchedArtist | null
}

function formatDate(y: number, m: number, d: number) {
  try {
    return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('lt-LT', { year: 'numeric', month: 'long', day: 'numeric' })
  } catch {
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  }
}

function wikiUrl(title: string) {
  return `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`
}

export default function WikiAlbumInboxPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [candidates, setCandidates] = useState<WikiAlbumCandidate[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<number | null>(null)
  const [linkDrafts, setLinkDrafts] = useState<Record<number, string>>({})
  const [errorMsg, setErrorMsg] = useState<Record<number, string>>({})

  const isAdmin = ['editor', 'admin', 'super_admin'].includes(session?.user?.role || '')

  // 2026-07-17: viršutinis "📥 Inbox" badge = bendra suma (news+events+albums).
  // Albumų dalį imam iš live `total` (mažėja patvirtinus), kitas iš snapshot'o.
  const { counts } = useInboxCounts()
  const grandTotal = counts ? (counts.total - counts.albums + total) : total

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/wiki-album-candidates?status=pending&limit=100')
      const j = await res.json()
      setCandidates(j.candidates || [])
      setTotal(j.total || 0)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (status === 'loading') return
    if (!isAdmin) { router.replace('/admin'); return }
    load()
  }, [status, isAdmin, router, load])

  async function reject(id: number) {
    setBusy(id)
    try {
      const res = await fetch(`/api/admin/wiki-album-candidates/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reject' }),
      })
      if (res.ok) setCandidates((prev) => prev.filter((c) => c.id !== id))
      else { const j = await res.json().catch(() => ({})); setErrorMsg((p) => ({ ...p, [id]: j.error || 'Klaida' })) }
    } finally {
      setBusy(null)
    }
  }

  async function approve(id: number) {
    setBusy(id)
    setErrorMsg((p) => ({ ...p, [id]: '' }))
    try {
      const draft = linkDrafts[id]?.trim()
      const body: any = { action: 'approve' }
      if (draft) body.album_wiki_link = draft
      const res = await fetch(`/api/admin/wiki-album-candidates/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const j = await res.json().catch(() => ({}))
      if (res.ok) setCandidates((prev) => prev.filter((c) => c.id !== id))
      else setErrorMsg((p) => ({ ...p, [id]: j.error || 'Klaida' }))
    } finally {
      setBusy(null)
    }
  }

  if (status === 'loading' || !isAdmin) return null

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <h1 className="text-base font-bold text-[var(--text-primary)] mb-3">
        📥 Inbox <span className="text-xs font-normal text-[var(--text-muted)]" title="Iš viso laukia: naujienos + renginiai + albumai">({grandTotal})</span>
      </h1>
      <InboxTabs />

      <p className="text-sm text-[var(--text-muted)] mb-4">
        Wikipedia „List of {new Date().getFullYear()} albums" — atlikėjai, kurie jau yra kataloge, bet
        albumas dar neturi savo Wikipedia straipsnio (taigi negalime auto-sukurti tracklist'o).
        Kai straipsnis atsiras, sekantis scan'as sukurs albumą automatiškai — čia gali atmesti klaidingus
        match'us arba, jei pats radai nuorodą anksčiau, patvirtinti ranka.
      </p>

      {loading ? (
        <p className="text-sm text-[var(--text-muted)]">Kraunama…</p>
      ) : candidates.length === 0 ? (
        <p className="text-sm text-[var(--text-muted)]">Tuščia — nieko laukiančio.</p>
      ) : (
        <div className="space-y-3">
          {candidates.map((c) => (
            <div key={c.id} className="border border-[var(--input-border)] rounded-lg p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm text-[var(--text-muted)]">{formatDate(c.release_year, c.release_month, c.release_day)}</div>
                  <div className="font-medium">
                    {c.matched_artist ? (
                      <Link href={`/atlikejas/${c.matched_artist.slug}`} className="text-blue-700 hover:underline" target="_blank">
                        {c.matched_artist.name}
                      </Link>
                    ) : (
                      c.artist_raw
                    )}
                    {' — '}{c.album_title}
                  </div>
                  {(c.genres_raw?.length > 0 || c.label_raw) && (
                    <div className="text-xs text-[var(--text-muted)] mt-0.5">
                      {c.genres_raw?.join(', ')}{c.genres_raw?.length && c.label_raw ? ' · ' : ''}{c.label_raw}
                    </div>
                  )}
                  <div className="text-xs mt-1">
                    {c.album_wiki_link ? (
                      <a href={wikiUrl(c.album_wiki_link)} target="_blank" rel="noreferrer" className="text-emerald-700 hover:underline">
                        ✓ Wikipedia straipsnis rastas
                      </a>
                    ) : (
                      <span className="text-amber-600">Wikipedia albumo straipsnio dar nėra</span>
                    )}
                    {c.source_url && (
                      <>
                        {' · '}
                        <a href={c.source_url} target="_blank" rel="noreferrer" className="text-[var(--text-muted)] hover:underline">
                          sąrašo puslapis
                        </a>
                      </>
                    )}
                  </div>
                </div>
                {c.match_score !== null && (
                  <div className="text-xs text-[var(--text-muted)] shrink-0">match {Math.round((c.match_score || 0) * 100)}%</div>
                )}
              </div>

              {!c.album_wiki_link && (
                <input
                  type="text"
                  placeholder="Wikipedia albumo straipsnio pavadinimas arba nuoroda (jei radai pats)"
                  value={linkDrafts[c.id] || ''}
                  onChange={(e) => setLinkDrafts((p) => ({ ...p, [c.id]: e.target.value }))}
                  className="mt-2 w-full text-sm border border-[var(--input-border)] rounded px-2 py-1"
                />
              )}

              {errorMsg[c.id] && <div className="text-xs text-red-600 mt-1">{errorMsg[c.id]}</div>}

              <div className="flex gap-2 mt-2">
                <button
                  onClick={() => approve(c.id)}
                  disabled={busy === c.id || (!c.album_wiki_link && !linkDrafts[c.id]?.trim())}
                  className="text-sm px-3 py-1 rounded bg-emerald-600 text-white disabled:opacity-40"
                >
                  {busy === c.id ? '…' : 'Patvirtinti ir sukurti'}
                </button>
                <button
                  onClick={() => reject(c.id)}
                  disabled={busy === c.id}
                  className="text-sm px-3 py-1 rounded border border-[var(--input-border)]"
                >
                  Atmesti
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
