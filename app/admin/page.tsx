'use client'
// Admin dashboard — sugrupuotos sekcijos, kiekviena su touch-friendly kortelėm.
// Migracija aukščiausiai (kasdienio darbo srautas: aktyvuoti, peržiūrėti pending,
// patvirtinti). Po jos — content management (atlikėjai/albums/tracks/news/events).
// Pabaigoje — sistemos meta (genres/search/settings/voting).
//
// Mobile-first: kortelės stack'inasi 1 kolona <640px, 2 kolonos sm:, 3 kolonos lg:.
// Touch targets >= 44px (iOS HIG). Niekur ne small text be papildomos akcijos.
import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import AdminMigrationProgress from '@/components/AdminMigrationProgress'
import AdminQuickAdd from '@/components/AdminQuickAdd'

type Counts = {
  artists: number; albums: number; tracks: number
  news: number; events: number; venues: number
  top_pending: number
  pending_albums: number   // legacy_scrape_pending
  pending_tracks: number
  active_jobs: number      // import_jobs running/pending
  inbox_pending: number    // news candidates laukia review'o
  users_migrated: number   // ghost user'iai su >=1 faze
}

type AdminCard = {
  href: string
  newHref?: string
  icon: string
  label: string
  count?: number
  badge?: { text: string; color: 'orange' | 'red' | 'green' | 'blue' }
  hint?: string
}

