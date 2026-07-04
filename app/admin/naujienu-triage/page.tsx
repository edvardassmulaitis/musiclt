'use client'

// /admin/naujienu-triage — Recenzijų triage (Thread C, 1 etapas)
//
// Legacy RECENZIJA įrašai (discussions, legacy_kind='news', title ~ 'recenzij')
// neturi author stulpelio — autorius parsinamas iš byline'o. Čia operatorius:
//   1. paleidžia autoriaus parsinimą ("Parsinti autorius"),
//   2. peržiūri parsintus vardus,
//   3. susieja autorių → narį (autocomplete). Susiejimas ĮSIMENAMAS ir
//      pritaikomas VISIEMS to autoriaus įrašams (atmintis).
// Konversija į narių įrašus (blog_posts) — 2 etapas: "Konvertuoti" mygtukas
// susietiems įrašams (post_type='review', editorial_type='recenzija').

import { useEffect, useState, useCallback, useRef } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { roleRank } from '@/lib/admin-sections'

type Member = { id: string; username: string | null; full_name: string | null; avatar_url: string | null }
type Item = {
  discussion_id: number
  title: string
  slug: string | null
  source_url: string | null
  published_at: string | null
  has_text: boolean
  artist_id: number | null
  author_raw: string | null
  author_key: string | null
  parse_method: string | null
  parse_conf: number | null
  status: 'pending' | 'linked' | 'converted' | 'dismissed'
  converted_blog_post_id: string | null
  member: Member | null
  gallery: { slug: string; photo_count: number } | null
}
type Counts = { total: number; with_text: number; with_gallery: number; parsed: number; linked: number; converted: number; dismissed: number; pending: number }

const STATUS_LABEL: Record<string, string> = {
  pending: 'Laukia', linked: 'Susieta', converted: 'Konvertuota', dismissed: 'Praleista',
}
const STATUS_COLOR: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700', linked: 'bg-green-100 text-green-700',
  converted: 'bg-blue-100 text-blue-700', dismissed: 'bg-gray-100 text-gray-500',
}

function fmtDate(s: string | null): string {
  if (!s) return '—'
  try { return new Date(s).toLocaleDateString('lt-LT', { year: 'numeric', month: '2-digit', day: '2-digit' }) } catch { return '—' }
}

