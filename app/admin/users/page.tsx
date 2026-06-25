'use client'

import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect, useState, useCallback, useRef } from 'react'

type Profile = {
  id: string
  email: string
  full_name: string | null
  username: string | null
  avatar_url: string | null
  role: string
  provider: string | null
  is_claimed: boolean | null
  created_at: string
  legacy_message_count: number | null
  legacy_login_count: number | null
  legacy_karma_points: number | null
  last_seen_legacy_at: string | null
  hide_from_homepage: boolean | null
  deactivated_at: string | null
  deactivated_reason: string | null
}

const PAGE = 100

export default function AdminUsersPage() {
  const { data: session, status, update } = useSession()
  const router = useRouter()

  const [users, setUsers] = useState<Profile[]>([])
  const [total, setTotal] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [updating, setUpdating] = useState<string | null>(null)
  const [impersonating, setImpersonating] = useState<string | null>(null)
  const [emailDraft, setEmailDraft] = useState<Record<string, string>>({})

  // Filtrai
  const [q, setQ] = useState('')
  const [sort, setSort] = useState('activity')
  const [claimedOnly, setClaimedOnly] = useState(false)

  // Tikra super_admin rolė (gali keisti roles); impersonacijos metu role
  // tampa nario, bet impersonating flag'as išlieka → leidžiam likti puslapy.
  const trulySuper = session?.user?.role === 'super_admin'
  const impersonatingNow = !!session?.user?.impersonating
  const canImpersonate = trulySuper || impersonatingNow
  const canAccess =
    trulySuper ||
    session?.user?.role === 'admin' ||
    impersonatingNow

  const reqId = useRef(0)

  const buildUrl = (offset: number) => {
    const p = new URLSearchParams()
    if (q.trim()) p.set('q', q.trim())
    if (sort) p.set('sort', sort)
    if (claimedOnly) p.set('claimed', '1')
    p.set('limit', String(PAGE))
    p.set('offset', String(offset))
    return `/api/admin/users?${p.toString()}`
  }

  const fetchUsers = useCallback(
    async (offset: number, append: boolean) => {
      const my = ++reqId.current
      append ? setLoadingMore(true) : setLoading(true)
      const res = await fetch(buildUrl(offset))
      const data = await res.json()
      if (my !== reqId.current) return // pasenusi užklausa — ignoruojam
      setTotal(typeof data.total === 'number' ? data.total : null)
      setUsers((prev) => (append ? [...prev, ...(data.users || [])] : data.users || []))
      append ? setLoadingMore(false) : setLoading(false)
    },
    [q, sort, claimedOnly]
  )

  // Auth guard
  useEffect(() => {
    if (status === 'loading') return
    if (!canAccess) router.push('/auth/forbidden')
  }, [status, canAccess])

  // Filtrų pakeitimas → perkraunam nuo 0 (su nedidele debounce paieškai)
  useEffect(() => {
    if (status === 'loading' || !canAccess) return
    const t = setTimeout(() => fetchUsers(0, false), q ? 300 : 0)
    return () => clearTimeout(t)
  }, [q, sort, claimedOnly, status, canAccess])

  const toggleHide = async (userId: string, val: boolean) => {
    setUpdating(userId)
    await fetch('/api/admin/users', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, hide_from_homepage: val }),
    })
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, hide_from_homepage: val } : u))
    setUpdating(null)
  }

  const updateRole = async (userId: string, newRole: string) => {
    if (!trulySuper) return
    setUpdating(userId)
    await fetch('/api/admin/users', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, role: newRole }),
    })
    setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, role: newRole } : u)))
    setUpdating(null)
  }

  // Priskirti realų el. paštą seno (legacy) nario profiliui — perėmimui.
  const assignEmail = async (userId: string) => {
    const val = (emailDraft[userId] || '').trim().toLowerCase()
    if (!val || !val.includes('@')) { alert('Įvesk teisingą el. paštą'); return }
    setUpdating(userId)
    const res = await fetch('/api/admin/users', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, setEmail: val }),
    })
    const data = await res.json().catch(() => ({}))
    setUpdating(null)
    if (!res.ok) { alert(data.message || data.error || 'Klaida priskiriant el. paštą'); return }
    setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, email: data.email } : u)))
    setEmailDraft((prev) => ({ ...prev, [userId]: '' }))
    alert('Priskirta. Kai narys prisijungs šiuo el. paštu — automatiškai perims šį profilį (su senu username ir veikla).')
  }

  // Soft-delete: paslėpti / atgaivinti narį (atstatoma).
  const toggleDeactivate = async (user: Profile) => {
    if (!trulySuper) return
    const isActive = !user.deactivated_at
    const label = user.full_name || user.username || user.email
    if (isActive) {
      if (!confirm(`Paslėpti narį „${label}"?\n\nProfilis taps neviešas ir bus paslėptas iš pagrindinio. Veiklą galėsi atgaivinti bet kada.`)) return
    } else {
      if (!confirm(`Atgaivinti narį „${label}"?`)) return
    }
    setUpdating(user.id)
    const res = await fetch('/api/admin/users', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: user.id, action: isActive ? 'deactivate' : 'reactivate' }),
    })
    const data = await res.json().catch(() => ({}))
    setUpdating(null)
    if (!res.ok) { alert(data.message || data.error || 'Klaida'); return }
    setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, deactivated_at: data.deactivated_at ?? null } : u)))
  }

  // Visiškas trynimas (negrįžtama) — dvigubas patvirtinimas.
  const deleteUser = async (user: Profile) => {
    if (!trulySuper) return
    const label = user.full_name || user.username || user.email
    if (!confirm(`IŠTRINTI narį „${label}" VISIŠKAI?\n\nNegrįžtama. Profilis ir jo veikla bus pašalinti, el. paštas (${user.email}) atlaisvintas.\n\nJei nori tik laikinai paslėpti — naudok „Paslėpti".`)) return
    const typed = prompt(`Patvirtink: įrašyk IŠTRINTI`)
    if (typed !== 'IŠTRINTI') { alert('Atšaukta.'); return }
    setUpdating(user.id)
    const res = await fetch('/api/admin/users', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: user.id }),
    })
    const data = await res.json().catch(() => ({}))
    setUpdating(null)
    if (!res.ok) { alert(data.message || data.error || 'Klaida trinant'); return }
    setUsers((prev) => prev.filter((u) => u.id !== user.id))
    setTotal((t) => (typeof t === 'number' ? Math.max(0, t - 1) : t))
  }

  const impersonate = async (user: Profile) => {
    if (!canImpersonate) return
    const label = user.full_name || user.username || user.email
    if (
      !confirm(
        `Prisijungti kaip „${label}"?\n\n` +
          `Atsidarys naujas langas, kuriame matysite svetainę šio nario akimis. ` +
          `Bet kada grįžkite per raudoną juostą viršuje.`
      )
    )
      return
    setImpersonating(user.id)
    // Langą atidarom IŠ KARTO (sinchroniškai), kad popup-blocker'is nestabdytų;
    // navigaciją nustatom kai sesija jau persijungusi.
    const win = window.open('about:blank', '_blank')
    await update({ impersonate: user.id })
    setImpersonating(null)
    if (win) win.location.href = '/'
    else window.location.href = '/' // jei popup užblokuotas — bent šitam tab'e
  }

  if (status === 'loading' || (loading && users.length === 0)) {
    return (
      <div className="min-h-screen bg-[var(--bg-elevated)] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-music-blue border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const roleColors: Record<string, string> = {
    super_admin: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    admin: 'bg-music-orange/20 text-music-orange border-music-orange/30',
    moderator: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
    user: 'bg-[var(--bg-hover)] text-[var(--text-muted)] border-[var(--border-default)]',
  }
  const roleLabels: Record<string, string> = {
    super_admin: 'Super Admin',
    admin: 'Admin',
    moderator: 'Moderatorius',
    user: 'Narys',
  }

  const sortOptions: { v: string; label: string }[] = [
    { v: 'activity', label: 'Aktyviausi (registruoti pirma)' },
    { v: 'messages', label: 'Daugiausiai žinučių' },
    { v: 'karma', label: 'Karma' },
    { v: 'recent', label: 'Naujausi' },
  ]

  const hasMore = total != null && users.length < total

  return (
    <div className="min-h-screen bg-[var(--bg-elevated)]">
      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-[var(--text-primary)]">Vartotojai</h1>
            <p className="text-[var(--text-muted)] text-sm mt-1">
              {total != null ? `${total.toLocaleString('lt-LT')} vartotojų` : `${users.length} vartotojų`}
              {q && ` · paieška „${q}"`}
            </p>
          </div>
          {!trulySuper && !impersonatingNow && (
            <div className="bg-[var(--status-warning-bg)] border border-[var(--status-warning-text)]/20 text-[var(--status-warning-text)] text-xs px-3 py-2 rounded-lg">
              Tik Super Admin gali keisti roles ir prisijungti kaip narys
            </div>
          )}
        </div>

        {/* Valdikliai */}
        <div className="flex items-center gap-3 mb-5 flex-wrap">
          <div className="relative flex-1 min-w-[220px]">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.3-4.3" />
            </svg>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Ieškoti pagal vardą, username arba el. paštą…"
              className="w-full pl-9 pr-3 py-2 text-sm rounded-lg bg-[var(--input-bg)] border border-[var(--input-border)] text-[var(--input-text)] focus:outline-none focus:ring-2 focus:ring-music-blue/30"
            />
          </div>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="text-sm bg-[var(--input-bg)] border border-[var(--input-border)] rounded-lg px-3 py-2 text-[var(--input-text)] focus:outline-none"
          >
            {sortOptions.map((o) => (
              <option key={o.v} value={o.v}>
                {o.label}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)] cursor-pointer select-none">
            <input
              type="checkbox"
              checked={claimedOnly}
              onChange={(e) => setClaimedOnly(e.target.checked)}
              className="accent-music-blue"
            />
            Tik registruoti
          </label>
        </div>

        <div className="bg-[var(--bg-surface)] border border-[var(--input-border)] rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[var(--border-default)]">
                <th className="text-left px-4 py-3 text-xs text-[var(--text-muted)] font-medium uppercase tracking-wider">Vartotojas</th>
                <th className="text-left px-4 py-3 text-xs text-[var(--text-muted)] font-medium uppercase tracking-wider hidden md:table-cell">Aktyvumas</th>
                <th className="text-left px-4 py-3 text-xs text-[var(--text-muted)] font-medium uppercase tracking-wider">Role</th>
                {trulySuper && <th className="text-left px-4 py-3 text-xs text-[var(--text-muted)] font-medium uppercase tracking-wider hidden lg:table-cell">Keisti rolę</th>}
                <th className="text-center px-4 py-3 text-xs text-[var(--text-muted)] font-medium uppercase tracking-wider hidden md:table-cell">Slėpti HP</th>
                {canImpersonate && <th className="text-right px-4 py-3 text-xs text-[var(--text-muted)] font-medium uppercase tracking-wider">Veiksmas</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]">
              {users.map((user) => {
                const isSelf = user.email === session?.user?.email
                const real = user.is_claimed || (user.provider && user.provider !== 'legacy_forum')
                return (
                  <tr key={user.id} className="hover:bg-[var(--bg-hover)] transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {user.avatar_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={user.avatar_url} alt="" width={32} height={32} className="w-8 h-8 rounded-full object-cover" referrerPolicy="no-referrer" />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-music-blue to-music-orange flex items-center justify-center text-xs font-bold text-white">
                            {(user.full_name || user.username || user.email)[0].toUpperCase()}
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-[var(--text-primary)] flex items-center gap-2">
                            {user.full_name || user.username || '—'}
                            {real && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-500/15 text-green-600 border border-green-500/20">
                                registruotas
                              </span>
                            )}
                            {user.deactivated_at && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-500/15 text-red-500 border border-red-500/20">
                                paslėptas
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-[var(--text-muted)] truncate">
                            {user.username ? `@${user.username}` : ''}
                            {user.username && user.email ? ' · ' : ''}
                            {user.email}
                          </div>
                          {trulySuper && !real && (
                            <div className="mt-1.5 flex items-center gap-1">
                              <input
                                type="email"
                                placeholder="priskirti realų el. paštą"
                                value={emailDraft[user.id] || ''}
                                onChange={(e) => setEmailDraft((p) => ({ ...p, [user.id]: e.target.value }))}
                                onKeyDown={(e) => { if (e.key === 'Enter') assignEmail(user.id) }}
                                className="text-xs bg-[var(--input-bg)] border border-[var(--input-border)] rounded px-2 py-1 text-[var(--input-text)] w-48 focus:outline-none"
                              />
                              <button
                                type="button"
                                onClick={() => assignEmail(user.id)}
                                disabled={updating === user.id}
                                title="Priskirti el. paštą — narys prisijungęs juo perims šį profilį"
                                className="text-xs font-medium px-2 py-1 rounded bg-music-blue text-white hover:bg-music-blue/90 disabled:opacity-50"
                              >
                                Priskirti
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <div className="text-xs text-[var(--text-muted)] space-y-0.5">
                        {user.legacy_message_count ? <div>💬 {user.legacy_message_count.toLocaleString('lt-LT')} žinučių</div> : null}
                        {user.legacy_login_count ? <div>🔑 {user.legacy_login_count.toLocaleString('lt-LT')} prisij.</div> : null}
                        {!user.legacy_message_count && !user.legacy_login_count ? <span className="text-[var(--text-faint)]">—</span> : null}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block text-xs px-2 py-1 rounded-full border font-medium ${roleColors[user.role] || roleColors.user}`}>
                        {roleLabels[user.role] || user.role}
                      </span>
                    </td>
                    {trulySuper && (
                      <td className="px-4 py-3 hidden lg:table-cell">
                        {!isSelf ? (
                          <select value={user.role} onChange={(e) => updateRole(user.id, e.target.value)} disabled={updating === user.id}
                            className="text-xs bg-[var(--input-bg)] border border-[var(--input-border)] rounded-lg px-2 py-1.5 text-[var(--input-text)] focus:outline-none disabled:opacity-50">
                            <option value="user">Narys</option>
                            <option value="moderator">Moderatorius</option>
                            <option value="admin">Admin</option>
                            <option value="super_admin">Super Admin</option>
                          </select>
                        ) : (
                          <span className="text-xs text-[var(--text-faint)]">Tu pats</span>
                        )}
                      </td>
                    )}
                    <td className="px-4 py-3 text-center hidden md:table-cell">
                      <button
                        type="button"
                        onClick={() => toggleHide(user.id, !user.hide_from_homepage)}
                        disabled={updating === user.id}
                        title={user.hide_from_homepage ? 'Rodomas pagrindiniame' : 'Slėpti nuo pagrindinio'}
                        className="relative inline-flex h-5 w-9 items-center rounded-full transition-colors disabled:opacity-50"
                        style={{ background: user.hide_from_homepage ? 'var(--accent-orange,#f2641a)' : 'rgba(255,255,255,0.12)' }}
                      >
                        <span className="absolute h-4 w-4 rounded-full bg-white shadow transition-transform"
                              style={{ left: 2, transform: user.hide_from_homepage ? 'translateX(16px)' : 'translateX(0)' }} />
                      </button>
                    </td>
                    {canImpersonate && (
                      <td className="px-4 py-3 text-right">
                        {!isSelf ? (
                          <div className="flex items-center justify-end gap-1.5 flex-wrap">
                            <button
                              onClick={() => impersonate(user)}
                              disabled={impersonating === user.id}
                              className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-music-blue text-white hover:bg-music-blue/90 transition-colors disabled:opacity-50"
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                                <polyline points="10 17 15 12 10 7" />
                                <line x1="15" y1="12" x2="3" y2="12" />
                              </svg>
                              {impersonating === user.id ? 'Jungiamasi…' : 'Prisijungti kaip'}
                            </button>
                            {trulySuper && user.role !== 'admin' && user.role !== 'super_admin' && (
                              <>
                                <button
                                  onClick={() => toggleDeactivate(user)}
                                  disabled={updating === user.id}
                                  title={user.deactivated_at ? 'Atgaivinti narį' : 'Paslėpti narį (atstatoma)'}
                                  className="inline-flex items-center text-xs font-medium px-2.5 py-1.5 rounded-lg border border-[var(--input-border)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition-colors disabled:opacity-50"
                                >
                                  {user.deactivated_at ? 'Atgaivinti' : 'Paslėpti'}
                                </button>
                                <button
                                  onClick={() => deleteUser(user)}
                                  disabled={updating === user.id}
                                  title="Ištrinti visiškai (negrįžtama)"
                                  className="inline-flex items-center text-xs font-medium px-2.5 py-1.5 rounded-lg border border-red-500/30 bg-red-500/10 text-red-500 hover:bg-red-500/20 transition-colors disabled:opacity-50"
                                >
                                  Ištrinti
                                </button>
                              </>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-[var(--text-faint)]">—</span>
                        )}
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
          {users.length === 0 && !loading && (
            <div className="px-4 py-10 text-center text-sm text-[var(--text-muted)]">Nieko nerasta</div>
          )}
        </div>

        {hasMore && (
          <div className="mt-5 text-center">
            <button
              onClick={() => fetchUsers(users.length, true)}
              disabled={loadingMore}
              className="text-sm font-medium px-5 py-2 rounded-lg border border-[var(--input-border)] bg-[var(--bg-surface)] text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors disabled:opacity-50"
            >
              {loadingMore ? 'Kraunama…' : `Rodyti daugiau (${(total! - users.length).toLocaleString('lt-LT')})`}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
