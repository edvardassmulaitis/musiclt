// app/naujienos/page.tsx
//
// Naujienos feed — sujungia dvi data sources:
//   1. `news` table (modern editorial — sukurtos per /admin/news)
//   2. `discussions` table su legacy_kind='news', is_legacy=true (scraped iš
//      music.lt per group_deep_scrape canonical pipeline)
//
// Karteles linkina:
//   - modern news → /news/{slug}
//   - legacy news → /diskusijos/{slug}  (legacy bridge — rodom su same UI)
//
// Sort by date desc.

import Link from 'next/link'
import type { Metadata } from 'next'
import { createAdminClient } from '@/lib/supabase'

export const metadata: Metadata = {
  title: 'Naujienos — music.lt',
  description: 'Lietuvos ir pasaulio muzikos naujienos',
}

export const dynamic = 'force-dynamic'

type NewsItem = {
  href: string
  title: string
  date: string | null
  image_url: string | null
  artist_name: string | null
  artist_slug: string | null
  source: 'modern' | 'legacy'
}

async function getAllNews(limit = 60): Promise<NewsItem[]> {
  const sb = createAdminClient()
  const [modernRes, legacyRes] = await Promise.all([
    sb.from('news')
      .select('id, slug, title, published_at, image_small_url, artist:artist_id(name, slug)')
      .order('published_at', { ascending: false, nullsFirst: false })
      .limit(limit),
    sb.from('discussions')
      .select('id, slug, title, first_post_at, last_comment_at, created_at, artist:artist_id(name, slug, cover_image_url)')
      .eq('legacy_kind', 'news')
      .eq('is_legacy', true)
      .eq('is_deleted', false)
      .order('first_post_at', { ascending: false, nullsFirst: false })
      .limit(limit),
  ])

  const modern: NewsItem[] = ((modernRes.data || []) as any[]).map((n: any) => ({
    href: `/news/${n.slug}`,
    title: n.title,
    date: n.published_at,
    image_url: n.image_small_url,
    artist_name: n.artist?.name || null,
    artist_slug: n.artist?.slug || null,
    source: 'modern',
  }))

  const legacy: NewsItem[] = ((legacyRes.data || []) as any[]).map((d: any) => ({
    href: `/diskusijos/${d.slug}`,
    title: d.title,
    date: d.first_post_at || d.last_comment_at || d.created_at,
    image_url: d.artist?.cover_image_url || null,
    artist_name: d.artist?.name || null,
    artist_slug: d.artist?.slug || null,
    source: 'legacy',
  }))

  // Combine + sort by date desc, newest first
  const all = [...modern, ...legacy].sort((a, b) => {
    const ta = a.date ? new Date(a.date).getTime() : 0
    const tb = b.date ? new Date(b.date).getTime() : 0
    return tb - ta
  })
  return all.slice(0, limit)
}

function fmtDate(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const months = ['sausio','vasario','kovo','balandžio','gegužės','birželio',
                  'liepos','rugpjūčio','rugsėjo','spalio','lapkričio','gruodžio']
  return `${d.getFullYear()} m. ${months[d.getMonth()]} ${d.getDate()} d.`
}

export default async function NaujienosPage() {
  const items = await getAllNews(60)
  return (
    <div style={{ background: 'var(--bg-page)', minHeight: '100vh' }}>
      <div className="mx-auto px-5 py-8" style={{ maxWidth: 1200 }}>
        <h1 className="mb-2 text-3xl font-black text-[var(--text-primary)]">
          Naujienos
        </h1>
        <p className="mb-8 text-sm text-[var(--text-muted)]">
          Lietuvos ir pasaulio muzikos scenos pulsas
        </p>

        {items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[var(--border-default)] p-12 text-center text-[var(--text-muted)]">
            Naujienų dar nėra
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((item, i) => (
              <Link
                key={`${item.source}-${i}`}
                href={item.href}
                className="group flex flex-col gap-3 rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-4 transition-all hover:-translate-y-0.5 hover:border-[var(--border-strong)] hover:shadow-lg"
              >
                {item.image_url && (
                  <img
                    src={item.image_url}
                    alt={item.title}
                    className="aspect-video w-full rounded-lg object-cover"
                  />
                )}
                <div className="flex-1">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--accent-orange)]">
                    Naujiena
                  </div>
                  <h2 className="mt-1 line-clamp-3 text-[15px] font-bold leading-snug text-[var(--text-primary)]">
                    {item.title}
                  </h2>
                  <div className="mt-2 flex items-center gap-2 text-[11px] text-[var(--text-faint)]">
                    {item.artist_name && (
                      <>
                        <span className="font-semibold text-[var(--text-secondary)]">
                          {item.artist_name}
                        </span>
                        <span>·</span>
                      </>
                    )}
                    <span>{fmtDate(item.date)}</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
