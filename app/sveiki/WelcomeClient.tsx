'use client'

import Link from 'next/link'

type LikedArtist = { name: string; slug: string; cover: string | null }

// ── Inline ikonos (stroke, currentColor) ─────────────────────────────
const Ic = {
  stream: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M4 11a9 9 0 0 1 9 9" /><path d="M4 4a16 16 0 0 1 16 16" /><circle cx="5" cy="19" r="1.5" fill="currentColor" stroke="none" /></svg>,
  compass: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><polygon points="16.2 7.8 14 14 7.8 16.2 10 10" fill="currentColor" stroke="none" /></svg>,
  radar: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M19.07 4.93A10 10 0 1 0 21 12" /><path d="M12 12 19 5" /><circle cx="12" cy="12" r="4" /></svg>,
  users: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>,
  music: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></svg>,
  trophy: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" /><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" /><path d="M4 22h16" /><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" /><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" /><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" /></svg>,
  news: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2Zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2" /><path d="M18 14h-8M15 18h-5M10 6h8v4h-8V6Z" /></svg>,
  calendar: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>,
  admin: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6" /></svg>,
  arrow: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: '-2px' }}><path d="M5 12h14M13 6l6 6-6 6" /></svg>,
  sparkle: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6.3 6.3l2.4 2.4M15.3 15.3l2.4 2.4M17.7 6.3l-2.4 2.4M8.7 15.3l-2.4 2.4" /></svg>,
}

