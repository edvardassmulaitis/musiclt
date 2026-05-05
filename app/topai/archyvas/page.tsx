import { Metadata } from 'next'
import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase'

export const metadata: Metadata = {
  title: 'Topo archyvas — praėjusių savaičių rezultatai | music.lt',
  description: 'Visų finalizuotų LT TOP 30 ir TOP 40 savaičių archyvas.',
}

export const dynamic = 'force-dynamic'

type Week = {
  id: number
  top_type: string
  week_start: string
  is_finalized: boolean
}

async function getArchive() {
  const supabase = createAdminClient()
  const { data: weeks } = await supabase
    .from('top_weeks')
    .select('id, top_type, week_start, is_finalized')
    .eq('is_finalized', true)
    .order('week_start', { ascending: false })
    .limit(60)
  return (weeks || []) as Week[]
}

function formatWeek(start: string) {
  const d = new Date(start + 'T00:00:00')
  const end = new Date(d)
  end.setDate(end.getDate() + 6)
  const fmt = (x: Date) => x.toLocaleDateString('lt-LT', { day: '2-digit', month: '2-digit' })
  return `${fmt(d)} – ${fmt(end)}, ${d.getFullYear()} m.`
}

export default async function ArchivePage() {
  const weeks = await getArchive()
  const top40 = weeks.filter(w => w.top_type === 'top40')
  const top30 = weeks.filter(w => w.top_type === 'lt_top30')

  return (
    <div className="max-w-5xl mx-auto px-4 py-10">
      <div className="mb-8">
        <Link href="/topai" className="text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)]">
          ← Topai
        </Link>
        <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-[var(--text-primary)]">
          Topo archyvas
        </h1>
        <p className="mt-2 text-[var(--text-muted)]">
          Finalizuotų savaičių rezultatai — naršyk pagal datą, pamatysi tos savaitės pilną topą.
        </p>
      </div>

      <div className="grid gap-8 md:grid-cols-2">
        <ArchiveColumn label="TOP 40" weeks={top40} accent="#f97316" basePath="/topai/archyvas" />
        <ArchiveColumn label="LT TOP 30" weeks={top30} accent="#22c55e" basePath="/topai/archyvas" />
      </div>

      {weeks.length === 0 && (
        <div className="mt-12 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-10 text-center">
          <p className="text-[var(--text-secondary)] font-semibold">Archyvas dar tuščias</p>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Pirmieji finalizuoti topai pateks čia po šios savaitės pabaigos.
          </p>
        </div>
      )}
    </div>
  )
}

function ArchiveColumn({
  label, weeks, accent, basePath,
}: {
  label: string; weeks: Week[]; accent: string; basePath: string
}) {
  return (
    <section>
      <div className="mb-3 flex items-baseline gap-2">
        <span
          className="rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white"
          style={{ background: accent }}
        >
          {label}
        </span>
        <span className="text-xs text-[var(--text-muted)]">{weeks.length} savaičių</span>
      </div>
      {weeks.length === 0 ? (
        <p className="text-sm text-[var(--text-muted)]">Dar nėra finalizuotų savaičių.</p>
      ) : (
        <ul className="divide-y divide-[var(--border-subtle)] rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] overflow-hidden">
          {weeks.map(w => (
            <li key={w.id}>
              <Link
                href={`${basePath}/${w.id}`}
                className="flex items-center justify-between px-4 py-3 hover:bg-[var(--bg-hover)] transition-colors"
              >
                <span className="text-sm font-medium text-[var(--text-primary)]">
                  {formatWeek(w.week_start)}
                </span>
                <span className="text-xs text-[var(--text-muted)]">→</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
