'use client'

import Link from 'next/link'

type Stats = {
  artists: number
  albums: number
  tracks: number
  karma: number | null
  messages: number | null
  joinedLegacy: string | null
}

export default function WelcomeClient({
  name,
  username,
  avatarUrl,
  covers,
  stats,
  hasLegacy,
  isReturning,
  isAdmin,
}: {
  name: string
  username: string | null
  avatarUrl: string | null
  covers: string[]
  stats: Stats
  hasLegacy: boolean
  isReturning: boolean
  isAdmin: boolean
}) {
  const totalLikes = stats.artists + stats.albums + stats.tracks
  const joinedYear = stats.joinedLegacy ? new Date(stats.joinedLegacy).getFullYear() : null
  const firstLetter = (name[0] || '?').toUpperCase()

  const features = [
    {
      href: '/mano-muzika/pradzia',
      emoji: '🎧',
      title: 'Susidėk savo muziką',
      desc: 'Pažymėk mėgstamus atlikėjus ir kurk savo music.lt skonį.',
      cta: 'Pradėti',
      accent: '#f97316',
    },
    {
      href: '/dienos-daina',
      emoji: '🔥',
      title: 'Dienos daina',
      desc: 'Balsuok ir atrask, ką klauso visa bendruomenė šiandien.',
      cta: 'Žiūrėti',
      accent: '#1a73e8',
    },
    {
      href: '/bendruomene',
      emoji: '💬',
      title: 'Bendruomenė',
      desc: 'Diskusijos, naujienos, narių įrašai ir muzikos atradimai.',
      cta: 'Atrasti',
      accent: '#10b981',
    },
  ]
  if (isAdmin) {
    features.push({
      href: '/admin',
      emoji: '🛠️',
      title: 'Valdymo skydelis',
      desc: 'Turinio, narių ir reitingų valdymas — tavo admin įrankiai.',
      cta: 'Atidaryti',
      accent: '#a855f7',
    })
  }

  return (
    <div style={{ background: 'var(--bg-body)', color: 'var(--text-primary)', minHeight: '100vh', fontFamily: "'DM Sans',system-ui,sans-serif" }}>
      {/* ═══ HERO su koliažu ═══ */}
      <div style={{ position: 'relative', overflow: 'hidden', borderBottom: '1px solid var(--border-subtle)' }}>
        {/* Koliažo fonas */}
        {covers.length > 0 && (
          <div
            aria-hidden
            style={{
              position: 'absolute',
              inset: 0,
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))',
              gridAutoRows: '96px',
              opacity: 0.45,
              filter: 'saturate(1.05)',
            }}
          >
            {covers.map((c, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={i} src={c} alt="" loading="lazy" referrerPolicy="no-referrer" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
            ))}
          </div>
        )}
        {/* Tamsinantis gradientas skaitomumui */}
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            background:
              'radial-gradient(ellipse at 50% 35%, rgba(0,0,0,.35), rgba(0,0,0,.78) 75%), linear-gradient(180deg, transparent 40%, var(--bg-body) 98%)',
          }}
        />
        {/* Turinys */}
        <div style={{ position: 'relative', maxWidth: 880, margin: '0 auto', padding: '72px 24px 56px', textAlign: 'center' }}>
          <div
            style={{
              width: 88, height: 88, borderRadius: '50%', margin: '0 auto 18px',
              border: '3px solid rgba(255,255,255,.85)', boxShadow: '0 12px 40px rgba(0,0,0,.45)',
              background: 'linear-gradient(135deg,#1a73e8,#f97316)', display: 'flex', alignItems: 'center', justifyContent: 'center',
              overflow: 'hidden', flexShrink: 0,
            }}
          >
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarUrl} alt={name} referrerPolicy="no-referrer" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <span style={{ fontFamily: 'Outfit,sans-serif', fontSize: 36, fontWeight: 900, color: '#fff' }}>{firstLetter}</span>
            )}
          </div>

          <h1 style={{ fontFamily: 'Outfit,sans-serif', fontSize: 'clamp(28px,5vw,44px)', fontWeight: 900, letterSpacing: '-.03em', margin: '0 0 8px', color: '#fff', textShadow: '0 2px 24px rgba(0,0,0,.5)' }}>
            {isReturning ? 'Sveikas sugrįžęs,' : 'Sveikas atvykęs,'}<br />
            <span style={{ color: '#fbbf24' }}>{username ? `@${username}` : name}</span>
          </h1>
          <p style={{ fontSize: 16, color: 'rgba(255,255,255,.82)', maxWidth: 520, margin: '0 auto 24px', lineHeight: 1.55, textShadow: '0 1px 12px rgba(0,0,0,.5)' }}>
            {isReturning
              ? 'Tavo profilis sėkmingai susietas su naująja music.lt versija. Visa tavo istorija — vietoje.'
              : 'Sveikas prisijungęs prie didžiausios lietuviškos muzikos bendruomenės.'}
          </p>

          {/* Statistikos juostelė */}
          {(totalLikes > 0 || hasLegacy) && (
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
              {totalLikes > 0 && <StatPill value={totalLikes} label="patinka" />}
              {stats.artists > 0 && <StatPill value={stats.artists} label="atlikėjai" />}
              {stats.albums > 0 && <StatPill value={stats.albums} label="albumai" />}
              {stats.tracks > 0 && <StatPill value={stats.tracks} label="dainos" />}
              {joinedYear && <StatPill value={joinedYear} label="narys nuo" />}
              {stats.karma ? <StatPill value={stats.karma} label="taškų" /> : null}
            </div>
          )}
        </div>
      </div>

      {/* ═══ FUNKCIJOS ═══ */}
      <div style={{ maxWidth: 1040, margin: '0 auto', padding: '40px 24px 64px' }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <h2 style={{ fontFamily: 'Outfit,sans-serif', fontSize: 22, fontWeight: 800, margin: '0 0 6px', color: 'var(--text-primary)' }}>
            Nuo ko pradėti
          </h2>
          <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: 0 }}>Keli žingsniai, kad music.lt taptų tavo</p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 14 }}>
          {features.map((f) => (
            <Link
              key={f.href}
              href={f.href}
              style={{
                display: 'flex', flexDirection: 'column', gap: 8, padding: '20px 18px',
                borderRadius: 16, border: '1px solid var(--border-default)', background: 'var(--card-bg)',
                textDecoration: 'none', transition: 'transform .15s, border-color .15s',
              }}
            >
              <div style={{ fontSize: 30, lineHeight: 1 }}>{f.emoji}</div>
              <div style={{ fontFamily: 'Outfit,sans-serif', fontSize: 17, fontWeight: 800, color: 'var(--text-primary)' }}>{f.title}</div>
              <div style={{ fontSize: 13.5, color: 'var(--text-muted)', lineHeight: 1.5, flex: 1 }}>{f.desc}</div>
              <span style={{ marginTop: 4, fontFamily: 'Outfit,sans-serif', fontSize: 13, fontWeight: 700, color: f.accent }}>{f.cta} →</span>
            </Link>
          ))}
        </div>

        {/* Pagrindinis CTA */}
        <div style={{ textAlign: 'center', marginTop: 36 }}>
          <Link
            href="/"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8, padding: '14px 34px', borderRadius: 999,
              background: 'linear-gradient(135deg,#1a73e8,#f97316)', color: '#fff', fontFamily: 'Outfit,sans-serif',
              fontSize: 15, fontWeight: 800, textDecoration: 'none', boxShadow: '0 8px 28px rgba(249,115,22,.3)',
            }}
          >
            Eiti į svetainę →
          </Link>
        </div>
      </div>
    </div>
  )
}

function StatPill({ value, label }: { value: number; label: string }) {
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'baseline', gap: 6, padding: '7px 14px', borderRadius: 999,
        background: 'rgba(255,255,255,.12)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,.18)',
      }}
    >
      <strong style={{ fontFamily: 'Outfit,sans-serif', fontSize: 16, fontWeight: 900, color: '#fff' }}>
        {value.toLocaleString('lt-LT')}
      </strong>
      <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: 'rgba(255,255,255,.7)' }}>{label}</span>
    </span>
  )
}
