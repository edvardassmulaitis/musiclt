import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createPost, getAllUserPosts, type PostUpsertFields } from '@/lib/supabase-blog'
import { ensureUserBlog } from '@/lib/ensure-blog'
import { resolveProfile } from '@/lib/profile-resolve'
import { detectEmbed } from '@/lib/embed-detect'
import { logActivity } from '@/lib/activity-logger'

const POST_TYPES = ['article', 'review', 'translation', 'creation', 'event'] as const
type PostType = typeof POST_TYPES[number]

export async function GET(_req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const profile = await resolveProfile(session)
  if (!profile) return NextResponse.json({ error: 'Profilio nepavyko paruošti' }, { status: 500 })
  try {
    const posts = await getAllUserPosts(profile.id)
    return NextResponse.json(posts)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Prisijunk' }, { status: 401 })

  const profile = await resolveProfile(session)
  if (!profile) {
    return NextResponse.json({ error: 'Profilio nepavyko paruošti' }, { status: 500 })
  }

  // ensureUserBlog gali mest'i: blog insert failed (RLS, schema mismatch,
  // slug collision twice). Wrap'inam, kad klientas matytų tikslią klaidą.
  let blog
  try {
    blog = await ensureUserBlog(profile)
  } catch (e: any) {
    console.error('[blog/posts] ensureUserBlog failed:', e?.message || e)
    return NextResponse.json({ error: `Nepavyko paruošti blogo: ${e?.message || 'unknown'}` }, { status: 500 })
  }
  if (!blog) return NextResponse.json({ error: 'Blog\'o sukurti nepavyko — bandyk dar kartą' }, { status: 500 })

  const body = await req.json()
  const postType: PostType = POST_TYPES.includes(body.post_type) ? body.post_type : 'article'

  // Visi tipai reikalauja pavadinimo. Vertimas išimties būdu — jei nėra
  // title'o, generuojam iš dainos pavadinimo (per target_track_id, nors
  // čia neskaičiuojam — šitą padarys frontend default'as).
  const title = (body.title || '').trim()
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
    // Tik track_id reikalingas — autorius/kalba implicit'iški (track.artist + EN→LT)
    data.target_track_id = numOrNull(body.target_track_id)
  }

  if (postType === 'event') {
    // events.id yra UUID — perduodam kaip string'ą
    if (body.target_event_id) {
      ;(data as any).target_event_id = String(body.target_event_id)
    }
  }

  try {
    const post = await createPost(blog.id, profile.id, data)

    // ── Activity feed: tik kai status='published' (draft'ai feed'e nepasirodo)
    try {
      const p: any = post
      if (p?.status === 'published') {
        const url = blog.slug && p.slug ? `/blogas/${blog.slug}/${p.slug}` : '/blogas'
        await logActivity({
          event_type: 'blog_post',
          user_id: profile.id,
          actor_name: profile.full_name || profile.username || null,
          actor_avatar: profile.avatar_url || null,
          entity_type: 'blog',
          entity_id: typeof p.id === 'number' ? p.id : null,
          entity_title: p.title || 'įrašas',
          entity_url: url,
          entity_image: p.cover_image_url || null,
        })
      }
    } catch (e: any) {
      console.error('[activity-log] blog_post failed:', e?.message || e)
    }

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
