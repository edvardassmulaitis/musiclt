'use client'

import { useEffect, useState, useCallback, use as usePromise } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

type Channel = { id: number; slug: string; name: string; logo_url?: string }
type Edition = {
  id: number
  channel_id: number
  slug: string
  name: string
  year?: number
  status: 'draft' | 'voting_open' | 'voting_closed' | 'archived'
  vote_open?: string
  vote_close?: string
}

export default function ChannelAdmin({ params }: { params: Promise<{ channelId: string }> }) {
  const { channelId } = usePromise(params)
  const { data: session, status } = useSession()
  const router = useRouter()
  const isAdmin = session?.user?.role === 'admin' || session?.user?.role === 'super_admin'

  const [channel, setChannel] = useState<Channel | null>(null)
  const [editions, setEditions] = useState<Edition[]>([])
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)
  const [newData, setNewData] = useState<any>({ name: '', year: new Date().getFullYear(), description: '' })

  useEffect(() => {
    if (status === 'loading') return
    if (!isAdmin) router.push('/')
  }, [status, isAdmin, router])

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch(`/api/voting/channels/${channelId}`)
    const data = await res.json()
    setChannel(data.channel)
    setEditions(data.editions || [])
    setLoading(false)
  }, [channelId])

  useEffect(() => { load() }, [load])

  async function create() {
    if (!newData.name) return alert('Įrašyk pavadinimą')
    const res = await fetch('/api/voting/editions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...newData, channel_id: channel!.id }),
    })
    if (res.ok) {
      setShowNew(false)
      setNewData({ name: '', year: new Date().getFullYear(), description: '' })
      load()
    } else {
      alert((await res.json()).error)
    }
  }

  async function remove(e: Edition) {
    if (!confirm(`Ištrinti leidimą "${e.name}"?`)) return
    await fetch(`/api/voting/editions/${e.id}`, { method: 'DELETE' })
    load()
  }

  if (!isAdmin) return null
  if (loading) return <div className="p-6 text-gray-400">Kraunama…</div>
  if (!channel) return <div className="p-6 text-red-500">Kanalas nerastas</div>

  return (
    <div className="max-w-5xl mx-auto p-6">
      <div className="mb-4 text-sm">
        <Link href="/admin/voting" className="text-orange-600 hover:underline">← Kanalai</Link>
      </div>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">{channel.name}</h1>
          <div className="text-xs text-gray-500">/{channel.slug}</div>
        </div>
        <button
          onClick={() => setShowNew(true)}
          className="px-4 py-2 bg-orange-500 text-white rounded hover:bg-orange-600 text-sm font-medium"
        >
          + Naujas leidimas
        </button>
      </div>

      <h2 className="text-lg font-semibold mb-3">Leidimai</h2>
      <div className="space-y-2">
        {editions.map(e => (
          <div key={e.id} className="flex items-center gap-4 p-4 border rounded hover:bg-[var(--bg-hover)]">
            <div className="flex-1">
              <Link href={`/admin/voting/${channel.id}/${e.id}`} className="font-medium hover:text-orange-600">
                {e.name} {e.year && <span className="text-gray-400">· {e.year}</span>}
              </Link>
              <div className="text-xs text-gray-500">/{e.slug} · {statusLabel(e.status)}</div>
            </div>
            <button onClick={() => remove(e)} className="px-2 py-1 text-xs border border-red-300 text-red-600 rounded hover:bg-red-50">
              Ištrinti
            </button>
          </div>
        ))}
        {editions.length === 0 && (
          <div className="text-gray-400 text-sm italic">Leidimų dar nėra. Sukurk pirmą leidimą (pvz. „Eurovizija 2026").</div>
        )}
      </div>

      {showNew && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowNew(false)}>
          <div className="bg-white dark:bg-gray-900 p-6 rounded-lg shadow-lg w-full max-w-md m-4" onClick={evt => evt.stopPropagation()}>
            <h2 className="text-xl font-bold mb-4">Naujas leidimas</h2>
            <div className="space-y-3">
              <div>
                <label className="text-sm text-gray-600">Pavadinimas *</label>
                <input
                  type="text"
                  value={newData.name}
                  onChange={e => setNewData({ ...newData, name: e.target.value })}
                  className="w-full px-3 py-2 border rounded"
                  placeholder="pvz. Eurovizija 2026"
                />
              </div>
              <div>
                <label className="text-sm text-gray-600">Metai</label>
                <input
                  type="number"
                  value={newData.year}
                  onChange={e => setNewData({ ...newData, year: parseInt(e.target.value) || undefined })}
                  className="w-full px-3 py-2 border rounded"
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

function statusLabel(s: string): string {
  return (
    { draft: 'Juodraštis', voting_open: 'Balsavimas atidarytas', voting_closed: 'Balsavimas uždarytas', archived: 'Archyvas' } as Record<string, string>
  )[s] || s
}
