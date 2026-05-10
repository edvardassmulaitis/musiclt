import { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase'
import CommentsSection from '@/components/CommentsSection'
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
    description: d.body.slice(0, 160),
  }
}

export default async function DiscussionPage({ params }: Props) {
  const { slug } = await params
  const discussion = await getDiscussion(slug)
  if (!discussion) notFound()

  const supabase = createAdminClient()
  await supabase
    .from('discussions')
    .update({ view_count: discussion.view_count + 1 })
    .eq('id', discussion.id)

  function timeAgo(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime()
    const days = Math.floor(diff / 86400000)
    if (days < 1) return 'Šiandien'
    if (days === 1) return 'Vakar'
    return new Date(dateStr).toLocaleDateString('lt-LT', { year: 'numeric', month: 'long', day: 'numeric' })
  }

  return (
    <div style={{ background: '#080d14', minHeight: '100vh' }}>
      <div className="max-w-[760px] mx-auto px-5 py-10">

        <div className="flex items-center gap-2 text-sm mb-6">
          <Link href="/diskusijos" className="text-gray-500 hover:text-white transition-colors">💬 Diskusijos</Link>
          <span className="text-gray-700">›</span>
          <span className="text-gray-400 truncate">{discussion.title}</span>
        </div>

        {discussion.tags?.length > 0 && (
          <div className="flex gap-2 mb-4">
            {discussion.tags.map((tag: string) => (
              <Link key={tag} href={`/diskusijos?tag=${encodeURIComponent(tag)}`}
                className="text-xs font-bold px-2.5 py-1 rounded-full transition-colors hover:bg-indigo-500/30"
                style={{ background: 'rgba(99,102,241,0.12)', color: '#a5b4fc', border: '1px solid rgba(99,102,241,0.2)' }}>
                {tag}
              </Link>
            ))}
          </div>
        )}

        <h1 className="text-3xl font-black text-white leading-tight mb-3">
          {discussion.is_locked && <span className="text-gray-600 mr-2">🔒</span>}
          {discussion.is_pinned && <span className="text-orange-400 mr-2">📌</span>}
          {discussion.title}
        </h1>

        <div className="flex items-center gap-3 text-xs text-gray-500 mb-6">
          <span className="font-semibold text-gray-400">{discussion.author_name || 'Vartotojas'}</span>
          <span className="text-gray-700">·</span>
          <span>{timeAgo(discussion.created_at)}</span>
          <span className="text-gray-700">·</span>
          <span>{discussion.view_count} peržiūrų</span>
          <span className="text-gray-700">·</span>
          <span>{discussion.comment_count} atsakymų</span>
        </div>

        <div className="text-gray-300 leading-relaxed whitespace-pre-wrap mb-10 text-sm"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '2.5rem' }}>
          {discussion.body}
        </div>

        <CommentsSection
          entityType="discussion"
          entityId={discussion.id}
          title={`Atsakymai (${discussion.comment_count})`}
        />
      </div>
    </div>
  )
}
