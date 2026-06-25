import { createAdminClient } from '@/lib/supabase'
import { unstable_cache } from 'next/cache'

const MAX = 6
const WINDOW_DAYS = 7

export type HotKind = 'daily_winner' | 'daily_suggestion' | 'discussion' | 'review' | 'rising'

export type HotItem = {
  id: string
  kind: HotKind
  href: string
  title: string
  meta: string
  coverUrl?: string | null
  emoji?: string
  authorId?: string | null
  score?: number
}

function todayLT(): string {
  return new Date().toLocaleDateString('lt-LT', {
    timeZone: 'Europe/Vilnius',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .split('.')
    .reverse()
    .join('-')
}

async function _getHotItems(): Promise<HotItem[]> {
  const supabase = createAdminClient()
  const since = new Date(Date.now() - WINDOW_DAYS * 86_400_000).toISOString()
  const today = todayLT()
  const out: HotItem[] = []

  // ── 1. Vakar dienos dainos laimėtojas ───────────────────────────────────────
  try {
    const { data: winner } = await supabase
      .from('daily_song_winners')
      .select(`
        id, date, track_id,
        tracks!track_id ( title, slug, cover_url, artists!artist_id ( name ) )
      `)
      .lt('date', today)
      .order('date', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (winner) {
      const track = (winner as any).tracks
      const artist = track?.artists?.name || ''
      out.push({
        id: `dw_${winner.id}`,
        kind: 'daily_winner',
        href: '/atrasti#dienos-daina',
        title: track?.title || 'Dienos daina',
        meta: artist ? `vakar laimėjo · ${artist}` : 'vakar laimėjo',
        coverUrl: track?.cover_url ?? null,
        emoji: '🏆',
      })
    }
  } catch {}

  // ── 2. Šiandien naujausia nominacija (siūloma daina) ───────────────────────
  try {
    const { data: sugg } = await supabase
      .from('daily_song_nominations')
      .select(`
        id, user_id,
        tracks!track_id ( title, slug, cover_url, artists!artist_id ( name ) )
      `)
      .eq('date', today)
      .is('removed_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (sugg) {
      const track = (sugg as any).tracks
      const artist = track?.artists?.name || ''
      out.push({
        id: `ds_${sugg.id}`,
        kind: 'daily_suggestion',
        href: '/atrasti#dienos-daina',
        title: track?.title || 'Siūloma daina',
        meta: artist ? `${artist} · balsuok →` : 'balsuok →',
        coverUrl: track?.cover_url ?? null,
        emoji: '✨',
        authorId: (sugg as any).user_id ?? null,
      })
    }
  } catch {}

  if (out.length >= MAX) return out.slice(0, MAX)

  // ── 3. Reitinguotas užpildas ────────────────────────────────────────────────
  type Candidate = {
    item: HotItem
    engagement: number
    createdAt: string
    authorId: string | null
  }
  const candidates: Candidate[] = []

  // Apžvalgos (blog_posts, post_type='review')
  try {
    const { data: reviews } = await supabase
      .from('blog_posts')
      .select('id, slug, title, cover_image_url, user_id, like_count, comment_count, published_at, blogs:blog_id(slug)')
      .eq('status', 'published').eq('is_deleted', false)
      .eq('post_type', 'review')
      .gte('published_at', since)
      .order('published_at', { ascending: false })
      .limit(20)

    for (const r of reviews ?? []) {
      const blogSlug = (r as any).blogs?.slug
      const href = blogSlug ? `/blogai/${blogSlug}/${r.slug}` : `/blogai/${r.slug}`
      candidates.push({
        item: {
          id: `rev_${r.id}`,
          kind: 'review',
          href,
          title: r.title ?? '',
          meta: `${r.comment_count ?? 0} kom.`,
          coverUrl: r.cover_image_url ?? null,
          emoji: '⭐',
          authorId: r.user_id ?? null,
        },
        engagement: (r.like_count ?? 0) + (r.comment_count ?? 0),
        createdAt: r.published_at ?? new Date(0).toISOString(),
        authorId: r.user_id ?? null,
      })
    }
  } catch {}

  // Diskusijos
  try {
    const { data: discs } = await supabase
      .from('discussions')
      .select('id, slug, title, user_id, comment_count, like_count, created_at')
      .eq('is_deleted', false)
      .or('legacy_kind.is.null,legacy_kind.eq.discussion')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(20)

    for (const d of discs ?? []) {
      candidates.push({
        item: {
          id: `disc_${d.id}`,
          kind: 'discussion',
          href: `/diskusijos/${d.slug}`,
          title: d.title ?? '',
          meta: `${d.comment_count ?? 0} atsak.`,
          coverUrl: null,
          emoji: '💬',
          authorId: d.user_id ?? null,
        },
        engagement: (d.comment_count ?? 0) + (d.like_count ?? 0),
        createdAt: d.created_at ?? new Date(0).toISOString(),
        authorId: d.user_id ?? null,
      })
    }
  } catch {}

  // Kylantys įrašai (blog_posts, ne apžvalgos)
  try {
    const { data: posts } = await supabase
      .from('blog_posts')
      .select('id, slug, title, cover_image_url, user_id, like_count, comment_count, published_at, blogs:blog_id(slug)')
      .eq('status', 'published').eq('is_deleted', false)
      .neq('post_type', 'review')
      .gte('published_at', since)
      .order('published_at', { ascending: false })
      .limit(20)

    for (const p of posts ?? []) {
      const blogSlug = (p as any).blogs?.slug
      const href = blogSlug ? `/blogai/${blogSlug}/${p.slug}` : `/blogai/${p.slug}`
      candidates.push({
        item: {
          id: `post_${p.id}`,
          kind: 'rising',
          href,
          title: p.title ?? '',
          meta: `${p.like_count ?? 0} ♥`,
          coverUrl: p.cover_image_url ?? null,
          emoji: '📈',
          authorId: p.user_id ?? null,
        },
        engagement: (p.like_count ?? 0) + (p.comment_count ?? 0),
        createdAt: p.published_at ?? new Date(0).toISOString(),
        authorId: p.user_id ?? null,
      })
    }
  } catch {}

  // ── homepage_weight iš profiles ────────────────────────────────────────────
  const authorIds = [...new Set(candidates.map(c => c.authorId).filter((id): id is string => !!id))]
  const weightById: Record<string, number> = {}
  if (authorIds.length > 0) {
    try {
      const { data: profs } = await supabase
        .from('profiles')
        .select('id, homepage_weight')
        .in('id', authorIds)
      for (const p of (profs ?? []) as any[]) {
        weightById[p.id] = typeof p.homepage_weight === 'number' ? p.homepage_weight : 1.0
      }
    } catch {}
  }

  // ── Rikiavimas + dedup pagal autorių ───────────────────────────────────────
  const scored = candidates
    .map(c => ({
      ...c,
      score: c.engagement * (c.authorId ? (weightById[c.authorId] ?? 1.0) : 1.0),
    }))
    .sort((a, b) => b.score - a.score || (a.createdAt < b.createdAt ? 1 : -1))

  const seenAuthors = new Set<string>()
  for (const c of scored) {
    if (out.length >= MAX) break
    if (c.authorId && seenAuthors.has(c.authorId)) continue
    if (c.authorId) seenAuthors.add(c.authorId)
    out.push({ ...c.item, score: c.score })
  }

  return out.slice(0, MAX)
}

export const getHotItems = unstable_cache(_getHotItems, ['home-hot'], { revalidate: 600 })
