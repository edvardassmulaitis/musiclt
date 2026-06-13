'use client'
// components/muzika/MuzikaTabs.tsx
//
// VIENA kompaktiška filtrų juosta (/koncertai stilius): chip'ai + popover'ai
// vienoje eilutėje su skirtukais. Šalis + Rikiavimas = TIKRI <Link> (SEO,
// path-segment puslapiai). Stilius/Šalis = popover navigacija į esamus
// landing'us. Tipas (Atlikėjai/Dainos/Albumai) = klientinis turinio
// perjungimas (artists/tracks/albums ateina kaip server-rendered ReactNode,
// lieka HTML'e, JS tik perjungia matomumą).

import { useState, useEffect, useRef, type ReactNode } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { HubScope } from '@/lib/muzika-hub'
import { hubHref, type HubMode } from './MuzikaFilterBar'

type TabKey = 'atlikejai' | 'dainos' | 'albumai'
type Opt = { label: string; href: string }

const Icon = {
  chevron: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>,
  note: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></svg>,
  globe: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M2 12h20M12 2a15 15 0 0 1 0 20 15 15 0 0 1 0-20" /></svg>,
}

/* Popover — kompaktiškas dropdown su outside-click (/koncertai patternas). */
function Popover({ id, openId, setOpenId, label, icon, on, width, children }: {
  id: string; openId: string | null; setOpenId: (v: string | null) => void
  label: string; icon?: ReactNode; on: boolean; width?: number; children: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  const open = openId === id
  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpenId(null) }
    function onEsc(e: KeyboardEvent) { if (e.key === 'Escape') setOpenId(null) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onEsc)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onEsc) }
  }, [open, setOpenId])
  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-flex' }}>
      <button type="button" onClick={() => setOpenId(open ? null : id)} className={`mz-chip${on ? ' on' : ''}`}>
        {icon}<span>{label}</span><span style={{ opacity: 0.7 }}>{Icon.chevron}</span>
      </button>
      {open && <div className="mz-pop" style={{ width: width ?? 'auto' }}>{children}</div>}
    </div>
  )
}

export default function MuzikaTabs({
  scope, mode, artists, tracks, albums, styleOptions, countryOptions,
}: {
  scope: HubScope
  mode: HubMode
  artists: ReactNode
  tracks: ReactNode
  albums: ReactNode
  styleOptions: Opt[]
  countryOptions: Opt[]
}) {
  const [tab, setTab] = useState<TabKey>('atlikejai')
  const [openId, setOpenId] = useState<string | null>(null)
  const router = useRouter()

  // Perjungiant šalį išlaikom rikiavimą (jei buvom konkrečioj šaly).
  const keepMode: HubMode = scope === 'all' ? 'both' : mode
  const scopes: { key: HubScope; label: string }[] = [
    { key: 'all', label: 'Visi' },
    { key: 'lt', label: '🇱🇹 Lietuviška' },
    { key: 'world', label: '🌍 Užsienio' },
  ]
  const modes: { key: HubMode; label: string }[] = [
    { key: 'both', label: 'Viskas' },
    { key: 'trending', label: 'Dabar' },
    { key: 'alltime', label: 'Visų laikų' },
  ]
  const tabs: { key: TabKey; label: string }[] = [
    { key: 'atlikejai', label: 'Atlikėjai' },
    { key: 'dainos', label: 'Dainos' },
    { key: 'albumai', label: 'Albumai' },
  ]

  return (
    <>
      <div className="mz-hubfbar">
        {/* Šalis — SEO Link chip'ai */}
        {scopes.map((s) => (
          <Link
            key={s.key}
            href={hubHref(s.key, s.key === 'all' ? 'both' : keepMode)}
            className={`mz-chip${scope === s.key ? ' on' : ''}`}
            prefetch={false}
          >
            {s.label}
          </Link>
        ))}

        {/* Rikiavimas — tik konkrečiai šaliai (path-segment) */}
        {scope !== 'all' && (
          <>
            <span className="mz-divider" />
            {modes.map((m) => (
              <Link
                key={m.key}
                href={hubHref(scope, m.key)}
                className={`mz-chip${mode === m.key ? ' on' : ''}`}
                prefetch={false}
              >
                {m.label}
              </Link>
            ))}
          </>
        )}

        <span className="mz-divider" />

        {/* Stilius — popover navigacija */}
        <Popover id="style" openId={openId} setOpenId={setOpenId} label="Stilius" icon={Icon.note} on={false} width={220}>
          <div className="mz-pop-list">
            {styleOptions.map((o) => (
              <button key={o.href} type="button" className="mz-opt" onClick={() => { setOpenId(null); router.push(o.href) }}>{o.label}</button>
            ))}
          </div>
        </Popover>

        {/* Šalis (konkreti) — popover navigacija */}
        {countryOptions.length > 0 && (
          <Popover id="country" openId={openId} setOpenId={setOpenId} label="Šalis" icon={Icon.globe} on={false} width={210}>
            <div className="mz-pop-list">
              {countryOptions.map((o) => (
                <button key={o.href} type="button" className="mz-opt" onClick={() => { setOpenId(null); router.push(o.href) }}>{o.label}</button>
              ))}
            </div>
          </Popover>
        )}

        {/* Tipas — turinio perjungimas (dešinėje) */}
        <span className="mz-hubfbar-spacer" />
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            className={`mz-chip${tab === t.key ? ' on' : ''}`}
            aria-pressed={tab === t.key}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div hidden={tab !== 'atlikejai'}>{artists}</div>
      <div hidden={tab !== 'dainos'}>{tracks}</div>
      <div hidden={tab !== 'albumai'}>{albums}</div>
    </>
  )
}
