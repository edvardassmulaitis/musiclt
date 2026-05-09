'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function PendingActions({ kind, id }: { kind: 'album' | 'track'; id: number }) {
  const router = useRouter()
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null)
  const [error, setError] = useState<string | null>(null)

  const action = async (op: 'approve' | 'reject') => {
    if (busy) return
    if (op === 'reject' && !confirm(`Tikrai ištrinti ${kind} ID ${id}? Cascade'inančiai ištrins likes/comments.`)) return
    setBusy(op); setError(null)
    try {
      const r = await fetch(`/api/admin/import/pending/${kind}/${id}`, {
        method: op === 'approve' ? 'PATCH' : 'DELETE',
        headers: { 'Content-Type': 'application/json' },
      })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      router.refresh()
    } catch (e: any) {
      setError(e?.message || 'Klaida')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={() => action('approve')}
        disabled={busy !== null}
        className="rounded-md bg-green-600 px-2 py-1 text-[11px] font-bold text-white transition-colors hover:bg-green-700 disabled:opacity-50"
      >
        {busy === 'approve' ? '…' : '✓ Approve'}
      </button>
      <button
        type="button"
        onClick={() => action('reject')}
        disabled={busy !== null}
        className="rounded-md bg-red-600 px-2 py-1 text-[11px] font-bold text-white transition-colors hover:bg-red-700 disabled:opacity-50"
      >
        {busy === 'reject' ? '…' : '✕ Reject'}
      </button>
      {error && <span className="text-[10px] text-red-500">{error}</span>}
    </div>
  )
}
