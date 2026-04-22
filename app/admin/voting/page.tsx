'use client'

import { useEffect, useState, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

type Channel = {
  id: number
  slug: string
  name: string
  description?: string
  logo_url?: string
  is_active: boolean
  sort_order: number
}

export default function VotingChannelsAdmin() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const isAdmin = session?.user?.role === 'admin' || session?.user?.role === 'super_admin'

  const [channels, setChannels] = useState<Channel[]>([])
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)
  const [newData, setNewData] = useState({ name: '', slug: '', description: '', logo_url: '' })

  useEffect(() => {
    if (status === 'loading') return
    if (!isAdmin) router.push('/')
  }, [status, isAdmin, router])

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/voting/channels?includeInactive=true')
    const data = await res.json()
    setChannels(data.channels || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function create() {
    if (!newData.name) return alert('Įrašyk pavadinimą')
    const res = await fetch('/api/voting/channels', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newData),
    })
    if (res.ok) {
      setShowNew(false)
      setNewData({ name: '', slug: '', description: '', logo_url: '' })
      load()
    } else {
      const err = await res.json()
      alert(err.error)
    }
  }

  async function toggleActive(c: Channel) {
    await fetch(`/api/voting/channels/${c.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !c.is_active }),
    })
    load()
  }

  async function remove(c: Channel) {
    if (!confirm(`Pašalinti kanalą "${c.name}"? Tai ištrins ir visus jo leidimus/rinkimus.`)) return
    await fetch(`/api/voting/channels/${c.id}`, { method: 'DELETE' })
    load()
  }

  if (!isAdmin) return null

  return (
    <div className="max-w-5xl mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Balsavimai / Rinkimai — Kanalai</h1>
        <button
          onClick={() => setShowNew(true)}
          className="px-4 py-2 bg-orange-500 text-white rounded hover:bg-orange-600 text-sm font-medium"
        >
          + Naujas kanalas
        </button>
      </div>

      <p className="text-sm text-gray-500 mb-4">
        Kanalas — tai tėvinė struktūra (pvz. „Eurovizija", „MAMA apdovanojimai"). Kiekvienas kanalas turi leidimus (metus),
        o kiekvienas leidimas — rinkimus ir dalyvius.
      </p>

      {loading ? (
        <div className="text-gray-400">Kraunama…</div>
      ) : (
        <div className="space-y-2">
          {channels.map(c => (
            <div
              key={c.id}
              className="flex items-center gap-4 p-4 border border-[var(--border-default)] rounded hover:bg-[var(--bg-hover)]"
            >
              {c.logo_url ? (
                <img src={c.logo_url} alt="" className="w-10 h-10 rounded object-cover" />
              ) : (
                <div className="w-10 h-10 rounded bg-gray-100 flex items-center justify-center text-gray-400">
                  🗳️
                </div>
              )}
              <div className="flex-1">
                <Link href={`/admin/voting/${c.id}`} className="font-medium hover:text-orange-600">
                  {c.name}
                </Link>
                <div className="text-xs text-gray-500">
                  /{c.slug} {!c.is_active && <span className="ml-2 text-red-500">• neaktyvus</span>}
                </div>
                {c.description && <div className="text-sm text-gray-600 mt-1">{c.description}</div>}
              </div>
              <div className="flex gap-2 text-xs">
                <button
                  onClick={() => toggleActive(c)}
                  className="px-2 py-1 border rounded hover:bg-gray-50"
                >
                  {c.is_active ? 'Slėpti' : 'Rodyti'}
                </button>
                <button
                  onClick={() => remove(c)}
                  className="px-2 py-1 border border-red-300 text-red-600 rounded hover:bg-red-50"
                >
                  Ištrinti
                </button>
              </div>
            </div>
          ))}
          {channels.length === 0 && (
            <div className="text-gray-400 text-sm italic">Kanalų nėra. Sukurk pirmą kanalą aukščiau.</div>
          )}
        </div>
      )}

      {showNew && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowNew(false)}>
          <div className="bg-[var(--modal-bg)] border border-[var(--modal-border)] p-6 rounded-lg shadow-[var(--modal-shadow)] w-full max-w-md m-4" onClick={e => e.stopPropagation()}>
            <h2 className="text-xl font-bold mb-4">Naujas kanalas</h2>
            <div className="space-y-3">
              <div>
                <label className="text-sm text-gray-600">Pavadinimas *</label>
                <input
                  type="text"
                  value={newData.name}
                  onChange={e => setNewData({ ...newData, name: e.target.value })}
                  className="w-full px-3 py-2 border rounded"
                  placeholder="pvz. Eurovizija"
                />
              </div>
              <div>
                <label className="text-sm text-gray-600">Slug (nebūtina)</label>
                <input
                  type="text"
                  value={newData.slug}
                  onChange={e => setNewData({ ...newData, slug: e.target.value })}
                  className="w-full px-3 py-2 border rounded"
                  placeholder="eurovizija"
                />
              </div>
              <div>
                <label className="text-sm text-gray-600">Aprašymas</label>
                <textarea
                  value={newData.description}
                  onChange={e => setNewData({ ...newData, description: e.target.value })}
                  className="w-full px-3 py-2 border rounded h-20"
                />
              </div>
              <div>
                <label className="text-sm text-gray-600">Logotipo URL</label>
                <input
                  type="text"
                  value={newData.logo_url}
                  onChange={e => setNewData({ ...newData, logo_url: e.target.value })}
                  className="w-full px-3 py-2 border rounded"
                />
              </div>
              <div className="flex justify-end gap-2 pt-3">
                <button onClick={() => setShowNew(false)} className="px-4 py-2 border rounded">Atšaukti</button>
                <button onClick={create} className="px-4 py-2 bg-orange-500 text-white rounded">Sukurti</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
