'use client'
// components/LegacyLikesPanel.tsx
// Reusable legacy community panel — rodoma ant /atlikejai/[slug], /lt/albumas/...,
// /lt/daina/... puslapių. Atvaizduoja kiek music.lt archyvo vartotojų patiko
// šį entity, plius avatarų grid'as su nuorodomis į /vartotojas/ghost/[username].
//
// Dizainas derinasi su bendra projekto paletė (CSS variables, Outfit headers,
// DM Sans body). Akcent'ai — amber (#fbbf24) „archyvo" reikšmei, kad išsiskirtų
// nuo produkto pagrindinio orange (#f97316) be konfliktų.

import Link from 'next/link'
import { proxyImg } from '@/lib/img-proxy'

export type LegacyLikeUser = {
  user_username: string
  user_rank?: string | null
  user_avatar_url?: string | null
}

type Props = {
  count: number
  users: LegacyLikeUser[]
  /** Teksto variantas po skaičiumi, pvz. "patiko šį albumą" */
  entityLabel?: string
  /** Maks. kiek vartotojų kortelių atvaizduoti (default 30) */
  maxUsers?: number
  /** Pavadinimas virš Card'o (jei perduotas, rendering'ame vidinį mini-header'į) */
  title?: string
}

const AMBER = '#fbbf24'
const AMBER_BG = 'rgba(251,191,36,.08)'
const AMBER_BG_SOFT = 'rgba(251,191,36,.04)'
const AMBER_BORDER = 'rgba(251,191,36,.22)'

export default function LegacyLikesPanel({
  count,
  users,
  entityLabel = 'vartotojų patiko music.lt archyve',
  maxUsers = 30,
  title,
}: Props) {
  if (!count || count <= 0) return null

  const shown = users.slice(0, maxUsers)
  const remaining = Math.max(0, count - shown.length)

  return (
    <div
      style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-default)',
        borderRadius: 12,
        overflow: 'hidden',
      }}
    >
      {title && (
        <div
          style={{
            padding: '10px 16px',
            borderBottom: '1px solid var(--border-subtle)',
            fontFamily: 'Outfit,sans-serif',
            fontSize: 10,
            fontWeight: 800,
            textTransform: 'uppercase',
            letterSpacing: '.12em',
            color: 'var(--text-primary)',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <ArchiveIcon size={12} color={AMBER} />
          {title}
        </div>
      )}

      {/* Count row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '14px 18px',
          borderBottom: shown.length > 0 ? '1px solid var(--border-subtle)' : 'none',
          background: `linear-gradient(90deg, ${AMBER_BG_SOFT}, transparent 70%)`,
        }}
      >
        <HeartIcon size={18} color={AMBER} />
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flex: 1, minWidth: 0, flexWrap: 'wrap' }}>
          <span
            style={{
              fontFamily: 'Outfit,sans-serif',
              fontSize: 22,
              fontWeight: 900,
              color: 'var(--text-primary)',
              lineHeight: 1,
              letterSpacing: '-.02em',
            }}
          >
            {count.toLocaleString('lt-LT')}
          </span>
          <span
            style={{
              fontSize: 12,
              color: 'var(--text-secondary)',
              fontWeight: 600,
              lineHeight: 1.3,
            }}
          >
            {entityLabel}
          </span>
        </div>
        <LegacyBadge />
      </div>

      {/* User grid */}
      {shown.length > 0 && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(128px, 1fr))',
            gap: 4,
            padding: 8,
          }}
        >
          {shown.map((u) => (
            <LegacyUserTile key={u.user_username} user={u} />
          ))}
        </div>
      )}

      {remaining > 0 && (
        <div
          style={{
            padding: '10px 18px',
            borderTop: '1px solid var(--border-subtle)',
            fontSize: 11,
            color: 'var(--text-muted)',
            textAlign: 'center',
            fontStyle: 'italic',
            background: AMBER_BG_SOFT,
          }}
        >
          …ir dar {remaining.toLocaleString('lt-LT')} {remaining === 1 ? 'vartotojas' : 'vartotojai'}
        </div>
      )}
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────
// Subcomponents
// ──────────────────────────────────────────────────────────────────

function LegacyUserTile({ user }: { user: LegacyLikeUser }) {
  return (
    <Link
      href={`/vartotojas/ghost/${encodeURIComponent(user.user_username)}`}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '7px 9px',
        borderRadius: 8,
        background: 'var(--card-bg)',
        border: '1px solid var(--border-subtle)',
        textDecoration: 'none',
        minWidth: 0,
        transition: 'all .15s',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = AMBER_BORDER
        e.currentTarget.style.background = AMBER_BG
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = 'var(--border-subtle)'
        e.currentTarget.style.background = 'var(--card-bg)'
      }}
    >
      {user.user_avatar_url ? (
        <img
          src={proxyImg(user.user_avatar_url)}
          alt={user.user_username}
          referrerPolicy="no-referrer"
          style={{
            width: 26,
            height: 26,
            borderRadius: '50%',
            border: `1px solid ${AMBER_BORDER}`,
            objectFit: 'cover',
            flexShrink: 0,
            background: AMBER_BG_SOFT,
          }}
          onError={(e) => {
            // If avatar fails to load, replace with initial fallback
            const el = e.currentTarget
            el.style.display = 'none'
            const next = el.nextElementSibling as HTMLElement | null
            if (next) next.style.display = 'flex'
          }}
        />
      ) : null}
      <div
        style={{
          width: 26,
          height: 26,
          borderRadius: '50%',
          background: `linear-gradient(135deg, ${AMBER_BG}, rgba(249,115,22,.08))`,
          border: `1px solid ${AMBER_BORDER}`,
          display: user.user_avatar_url ? 'none' : 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          fontSize: 11,
          fontWeight: 800,
          color: AMBER,
          fontFamily: 'Outfit,sans-serif',
        }}
      >
        {user.user_username[0]?.toUpperCase() || '?'}
      </div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: 'var(--text-primary)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {user.user_username}
        </div>
        {user.user_rank && (
          <div
            style={{
              fontSize: 9,
              color: 'var(--text-muted)',
              fontWeight: 600,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              fontFamily: 'Outfit,sans-serif',
              letterSpacing: '.02em',
            }}
          >
            {user.user_rank}
          </div>
        )}
      </div>
    </Link>
  )
}

/** Mažas pilule'is „📁 Archyvas" inline rodymui */
export function LegacyBadge({ label = 'Archyvas' }: { label?: string } = {}) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        fontSize: 9,
        fontWeight: 800,
        textTransform: 'uppercase',
        letterSpacing: '.1em',
        color: AMBER,
        padding: '3px 9px',
        borderRadius: 100,
        background: AMBER_BG,
        border: `1px solid ${AMBER_BORDER}`,
        fontFamily: 'Outfit,sans-serif',
        flexShrink: 0,
        lineHeight: 1,
      }}
    >
      <ArchiveIcon size={9} color={AMBER} />
      {label}
    </span>
  )
}

// ──────────────────────────────────────────────────────────────────
// Icons (inline SVG — jokių external deps)
// ──────────────────────────────────────────────────────────────────

function HeartIcon({ size = 16, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} style={{ flexShrink: 0 }}>
      <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
    </svg>
  )
}

function ArchiveIcon({ size = 12, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flexShrink: 0 }}
    >
      <rect x="2.5" y="3.5" width="19" height="5" rx="1" />
      <path d="M4.5 8.5v12h15v-12" />
      <path d="M10 13h4" />
    </svg>
  )
}
