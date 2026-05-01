import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createPost, getAllUserPosts, type PostUpsertFields } from '@/lib/supabase-blog'
import { ensureUserBlog } from '@/lib/ensure-blog'
import { detectEmbed } from '@/lib/embed-detect'

const POST_TYPES = ['article', 'quick', 'review', 'translation', 'creation', 'journal'] as const
type PostType = typeof POST_TYPES[number]

export async function GET(_req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const posts = await getAllUserPosts(session.user.id)
    return NextResponse.json(posts)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const blog = await ensureUserBlog(session.user.id)
  if (!blog) return NextResponse.json({ error: 'Nepavyko sukurti blogo' }, { status: 500 })

  const body = await req.json()
  const postType: PostType = POST_TYPES.includes(body.post_type) ? body.post_type : 'article'

  // ── Per-type validacija ────────────────────────────────────────────────
  // Quick mode'as gali neturėti title — auto-generuojam iš embed'o; visi kiti
  // tipai reikalauja pavadinimo.
  let title = (body.title || '').trim()
  if (postType === 'quick' && !title) {
    title = body.embed_title || body.embed_url || 'Quick post'
  }
  if (!title) return NextResponse.json({ error: 'Trūksta pavadinimo' }, { status: 400 })

  // ── Slug generation ────────────────────────────────────────────────────
  const baseSlug = (body.slug || title).toLowerCase()
    .replace(/[ąčęėįšųūž]/g, (c: string) => ({ 'ą': 'a', 'č': 'c', 'ę': 'e', 'ė': 'e', 'į': 'i', 'š': 's', 'ų': 'u', 'ū': 'u', 'ž': 'z' }[c] || c))
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || `post-${Date.now()}`

  // ── Embed auto-detection: jei user'is įklijavo URL, parsinam tipą ──────
  const embedFields: Partial<PostUpsertFields> = {}
  if (body.embed_url) {
    const detected = detectEmbed(body.embed_url)
    embedFields.embed_url = body.embed_url
    embedFields.embed_type = body.embed_type || detected?.type || 'other'
    embedFields.embed_thumbnail_url = body.embed_thumbnail_url || detected?.thumbnailUrl || null
    embedFields.embed_title = body.embed_title || detected?.title || null
    embedFields.embed_html = body.embed_html || detected?.html || null
  }

  // ── Type-specific laukai ───────────────────────────────────────────────
  const data: PostUpsertFields & { slug: string } = {
    title,
    slug: baseSlug,
    content: body.content || null,
    summary: body.summary || null,
    cover_image_url: body.cover_image_url || null,
    status: body.status === 'published' ? 'published' : 'draft',
    post_type: postType,
    tags: Array.isArray(body.tags) ? body.tags.slice(0, 20).map((t: string) => String(t).trim().toLowerCase()).filter(Boolean) : [],
    ...embedFields,
  }

  if (postType === 'review') {
    data.rating = clampRating(body.rating)
    data.target_artist_id = numOrNull(body.target_artist_id)
    data.target_album_id = numOrNull(body.target_album_id)
    data.target_track_id = numOrNull(body.target_track_id)
  }

  if (postType === 'translation') {
    data.original_url = body.original_url || null
    data.original_author = body.original_author || null
    data.original_lang = body.original_lang || null
  }

  try {
    const post = await createPost(blog.id, session.user.id, data)
    return NextResponse.json(post)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

function clampRating(v: any): number | null {
  const n = Number(v)
  if (!Number.isFinite(n)) return null
  return Math.max(1, Math.min(10, Math.round(n)))
}

function numOrNull(v: any): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}
