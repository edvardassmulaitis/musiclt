import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase'
import Link from 'next/link'

type Props = { params: Promise<{ id: string }> }

async function getThread(legacyId: number) {
  const sb = createAdminClient()
  const { data } = await sb
    .from('forum_threads')
    .select('legacy_id, slug, source_url, kind')
    .eq('legacy_id', legacyId)
    .maybeSingle()
  return data
}

function slugToTitle(slug: string): string {
  return (slug || '').replace(/\/$/, '').replace(/-/g, ' ').replace(/\s+/g, ' ').trim()
}

export default async function LegacyDiscussionPage({ params }: Props) {
  const { id } = await params
  const legacyId = parseInt(id)
  if (!legacyId) notFound()
  const thread = await getThread(legacyId)
  if (!thread) notFound()

  const title = slugToTitle(thread.slug)
  const isNews = thread.kind === 'news'

  return (
    <div style={{ background: 'var(--bg-body)', color: 'var(--text-primary)', minHeight: '100vh', fontFamily: "'DM Sans',system-ui,sans-serif" }}>
      <div style={{ maxWidth: 780, margin: '0 auto', padding: '48px 24px 80px' }}>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'Outfit,sans-serif', fontWeight: 700, letterSpacing: '.04em', marginBottom: 20 }}>
          <Link href="/" style={{ color: 'inherit', textDecoration: 'none' }}>music.lt</Link>
          {' / '}
          <Link href="/diskusijos" style={{ color: 'inherit', textDecoration: 'none' }}>Diskusijos</Link>
        </div>

        <div style={{ display: 'inline-block', padding: '4px 12px', borderRadius: 100, background: isNews ? 'rgba(249,115,22,.1)' : 'rgba(59,130,246,.1)', border: `1px solid ${isNews ? 'rgba(249,115,22,.3)' : 'rgba(59,130,246,.3)'}`, fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.1em', color: isNews ? '#f97316' : '#3b82f6', fontFamily: 'Outfit,sans-serif', marginBottom: 14 }}>
          {isNews ? 'Naujiena' : 'Diskusija'}
        </div>

        <h1 style={{ fontFamily: 'Outfit,sans-serif', fontSize: '2.2rem', fontWeight: 900, lineHeight: 1.15, letterSpacing: '-.02em', margin: '0 0 8px', color: 'var(--text-primary)' }}>
          {title}
        </h1>

        <div style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'Outfit,sans-serif', fontWeight: 600, marginBottom: 36 }}>
          music.lt #{thread.legacy_id}
        </div>

        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 12, padding: '28px 26px', marginBottom: 24 }}>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            Šio {isNews ? 'straipsnio' : 'diskusijos'} turinys ir komentarai dar nebuvo restauruoti į naująją versiją.
          </div>
        </div>

        <div>
          <a
            href={thread.source_url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-block',
              padding: '10px 18px', borderRadius: 100,
              background: '#f97316', color: '#fff',
              fontWeight: 700, fontSize: 13, textDecoration: 'none',
              fontFamily: 'Outfit,sans-serif',
            }}
          >
            Atidaryti music.lt archyve →
          </a>
        </div>
      </div>
    </div>
  )
}