function Card({ card }: { card: AdminCard }) {
  const badgeColors: Record<string, string> = {
    orange: 'bg-orange-100 text-orange-700 border-orange-200',
    red:    'bg-red-100 text-red-700 border-red-200',
    green:  'bg-green-100 text-green-700 border-green-200',
    blue:   'bg-blue-100 text-blue-700 border-blue-200',
  }
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
        {card.badge && (
          <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10.5px] font-bold ${badgeColors[card.badge.color]}`}>
            {card.badge.text}
          </span>
        )}
        {card.count !== undefined && !card.badge && (
          <span className="shrink-0 rounded-full bg-[var(--bg-elevated)] px-2 py-0.5 text-xs text-[var(--text-muted)]">
            {card.count.toLocaleString('lt-LT')}
          </span>
        )}
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

export default function AdminDashboardPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [counts, setCounts] = useState<Counts | null>(null)

  const isAdmin = session?.user?.role === 'admin' || session?.user?.role === 'super_admin'

  useEffect(() => { if (status === 'unauthenticated') router.push('/') }, [status])

  useEffect(() => {
    if (!isAdmin) return
    Promise.all([
      fetch('/api/artists?limit=1').then(r => r.json()),
      fetch('/api/albums?limit=1').then(r => r.json()),
      fetch('/api/tracks?limit=1').then(r => r.json()),
      fetch('/api/news?limit=1').then(r => r.json()),
      fetch('/api/events?limit=1&showPast=true').then(r => r.json()),
      fetch('/api/top/suggestions?status=pending').then(r => r.json()),
      fetch('/api/venues').then(r => r.json()),
      // Migration counters — turi būti light query'ai. Naudojam REST API
      // su `Prefer: count=exact, head=true` jei reikia, bet dabar tiesiog
      // imam .total iš normalaus list endpoint'o.
      fetch('/api/admin/import/pending/counts').then(r => r.ok ? r.json() : { albums: 0, tracks: 0, jobs: 0 }).catch(() => ({ albums: 0, tracks: 0, jobs: 0 })),
      // Inbox pending news candidates (light query — head=true count)
      fetch('/api/admin/news-candidates?status=pending&limit=1').then(r => r.ok ? r.json() : { total: 0 }).catch(() => ({ total: 0 })),
      // Migrated users count (>=1 phase touched)
      fetch('/api/admin/users-migration/counts').then(r => r.ok ? r.json() : { migrated: 0 }).catch(() => ({ migrated: 0 })),
    ]).then(([ar, al, tr, nw, ev, sg, vn, mig, inbox, usersMig]) => {
      setCounts({
        artists: ar.total || 0,
        albums: al.total || 0,
        tracks: tr.total || 0,
        news: nw.total || 0,
        events: ev.total || 0,
        top_pending: sg.suggestions?.length || 0,
        venues: vn.venues?.length || 0,
        pending_albums: mig.albums || 0,
        pending_tracks: mig.tracks || 0,
        active_jobs: mig.jobs || 0,
        inbox_pending: inbox.total || inbox.candidates?.length || 0,
        users_migrated: usersMig.migrated || 0,
      })
    })
  }, [isAdmin])

  if (status === 'loading' || !isAdmin) return null

  const totalPending = (counts?.pending_albums || 0) + (counts?.pending_tracks || 0)

  // ── Sekcijos ────────────────────────────────────────────────────────
  // Kasdienio darbo srautai — review queue + nariai. Aukščiausioje vietoje.
  const ops: AdminCard[] = [
    {
      href: '/admin/inbox',
      icon: '📥',
      label: 'Naujienų inbox',
      hint: 'News scout candidates → review / publish',
      badge: counts?.inbox_pending && counts.inbox_pending > 0
        ? { text: `${counts.inbox_pending} laukia`, color: 'orange' }
        : undefined,
    },
    {
      href: '/admin/users-migration',
      icon: '👤',
      label: 'Narių UGC migracija',
      hint: 'Per-user content + likes (top karma sąrašas)',
      badge: counts?.users_migrated && counts.users_migrated > 0
        ? { text: `${counts.users_migrated} migruoti`, color: 'green' }
        : undefined,
    },
    {
      href: '/admin/import/pending',
      icon: '⏳',
      label: 'Pending review',
      hint: 'music.lt has, Wiki neturi — patvirtinti',
      badge: totalPending > 0
        ? { text: `${totalPending} laukia`, color: 'orange' }
        : undefined,
    },
  ]

  const migration: AdminCard[] = [
    {
      href: '/admin/import',
      icon: '🚀',
      label: 'Atlikėjų migracija',
      hint: 'Wiki + scrape job queue, bulk run',
      badge: counts?.active_jobs && counts.active_jobs > 0
        ? { text: `${counts.active_jobs} aktyvūs`, color: 'orange' }
        : undefined,
    },
    {
      href: '/admin/artist-import',
      icon: '📋',
      label: 'JSON importas',
      hint: 'GPT JSON → atlikėjo info (create/update)',
    },
    {
      href: '/admin/import/forum',
      icon: '🧵',
      label: 'Forum migracija',
      hint: 'Senas forumas → diskusijų threads',
    },
  ]

  const content: AdminCard[] = [
    { href: '/admin/artists', newHref: '/admin/artists/new', icon: '🎤', label: 'Atlikėjai', count: counts?.artists },
    { href: '/admin/albums', newHref: '/admin/albums/new', icon: '💿', label: 'Albumai', count: counts?.albums },
    { href: '/admin/tracks', newHref: '/admin/tracks/new', icon: '🎵', label: 'Dainos', count: counts?.tracks },
    { href: '/admin/news', newHref: '/admin/news/new', icon: '📰', label: 'Naujienos', count: counts?.news },
    { href: '/admin/events', newHref: '/admin/events/new', icon: '📅', label: 'Renginiai', count: counts?.events },
    { href: '/admin/venues', newHref: '/admin/venues/new', icon: '📍', label: 'Vietos', count: counts?.venues },
    { href: '/admin/comments', icon: '💬', label: 'Komentarai', hint: 'Visi komentarai per visas surfaces' },
  ]

  const tops: AdminCard[] = [
    {
      href: '/admin/top',
      icon: '🏆',
      label: 'TOP sąrašai',
      hint: 'TOP 40 · LT TOP 30',
      badge: counts?.top_pending && counts.top_pending > 0
        ? { text: `${counts.top_pending} laukia`, color: 'orange' }
        : undefined,
    },
    { href: '/admin/charts', icon: '🌍', label: 'Išoriniai topai', hint: 'AGATA, Spotify, Apple — susieti dainas' },
    { href: '/admin/dienos-daina', icon: '⭐', label: 'Dienos daina', hint: 'Daily song spotlight' },
    { href: '/admin/voting', icon: '🗳️', label: 'Balsavimai', hint: 'Apdovanojimai, votings' },
    { href: '/admin/boombox', icon: '🎛️', label: 'Boombox', hint: 'Live stream player config' },
  ]

  const system: AdminCard[] = [
    { href: '/admin/genres', icon: '🎨', label: 'Žanrai' },
    { href: '/admin/role-translations', icon: '🌐', label: 'Sričių vertimai' },
    { href: '/admin/eventai', icon: '📅', label: 'Eventai (legacy)' },
    { href: '/admin/search', icon: '🔍', label: 'Paieška' },
    { href: '/admin/users', icon: '👥', label: 'Vartotojai' },
    { href: '/admin/settings', icon: '⚙️', label: 'Nustatymai' },
    { href: '/admin/db-stats', icon: '💾', label: 'DB stats', hint: 'Lentelių dydžiai, dead indexes, bloat' },
  ]

  return (
    <div className="min-h-screen bg-[var(--bg-elevated)]">
      <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="mb-6">
          <h1 className="font-['Outfit',sans-serif] text-2xl font-extrabold text-[var(--text-primary)] sm:text-3xl">
            Admin dashboard
          </h1>
          <p className="mt-1 text-[12.5px] text-[var(--text-muted)]">
            Migracijos workflow + content management. Optimizuotas mobile'ui.
          </p>
        </div>

        {/* Greitas pridėjimas — viena nuoroda → daina (YT) arba albumas (Wiki) */}
        <section className="mb-6">
          <AdminQuickAdd />
        </section>

        {/* Migracijos progresas — visų atlikėjų sutvarkymo % + priority list */}
        <section className="mb-6">
          <AdminMigrationProgress />
        </section>

        {/* Kasdienis darbas — inbox, narių UGC, pending review */}
        <section className="mb-8">
          <SectionTitle icon="📋" label="Kasdienis darbas" hint="inbox review, narių migracija, pending entries" />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {ops.map(card => <Card key={card.href} card={card} />)}
          </div>
        </section>

        {/* Migracija — atlikėjų importas + forum */}
        <section className="mb-8">
          <SectionTitle icon="🚀" label="Migracija" hint="atlikėjų importas, forumas" />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {migration.map(card => <Card key={card.href} card={card} />)}
          </div>
        </section>

        {/* Content management */}
        <section className="mb-8">
          <SectionTitle icon="📚" label="Turinys" hint="atlikėjai, albumai, dainos, news, events" />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {content.map(card => <Card key={card.href} card={card} />)}
          </div>
        </section>

        {/* TOP / charts / votings */}
        <section className="mb-8">
          <SectionTitle icon="🏆" label="Topai ir balsavimai" />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {tops.map(card => <Card key={card.href} card={card} />)}
          </div>
        </section>

        {/* System */}
        <section className="mb-6">
          <SectionTitle icon="⚙️" label="Sistema" />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {system.map(card => <Card key={card.href} card={card} />)}
          </div>
        </section>
      </div>
    </div>
  )
}
