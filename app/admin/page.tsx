'use client'
// Admin dashboard — „ką reikia padaryti dabar", ne funkcijų katalogas.
//
// Grupės + kortelės + rolės gyvena VIENAME tiesos šaltinyje: lib/admin-sections.ts.
// Tas pats config'as valdo middleware enforcement (server-side). Čia tik renderis.
//
// Rolės: editor (regular admin) mato review/content/growth/community; admin +
// super_admin papildomai mato imports/system. Filtravimas — canSeeSection().
//
// Mobile-first: 1 kolona <640px, 2 sm:, 3 lg:. Touch targets >= 44px.
import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import AdminMigrationProgress from '@/components/AdminMigrationProgress'
import AdminQuickAdd from '@/components/AdminQuickAdd'
import {
  ADMIN_GROUPS, ADMIN_SECTIONS, canSeeSection, hasMinRole, isAdminTier,
  type AdminSection, type GroupKey,
} from '@/lib/admin-sections'

// Summary endpoint grąžina plokščią objektą: { artists: 13641, inbox_pending: 38, ... }
type Summary = Record<string, number>

const BADGE_SUFFIX: Record<string, string> = {
  active_jobs: 'aktyvūs',
  users_migrated: 'migruoti',
  radar_pending: 'nauji',
}

function Card({ card, summary }: { card: AdminSection; summary: Summary | null }) {
  const badgeVal = card.badgeKey ? summary?.[card.badgeKey] : undefined
  const showBadge = typeof badgeVal === 'number' && badgeVal > 0
  const countVal = card.countKey ? summary?.[card.countKey] : undefined

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--input-border)] bg-[var(--bg-surface)] transition-all hover:border-[var(--border-strong)] hover:shadow-md">
      <Link
        href={card.href}
        className="flex min-h-[60px] items-center gap-3 px-4 py-3 transition-colors hover:bg-[var(--bg-hover)]"
      >
        <span className="text-2xl">{card.icon}</span>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate font-semibold text-[var(--text-primary)]">{card.label}</span>
          {card.hint && (
            <span className="truncate text-[11px] text-[var(--text-muted)]">{card.hint}</span>
          )}
        </div>
        {showBadge ? (
          <span className="shrink-0 rounded-full border border-orange-200 bg-orange-100 px-2 py-0.5 text-[10.5px] font-bold text-orange-700">
            {badgeVal} {BADGE_SUFFIX[card.badgeKey!] || 'laukia'}
          </span>
        ) : countVal !== undefined ? (
          <span className="shrink-0 rounded-full bg-[var(--bg-elevated)] px-2 py-0.5 text-xs text-[var(--text-muted)]">
            {countVal.toLocaleString('lt-LT')}
          </span>
        ) : null}
      </Link>
      {card.newHref && (
        <Link
          href={card.newHref}
          className="flex min-h-[36px] w-full items-center justify-center border-t border-[var(--border-subtle)] py-2 text-xs text-music-blue transition-colors hover:bg-[var(--hover-blue)]"
        >
          + Naujas
        </Link>
      )}
    </div>
  )
}

function SectionTitle({ icon, label, hint }: { icon: string; label: string; hint?: string }) {
  return (
    <div className="mb-3 flex items-baseline gap-2">
      <span className="text-lg">{icon}</span>
      <h2 className="font-['Outfit',sans-serif] text-sm font-extrabold uppercase tracking-[0.12em] text-[var(--text-secondary)]">
        {label}
      </h2>
      {hint && <span className="text-[11px] text-[var(--text-faint)]">— {hint}</span>}
    </div>
  )
}

function CollapseButton({
  icon, label, count, open, onToggle, badge,
}: {
  icon: string; label: string; count: number
  open: boolean; onToggle: () => void; badge?: string
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className="flex w-full items-center gap-3 rounded-xl border border-[var(--input-border)] bg-[var(--bg-surface)] px-4 py-3 text-left transition-all hover:border-[var(--border-strong)] hover:bg-[var(--bg-hover)]"
    >
      <span className="text-2xl">{icon}</span>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="font-semibold text-[var(--text-primary)]">{label}</span>
      </div>
      {badge && (
        <span className="shrink-0 rounded-full border border-orange-200 bg-orange-100 px-2 py-0.5 text-[10.5px] font-bold text-orange-700">
          {badge}
        </span>
      )}
      <span className="shrink-0 rounded-full bg-[var(--bg-elevated)] px-2 py-0.5 text-xs text-[var(--text-muted)]">
        {count}
      </span>
      <svg
        width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
        className={`shrink-0 text-[var(--text-muted)] transition-transform ${open ? 'rotate-180' : ''}`}
      >
        <polyline points="6 9 12 15 18 9" />
      </svg>
    </button>
  )
}

export default function AdminDashboardPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const role = session?.user?.role
  const isAdmin = isAdminTier(role)
  const isFull = hasMinRole(role, 'admin')

  const [summary, setSummary] = useState<Summary | null>(null)
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({})

  useEffect(() => { if (status === 'unauthenticated') router.push('/') }, [status])

  useEffect(() => {
    if (!isAdmin) return
    fetch('/api/admin/dashboard-summary')
      .then(r => (r.ok ? r.json() : {}))
      .then((d) => setSummary(d || {}))
      .catch(() => setSummary({}))
  }, [isAdmin])

  if (status === 'loading' || !isAdmin) return null

  // Sekcijos matomos šiai rolei, sugrupuotos.
  const visibleByGroup = (g: GroupKey) =>
    ADMIN_SECTIONS.filter(s => s.group === g && canSeeSection(role, s))

  const toggle = (g: string) => setOpenGroups(o => ({ ...o, [g]: !o[g] }))

  return (
    <div className="min-h-screen bg-[var(--bg-elevated)]">
      <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="mb-6">
          <h1 className="font-['Outfit',sans-serif] text-2xl font-extrabold text-[var(--text-primary)] sm:text-3xl">
            Admin dashboard
          </h1>
          <p className="mt-1 text-[12.5px] text-[var(--text-muted)]">
            Ką reikia padaryti dabar — peržiūra, turinys, augimas.{!isFull && ' (Redaktoriaus rodinys)'}
          </p>
        </div>

        {/* Greitas pridėjimas */}
        <section className="mb-6">
          <AdminQuickAdd />
        </section>

        {ADMIN_GROUPS.map((group) => {
          // Grupė matoma tik jei rolė pasiekia jos minRole.
          if (!hasMinRole(role, group.minRole)) return null
          const cards = visibleByGroup(group.key)
          if (cards.length === 0) return null

          // Imports/system — collapse mygtukas.
          if (group.collapsed) {
            const open = !!openGroups[group.key]
            const badge = group.key === 'imports' && summary?.active_jobs
              ? `${summary.active_jobs} aktyvūs` : undefined
            return (
              <section key={group.key} className="mb-4">
                <CollapseButton
                  icon={group.icon}
                  label={group.title}
                  count={cards.length}
                  open={open}
                  onToggle={() => toggle(group.key)}
                  badge={badge}
                />
                {open && (
                  <div className="mt-3 space-y-3">
                    {group.key === 'imports' && <AdminMigrationProgress />}
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {cards.map(card => <Card key={card.key} card={card} summary={summary} />)}
                    </div>
                  </div>
                )}
              </section>
            )
          }

          // review/content/growth/community — visada išskleista.
          return (
            <section key={group.key} className="mb-8">
              <SectionTitle icon={group.icon} label={group.title} />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {cards.map(card => <Card key={card.key} card={card} summary={summary} />)}
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}