// ── Narių paieška (autocomplete) ───────────────────────────────────────────
function MemberPicker({ onPick }: { onPick: (m: Member) => void }) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<Member[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current)
    if (q.trim().length < 2) { setResults([]); return }
    timer.current = setTimeout(async () => {
      setLoading(true)
      try {
        const res = await fetch(`/api/admin/naujienu-triage/members?q=${encodeURIComponent(q.trim())}`)
        const data = await res.json()
        setResults(data.members || [])
        setOpen(true)
      } finally { setLoading(false) }
    }, 250)
    return () => { if (timer.current) clearTimeout(timer.current) }
  }, [q])

  return (
    <div className="relative">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => results.length && setOpen(true)}
        placeholder="Ieškoti nario…"
        className="w-44 px-2 py-1 text-xs rounded border"
        style={{ background: 'var(--bg-elevated)', borderColor: 'var(--input-border)', color: 'var(--text-primary)' }}
      />
      {open && (results.length > 0 || loading) && (
        <div className="absolute z-20 mt-1 w-60 max-h-64 overflow-auto rounded-lg border shadow-lg"
          style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-default)' }}>
          {loading && <div className="px-3 py-2 text-xs" style={{ color: 'var(--text-muted)' }}>Ieškoma…</div>}
          {results.map((m) => (
            <button key={m.id}
              onClick={() => { onPick(m); setOpen(false); setQ('') }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-black/5">
              {m.avatar_url
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={m.avatar_url} alt="" className="h-5 w-5 rounded-full object-cover" />
                : <span className="h-5 w-5 rounded-full bg-gray-300 inline-block" />}
              <span style={{ color: 'var(--text-primary)' }}>{m.username || '—'}</span>
              {m.full_name && <span style={{ color: 'var(--text-muted)' }}>· {m.full_name}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function NaujienuTriage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const isAdmin = roleRank((session?.user as any)?.role) >= 1

  const [items, setItems] = useState<Item[]>([])
  const [counts, setCounts] = useState<Counts | null>(null)
  const [loading, setLoading] = useState(true)
  const [parsing, setParsing] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [textOnly, setTextOnly] = useState(true)
  const [search, setSearch] = useState('')
  const [busyId, setBusyId] = useState<number | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/naujienu-triage/list')
      const data = await res.json()
      setItems(data.items || [])
      setCounts(data.counts || null)
    } finally { setLoading(false) }
  }, [])

  useEffect(() => {
    if (status === 'loading') return
    if (!isAdmin) { router.replace('/'); return }
    load()
  }, [status, isAdmin, load, router])

  const runParse = async () => {
    setParsing(true); setMsg(null)
    try {
      const res = await fetch('/api/admin/naujienu-triage/parse', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
      const data = await res.json()
      if (!res.ok) { setMsg(`Klaida: ${data.error || 'nepavyko'}`); return }
      setMsg(`Parsinta ${data.parsed}: autorius rastas ${data.with_author}, iš atminties susieta ${data.linked_from_memory}, praleista užrakintų ${data.skipped_locked}.`)
      await load()
    } finally { setParsing(false) }
  }

  const doAction = async (payload: any, okMsg?: (d: any) => string) => {
    setBusyId(payload.discussion_id ?? null); setMsg(null)
    try {
      const res = await fetch('/api/admin/naujienu-triage/link', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const data = await res.json()
      if (!res.ok) { setMsg(`Klaida: ${data.error || 'nepavyko'}`); return }
      if (okMsg) setMsg(okMsg(data))
      await load()
    } finally { setBusyId(null) }
  }

  const link = (it: Item, m: Member) => doAction(
    { action: 'link', discussion_id: it.discussion_id, profile_id: m.id, author_display: it.author_raw || undefined },
    (d) => `Susieta su @${m.username}. Priskirta ${d.affected} įraš${d.affected === 1 ? 'as' : 'ų'} (atmintis).`,
  )
  const unlink = (it: Item) => doAction({ action: 'unlink', discussion_id: it.discussion_id })
  const dismiss = (it: Item) => doAction({ action: it.status === 'dismissed' ? 'undismiss' : 'dismiss', discussion_id: it.discussion_id })

  // Konversija į narių įrašą (blog_posts) — 2 etapas. Tik susietiems + su tekstu.
  const convert = async (it: Item) => {
    setBusyId(it.discussion_id); setMsg(null)
    try {
      const res = await fetch('/api/admin/naujienu-triage/convert', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ discussion_id: it.discussion_id }),
      })
      const data = await res.json()
      if (!res.ok) { setMsg(`Klaida: ${data.error || 'nepavyko'}`); return }
      setMsg(data.already ? 'Jau buvo konvertuota.' : `Konvertuota į narių įrašą${data.url ? ` — ${data.url}` : ''}${data.gallery ? ' · galerija susieta 📸' : ''}.`)
      await load()
    } finally { setBusyId(null) }
  }

  const filtered = items.filter((i) => {
    if (textOnly && !i.has_text) return false
    if (statusFilter !== 'all' && i.status !== statusFilter) return false
    if (search.trim() && !i.title.toLowerCase().includes(search.trim().toLowerCase())) return false
    return true
  })

  if (status === 'loading' || (!isAdmin && status === 'authenticated')) {
    return <div className="p-8 text-sm" style={{ color: 'var(--text-muted)' }}>Kraunama…</div>
  }

  return (
    <div className="max-w-[1200px] mx-auto px-4 py-6" style={{ color: 'var(--text-primary)' }}>
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h1 className="text-2xl font-black">🎙️ Recenzijų triage</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
            Legacy RECENZIJA įrašai → autorius iš teksto → susieti su nariu. Susiejimas įsimenamas visiems to autoriaus įrašams.
          </p>
        </div>
        <button onClick={runParse} disabled={parsing}
          className="shrink-0 px-3 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
          style={{ background: 'var(--accent-orange, #ea580c)' }}>
          {parsing ? 'Parsinama…' : '↻ Parsinti autorius'}
        </button>
      </div>

      {counts && (
        <div className="flex flex-wrap gap-2 mb-3 text-xs">
          {([
            ['all', `Viso ${counts.total}`],
            ['pending', `Laukia ${counts.pending}`],
            ['linked', `Susieta ${counts.linked}`],
            ['converted', `Konvertuota ${counts.converted}`],
            ['dismissed', `Praleista ${counts.dismissed}`],
          ] as [string, string][]).map(([k, label]) => (
            <button key={k} onClick={() => setStatusFilter(k)}
              className={`px-2.5 py-1 rounded-full border ${statusFilter === k ? 'font-bold' : ''}`}
              style={{ borderColor: 'var(--border-default)', background: statusFilter === k ? 'var(--bg-elevated)' : 'transparent', color: 'var(--text-primary)' }}>
              {label}
            </button>
          ))}
          <span className="px-2.5 py-1" style={{ color: 'var(--text-muted)' }}>· su tekstu: {counts.with_text} · su galerija: {counts.with_gallery} · parsinta: {counts.parsed}</span>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Paieška antraštėje…"
          className="px-3 py-1.5 text-sm rounded border w-64"
          style={{ background: 'var(--bg-elevated)', borderColor: 'var(--input-border)', color: 'var(--text-primary)' }} />
        <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-muted)' }}>
          <input type="checkbox" checked={textOnly} onChange={(e) => setTextOnly(e.target.checked)} />
          Tik su realiu tekstu
        </label>
        <span className="text-sm" style={{ color: 'var(--text-muted)' }}>Rodoma: {filtered.length}</span>
      </div>

      {msg && <div className="mb-3 px-3 py-2 rounded-lg text-sm" style={{ background: 'var(--bg-elevated)', color: 'var(--text-primary)' }}>{msg}</div>}

      {loading ? (
        <div className="p-8 text-sm" style={{ color: 'var(--text-muted)' }}>Kraunama…</div>
      ) : (
        <div className="space-y-2">
          {filtered.map((it) => (
            <div key={it.discussion_id}
              className="flex flex-col md:flex-row md:items-center gap-3 p-3 rounded-lg border"
              style={{ borderColor: 'var(--border-default)', background: 'var(--bg-elevated)' }}>
              {/* Antraštė + meta */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className={`shrink-0 px-1.5 py-0.5 rounded text-[11px] font-bold ${STATUS_COLOR[it.status]}`}>{STATUS_LABEL[it.status]}</span>
                  {!it.has_text && <span className="shrink-0 px-1.5 py-0.5 rounded text-[11px] bg-gray-100 text-gray-500">tik antraštė</span>}
                  <a href={it.source_url || '#'} target="_blank" rel="noreferrer"
                    className="truncate text-sm font-semibold hover:underline" style={{ color: 'var(--text-primary)' }}>{it.title}</a>
                </div>
                <div className="text-xs mt-0.5 flex items-center gap-2 flex-wrap" style={{ color: 'var(--text-muted)' }}>
                  <span>{fmtDate(it.published_at)} · #{it.discussion_id}</span>
                  {it.gallery && (
                    <a href={`/galerija/${it.gallery.slug}`} target="_blank" rel="noreferrer"
                      className="px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 hover:underline">
                      📸 galerija{it.gallery.photo_count ? ` (${it.gallery.photo_count})` : ''}
                    </a>
                  )}
                </div>
              </div>

              {/* Parsintas autorius */}
              <div className="md:w-48 shrink-0">
                {it.author_raw ? (
                  <div className="text-sm">
                    <span style={{ color: 'var(--text-primary)' }}>{it.author_raw}</span>
                    <span className="ml-1 text-[11px]" style={{ color: 'var(--text-muted)' }}>
                      {it.parse_method}{it.parse_conf != null ? ` ${Math.round(it.parse_conf * 100)}%` : ''}
                    </span>
                  </div>
                ) : <span className="text-xs italic" style={{ color: 'var(--text-muted)' }}>autorius nerastas</span>}
              </div>

              {/* Narys + veiksmai */}
              <div className="md:w-72 shrink-0 flex items-center gap-2 justify-end">
                {it.member ? (
                  <>
                    <span className="text-sm px-2 py-1 rounded bg-green-50 text-green-700">@{it.member.username}</span>
                    <button onClick={() => unlink(it)} disabled={busyId === it.discussion_id}
                      className="text-xs px-2 py-1 rounded border disabled:opacity-50" style={{ borderColor: 'var(--border-default)', color: 'var(--text-muted)' }}>Atsieti</button>
                  </>
                ) : (
                  <MemberPicker onPick={(m) => link(it, m)} />
                )}
                {it.member && it.status === 'linked' && it.has_text && (
                  <button onClick={() => convert(it)} disabled={busyId === it.discussion_id}
                    className="text-xs px-2 py-1 rounded font-semibold text-white disabled:opacity-50"
                    style={{ background: 'var(--accent-orange, #ea580c)' }}>Konvertuoti</button>
                )}
                <button onClick={() => dismiss(it)} disabled={busyId === it.discussion_id}
                  className="text-xs px-2 py-1 rounded border disabled:opacity-50" style={{ borderColor: 'var(--border-default)', color: 'var(--text-muted)' }}>
                  {it.status === 'dismissed' ? 'Grąžinti' : 'Praleisti'}
                </button>
              </div>
            </div>
          ))}
          {!filtered.length && <div className="p-8 text-sm text-center" style={{ color: 'var(--text-muted)' }}>Nėra įrašų pagal filtrus.</div>}
        </div>
      )}
    </div>
  )
}
