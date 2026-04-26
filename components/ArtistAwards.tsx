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

const RESULT_META: Record<string, { label: string; bg: string; fg: string; icon: string }> = {
  won:        { label: 'Laimėjo',     bg: '#dcfce7', fg: '#166534', icon: '🏆' },
  nominated:  { label: 'Nominuotas',  bg: '#dbeafe', fg: '#1e40af', icon: '🎯' },
  inducted:   { label: 'Įtrauktas',   bg: '#f3e8ff', fg: '#6b21a8', icon: '⭐' },
  other:      { label: '?',           bg: '#f1f5f9', fg: '#64748b', icon: '·' },
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
    <section className="mt-8">
      <div className="flex items-baseline justify-between mb-3 gap-3 flex-wrap">
        <h2 className="font-['Outfit',sans-serif] text-[18px] font-black tracking-[-0.01em] text-[var(--text-primary)] sm:text-[20px]">
          Apdovanojimai
        </h2>
        <div className="text-xs text-[var(--text-muted)] flex gap-2 items-center">
          {totals.wins > 0 && <span className="text-green-700 font-bold">{totals.wins} laimėjo</span>}
          {totals.noms > 0 && <span className="text-blue-700 font-bold">{totals.noms} nominacij{totals.noms === 1 ? 'a' : 'os'}</span>}
          {totals.inducted > 0 && <span className="text-purple-700 font-bold">{totals.inducted} įtrauktas</span>}
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
                  <span className="text-base">🏆</span>
                  <div className="min-w-0">
                    <div className="font-bold text-sm text-[var(--text-primary)] truncate">{channelName}</div>
                    <div className="text-xs text-[var(--text-faint)] mt-0.5">
                      {items.length} {items.length === 1 ? 'įrašas' : 'įrašai'}
                      {wins > 0 && <> · <span className="text-green-700">{wins} laimėjo</span></>}
                      {noms > 0 && <> · <span className="text-blue-700">{noms} nominacij{noms === 1 ? 'a' : 'os'}</span></>}
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
                          className="text-[10px] font-bold px-2 py-0.5 rounded shrink-0 inline-flex items-center gap-1"
                          style={{ background: meta.bg, color: meta.fg }}
                        >
                          <span className="text-[10px]">{meta.icon}</span>{meta.label}
                        </span>
                        {partial && (
                          <span title="Ceremonija pilnai neaprašyta — tik šis atlikėjas importuotas. Co-nominees gali būti pridėti vėliau."
                            className="text-amber-600 text-[10px] font-bold shrink-0">⚠</span>
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
