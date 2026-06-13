'use client'

import { useMemo, useState, type CSSProperties } from 'react'
import {
  CONCERTS, DESTINATIONS, DEST_BY_KEY,
  flagEmoji, tripCostFrom, reachLabel, fmtDate,
  type Concert, type ReachMode,
} from '@/lib/verta-keliones-seed'

const ACCENT = '#10b981'

type ModeFilter = 'all' | ReachMode
type Sort = 'soon' | 'cheap' | 'popular'

const MONTHS = ['saus.', 'vas.', 'kovo', 'bal.', 'geg.', 'birž.', 'liep.', 'rugp.', 'rugs.', 'spal.', 'lapkr.', 'gruod.']

export default function RadarClient() {
  const [mode, setMode] = useState<ModeFilter>('all')
  const [dest, setDest] = useState<string>('all')
  const [month, setMonth] = useState<number | 'all'>('all')
  const [sort, setSort] = useState<Sort>('soon')

  const monthsPresent = useMemo(() => {
    const s = new Set<number>()
    CONCERTS.forEach(c => s.add(new Date(c.date).getMonth()))
    return Array.from(s).sort((a, b) => a - b)
  }, [])

  const list = useMemo(() => {
    let r = CONCERTS.filter(c => {
      const d = DEST_BY_KEY[c.destKey]
      if (!d) return false
      if (mode !== 'all' && d.reach !== mode) return false
      if (dest !== 'all' && c.destKey !== dest) return false
      if (month !== 'all' && new Date(c.date).getMonth() !== month) return false
      return true
    })
    r = r.slice().sort((a, b) => {
      if (sort === 'cheap') return tripCostFrom(a) - tripCostFrom(b)
      if (sort === 'popular') return b.popularity - a.popularity
      return +new Date(a.date) - +new Date(b.date)
    })
    return r
  }, [mode, dest, month, sort])

  return (
    <div className="page-shell">
      {/* Header */}
      <div className="page-head" style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
        <div style={{
          flexShrink: 0, width: 46, height: 46, borderRadius: 13, marginTop: 2,
          background: ACCENT, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: `0 10px 26px ${ACCENT}44`,
        }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/>
          </svg>
        </div>
        <div>
          <h1>Verta kelionės</h1>
          <p>Top atlikėjų ir festivalių koncertai užsienyje, kuriuos pasieksi pigiu skrydžiu arba mašina iš Lietuvos. Kiekvienam — apytikslė visos kelionės kaina.</p>
          <span style={{
            display: 'inline-block', marginTop: 8, fontSize: 11, fontWeight: 700,
            color: 'var(--text-muted)', border: '1px solid var(--border-default)',
            padding: '3px 9px', borderRadius: 999,
          }}>
            Demonstraciniai duomenys · pipeline ruošiamas
          </span>
        </div>
      </div>

      {/* Kryptys juosta */}
      <div style={{ marginBottom: 22 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
          Pasiekiamos kryptys
        </div>
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
          {DESTINATIONS.map(d => {
            const active = dest === d.key
            return (
              <button
                key={d.key}
                onClick={() => setDest(active ? 'all' : d.key)}
                style={{
                  flexShrink: 0, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 7,
                  padding: '8px 13px', borderRadius: 11, fontSize: 13,
                  background: active ? `${ACCENT}1f` : 'var(--bg-surface)',
                  border: `1px solid ${active ? ACCENT : 'var(--border-default)'}`,
                  color: active ? ACCENT : 'var(--text-primary)', fontWeight: 600,
                }}
              >
                <span style={{ fontSize: 15 }}>{d.reach === 'flight' ? '✈' : '🚗'}</span>
                <span>{flagEmoji(d.countryCode)} {d.city}</span>
                <span style={{ color: 'var(--text-muted)', fontWeight: 500, fontSize: 12 }}>
                  {d.reach === 'flight' ? `nuo €${d.priceFrom}` : `${d.driveHours} val`}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Filtrai */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center', marginBottom: 22, paddingBottom: 18, borderBottom: '1px solid var(--border-subtle)' }}>
        <Seg label="Būdas" value={mode} onChange={v => setMode(v as ModeFilter)} options={[
          { v: 'all', l: 'Visi' }, { v: 'flight', l: '✈ Skrydžiu' }, { v: 'car', l: '🚗 Mašina' },
        ]} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span style={fLabel}>Mėnuo</span>
          <select value={String(month)} onChange={e => setMonth(e.target.value === 'all' ? 'all' : Number(e.target.value))} style={selectStyle}>
            <option value="all">Visi</option>
            {monthsPresent.map(m => <option key={m} value={m}>{MONTHS[m]}</option>)}
          </select>
        </div>
        <Seg label="Rikiuoti" value={sort} onChange={v => setSort(v as Sort)} options={[
          { v: 'soon', l: 'Artimiausi' }, { v: 'cheap', l: 'Pigiausia' }, { v: 'popular', l: 'Populiariausi' },
        ]} />
        <span style={{ marginLeft: 'auto', fontSize: 13, color: 'var(--text-muted)' }}>{list.length} koncert.</span>
      </div>

      {/* Kortelės */}
      {list.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
          Šioje kryptyje ar laikotarpiu kol kas nieko. Pakeisk filtrus.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
          {list.map(c => <Card key={c.id} c={c} />)}
        </div>
      )}
    </div>
  )
}

function Card({ c }: { c: Concert }) {
  const d = DEST_BY_KEY[c.destKey]
  const cost = tripCostFrom(c)
  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      background: 'var(--bg-surface)', border: '1px solid var(--border-default)',
      borderRadius: 16, padding: 16, position: 'relative', overflow: 'hidden',
    }}>
      {/* viršus: žyma + populiarumas */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <span style={{
          fontSize: 11, fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase',
          padding: '4px 9px', borderRadius: 7,
          background: d?.reach === 'flight' ? `${ACCENT}1f` : 'rgba(245,158,11,0.16)',
          color: d?.reach === 'flight' ? ACCENT : '#f59e0b',
        }}>
          {d?.reach === 'flight' ? '✈ Skrydžiu' : '🚗 Mašina'}
        </span>
        {c.isFestival && (
          <span style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', padding: '4px 9px', borderRadius: 7, background: 'rgba(99,102,241,0.16)', color: '#818cf8' }}>
            Festivalis
          </span>
        )}
        <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: ACCENT, display: 'inline-block' }} />
          {c.popularity}
        </span>
      </div>

      {/* atlikėjas */}
      <div style={{ fontSize: 19, fontWeight: 900, letterSpacing: '-0.02em', color: 'var(--text-primary)', lineHeight: 1.15, marginBottom: 6 }}>
        {c.artist}
      </div>

      {/* vieta + data */}
      <div style={{ fontSize: 13.5, color: 'var(--text-secondary)', marginBottom: 2 }}>
        {flagEmoji(d?.countryCode || '')} {d?.city}, {d?.country} · {c.venue}
      </div>
      <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12 }}>
        {fmtDate(c.date, c.endDate)}
        {c.verified && <span title="Data patvirtinta" style={{ color: ACCENT, marginLeft: 6 }}>✓</span>}
      </div>

      {/* kodėl verta */}
      <div style={{ fontSize: 12.5, lineHeight: 1.45, color: 'var(--text-muted)', marginBottom: 14, flex: 1 }}>
        {c.why}
      </div>

      {/* pasiekiamumas + kaina */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14, padding: '11px 12px', background: 'var(--bg-elevated)', borderRadius: 11 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{reachLabel(c)}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Visa kelionė nuo</span>
          <span style={{ fontSize: 20, fontWeight: 900, color: ACCENT }}>€{cost}</span>
        </div>
        <div style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>
          {d?.reach === 'flight' ? 'skrydis (ten-atgal) + bilietas + 1 naktis' : 'kelionė + bilietas + nakvynė'}
        </div>
      </div>

      {/* CTA */}
      <div style={{ display: 'flex', gap: 8 }}>
        <a href={c.ticketUrl || '#'} target="_blank" rel="noopener noreferrer"
          style={{ flex: 1, textAlign: 'center', padding: '10px 12px', borderRadius: 10, background: ACCENT, color: '#fff', fontSize: 13, fontWeight: 800, textDecoration: 'none' }}>
          Bilietai
        </a>
        <a href={`https://www.google.com/flights`} target="_blank" rel="noopener noreferrer"
          style={{ padding: '10px 14px', borderRadius: 10, background: 'transparent', border: '1px solid var(--border-default)', color: 'var(--text-secondary)', fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>
          Kaip nuvykti
        </a>
      </div>
    </div>
  )
}

/* ── maži UI helperiai ─────────────────────────────────────────────── */
function Seg({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void; options: { v: string; l: string }[]
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
      <span style={fLabel}>{label}</span>
      <div style={{ display: 'flex', gap: 4, background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 10, padding: 3 }}>
        {options.map(o => {
          const active = value === o.v
          return (
            <button key={o.v} onClick={() => onChange(o.v)} style={{
              cursor: 'pointer', padding: '6px 11px', borderRadius: 7, fontSize: 12.5, fontWeight: 700, border: 'none',
              background: active ? ACCENT : 'transparent', color: active ? '#fff' : 'var(--text-secondary)',
            }}>
              {o.l}
            </button>
          )
        })}
      </div>
    </div>
  )
}

const fLabel: CSSProperties = { fontSize: 12, fontWeight: 700, color: 'var(--text-muted)' }
const selectStyle: CSSProperties = {
  padding: '8px 11px', borderRadius: 10, fontSize: 12.5, fontWeight: 600,
  background: 'var(--bg-surface)', border: '1px solid var(--border-default)', color: 'var(--text-primary)',
}
