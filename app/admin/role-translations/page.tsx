'use client'
// app/admin/role-translations/page.tsx
//
// Admin valdo „Sritys" canonical values (singer, songwriter, vocals, etc.)
// LT vertimus + hide flag'us. Sąrašas auto-agreguotas iš visų atlikėjų
// artists.roles[] stulpelio + esamų role_translations įrašų.
//
// Vertimai šiuo metu naudojami tik kaip duomenų sluoksnis — public
// artist profile dar nerodo Sritys sekcijos. Tačiau admin'as gali iš anksto
// pasiruošti vertimus, kad jau po display'aus įdiegimo viskas matytųsi.

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

type Item = {
  canonical: string
  count: number
  lt: string | null
  hidden: boolean
  updated_at: string | null
}

export default function RoleTranslationsAdminPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [showOnly, setShowOnly] = useState<'all'|'untranslated'|'hidden'>('all')

  const isAdmin = session?.user?.role === 'admin' || session?.user?.role === 'super_admin'

  useEffect(() => { if (status === 'unauthenticated') router.push('/') }, [status, router])

  useEffect(() => {
    if (!isAdmin) return
    fetch('/api/admin/role-translations')
      .then(r => r.json())
      .then(d => setItems(d.items || []))
      .finally(() => setLoading(false))
  }, [isAdmin])

  const update = async (canonical: string, patch: Partial<Pick<Item, 'lt'|'hidden'>>) => {
    setSaving(canonical)
    try {
      const r = await fetch('/api/admin/role-translations', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ canonical, ...patch }),
      })
      if (r.ok) {
        setItems(prev => prev.map(it => it.canonical === canonical ? { ...it, ...patch } as Item : it))
      }
    } catch {}
    finally { setSaving(null) }
  }

  if (status === 'loading' || (status === 'authenticated' && !isAdmin)) {
    return <div className="p-6 text-center text-sm text-[var(--text-muted)]">Tikrinama prieiga...</div>
  }
  if (status === 'unauthenticated') return null

  const q = search.trim().toLowerCase()
  const filtered = items.filter(it => {
    if (q && !it.canonical.includes(q) && !(it.lt || '').toLowerCase().includes(q)) return false
    if (showOnly === 'untranslated' && it.lt) return false
    if (showOnly === 'hidden' && !it.hidden) return false
    return true
  })

  const untranslatedCount = items.filter(it => !it.lt && !it.hidden).length

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6">
      <div className="mb-4">
        <nav className="text-xs text-[var(--text-muted)] mb-2">
          <Link href="/admin" className="hover:underline">Admin</Link>
          <span className="mx-1.5">/</span>
          <span className="text-[var(--text-primary)] font-semibold">Sričių vertimai</span>
        </nav>
        <h1 className="text-xl font-bold text-[var(--text-primary)]">Sričių vertimai</h1>
        <p className="text-sm text-[var(--text-muted)] mt-1">
          LT vertimai Wiki Sritys (occupation + instrument) reikšmėms. Galima
          paslėpti įrašus, kurie netinka public profilyje. {untranslatedCount > 0 && (
            <span className="ml-1 text-amber-600">{untranslatedCount} neturi LT vertimo.</span>
          )}
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-2 mb-3">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Ieškoti pagal canonical arba LT..."
          className="flex-1 px-3 py-2 border border-[var(--input-border)] rounded-lg text-sm focus:outline-none focus:border-blue-400"
        />
        <select
          value={showOnly}
          onChange={e => setShowOnly(e.target.value as any)}
          className="px-3 py-2 border border-[var(--input-border)] rounded-lg text-sm bg-white"
        >
          <option value="all">Visi ({items.length})</option>
          <option value="untranslated">Be LT vertimo</option>
          <option value="hidden">Paslėpti</option>
        </select>
      </div>

      {loading ? (
        <div className="text-center py-10 text-sm text-[var(--text-muted)]">Kraunama...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-10 text-sm text-[var(--text-muted)]">Nieko nerasta</div>
      ) : (
        <div className="border border-[var(--border-subtle)] rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-[var(--bg-elevated)] text-[var(--text-muted)] text-xs uppercase tracking-wider">
              <tr>
                <th className="text-left px-3 py-2 font-semibold">Canonical (EN)</th>
                <th className="text-left px-3 py-2 font-semibold">Atlikėjų</th>
                <th className="text-left px-3 py-2 font-semibold">LT vertimas</th>
                <th className="text-center px-3 py-2 font-semibold">Slėpti</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(it => (
                <tr key={it.canonical} className={`border-t border-[var(--border-subtle)] ${it.hidden ? 'opacity-60' : ''}`}>
                  <td className="px-3 py-2 font-medium text-[var(--text-primary)] whitespace-nowrap">{it.canonical}</td>
                  <td className="px-3 py-2 text-[var(--text-muted)] text-xs tabular-nums">{it.count || '—'}</td>
                  <td className="px-3 py-2">
                    <LtInput
                      initial={it.lt || ''}
                      placeholder={`pvz. ${it.canonical === 'singer' ? 'dainininkas' : it.canonical === 'guitar' ? 'gitara' : '...'}`}
                      onSave={v => update(it.canonical, { lt: v || null })}
                      saving={saving === it.canonical}
                    />
                  </td>
                  <td className="px-3 py-2 text-center">
                    <input
                      type="checkbox"
                      checked={it.hidden}
                      onChange={e => update(it.canonical, { hidden: e.target.checked })}
                      className="w-4 h-4 cursor-pointer"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function LtInput({ initial, placeholder, onSave, saving }: {
  initial: string; placeholder?: string; onSave: (v: string) => void; saving: boolean
}) {
  const [v, setV] = useState(initial)
  const [dirty, setDirty] = useState(false)
  useEffect(() => { setV(initial); setDirty(false) }, [initial])
  return (
    <div className="flex items-center gap-1.5">
      <input
        type="text"
        value={v}
        onChange={e => { setV(e.target.value); setDirty(e.target.value !== initial) }}
        onBlur={() => { if (dirty) onSave(v.trim()) }}
        onKeyDown={e => { if (e.key === 'Enter') { e.currentTarget.blur() } }}
        placeholder={placeholder}
        className="w-full px-2 py-1 text-sm border border-[var(--input-border)] rounded focus:outline-none focus:border-blue-400"
      />
      {saving && <span className="text-[10px] text-[var(--text-faint)]">...</span>}
      {dirty && !saving && <span className="text-[10px] text-amber-500">●</span>}
    </div>
  )
}
