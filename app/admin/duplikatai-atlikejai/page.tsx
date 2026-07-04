'use client'

// /admin/duplikatai-atlikejai — Atlikėjų dublikatų valymas
//
// artists.slug NĖRA unikalus (~94 slug'ai kartojasi). Čia admin peržiūri
// dublikatų grupes, pasirenka „keeper'į" (kurį palikti) ir sujungia likusius
// per merge_artists() RPC (perkelia visas nuorodas + likes, ištrina loser'į).
// DESTRUKTYVU — tik pilnam admin.

import { useEffect, useState, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'

type Artist = {
  slug: string; id: number; name: string; score: number | null
  legacy_id: number | null; cover_image_url: string | null; tracks: number; albums: number
}
type Group = { slug: string; count: number; suggested_keeper_id: number | null; artists: Artist[] }

export default function DuplikataiAtlikejai() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const role = (session?.user as any)?.role
  const isFullAdmin = role === 'admin' || role === 'super_admin'

  const [groups, setGroups] = useState<Group[]>([])
  const [keeper, setKeeper] = useState<Record<string, number>>({}) // slug -> keeper id
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [onlyContent, setOnlyContent] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/duplikatai-atlikejai/list')
      const data = await res.json()
      const gs: Group[] = data.groups || []
      setGroups(gs)
      const k: Record<string, number> = {}
      for (const g of gs) if (g.suggested_keeper_id) k[g.slug] = g.suggested_keeper_id
      setKeeper(k)
    } finally { setLoading(false) }
  }, [])

  useEffect(() => {
    if (status === 'loading') return
    if (!isFullAdmin) { router.replace('/'); return }
    load()
  }, [status, isFullAdmin, load, router])

  const merge = async (g: Group) => {
    const keeperId = keeper[g.slug]
    if (!keeperId) { setMsg('Pasirink keeper’į'); return }
    const loserIds = g.artists.map(a => a.id).filter(id => id !== keeperId)
    if (!loserIds.length) return
    const keeperName = g.artists.find(a => a.id === keeperId)?.name || keeperId
    if (!window.confirm(`Sujungti ${loserIds.length} dublikatą(-us) į „${keeperName}" (#${keeperId})?\n\nVisos nuorodos + patiktukai persikels į keeper’į, o dublikatai bus IŠTRINTI. Negrįžtama.`)) return
    setBusy(g.slug); setMsg(null)
    try {
      const res = await fetch('/api/admin/duplikatai-atlikejai/action', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keeper_id: keeperId, loser_ids: loserIds }),
      })
      const data = await res.json()
      if (!res.ok) { setMsg(`Klaida: ${data.error || 'nepavyko'}`); return }
      const failed = (data.results || []).filter((r: any) => !r.ok)
      setMsg(failed.length
        ? `Sujungta ${data.merged}, nepavyko ${failed.length}: ${failed.map((f: any) => `#${f.loser_id} (${f.error})`).join('; ')}`
        : `Sujungta ${data.merged} dublikatas(-ai) į „${keeperName}". Nuoroda /atlikejai/${g.slug} dabar vienareikšmė.`)
      await load()
    } finally { setBusy(null) }
  }

  const visible = onlyContent
    ? groups.filter(g => g.artists.filter(a => a.tracks + a.albums > 0).length >= 2)
    : groups

  if (status === 'loading' || (!isFullAdmin && status === 'authenticated')) {
    return <div className="p-8 text-sm" style={{ color: 'var(--text-muted)' }}>Kraunama…</div>
  }

  return (
    <div className="max-w-[1100px] mx-auto px-4 py-6" style={{ color: 'var(--text-primary)' }}>
      <div className="mb-4">
        <h1 className="text-2xl font-black">🧹 Atlikėjų dublikatai</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
          Tas pats slug ≥2 atlikėjams → 404 ir painiava. Pasirink keeper’į (paprastai daugiausiai turinio)
          ir sujunk likusius. Nuorodos + patiktukai persikelia, dublikatai ištrinami. <b>Negrįžtama.</b>
        </p>
      </div>

      <div className="flex items-center gap-4 mb-4 text-sm">
        <span style={{ color: 'var(--text-muted)' }}>Grupių: {groups.length} · rodoma: {visible.length}</span>
        <label className="flex items-center gap-2" style={{ color: 'var(--text-muted)' }}>
          <input type="checkbox" checked={onlyContent} onChange={e => setOnlyContent(e.target.checked)} />
          Tik „konfliktinės" (≥2 su turiniu)
        </label>
      </div>

      {msg && <div className="mb-3 px-3 py-2 rounded-lg text-sm" style={{ background: 'var(--bg-elevated)' }}>{msg}</div>}

      {loading ? (
        <div className="p-8 text-sm" style={{ color: 'var(--text-muted)' }}>Kraunama…</div>
      ) : (
        <div className="space-y-4">
          {visible.map(g => (
            <div key={g.slug} className="rounded-lg border p-3" style={{ borderColor: 'var(--border-default)', background: 'var(--bg-elevated)' }}>
              <div className="flex items-center justify-between mb-2">
                <div className="font-bold">/atlikejai/<span style={{ color: 'var(--accent-orange)' }}>{g.slug}</span> <span className="text-xs font-normal" style={{ color: 'var(--text-muted)' }}>· {g.count} atlikėjai</span></div>
                <button onClick={() => merge(g)} disabled={busy === g.slug}
                  className="text-xs px-3 py-1.5 rounded font-semibold text-white disabled:opacity-50"
                  style={{ background: 'var(--accent-orange, #ea580c)' }}>
                  {busy === g.slug ? 'Jungiama…' : 'Sujungti kitus į pažymėtą'}
                </button>
              </div>
              <div className="space-y-1.5">
                {g.artists.map(a => (
                  <label key={a.id} className="flex items-center gap-3 px-2 py-1.5 rounded cursor-pointer"
                    style={{ background: keeper[g.slug] === a.id ? 'var(--bg-hover)' : 'transparent' }}>
                    <input type="radio" name={`keeper-${g.slug}`} checked={keeper[g.slug] === a.id}
                      onChange={() => setKeeper(k => ({ ...k, [g.slug]: a.id }))} />
                    {a.cover_image_url
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={a.cover_image_url} alt="" className="h-8 w-8 rounded object-cover" />
                      : <span className="h-8 w-8 rounded inline-block" style={{ background: 'var(--bg-hover)' }} />}
                    <span className="flex-1 min-w-0">
                      <span className="text-sm font-semibold">{a.name}</span>
                      <span className="ml-2 text-xs" style={{ color: 'var(--text-muted)' }}>
                        #{a.id}{a.legacy_id ? ` · legacy ${a.legacy_id}` : ''} · score {a.score ?? 0} · {a.tracks} dain. · {a.albums} alb.
                      </span>
                    </span>
                    <a href={`/atlikejai/${a.id}`} target="_blank" rel="noreferrer"
                      className="text-xs hover:underline" style={{ color: 'var(--text-muted)' }}>peržiūra ↗</a>
                    {keeper[g.slug] === a.id && <span className="text-[12px] font-bold px-1.5 py-0.5 rounded bg-green-100 text-green-700">KEEPER</span>}
                  </label>
                ))}
              </div>
            </div>
          ))}
          {!visible.length && <div className="p-8 text-sm text-center" style={{ color: 'var(--text-muted)' }}>Dublikatų nėra 🎉</div>}
        </div>
      )}
    </div>
  )
}
