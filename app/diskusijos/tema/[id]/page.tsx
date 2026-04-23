// app/diskusijos/archyvas/[id]/page.tsx
// Individualios archyvinės diskusijos puslapis. Dabar scrape'as turi tik title,
// slug ir source_url. Komentarų turinys laukia ateities scrape'o.
import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase'
import Link from 'next/link'
import type { Metadata } from 'next'

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

function findLikelyArtistSlugFromUrl(sourceUrl: string | null): string | null {
  if (!sourceUrl) return null
  // source_url formatas: /lt/diskusijos/tema/{id}/{thread-slug}/
  // Artist atspindime per URL pattern match į DM kontekstą — ne visada patikima,
  // bet DM case works: „Depeche-Mode" fragment URL'e.
  const m = sourceUrl.match(/\/tema\/\d+\/([^\/]+)/)
  if (!m) return null
  // Paimam pirmą segment'ą, kurį atpažinsim kaip artist
  const segs = m[1].split('-')
  // Heuristics: pirmi 1-3 segments gali sudaryti artist name
  return segs.slice(0, 2).join('-').toLowerCase()
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  const t = await getThread(parseInt(id))
  const title = t ? slugToTitle(t.slug) : 'Diskusija'
  return { title: `${title} — music.lt archyvas` }
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
        {/* Breadcrumb */}
        <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'Outfit,sans-serif', fontWeight: 700, letterSpacing: '.04em', marginBottom: 20, display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <Link href="/" style={{ color: 'inherit', textDecoration: 'none' }}>music.lt</Link>
          <span style={{ opacity: 0.4 }}>›</span>
          <Link href={isNews ? '/naujienos' : '/diskusijos'} style={{ color: 'inherit', textDecoration: 'none' }}>{isNews ? 'Naujienos' : 'Diskusijos'}</Link>
          <span style={{ opacity: 0.4 }}>›</span>
          <span style={{ color: 'var(--text-faint)' }}>Archyvas</span>
        </div>

        {/* Kind badge */}
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 12px', borderRadius: 100, background: isNews ? 'rgba(249,115,22,.1)' : 'rgba(59,130,246,.1)', border: `1px solid ${isNews ? 'rgba(249,115,22,.3)' : 'rgba(59,130,246,.3)'}`, fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.1em', color: isNews ? '#f97316' : '#3b82f6', fontFamily: 'Outfit,sans-serif', marginBottom: 14 }}>
          {isNews ? '📰 Naujiena' : '💬 Diskusija'}
        </div>

        {/* Title */}
        <h1 style={{ fontFamily: 'Outfit,sans-serif', fontSize: 'clamp(1.6rem, 3.6vw, 2.4rem)', fontWeight: 900, lineHeight: 1.15, letterSpacing: '-.02em', margin: '0 0 8px', color: 'var(--text-primary)' }}>
          {title}
        </h1>

        <div style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'Outfit,sans-serif', fontWeight: 600, letterSpacing: '.02em', marginBottom: 36 }}>
          music.lt #{thread.legacy_id}
        </div>

        {/* Content placeholder */}
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 12, padding: '28px 26px', marginBottom: 24 }}>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            Šio {isNews ? 'straipsnio' : 'diskusijos'} turinys ir komentarai dar nebuvo restauruoti į naująją versiją.
            Originalų turinį gali pamatyti <a href={thread.source_url} target="_blank" rel="noopener noreferrer" style={{ color: '#f97316', fontWeight: 700 }}>senojoje music.lt</a>.
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <a
            href={thread.source_url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: '10px 18px', borderRadius: 100,
              background: '#f97316', color: '#fff',
              fontWeight: 700, fontSize: 13, textDecoration: 'none',
              fontFamily: 'Outfit,sans-serif', transition: 'opacity .15s',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M7 17L17 7M17 7H8M17 7v9" />
            </svg>
            Atidaryti music.lt archyve
          </a>
          <Link
            href={isNews ? '/naujienos' : '/diskusijos'}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: '10px 18px', borderRadius: 100,
              background: 'var(--card-bg)', color: 'var(--text-primary)',
              fontWeight: 700, fontSize: 13, textDecoration: 'none',
              fontFamily: 'Outfit,sans-serif',
              border: '1px solid var(--border-subtle)', transition: 'all .15s',
            }}
          >
            ← Visos {isNews ? 'naujienos' : 'diskusijos'}
          </Link>
        </div>
      </div>
    </div>
  )
}
