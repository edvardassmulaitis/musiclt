// app/api/blog/posts/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getPostById, updatePost, deletePost } from '@/lib/supabase-blog'
import { resolveProfile } from '@/lib/profile-resolve'
import { detectEmbed } from '@/lib/embed-detect'

const POST_TYPES = ['article', 'review', 'translation', 'creation', 'event'] as const

// Allowlist — visi laukai, kuriuos klientas leidžia atnaujinti. Niekada
// neperduodam status/published_at sandbagging — turim explicit handling.
const ALLOWED_FIELDS = new Set([
  'title', 'content', 'summary', 'cover_image_url', 'status',
  'post_type', 'rating',
  'target_artist_id', 'target_album_id', 'target_track_id', 'target_event_id',
  'embed_url', 'embed_type', 'embed_thumbnail_url', 'embed_title', 'embed_html',
  'tags',
])

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const post = await getPostById(id)
    if (!post) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json(post)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const profile = await resolveProfile(session)
  if (!profile) return NextResponse.json({ error: 'Profilio nepavyko paruošti' }, { status: 500 })
  const { id } = await params
  const body = await req.json()

  const updates: Record<string, any> = {}
  for (const key of Object.keys(body)) {
    if (ALLOWED_FIELDS.has(key)) updates[key] = body[key]
  }

  // ── Validation: post_type ─────────────────────────────────────────────
  if (updates.post_type && !POST_TYPES.includes(updates.post_type)) {
    return NextResponse.json({ error: 'Netinkamas tipas' }, { status: 400 })
  }

  // ── Embed re-detection: jei URL keičiasi, perskaičiuojam metadata ─────
  if (updates.embed_url) {
    const detected = detectEmbed(updates.embed_url)
    if (detected) {
      updates.embed_type = updates.embed_type || detected.type
      updates.embed_html = updates.embed_html || detected.html
      updates.embed_thumbnail_url = updates.embed_thumbnail_url || detected.thumbnailUrl
    }
  }

  // ── Rating clamp ──────────────────────────────────────────────────────
  if (updates.rating !== undefined && updates.rating !== null) {
    const n = Number(updates.rating)
    updates.rating = Number.isFinite(n) ? Math.max(1, Math.min(10, Math.round(n))) : null
  }

  // ── Tags normalize ────────────────────────────────────────────────────
  if (Array.isArray(updates.tags)) {
    updates.tags = updates.tags
      .slice(0, 20)
      .map((t: any) => String(t).trim().toLowerCase())
      .filter(Boolean)
  }

  // ── Publish handling: nustatom published_at kai pereinama į published ─
  if (updates.status === 'published') {
    updates.published_at = new Date().toISOString()
  }

  try {
    await updatePost(id, profile.id, updates)
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const profile = await resolveProfile(session)
  if (!profile) return NextResponse.json({ error: 'Profilio nepavyko paruošti' }, { status: 500 })
  const { id } = await params
  try {
    await deletePost(id, profile.id)
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
