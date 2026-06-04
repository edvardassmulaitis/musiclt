'use client'

import { useState } from 'react'
import Link from 'next/link'
import { proxyImg } from '@/lib/img-proxy'
import { formatPrice, LISTING_TYPES, type Listing, type ListingStatus } from '@/lib/skelbimai'

/* Mano skelbimai — statusų valdymas (active/reserved/closed), pratęsimas, trynimas. */

const STATUS_LABEL: Record<string, string> = {
  active: 'Aktyvus', reserved: 'Rezervuotas', closed: 'Užbaigtas', expired: 'Pasibaigęs',
}
const STATUS_COLOR: Record<string, string> = {
  active: 'var(--accent-green)', reserved: 'var(--accent-yellow)', closed: 'var(--text-muted)', expired: 'var(--text-faint)',
}

export function MyListings({ initial }: { initial: Listing[] }) {
  const [items, setItems] = useState<Listing[]>(initial)
  const [busy, setBusy] = useState<string | null>(null)

  async function patch(id: string, body: any) {
    setBusy(id)
    try {
      const res = await fetch(`/api/skelbimai/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      if (res.ok) {
        setItems(items.map(it => it.id === id ? { ...it, ...(body.status ? { status: body.status as ListingStatus } : {}) } : it))
      }
    } finally { setBusy(null) }
  }

  async function remove(id: string) {
    if (!confirm('Ištrinti šį skelbimą?')) return
    setBusy(id)
    try {
      const res = await fetch(`/api/skelbimai/${id}`, { method: 'DELETE' })
      if (res.ok) setItems(items.filter(it => it.id !== id))
    } finally { setBusy(null) }
  }

  if (items.length === 0) {
    return (
      <div style={{ padding: '48px 24px', textAlign: 'center', borderRadius: 16, border: '1px dashed var(--border-default)', color: 'var(--text-muted)' }}>
        <p style={{ margin: '0 0 14px' }}>Dar neturi skelbimų.</p>
        <Link href="/skelbimai/naujas" style={{ display: 'inline-block', padding: '10px 20px', borderRadius: 10, fontWeight: 700, background: 'var(--accent-green)', color: '#04140a', textDecoration: 'none' }}>+ Įdėti skelbimą</Link>
      </div>
    )
  }

  const smallBtn: React.CSSProperties = {
    padding: '6px 11px', fontSize: 12.5, fontWeight: 700, borderRadius: 8, cursor: 'pointer',
    background: 'var(--bg-surface)', border: '1px solid var(--border-default)', color: 'var(--text-secondary)',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {items.map(l => {
        const price = formatPrice(l.price_cents, l.price_unit, l.is_free)
        return (
          <div key={l.id} style={{
            display: 'flex', gap: 14, padding: 12, borderRadius: 12,
            background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
            opacity: busy === l.id ? 0.6 : 1, alignItems: 'center', flexWrap: 'wrap',
          }}>
            <Link href={`/skelbimai/skelbimas/${l.id}`} style={{ flexShrink: 0 }}>
              {l.photos?.[0] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={proxyImg(l.photos[0], 160)} alt="" style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 9 }} />
              ) : (
                <div style={{ width: 64, height: 64, borderRadius: 9, background: 'var(--bg-surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-faint)', fontSize: 12 }}>—</div>
              )}
            </Link>

            <div style={{ flex: '1 1 200px', minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: STATUS_COLOR[l.status] }}>{STATUS_LABEL[l.status] || l.status}</span>
                <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>· {LISTING_TYPES[l.type].label}</span>
              </div>
              <Link href={`/skelbimai/skelbimas/${l.id}`} style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', textDecoration: 'none' }}>{l.title}</Link>
              {price && <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--accent-green)' }}>{price}</div>}
              <div style={{ fontSize: 12, color: 'var(--text-faint)' }}>{l.save_count} įsiminta · {l.view_count} peržiūrų</div>
            </div>

            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <Link href={`/skelbimai/skelbimas/${l.id}`} style={{ ...smallBtn, textDecoration: 'none' }}>Peržiūrėti</Link>
              {l.status === 'active' && <button onClick={() => patch(l.id, { status: 'closed' })} style={smallBtn}>Pažymėti užbaigtu</button>}
              {l.status !== 'active' && <button onClick={() => patch(l.id, { status: 'active', extend: true })} style={smallBtn}>Aktyvuoti</button>}
              <button onClick={() => remove(l.id)} style={{ ...smallBtn, color: 'var(--accent-red)' }}>Ištrinti</button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
