'use client'

/**
 * Public artist page — Awards section.
 *
 * Group entries by channel, show top channels by count.
 * Each row: year + category + work + result badge + completeness indicator.
 *
 * `participants_in_event === 1` means the ceremony was imported from this
 * artist's own awards article — co-nominees not yet imported. Show ⚠.
 */

import { useState } from 'react'
import Link from 'next/link'

export type AwardRow = {
  id: number
  result: string
  work: string | null
  album_id: number | null
  track_id: number | null
  event_id: number
  event_name: string
  event_slug: string
  edition_id?: number
  edition_year?: number | null
  channel_id?: number
  channel_name: string
  channel_slug: string
  participants_in_event: number
}

// Theme-aware result meta — naudojam rgba CSS spalvas su accent variations
// vietoj hard-code'intų hex'ų. Anksčiau #dcfce7/#166534 atrodė broken ant
// dark theme (low contrast bright pastel ant dark bg).
const RESULT_META: Record<string, { label: string; bg: string; fg: string }> = {
  won:        { label: 'Laimėjo',     bg: 'rgba(34,197,94,0.18)',  fg: '#4ade80' },  // green-400
  nominated:  { label: 'Nominuotas',  bg: 'rgba(59,130,246,0.18)', fg: '#60a5fa' },  // blue-400
  inducted:   { label: 'Įtrauktas',   bg: 'rgba(168,85,247,0.18)', fg: '#c084fc' },  // purple-400
  other:      { label: '?',           bg: 'var(--card-bg)',         fg: 'var(--text-muted)' },
}

export default function ArtistAwards({ awards }: { awards: AwardRow[] }) {
  const [expandedChannels, setExpandedChannels] = useState<Set<string>>(new Set())

  if (!awards || awards.length === 0) return null

  // Aggregate by channel
  const byChannel: Record<string, AwardRow[]> = {}
  for (const a of awards) (byChannel[a.channel_slug] ||= []).push(a)
  const channelKeys = Object.keys(byChannel).sort((a, b) => byChannel[b].length - byChannel[a].length)

  const totals = {
    wins: awards.filter(a => a.result === 'won').length,
    noms: awards.filter(a => a.result === 'nominated').length,
    inducted: awards.filter(a => a.result === 'inducted').length,
    channels: channelKeys.length,
  }

  const toggle = (slug: string) => {
    const s = new Set(expandedChannels)
    if (s.has(slug)) s.delete(slug); else s.add(slug)
    setExpandedChannels(s)
  }

  return (
    <section>
      <div className="flex items-baseline justify-between mb-4 gap-3 flex-wrap">
        {/* Match SectionTitle styling iš artist page'o (sizing + tracking). */}
        <h2 className="font-['Outfit',sans-serif] text-[22px] font-black tracking-[-0.01em] text-[var(--text-primary)] sm:text-[26px] lg:text-[28px]">
          Apdovanojimai
        </h2>
        <div className="text-xs text-[var(--text-muted)] flex gap-2 items-center">
          {totals.wins > 0 && <span className="text-[#4ade80] font-bold">{totals.wins} laimėjo</span>}
          {totals.noms > 0 && <span className="text-[#60a5fa] font-bold">{totals.noms} nominacij{totals.noms === 1 ? 'a' : 'os'}</span>}
          {totals.inducted > 0 && <span className="text-[#c084fc] font-bold">{totals.inducted} įtrauktas</span>}
          <span className="text-[var(--text-faint)]">· {totals.channels} kanalai</span>
        </div>
      </div>

      <div className="space-y-2">
        {channelKeys.map(slug => {
          const items = byChannel[slug]
          const channelName = items[0].channel_name
          const wins = items.filter(a => a.result === 'won').length
          const noms = items.filter(a => a.result === 'nominated').length
          const isExpanded = expandedChannels.has(slug)

          return (
            <div key={slug} className="border border-[var(--border-default)] rounded-xl overflow-hidden bg-[var(--card-bg)]">
              <button
                onClick={() => toggle(slug)}
                className="w-full px-4 py-3 flex items-center justify-between hover:bg-[var(--bg-hover)] transition-colors text-left"
              >
                <div className="flex items-center gap-3 min-w-0">
                  {/* Trophy SVG (monochrome, matches site icon language). */}
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-[var(--accent-orange)]" aria-hidden>
                    <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
                    <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
                    <path d="M4 22h16" />
                    <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
                    <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
                    <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
                  </svg>
                  <div className="min-w-0">
                    <div className="font-bold text-sm text-[var(--text-primary)] truncate">{channelName}</div>
                    <div className="text-xs text-[var(--text-faint)] mt-0.5">
                      {items.length} {items.length === 1 ? 'įrašas' : 'įrašai'}
                      {wins > 0 && <> · <span className="text-[#4ade80]">{wins} laimėjo</span></>}
                      {noms > 0 && <> · <span className="text-[#60a5fa]">{noms} nominacij{noms === 1 ? 'a' : 'os'}</span></>}
                    </div>
                  </div>
                </div>
                <svg
                  className={`w-4 h-4 text-[var(--text-faint)] shrink-0 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                  viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>

              {isExpanded && (
                <div className="border-t border-[var(--border-subtle)] divide-y divide-[var(--border-subtle)]">
                  {[...items].sort((a, b) => (b.edition_year || 0) - (a.edition_year || 0)).map(item => {
                    const meta = RESULT_META[item.result] || RESULT_META.other
                    const partial = item.participants_in_event === 1
                    return (
                      <div key={item.id} className="px-4 py-2 flex items-center gap-3 text-xs">
                        <span className="text-[var(--text-secondary)] tabular-nums w-12 shrink-0">{item.edition_year || '?'}</span>
                        <span className="flex-1 text-[var(--text-primary)] truncate">{item.event_name}</span>
                        {item.work && (
                          <span className="text-[var(--text-faint)] italic truncate max-w-[160px] hidden sm:block">{item.work}</span>
                        )}
                        <span
                          className="text-[12px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded shrink-0 inline-flex items-center font-['Outfit',sans-serif]"
                          style={{ background: meta.bg, color: meta.fg }}
                        >
                          {meta.label}
                        </span>
                        {partial && (
                          <span title="Ceremonija pilnai neaprašyta — tik šis atlikėjas importuotas. Co-nominees gali būti pridėti vėliau."
                            className="text-[#f59e0b] shrink-0 inline-flex items-center" aria-label="Ceremonija pilnai neaprašyta">
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                              <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
                              <line x1="12" y1="9" x2="12" y2="13" />
                              <line x1="12" y1="17" x2="12.01" y2="17" />
                            </svg>
                          </span>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}
