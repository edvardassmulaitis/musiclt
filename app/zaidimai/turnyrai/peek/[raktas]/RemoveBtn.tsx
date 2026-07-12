'use client'

// Kandidato šalinimo mygtukas (tik peek peržiūroje).
// Pašalina dainą visam laikui (exclusions) ir pergeneruoja turnyrą —
// į vietą ateina kita to paties atlikėjo daina arba kitas atlikėjas.

import { useState } from 'react'

export default function RemoveBtn({ raktas, trackId, label }: {
  raktas: string
  trackId: number
  label: string
}) {
  const [busy, setBusy] = useState(false)

  async function remove() {
    if (!confirm(`Pašalinti „${label}" iš turnyro?\n\nDaina nebegrįš (į vietą ateis kita), o turnyro medis bus pergeneruotas.`)) return
    setBusy(true)
    try {
      const res = await fetch('/api/zaidimai/turnyrai/salinti', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ raktas, trackId }),
      })
      const j = await res.json()
      if (!res.ok) { alert(j.error || 'Nepavyko'); setBusy(false); return }
      location.reload()
    } catch {
      alert('Tinklo klaida')
      setBusy(false)
    }
  }

  return (
    <button
      onClick={remove}
      disabled={busy}
      title="Pašalinti kandidatą (pergeneruos turnyrą)"
      className="ml-auto shrink-0 rounded px-1.5 text-[11px] leading-5 text-neutral-600 hover:bg-red-500/15 hover:text-red-400 disabled:opacity-40"
    >
      {busy ? '…' : '✕'}
    </button>
  )
}