export default function WelcomeClient({
  name,
  username,
  avatarUrl,
  covers,
  likedArtists,
  hasMusic,
  isReturning,
  isAdmin,
}: {
  name: string | null
  username: string | null
  avatarUrl: string | null
  covers: string[]
  likedArtists: LikedArtist[]
  hasMusic: boolean
  isReturning: boolean
  isAdmin: boolean
}) {
  // Neutralus kreipinys (be lyties): rodom @username arba tikrą vardą; jei nieko —
  // tik pasveikinimą be vardo. Jokio „bičiuli" ar „sugrįžęs/atvykęs" (vyriška giminė).
  const displayName = username ? `@${username}` : (name || null)
  const firstLetter = ((username || name || '?')[0] || '?').toUpperCase()

  const features = [
    { href: '/srautas', icon: Ic.stream, title: 'Mėgstamos muzikos srautas', desc: 'Kas naujo pas tavo atlikėjus' },
    { href: '/muzikos-atradimai', icon: Ic.compass, title: 'Muzikos atradimai', desc: 'Ką dar verta išgirsti' },
    { href: '/nauji-atlikejai', icon: Ic.radar, title: 'Naujos muzikos radaras', desc: 'Kylantys nauji atlikėjai' },
  ]

  const sections = [
    { href: '/bendruomene', icon: Ic.users, label: 'Bendruomenė' },
    { href: '/muzika', icon: Ic.music, label: 'Muzika' },
    { href: '/topai', icon: Ic.trophy, label: 'Topai' },
    { href: '/naujienos', icon: Ic.news, label: 'Naujienos' },
    { href: '/koncertai', icon: Ic.calendar, label: 'Koncertai' },
  ]
  if (isAdmin) sections.push({ href: '/admin', icon: Ic.admin, label: 'Valdymas' })

  return (
    <div style={{ background: 'var(--bg-body)', color: 'var(--text-primary)', minHeight: '100vh', fontFamily: "'DM Sans',system-ui,sans-serif" }}>
      {/* ═══ HERO ═══ */}
      <div style={{ position: 'relative', overflow: 'hidden', borderBottom: '1px solid var(--border-subtle)' }}>
        {covers.length > 0 && (
          <div aria-hidden style={{ position: 'absolute', inset: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(104px, 1fr))', gridAutoRows: '104px', opacity: 0.7 }}>
            {covers.map((c, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={i} src={c} alt="" loading="lazy" referrerPolicy="no-referrer" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
            ))}
          </div>
        )}
        <div aria-hidden style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at 50% 30%, rgba(8,11,18,.28), rgba(8,11,18,.72) 78%), linear-gradient(180deg, transparent 45%, var(--bg-body) 99%)' }} />
        <div style={{ position: 'relative', maxWidth: 920, margin: '0 auto', padding: '64px 24px 52px', textAlign: 'center' }}>
          <div style={{ width: 84, height: 84, borderRadius: '50%', margin: '0 auto 16px', border: '3px solid rgba(255,255,255,.9)', boxShadow: '0 10px 36px rgba(0,0,0,.4)', background: 'linear-gradient(135deg,#1a73e8,#f97316)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarUrl ?? undefined} alt={name ?? ''} referrerPolicy="no-referrer" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <span style={{ fontFamily: 'Outfit,sans-serif', fontSize: 34, fontWeight: 900, color: '#fff' }}>{firstLetter}</span>
            )}
          </div>
          <h1 style={{ fontFamily: 'Outfit,sans-serif', fontSize: 'clamp(26px,4.6vw,40px)', fontWeight: 900, letterSpacing: '-.03em', margin: '0 0 10px', color: '#fff', textShadow: '0 2px 26px rgba(0,0,0,.55)' }}>
            {isReturning ? 'Sveiki sugrįžę' : 'Sveiki atvykę'}{displayName ? ', ' : '!'}
            {displayName && <span style={{ color: '#fbbf24' }}>{displayName}</span>}
          </h1>
          <p style={{ fontSize: 16, color: 'rgba(255,255,255,.86)', maxWidth: 460, margin: '0 auto', lineHeight: 1.55, textShadow: '0 1px 14px rgba(0,0,0,.55)' }}>
            {isReturning
              ? 'Tavo profilis susietas su naująja music.lt — visa istorija vietoje.'
              : 'Smagu, kad prisijungei prie didžiausios lietuviškos muzikos bendruomenės.'}
          </p>
        </div>
      </div>

      <div style={{ maxWidth: 920, margin: '0 auto', padding: '32px 24px 64px' }}>
        {/* ═══ MĖGSTAMI ATLIKĖJAI / NAUJO NARIO CTA ═══ */}
        {likedArtists.length > 0 ? (
          <section style={{ marginBottom: 36 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 16 }}>
              <h2 style={{ fontFamily: 'Outfit,sans-serif', fontSize: 18, fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>Tavo mėgstami atlikėjai</h2>
              <Link href="/mano-muzika" style={{ fontSize: 13, fontWeight: 700, color: '#f97316', textDecoration: 'none' }}>Visa mano muzika {Ic.arrow}</Link>
            </div>
            <div style={{ display: 'flex', gap: 18, overflowX: 'auto', paddingBottom: 4 }}>
              {likedArtists.map((a) => (
                <Link key={a.slug} href={`/atlikejai/${a.slug}`} style={{ textAlign: 'center', width: 76, flexShrink: 0, textDecoration: 'none' }}>
                  <div style={{ width: 72, height: 72, borderRadius: '50%', margin: '0 auto 8px', overflow: 'hidden', border: '1px solid var(--border-default)', background: 'var(--cover-placeholder)' }}>
                    {a.cover && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={a.cover} alt={a.name} loading="lazy" referrerPolicy="no-referrer" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    )}
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.name}</div>
                </Link>
              ))}
            </div>
          </section>
        ) : (
          <section style={{ marginBottom: 36 }}>
            <Link href="/mano-muzika/pradzia" style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '20px 22px', borderRadius: 16, border: '1px solid rgba(249,115,22,.3)', background: 'var(--card-bg)', textDecoration: 'none' }}>
              <div style={{ flexShrink: 0, color: '#f97316' }}>{Ic.sparkle}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: 'Outfit,sans-serif', fontSize: 16, fontWeight: 800, color: 'var(--text-primary)' }}>Susidėk savo muziką</div>
                <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>Per minutę pasirink mėgstamus atlikėjus — ir profilis atgis.</div>
              </div>
              <span style={{ color: '#f97316', fontWeight: 800 }}>{Ic.arrow}</span>
            </Link>
          </section>
        )}

        {/* ═══ NAUJI FEATURE'AI ═══ */}
        <section style={{ marginBottom: 36 }}>
          <h2 style={{ fontFamily: 'Outfit,sans-serif', fontSize: 18, fontWeight: 800, margin: '0 0 16px', color: 'var(--text-primary)' }}>Nauja music.lt — tau pritaikyta</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
            {features.map((f) => (
              <Link key={f.href} href={f.href} style={{ display: 'flex', flexDirection: 'column', gap: 9, padding: '20px 18px', borderRadius: 16, border: '1px solid rgba(249,115,22,.28)', background: 'var(--card-bg)', textDecoration: 'none' }}>
                <div style={{ color: '#f97316' }}>{f.icon}</div>
                <div style={{ fontFamily: 'Outfit,sans-serif', fontSize: 16, fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.25 }}>{f.title}</div>
                <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.45 }}>{f.desc}</div>
              </Link>
            ))}
          </div>
        </section>

        {/* ═══ PAGRINDINĖS DALYS ═══ */}
        <section>
          <h2 style={{ fontFamily: 'Outfit,sans-serif', fontSize: 18, fontWeight: 800, margin: '0 0 16px', color: 'var(--text-primary)' }}>Atrask music.lt</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10 }}>
            {sections.map((s) => (
              <Link key={s.href} href={s.href} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '16px 10px', borderRadius: 12, border: '1px solid var(--border-default)', background: 'var(--card-bg)', textDecoration: 'none' }}>
                <div style={{ color: 'var(--text-secondary)' }}>{s.icon}</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{s.label}</div>
              </Link>
            ))}
          </div>
        </section>

        {/* ═══ CTA ═══ */}
        <div style={{ textAlign: 'center', marginTop: 40 }}>
          <Link href="/" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '14px 36px', borderRadius: 999, background: '#f97316', color: '#fff', fontFamily: 'Outfit,sans-serif', fontSize: 15, fontWeight: 800, textDecoration: 'none', boxShadow: '0 8px 26px rgba(249,115,22,.3)' }}>
            Eiti į svetainę {Ic.arrow}
          </Link>
        </div>
      </div>
    </div>
  )
}
