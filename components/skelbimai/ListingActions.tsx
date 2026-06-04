'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

/* Skelbimo veiksmai: Susisiekti (DM), Įsiminti, Pasidalinti.
 * Kontaktas = vidinės žinutės → POST /api/chat/conversations (DM) → /pokalbiai. */

type Props = {
  listingId: string
  authorId: string
  isAuthed: boolean
  isOwner: boolean
  initialSaved: boolean
  title: string
  sourceUrl?: string | null
  sourceName?: string | null
}

export function ListingActions({ listingId, authorId, isAuthed, isOwner, initialSaved, title, sourceUrl, sourceName }: Props) {
  const router = useRouter()
  const [saved, setSaved] = useState(initialSaved)
  const [saving, setSaving] = useState(false)
  const [contacting, setContacting] = useState(false)
  const [copied, setCopied] = useState(false)

  async function contact() {
    if (!isAuthed) { router.push(`/auth/signin?callbackUrl=/skelbimai/skelbimas/${listingId}`); return }
    setContacting(true)
    try {
      const res = await fetch('/api/chat/conversations', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'dm', user_id: authorId }),
      })
      const json = await res.json()
      if (res.ok && json.id) router.push(`/pokalbiai?c=${json.id}`)
      else router.push('/pokalbiai')
    } catch {
      router.push('/pokalbiai')
    } finally {
      setContacting(false)
    }
  }

  async function toggleSave() {
    if (!isAuthed) { router.push(`/auth/signin?callbackUrl=/skelbimai/skelbimas/${listingId}`); return }
    setSaving(true)
    const prev = saved
    setSaved(!prev) // optimistinis
    try {
      const res = await fetch(`/api/skelbimai/${listingId}/save`, { method: 'POST' })
      const json = await res.json()
      if (res.ok) setSaved(!!json.saved)
      else setSaved(prev)
    } catch {
      setSaved(prev)
    } finally {
      setSaving(false)
    }
  }

  async function share() {
    const url = typeof window !== 'undefined' ? window.location.href : ''
    if (navigator.share) {
      try { await navigator.share({ title, url }) } catch { /* user cancel */ }
    } else {
      try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000) } catch {}
    }
  }

  const btnBase: React.CSSProperties = {
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    padding: '12px 16px', fontSize: 15, fontWeight: 700, borderRadius: 10,
    cursor: 'pointer', border: '1px solid var(--border-default)',
    background: 'var(--bg-elevated)', color: 'var(--text-primary)',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {sourceUrl ? (
        <a href={sourceUrl} target="_blank" rel="noopener noreferrer nofollow" style={{
          ...btnBase, background: 'var(--accent-orange)', color: '#fff', border: 'none', textDecoration: 'none',
        }}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" /></svg>
          Žiūrėti originalą{sourceName ? ` (${sourceName})` : ''}
        </a>
      ) : !isOwner ? (
        <button onClick={contact} disabled={contacting} style={{
          ...btnBase, background: 'var(--accent-orange)', color: '#fff', border: 'none',
          opacity: contacting ? 0.7 : 1,
        }}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
          {contacting ? 'Atidaroma…' : 'Susisiekti'}
        </button>
      ) : (
        <a href="/skelbimai/mano" style={{ ...btnBase, textDecoration: 'none' }}>Tai tavo skelbimas — tvarkyk</a>
      )}

      <div style={{ display: 'flex', gap: 10 }}>
        <button onClick={toggleSave} disabled={saving} style={{ ...btnBase, flex: 1, color: saved ? 'var(--accent-red)' : 'var(--text-primary)' }}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill={saved ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 1 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78z" /></svg>
          {saved ? 'Įsiminta' : 'Įsiminti'}
        </button>
        <button onClick={share} style={{ ...btnBase, flex: 1 }}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" /></svg>
          {copied ? 'Nukopijuota' : 'Dalintis'}
        </button>
      </div>
    </div>
  )
}
