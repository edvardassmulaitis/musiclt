import { Metadata } from 'next'
import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase'
import { getCurrentWeekMonday } from '@/lib/top-week'

export const metadata: Metadata = {
  title: 'Muzikos topai — TOP 40, LT TOP 30 ir kiti | music.lt',
  description: 'Visi music.lt muzikos topai vienoje vietoje — pasaulinis TOP 40, lietuviškas LT TOP 30, lankytojų sukurti ir oficialūs reitingai.',
}

type Mini = {
  position: number
  title: string
  artistName: string
  artistSlug: string
  trackSlug: string | null
  coverUrl: string | null
  totalVotes: number
}

async function getMiniChart(topType: string, limit = 3): Promise<{ entries: Mini[]; week: any }> {
  const supabase = createAdminClient()

  // Anchor į dabartinę kalendorinę savaitę
  const thisMonday = getCurrentWeekMonday()
  const { data: week } = await supabase
    .from('top_weeks')
    .select('id, week_start, vote_close, is_finalized, total_votes')
    .eq('top_type', topType)
    .eq('week_start', thisMonday)
    .maybeSingle()

  if (!week) return { entries: [], week: null }

  const { data: rows } = await supabase
    .from('top_entries')
    .select(`
      position, total_votes,
      tracks:track_id (
        slug, title, cover_url,
        artists:artist_id ( slug, name )
      )
    `)
    .eq('week_id', week.id)
    .order(week.is_finalized ? 'position' : 'total_votes', { ascending: !!week.is_finalized })
    .limit(limit)

  const entries: Mini[] = (rows || []).map((r: any, i: number) => {
    const tr = Array.isArray(r.tracks) ? r.tracks[0] : r.tracks
    const ar = tr ? (Array.isArray(tr.artists) ? tr.artists[0] : tr.artists) : null
    return {
      position: r.position ?? (i + 1),
      title: tr?.title ?? '—',
      artistName: ar?.name ?? '—',
      artistSlug: ar?.slug ?? '',
      trackSlug: tr?.slug ?? null,
      coverUrl: tr?.cover_url ?? null,
      totalVotes: r.total_votes ?? 0,
    }
  })

  return { entries, week }
}

