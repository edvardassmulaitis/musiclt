'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import Link from 'next/link'

type Discussion = {
  id: number; slug: string; title: string; body: string
  user_id: string; author_name: string | null; author_avatar: string | null
  tags: string[]; is_pinned: boolean; is_locked: boolean
  comment_count: number; like_count: number; view_count: number
  last_comment_at: string | null; created_at: string
}

const AVAILABLE_TAGS = ['Klausimai', 'Rekomendacijos', 'Diskusijos', 'Marketplace', 'Renginiai', 'Kita']

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Ka tik'
  if (mins < 60) return 'pries ' + mins + ' min.'
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return 'pries ' + hrs + ' val.'
  const days = Math.floor(hrs / 24)
  if (days < 30) return 'pries ' + days + ' d.'
  return new Date(dateStr).toLocaleDateString('lt-LT', { month: 'short', day: 'numeric', year: 'numeric' })
}

function NewDiscussionModal({ onClose, onCreated }: { onClose: () => void; onCreated: (d: Discussion) => void }) {
  const [title, setTitle] = useState('')
  const [text, setText] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  const submit = async () => {
    setError('')
    setSending(true)
    const res = await fetch('/api/diskusijos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, text, tags }),
    })
    const data = await res.json()
    if (res.ok) onCreated(data.discussion)
    else setError(data.error || 'Klaida')
    setSending(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-8 overflow-y-auto"
      style={{ background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="w-full max-w-2xl rounded-3xl overflow-hidden shadow-2xl"
        style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.12)' }}>
        <div className="flex items-center justify-between px-6 py-5 border-b border-white/10">
          <h3 className="font-black text-white text-xl">Nauja diskusija</h3>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full bg-white/5 text-gray-400 hover:text-white hover:bg-white/10 transition-all">x</button>
        </div>
        <div className="p-6 space-y-4">
          <input type="text" value={title} onChange={e => setTitle(e.target.value)}
            placeholder="Pavadinimas..."
            className="w-full px-4 py-3 rounded-2xl text-white placeholder:text-gray-500 text-base font-semibold focus:outline-none"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }} />
          <textarea value={text} onChange={e => setText(e.target.value)}
            placeholder="Parasyk diskusijos turini..."
            rows={6}
            className="w-full px-4 py-3 rounded-2xl text-white placeholder:text-gray-500 text-sm resize-none focus:outline-none"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }} />
          <div>
            <p className="text-xs text-gray-500 font-bold uppercase tracking-wider mb-2">Tagai</p>
            <div className="flex flex-wrap gap-2">
              {AVAILABLE_TAGS.map(tag => (
                <button key={tag} onClick={() => setTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag])}
                  className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all ${tags.includes(tag) ? 'bg-blue-600 text-white' : 'bg-white/5 text-gray-400 border border-white/10 hover:bg-white/10'}`}>
                  {tag}
                </button>
              ))}
            </div>
          </div>
          {error && (
            <p className="text-red-400 text-sm px-3 py-2 rounded-xl"
              style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)' }}>
              {error}
            </p>
          )}
          <button onClick={submit} disabled={sending || title.trim().length < 5 || text.trim().length < 10}
            className="w-full py-3.5 rounded-2xl font-black text-white text-base transition-all disabled:opacity-40"
            style={{ background: 'linear-gradient(135deg, #1d4ed8, #4f46e5)' }}>
            {sending ? 'Kuriama...' : 'Sukurti diskusija'}
          </button>
        </div>
      </div>
    </div>
  )
}

function DiscussionCard({ d }: { d: Discussion }) {
  const activityDate = d.last_comment_at || d.created_at
  return (
    <Link href={`/diskusijos/${d.slug}`} className="block group transition-all hover:translate-y-[-1px]">
      <div className="px-5 py-4 rounded-2xl transition-all"
        style={{
          background: d.is_pinned ? 'rgba(249,115,22,0.06)' : 'rgba(255,255,255,0.04)',
          border: d.is_pinned ? '1px solid rgba(249,115,22,0.15)' : '1px solid rgba(255,255,255,0.07)',
        }}>
        <div className="flex items-start gap-3">
          <div className="hidden sm:flex flex-col items-center gap-3 flex-shrink-0 w-10">
            <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold"
              style={{ background: 'rgba(29,78,216,0.2)', color: '#93c5fd' }}>
              {d.author_name?.slice(0, 2).toUpperCase() || '??'}
            </div>
            <div className="text-center">
              <p className="text-xs font-bold text-white">{d.comment_count}</p>
              <p className="text-[10px] text-gray-600">atl.</p>
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start gap-2 flex-wrap mb-1">
              {d.is_pinned && <span className="text-[10px] font-black text-orange-400 uppercase">Prisegta</span>}
              {d.is_locked && <span className="text-[10px] font-black text-gray-600 uppercase">Uzrakinta</span>}
              {(d.tags || []).map(tag => (
                <span key={tag} className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                  style={{ background: 'rgba(99,102,241,0.15)', color: '#a5b4fc' }}>
                  {tag}
                </span>
              ))}
            </div>
            <h3 className="text-sm font-bold text-white group-hover:text-blue-300 transition-colors leading-snug">{d.title}</h3>
            <p className="text-xs text-gray-600 mt-1 line-clamp-1">{d.body}</p>
            <div className="flex items-center gap-3 mt-2">
              <span className="text-xs text-gray-600">{d.author_name || 'Vartotojas'}</span>
              <span className="text-gray-800 text-xs">·</span>
              <span className="text-xs text-gray-600">{timeAgo(activityDate)}</span>
              <span className="text-gray-800 text-xs">·</span>
              <span className="text-xs text-gray-600">{d.view_count} peržiūrų</span>
            </div>
          </div>
        </div>
      </div>
    </Link>
  )
}

export default function DiskusijosPage() {
  const { data: session } = useSession()
  const [discussions, setDiscussions] = useState<Discussion[]>([])
  const [loading, setLoading] = useState(true)
  const [sort, setSort] = useState<'activity' | 'newest' | 'popular'>('activity')
  const [activeTag, setActiveTag] = useState<string | null>(null)
  const [showNew, setShowNew] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams({ sort, limit: '30' })
    if (activeTag) params.set('tag', activeTag)
    const res = await fetch(`/api/diskusijos?${params}`)
    const data = await res.json()
    setDiscussions(data.discussions || [])
    setLoading(false)
  }, [sort, activeTag])

  useEffect(() => { load() }, [load])

  return (
    <div style={{ background: '#080d14', minHeight: '100vh' }}>
      <div className="max-w-[860px] mx-auto px-5 py-10">

        <div className="flex items-start justify-between gap-4 mb-8 flex-wrap">
          <div>
            <h1 className="text-4xl font-black text-white mb-1">Diskusijos</h1>
            <p className="text-gray-500">Laisvos diskusijos, klausimai, rekomendacijos</p>
          </div>
          {session ? (
            <button onClick={() => setShowNew(true)}
              className="px-5 py-2.5 rounded-2xl font-black text-white text-sm transition-all hover:scale-105"
              style={{ background: 'linear-gradient(135deg, #1d4ed8, #4f46e5)' }}>
              + Nauja diskusija
            </button>
          ) : (
            <Link href="/auth/signin"
              className="px-5 py-2.5 rounded-2xl font-bold text-sm text-white transition-all hover:scale-105"
              style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)' }}>
              Prisijungti
            </Link>
          )}
        </div>

        <div className="flex items-center gap-3 mb-5 flex-wrap">
          <div className="flex gap-1 p-1 rounded-xl"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
            {([['activity', 'Aktyvios'], ['newest', 'Naujos'], ['popular', 'Populiarios']] as const).map(([k, l]) => (
              <button key={k} onClick={() => setSort(k)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${sort === k ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}>
                {l}
              </button>
            ))}
          </div>
          <div className="flex gap-2 flex-wrap">
            <button onClick={() => setActiveTag(null)}
              className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all ${!activeTag ? 'bg-white/15 text-white' : 'bg-white/5 text-gray-500 border border-white/10 hover:bg-white/10'}`}>
              Visos
            </button>
            {AVAILABLE_TAGS.map(tag => (
              <button key={tag} onClick={() => setActiveTag(activeTag === tag ? null : tag)}
                className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all ${activeTag === tag ? 'bg-indigo-500/30 text-indigo-300 border border-indigo-500/40' : 'bg-white/5 text-gray-500 border border-white/10 hover:bg-white/10'}`}>
                {tag}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-7 h-7 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : discussions.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-5xl mb-4">💬</p>
            <p className="text-xl font-black text-white mb-2">Dar nera diskusiju</p>
            <p className="text-gray-500 mb-6">Buk pirmas — sukurk diskusijos tema!</p>
            {session && (
              <button onClick={() => setShowNew(true)}
                className="px-8 py-3 rounded-2xl font-black text-white"
                style={{ background: 'linear-gradient(135deg, #1d4ed8, #4f46e5)' }}>
                + Nauja diskusija
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {discussions.map(d => <DiscussionCard key={d.id} d={d} />)}
          </div>
        )}

        {showNew && (
          <NewDiscussionModal
            onClose={() => setShowNew(false)}
            onCreated={d => { setDiscussions(prev => [d, ...prev]); setShowNew(false) }}
          />
        )}
      </div>
    </div>
  )
}
