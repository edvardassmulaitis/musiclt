import { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase'
import EntityCommentsBlock from '@/components/EntityCommentsBlock'
import Link from 'next/link'

interface Props {
  params: Promise<{ slug: string }>
}

async function getDiscussion(slug: string) {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('discussions')
    .select('*')
    .eq('slug', slug)
    .eq('is_deleted', false)
    .single()
  return data
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const d = await getDiscussion(slug)
  if (!d) return { title: 'Diskusija nerasta' }
  return {
    title: `${d.title} | Diskusijos | music.lt`,
    description: (d.body || d.title || '').slice(0, 160),
  }
}

function fmtDate(s: string): string {
  return new Date(s).toLocaleDateString('lt-LT', { year: 'numeric', month: 'long', day: 'numeric' })
}

/** Legacy thread'ams body == title placeholder, parodyt nereikia (dubliuoja H1).
 *  Original user-created'iniems body skiriasi nuo title — tada rodom. */
function bodyIsMeaningful(d: any): boolean {
  if (!d.body) return false
  const b = String(d.body).trim()
  if (!b) return false
  const t = String(d.title || '').trim()
  if (b === t) return false
  return true
}

export default async function DiscussionPage({ params }: Props) {
  const { slug } = await params
  const discussion = await getDiscussion(slug)
  if (!discussion) notFound()

  // Fire-and-forget view count increment.
  const supabase = createAdminClient()
  await supabase
    .from('discussions')
    .update({ view_count: (discussion.view_count || 0) + 1 })
    .eq('id', discussion.id)

  return (
    <div style={{ background: '#080d14', minHeight: '100vh' }}>
      <div className="mx-auto px-5 py-8" style={{ maxWidth: 1200 }}>
        {/* Breadcrumb su atgal į listing'ą — title čia jau ne'rodom (yra žemiau H1'e). */}
        <div className="mb-5 text-sm">
          <Link href="/diskusijos" className="text-gray-500 hover:text-white transition-colors">
            ← Diskusijos
          </Link>
        </div>

        <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-8">
          {/* MAIN — thread header + composer + komentarai */}
          <div className="min-w-0">
            {/* Tags chips — virš title'o, smulkūs */}
            {Array.isArray(discussion.tags) && discussion.tags.length > 0 && (
              <div className="mb-3 flex flex-wrap gap-1.5">
                {discussion.tags.map((tag: string) => (
                  <Link
                    key={tag}
                    href={`/diskusijos?tag=${encodeURIComponent(tag)}`}
                    className="rounded-full px-2 py-0.5 text-[11px] font-bold transition-colors hover:bg-indigo-500/30"
                    style={{ background: 'rgba(99,102,241,0.12)', color: '#a5b4fc', border: '1px solid rgba(99,102,241,0.2)' }}
                  >
                    {tag}
                  </Link>
                ))}
              </div>
            )}

            <h1 className="mb-2 text-3xl font-black leading-tight text-white">
              {discussion.is_locked && <span className="mr-2 text-gray-600">🔒</span>}
              {discussion.is_pinned && <span className="mr-2 text-orange-400">📌</span>}
              {discussion.title}
            </h1>

            {/* Vienos eilutės meta — author + data, BE peržiūrų ir BE atsakymų count'o
                (jį rodysim viduje EntityCommentsBlock'o). */}
            <div className="mb-6 flex items-center gap-2 text-xs text-gray-500">
              <span className="font-semibold text-gray-400">{discussion.author_name || 'Vartotojas'}</span>
              <span className="text-gray-700">·</span>
              <span>{fmtDate(discussion.created_at)}</span>
            </div>

            {/* Body — rodom TIK jei skiriasi nuo title'o (legacy thread'ams placeholder == title). */}
            {bodyIsMeaningful(discussion) && (
              <div
                className="mb-8 whitespace-pre-wrap text-sm leading-relaxed text-gray-300"
                style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '1.5rem' }}
              >
                {discussion.body}
              </div>
            )}

            <EntityCommentsBlock
              entityType="discussion"
              entityId={discussion.id}
              title={`${discussion.comment_count.toLocaleString()} atsakymų`}
            />
          </div>

          {/* SIDEBAR — placeholder kol pridesim related/similar threads, linked entity,
              top contributors. Mobile'e slepia, tik lg+. */}
          <aside className="hidden lg:block">
            <div className="sticky top-6 flex flex-col gap-3">
              <div className="rounded-2xl border border-white/5 bg-white/[0.025] p-4">
                <div className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-gray-500">
                  Apie diskusiją
                </div>
                <div className="mt-3 space-y-1.5 text-xs text-gray-400">
                  <div className="flex justify-between gap-2">
                    <span>Pradžia</span>
                    <span className="text-gray-300">{fmtDate(discussion.created_at)}</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span>Atsakymai</span>
                    <span className="font-bold text-gray-200">{(discussion.comment_count ?? 0).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span>Peržiūros</span>
                    <span className="text-gray-300">{(discussion.view_count ?? 0).toLocaleString()}</span>
                  </div>
                  {discussion.last_comment_at && (
                    <div className="flex justify-between gap-2">
                      <span>Paskutinis</span>
                      <span className="text-gray-300">{fmtDate(discussion.last_comment_at)}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Susijusių diskusijų placeholder — pridesim po to, kai turėsim
                  related discussion logic'ą (panašaus title'o, ar tos pačios
                  forum kategorijos, ar linkuotų prie to paties entity). */}
              <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.015] p-4 text-center">
                <div className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-gray-600">
                  Panašios diskusijos
                </div>
                <div className="mt-2 text-[11px] italic text-gray-600">
                  netrukus
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  )
}