export default async function TopaiHubPage() {
  const [top40, top30] = await Promise.all([
    getMiniChart('top40', 5),
    getMiniChart('lt_top30', 5),
  ])

  return (
    <div className="topai-page">
      <style>{`
        .topai-page { max-width: 1180px; margin: 0 auto; padding: 36px 20px 80px; color: var(--text-primary); }

        .topai-hero {
          display: flex; align-items: center; gap: 18px; margin-bottom: 8px;
        }
        .topai-hero-icon {
          width: 56px; height: 56px; border-radius: 16px;
          background: linear-gradient(135deg, #f59e0b 0%, #ef4444 100%);
          color: #fff; display: flex; align-items: center; justify-content: center;
          box-shadow: 0 14px 36px rgba(239, 68, 68, 0.35), inset 0 1px 0 rgba(255,255,255,0.25);
          flex-shrink: 0;
        }
        .topai-title {
          margin: 0; font-size: clamp(32px, 5vw, 44px); font-weight: 900;
          letter-spacing: -0.025em; line-height: 1.05; color: var(--text-primary);
        }
        .topai-sub {
          margin: 8px 0 32px; color: var(--text-muted); font-size: 14px; max-width: 64ch;
        }

        /* Featured chart cards */
        .featured-grid {
          display: grid; grid-template-columns: 1fr 1fr; gap: 18px;
          margin-bottom: 40px;
        }
        @media (max-width: 820px) { .featured-grid { grid-template-columns: 1fr; } }

        .chart-card {
          --c: #ef4444;
          --c-soft: rgba(239, 68, 68, 0.10);
          position: relative;
          background: var(--bg-surface); border: 1px solid var(--border-subtle);
          border-radius: 18px; overflow: hidden;
          transition: transform 0.2s, box-shadow 0.2s, border-color 0.2s;
          text-decoration: none;
          display: flex; flex-direction: column;
        }
        .chart-card:hover { transform: translateY(-3px); box-shadow: 0 20px 40px rgba(0,0,0,0.08); border-color: var(--c); }

        .chart-card-head {
          padding: 22px 22px 16px;
          background: linear-gradient(135deg, var(--c-soft) 0%, transparent 80%);
          border-bottom: 1px solid var(--border-subtle);
          display: flex; align-items: flex-start; justify-content: space-between; gap: 12px;
        }
        .chart-card-meta { min-width: 0; }
        .chart-card-badge {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 3px 9px; border-radius: 999px;
          background: var(--c-soft); color: var(--c);
          font-size: 10px; font-weight: 800; letter-spacing: 0.06em; text-transform: uppercase;
          border: 1px solid var(--c-soft);
        }
        .chart-card-name { margin: 6px 0 4px; font-size: 26px; font-weight: 900; color: var(--text-primary); letter-spacing: -0.02em; }
        .chart-card-sub { margin: 0; font-size: 12px; color: var(--text-muted); }
        .chart-card-cta {
          padding: 8px 14px; border-radius: 10px;
          background: var(--c); color: #fff;
          font-size: 12px; font-weight: 700;
          flex-shrink: 0;
        }

        .chart-card-body { padding: 14px 16px 18px; flex: 1; }
        .chart-card-empty {
          padding: 24px 0; text-align: center; color: var(--text-muted); font-size: 13px;
        }
        .mini-row {
          display: flex; align-items: center; gap: 12px;
          padding: 8px 6px; border-radius: 10px;
        }
        .mini-row + .mini-row { margin-top: 2px; }
        .mini-row:hover { background: var(--bg-hover); }
        .mini-pos {
          width: 24px; flex-shrink: 0; font-weight: 900; font-size: 16px;
          color: var(--text-muted); text-align: center; font-variant-numeric: tabular-nums;
        }
        .mini-row.top1 .mini-pos { color: var(--c); font-size: 18px; }
        .mini-cover {
          width: 40px; height: 40px; border-radius: 8px; overflow: hidden;
          flex-shrink: 0; background: var(--bg-elevated);
          display: flex; align-items: center; justify-content: center;
          font-size: 14px; color: var(--text-muted);
        }
        .mini-cover img { width: 100%; height: 100%; object-fit: cover; }
        .mini-info { flex: 1; min-width: 0; }
        .mini-title { margin: 0; font-size: 13px; font-weight: 700; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .mini-artist { margin: 1px 0 0; font-size: 11px; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .mini-votes { font-size: 11px; font-weight: 700; color: var(--text-secondary); flex-shrink: 0; }

        .chart-card-footer {
          padding: 12px 16px; border-top: 1px solid var(--border-subtle);
          background: var(--bg-elevated);
          display: flex; align-items: center; justify-content: space-between;
          font-size: 12px; color: var(--text-muted);
        }
        .chart-card-footer strong { color: var(--text-secondary); font-weight: 700; }

        /* Section heading */
        .section-head {
          display: flex; align-items: baseline; justify-content: space-between;
          margin-bottom: 18px; flex-wrap: wrap; gap: 8px;
        }
        .section-title { margin: 0; font-size: 22px; font-weight: 900; color: var(--text-primary); letter-spacing: -0.02em; }
        .section-sub { margin: 4px 0 0; color: var(--text-muted); font-size: 13px; }

        /* Tile grid */
        .tile-grid {
          display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 14px;
        }
        .tile {
          --c: #6366f1;
          --c-soft: rgba(99, 102, 241, 0.10);
          position: relative;
          padding: 18px;
          background: var(--bg-surface); border: 1px solid var(--border-subtle);
          border-radius: 14px;
          text-decoration: none; color: inherit;
          transition: transform 0.2s, box-shadow 0.2s, border-color 0.2s;
          display: flex; flex-direction: column; gap: 10px; min-height: 130px;
        }
        .tile:hover { transform: translateY(-2px); box-shadow: 0 14px 32px rgba(0,0,0,0.06); border-color: var(--c); }
        .tile.soon { cursor: default; }
        .tile.soon:hover { transform: none; box-shadow: none; border-color: var(--border-subtle); opacity: 0.85; }
        .tile-icon {
          width: 36px; height: 36px; border-radius: 10px;
          background: var(--c-soft); color: var(--c);
          display: flex; align-items: center; justify-content: center;
        }
        .tile-name { margin: 0; font-size: 15px; font-weight: 800; color: var(--text-primary); letter-spacing: -0.01em; }
        .tile-desc { margin: 0; font-size: 12px; color: var(--text-muted); line-height: 1.45; flex: 1; }
        .tile-soon-pill {
          position: absolute; top: 14px; right: 14px;
          font-size: 9px; font-weight: 800; letter-spacing: 0.06em; text-transform: uppercase;
          padding: 3px 8px; border-radius: 999px;
          background: var(--bg-elevated); color: var(--text-muted);
          border: 1px solid var(--border-subtle);
        }
      `}</style>

      <div className="topai-hero">
        <div className="topai-hero-icon">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4Z" />
            <path d="M17 4h3v3a3 3 0 0 1-3 3M7 4H4v3a3 3 0 0 0 3 3" />
          </svg>
        </div>
        <h1 className="topai-title">Muzikos topai</h1>
      </div>
      <p className="topai-sub">
        Visi music.lt reitingai vienoje vietoje — savaitiniai TOP 40 ir LT TOP 30, lankytojų sukurti
        sąrašai bei oficialūs muzikos topai. Balsuok, kurk ir formuok lietuviškos muzikos istoriją.
      </p>

      {/* Featured charts */}
      <section>
        <div className="section-head">
          <div>
            <h2 className="section-title">Pagrindiniai topai</h2>
            <p className="section-sub">Atnaujinami kas savaitę pagal klausytojų balsus.</p>
          </div>
        </div>

        <div className="featured-grid">
          {/* TOP 40 */}
          <Link
            href="/top40"
            className="chart-card"
            style={{ ['--c' as any]: '#ef4444', ['--c-soft' as any]: 'rgba(239, 68, 68, 0.10)' }}
          >
            <div className="chart-card-head">
              <div className="chart-card-meta">
                <span className="chart-card-badge">Pasaulinis topas</span>
                <h3 className="chart-card-name">TOP 40</h3>
                <p className="chart-card-sub">Karščiausi pasaulio hitai šią savaitę</p>
              </div>
              <span className="chart-card-cta">Žiūrėti →</span>
            </div>
            <div className="chart-card-body">
              {top40.entries.length === 0 ? (
                <div className="chart-card-empty">Sąrašas formuojasi</div>
              ) : (
                top40.entries.map(e => (
                  <div key={e.position} className={`mini-row${e.position === 1 ? ' top1' : ''}`}>
                    <div className="mini-pos">{e.position}</div>
                    <div className="mini-cover">
                      {e.coverUrl ? <img src={e.coverUrl} alt="" /> : '♪'}
                    </div>
                    <div className="mini-info">
                      <p className="mini-title">{e.title}</p>
                      <p className="mini-artist">{e.artistName}</p>
                    </div>
                    {e.totalVotes > 0 && <span className="mini-votes">{e.totalVotes} ♥</span>}
                  </div>
                ))
              )}
            </div>
            <div className="chart-card-footer">
              <span>{top40.entries.length > 0 ? <><strong>{top40.entries.length}</strong> dainų top'e</> : 'Tuščia'}</span>
              <span>Iki sekmadienio →</span>
            </div>
          </Link>

          {/* LT TOP 30 */}
          <Link
            href="/top30"
            className="chart-card"
            style={{ ['--c' as any]: '#22c55e', ['--c-soft' as any]: 'rgba(34, 197, 94, 0.10)' }}
          >
            <div className="chart-card-head">
              <div className="chart-card-meta">
                <span className="chart-card-badge">Lietuvos topas</span>
                <h3 className="chart-card-name">LT TOP 30</h3>
                <p className="chart-card-sub">Populiariausi lietuviški kūriniai</p>
              </div>
              <span className="chart-card-cta">Žiūrėti →</span>
            </div>
            <div className="chart-card-body">
              {top30.entries.length === 0 ? (
                <div className="chart-card-empty">Sąrašas formuojasi</div>
              ) : (
                top30.entries.map(e => (
                  <div key={e.position} className={`mini-row${e.position === 1 ? ' top1' : ''}`}>
                    <div className="mini-pos">{e.position}</div>
                    <div className="mini-cover">
                      {e.coverUrl ? <img src={e.coverUrl} alt="" /> : '♪'}
                    </div>
                    <div className="mini-info">
                      <p className="mini-title">{e.title}</p>
                      <p className="mini-artist">{e.artistName}</p>
                    </div>
                    {e.totalVotes > 0 && <span className="mini-votes">{e.totalVotes} ♥</span>}
                  </div>
                ))
              )}
            </div>
            <div className="chart-card-footer">
              <span>{top30.entries.length > 0 ? <><strong>{top30.entries.length}</strong> dainų top'e</> : 'Tuščia'}</span>
              <span>Iki šeštadienio →</span>
            </div>
          </Link>
        </div>
      </section>

      {/* Daugiau topų */}
      <section style={{ marginTop: 16 }}>
        <div className="section-head">
          <div>
            <h2 className="section-title">Daugiau topų</h2>
            <p className="section-sub">Lankytojų sukurti, oficialūs ir specializuoti reitingai.</p>
          </div>
        </div>

        <div className="tile-grid">
          {/* User-created */}
          <div className="tile soon" style={{ ['--c' as any]: '#8b5cf6', ['--c-soft' as any]: 'rgba(139, 92, 246, 0.10)' }}>
            <span className="tile-soon-pill">Netrukus</span>
            <div className="tile-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" /><line x1="9" y1="13" x2="15" y2="13" /><line x1="9" y1="17" x2="15" y2="17" />
              </svg>
            </div>
            <h3 className="tile-name">Lankytojų topai</h3>
            <p className="tile-desc">Susikurk savo TOP 10, dalinkis su draugais, balsuok už kitų sąrašus.</p>
          </div>

          {/* Visų laikų */}
          <div className="tile soon" style={{ ['--c' as any]: '#f59e0b', ['--c-soft' as any]: 'rgba(245, 158, 11, 0.10)' }}>
            <span className="tile-soon-pill">Netrukus</span>
            <div className="tile-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
              </svg>
            </div>
            <h3 className="tile-name">Visų laikų topas</h3>
            <p className="tile-desc">Geriausios visų laikų lietuviškos dainos pagal community balsus.</p>
          </div>

          {/* Radio tops */}
          <div className="tile soon" style={{ ['--c' as any]: '#06b6d4', ['--c-soft' as any]: 'rgba(6, 182, 212, 0.10)' }}>
            <span className="tile-soon-pill">Netrukus</span>
            <div className="tile-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4.93 19.07a10 10 0 0 1 0-14.14M19.07 4.93a10 10 0 0 1 0 14.14" />
                <path d="M7.76 16.24a6 6 0 0 1 0-8.48M16.24 7.76a6 6 0 0 1 0 8.48" />
                <circle cx="12" cy="12" r="2" />
              </svg>
            </div>
            <h3 className="tile-name">Radijo stočių topai</h3>
            <p className="tile-desc">M-1, ZIP FM, Lietus ir kt. — kas dažniausiai skambėjo eteryje.</p>
          </div>

          {/* Žanrų topai */}
          <div className="tile soon" style={{ ['--c' as any]: '#ec4899' as any, ['--c-soft' as any]: 'rgba(236, 72, 153, 0.10)' }}>
            <span className="tile-soon-pill">Netrukus</span>
            <div className="tile-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 12 5 5l7 2 7-2 2 7-2 7-7-2-7 2Z" /><circle cx="12" cy="12" r="3" />
              </svg>
            </div>
            <h3 className="tile-name">Žanrų topai</h3>
            <p className="tile-desc">Geriausi rokas, hip-hop, electronic, folk ir popsas reitingai.</p>
          </div>

          {/* Apdovanojimai */}
          <Link href="/apdovanojimai" className="tile" style={{ ['--c' as any]: '#eab308', ['--c-soft' as any]: 'rgba(234, 179, 8, 0.10)' }}>
            <div className="tile-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="9" r="6" /><path d="M8.21 13.89 7 22l5-3 5 3-1.21-8.11" />
              </svg>
            </div>
            <h3 className="tile-name">Apdovanojimai</h3>
            <p className="tile-desc">M.A.M.A., Bravo ir kiti istoriniai laureatai bei nominacijos.</p>
          </Link>

          {/* Balsavimai */}
          <Link href="/balsavimai" className="tile" style={{ ['--c' as any]: '#3b82f6', ['--c-soft' as any]: 'rgba(59, 130, 246, 0.10)' }}>
            <div className="tile-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m9 12 2 2 4-4" /><rect x="3" y="4" width="18" height="16" rx="2" />
              </svg>
            </div>
            <h3 className="tile-name">Aktyvūs balsavimai</h3>
            <p className="tile-desc">Specialūs renginių, festivalių ir kategorijų reitingai.</p>
          </Link>
        </div>
      </section>
    </div>
  )
}
