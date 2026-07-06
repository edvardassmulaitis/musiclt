// app/api/comments/route.ts
//
// Modern user-editable comments backing CommentsSection / EntityCommentsBlock.
//
// `comments` table actually uses separate FK columns per entity type
// (track_id, album_id, news_id, event_id). This API translates an
// `entity_type` + `entity_id` request from the client to the right column,
// so the consumer doesn't have to know the storage layout. Author display
// info (name + avatar) is resolved via JOIN to `profiles` so we don't have
// to denormalize on insert.

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { resolveAuthorId } from '@/lib/resolve-author'
import { rateLimit } from '@/lib/rate-limit'
import { verifyTurnstile } from '@/lib/turnstile'
import { notifyFromSession } from '@/lib/notifications'
import { logActivity } from '@/lib/activity-logger'

const EDIT_WINDOW_MINUTES = 20

type EntityType = 'track' | 'album' | 'news' | 'event' | 'discussion' | 'blog_post'
type EntityCol = 'track_id' | 'album_id' | 'news_id' | 'event_id' | 'discussion_id' | 'blog_post_id'

const ENTITY_COL: Record<EntityType, EntityCol> = {
  track: 'track_id',
  album: 'album_id',
  news: 'news_id',
  event: 'event_id',
  discussion: 'discussion_id',
  blog_post: 'blog_post_id',
}

function entityCol(t: string | null): EntityCol | null {
  if (!t) return null
  return ENTITY_COL[t as EntityType] ?? null
}

/** blog_post_id yra UUID (string), kitos entity_id — bigint (number).
 *  Apsaugom nuo parseInt('uuid-string') → NaN, kuris nulaužtų visą query'į. */
function coerceEntityId(entityType: string, entityId: string): number | string | null {
  if (entityType === 'blog_post') {
    // UUID format check — non-empty hex string with dashes (relaxed)
    const v = entityId.trim()
    return v.length >= 32 ? v : null
  }
  const n = parseInt(entityId)
  return Number.isFinite(n) && n > 0 ? n : null
}


export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const entityType = searchParams.get('entity_type')
  const entityId = searchParams.get('entity_id')
  const sort = searchParams.get('sort') || 'newest' // newest | oldest | popular
  const limit = Math.min(parseInt(searchParams.get('limit') || '100'), 1000)
  const offset = Math.max(0, parseInt(searchParams.get('offset') || '0'))

  const col = entityCol(entityType)
  if (!col || !entityId) return NextResponse.json({ comments: [] })

  const sb = createAdminClient()

  // Pre-resolve viewer's identity for is_own + admin checks. Email is the
  // stable backbone (profile UUIDs can drift across DB wipes — see
  // resolveAuthorId notes), tai email'ą lyginsim su comment author email
  // kaip primary self-detection check.
  const session = await getServerSession(authOptions)
  const viewerEmail = (session?.user as any)?.email?.toLowerCase() || null
  const viewerId = await resolveAuthorId(sb, session)
  const viewerRole = (session?.user as any)?.role
  const viewerIsAdmin = viewerRole === 'admin' || viewerRole === 'super_admin'

  // SELECT comments + JOIN profiles. `email` reikalingas is_own match'ui kai
  // author_id po wipe'o nesutampa su current'iu profile UUID.
  // music_attachments — optional column (per migration 20260428).
  //
  // SPECIAL CASE 'news': legacy news yra discussions table (legacy_kind='news'),
  // tad jų komentarai turi discussion_id, NE news_id. Modern news (admin-created)
  // turi news_id. Filtras OR su abiem column'ais — entityId vienu atveju yra
  // discussion.id (legacy), kitu — news.id (modern). Abi reikšmes ne'koliduoja
  // tarpusavy (skirtingos sequence'os).
  let query = sb
    .from('comments')
    .select('id, parent_id, author_id, body, like_count, reported_count, is_deleted, created_at, updated_at, music_attachments, profiles:author_id(username, full_name, avatar_url, email)')
    .range(offset, offset + limit - 1)

  const eid = coerceEntityId(entityType!, entityId)
  if (eid === null) return NextResponse.json({ comments: [] })
  if (entityType === 'news') {
    query = query.or(`news_id.eq.${eid},discussion_id.eq.${eid}`)
  } else {
    query = query.eq(col, eid)
  }

  if (sort === 'oldest') query = query.order('created_at', { ascending: true })
  else if (sort === 'popular') query = query.order('like_count', { ascending: false }).order('created_at', { ascending: false })
  else query = query.order('created_at', { ascending: false })

  let { data, error } = await query as { data: any; error: any }
  // Migration 20260428 dar neaplikuota? Pakartojam be music_attachments.
  if (error && /music_attachments/.test(error.message)) {
    let fallback = sb
      .from('comments')
      .select('id, parent_id, author_id, body, like_count, reported_count, is_deleted, created_at, updated_at, profiles:author_id(username, full_name, avatar_url, email)')
      .range(offset, offset + limit - 1)
      .order('created_at', { ascending: sort === 'oldest' })
    if (entityType === 'news') {
      fallback = fallback.or(`news_id.eq.${eid},discussion_id.eq.${eid}`)
    } else {
      fallback = fallback.eq(col, eid)
    }
    const fb = await fallback
    data = fb.data
    error = fb.error
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Sanitize + normalize for client.
  //   • Public users — paš salinti komentarai pilnai filtruojami (jų net
  //     nematys list'e).
  //   • Admin'ams — paliekam matomus su pilnu autorium + body, plius
  //     `is_deleted=true`, kad UI galėtų pavaizduoti dim'intus + uždrausti
  //     reactions/replies.
  const sanitized = (data || []).map((c: any) => {
    const authorEmail = (c.profiles?.email || '').toLowerCase() || null
    const isOwn = !!(viewerId && c.author_id && c.author_id === viewerId) ||
                  !!(viewerEmail && authorEmail && viewerEmail === authorEmail)
    return {
      id: c.id,
      parent_id: c.parent_id,
      user_id: c.author_id,
      // is_own — server-computed per request. Frontend should TRUST šitą,
      // ne lygint UUID/email pati. Robust against profile UUID drift.
      is_own: isOwn,
      author_name: c.profiles?.username || c.profiles?.full_name || 'Vartotojas',
      author_avatar: c.profiles?.avatar_url || null,
      body: c.body || '',
      // Po 2026-05-28c content_html drop'o — visada NULL. UI fall'asi į
      // body field'ą (BBCode render'inamas runtime). Nested blockquote
      // chain'us legacy migracijoje jau buvo flatten'inti į body.
      content_html: null,
      like_count: c.like_count || 0,
      reported_count: c.reported_count || 0,
      is_deleted: c.is_deleted,
      music_attachments: Array.isArray(c.music_attachments) ? c.music_attachments : null,
      created_at: c.created_at,
      edited_at: c.updated_at && c.updated_at !== c.created_at ? c.updated_at : null,
    }
  }).filter((c: any) => !c.is_deleted || viewerIsAdmin)

  return NextResponse.json({ comments: sanitized })
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Reikia prisijungti' }, { status: 401 })
  }
  // Anti-spam: 10 komentarų / min vienam vartotojui.
  if (!(await rateLimit(`cmt:${session.user.email}`, 10, 60))) {
    return NextResponse.json({ error: 'Per daug komentarų. Palaukite.' }, { status: 429 })
  }

  const body = await req.json()
  // Bot apsauga — tik jei UGC apsauga įjungta atskirai (TURNSTILE_PROTECT_UGC=1)
  // IR pridėtas widget'as komentarų formoje. Login captcha valdoma atskirai.
  if (process.env.TURNSTILE_PROTECT_UGC === '1' && !(await verifyTurnstile(body?.turnstileToken))) {
    return NextResponse.json({ error: 'Patvirtinkite, kad nesate robotas.' }, { status: 400 })
  }
  const { entity_type, entity_id, parent_id, text, attachments } = body
  const cleanAttachments = Array.isArray(attachments)
    ? attachments.filter((a: any) => a && typeof a === 'object').slice(0, 8)
    : null

  // Body gali būti tuščias jei vartotojas pridėjo bent vieną attachment'ą.
  const hasAttachments = !!(cleanAttachments && cleanAttachments.length > 0)
  if ((!text?.trim() || text.trim().length < 2) && !hasAttachments)
    return NextResponse.json({ error: 'Komentaras per trumpas' }, { status: 400 })
  if (text && text.trim().length > 5000)
    return NextResponse.json({ error: 'Komentaras per ilgas (max 5000)' }, { status: 400 })

  const col = entityCol(entity_type)
  if (!col || !entity_id) return NextResponse.json({ error: 'Bloga entity reikšmė' }, { status: 400 })

  const eid = coerceEntityId(entity_type, String(entity_id))
  if (eid === null) return NextResponse.json({ error: 'Bloga entity_id reikšmė' }, { status: 400 })

  const sb = createAdminClient()
  const authorId = await resolveAuthorId(sb, session)
  if (!authorId) {
    return NextResponse.json({ error: 'Tavo profilis dar nesukurtas — atsijunk ir prisijunk iš naujo' }, { status: 500 })
  }

  // Validate parent_id (if reply) belongs to same entity.
  if (parent_id) {
    const { data: parent } = await sb
      .from('comments')
      .select('id, ' + col)
      .eq('id', parent_id)
      .single()
    if (!parent || (parent as any)[col] !== eid)
      return NextResponse.json({ error: 'Tėvinis komentaras nerastas' }, { status: 404 })
  }

  const insertRow: any = {
    [col]: eid,
    parent_id: parent_id || null,
    author_id: authorId,
    body: (text || '').trim(),
  }
  if (hasAttachments) insertRow.music_attachments = cleanAttachments

  let { data, error } = await sb
    .from('comments')
    .insert(insertRow)
    .select('id, parent_id, author_id, body, like_count, created_at, updated_at, music_attachments, profiles:author_id(username, full_name, avatar_url)')
    .single() as { data: any; error: any }
  // Migration 20260428 dar neaplikuota? Pakartojam be music_attachments —
  // tekstinis komentaras vis tiek išsaugomas, attachment'ai tylia praleisti.
  if (error && /music_attachments/.test(error.message)) {
    delete insertRow.music_attachments
    const fb = await sb
      .from('comments')
      .insert(insertRow)
      .select('id, parent_id, author_id, body, like_count, created_at, updated_at, profiles:author_id(username, full_name, avatar_url)')
      .single()
    data = fb.data
    error = fb.error
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const c: any = data

  // ── Activity feed: visi komentarai populate'ina globalų "Kas vyksta". ──
  try {
    const actorName = c.profiles?.full_name || c.profiles?.username || (session.user as any)?.name || null
    const actorAvatar = c.profiles?.avatar_url || (session.user as any)?.image || null
    await logActivity({
      event_type: 'comment',
      user_id: authorId,
      actor_name: actorName,
      actor_avatar: actorAvatar,
      entity_type,
      entity_id: parseInt(entity_id),
      entity_title: (text || '').slice(0, 80),
      entity_url: buildEntityUrl(entity_type, parseInt(entity_id), sb),
    })
  } catch (e: any) {
    console.error('[activity-log] comment failed:', e?.message || e)
  }

  // ── Notification: jeigu tai reply, žinom tėvo komentaro autorių. ──────
  // Notification kūrimas yra fire-and-forget — jeigu DB klaida ar table
  // dar neegzistuoja, notifyFromSession nesvaidys (žr. lib/notifications.ts).
  try {
    if (parent_id) {
      const { data: parent } = await sb
        .from('comments')
        .select('author_id, profiles:author_id(email)')
        .eq('id', parent_id)
        .maybeSingle() as { data: any }
      const parentEmail = parent?.profiles?.email || null
      if (parent?.author_id && parent.author_id !== authorId) {
        await notifyFromSession({
          recipientUserId: parent.author_id,
          recipientEmail: parentEmail,    // ← FK fallback
          actorSession: session,
          type: 'comment_reply',
          entity_type,
          entity_id,
          url: buildEntityUrl(entity_type, parseInt(entity_id), sb),
          snippet: (text || '').slice(0, 200),
        })
      }
    }
  } catch (e: any) {
    console.error('[notifications] comment reply failed:', e?.message || e)
  }

  return NextResponse.json({
    comment: {
      id: c.id,
      parent_id: c.parent_id,
      user_id: c.author_id,
      author_name: c.profiles?.username || c.profiles?.full_name || 'Vartotojas',
      author_avatar: c.profiles?.avatar_url || null,
      body: c.body,
      like_count: c.like_count || 0,
      music_attachments: Array.isArray(c.music_attachments) ? c.music_attachments : null,
      created_at: c.created_at,
      edited_at: null,
    },
  })
}

// Best-effort URL builder for deep-linking from notification payload to the
// commented entity. Async because we lookup slug from DB (small queries, OK).
function buildEntityUrl(entityType: string, entityId: number, _sb: any): string {
  switch (entityType) {
    case 'track':       return `/dainos/${entityId}`
    case 'album':       return `/albumai/${entityId}`
    case 'news':        return `/news/${entityId}`
    case 'event':       return `/renginiai/${entityId}`
    case 'discussion':  return `/diskusijos/${entityId}` // ID, ne slug — deep link redirect'inasi
    case 'blog_post':   return `/blogas` // FE redirect'as iš ID į /blogas/<u>/<slug>
    default:            return '/'
  }
}

export async function PATCH(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email)
    return NextResponse.json({ error: 'Reikia prisijungti' }, { status: 401 })

  const body = await req.json()
  const { id, text } = body

  if (!text?.trim()) return NextResponse.json({ error: 'Turinys tuščias' }, { status: 400 })

  const sb = createAdminClient()
  const authorId = await resolveAuthorId(sb, session)
  if (!authorId) return NextResponse.json({ error: 'Profilis nerastas' }, { status: 500 })

  const { data: existing } = await sb
    .from('comments')
    .select('author_id, created_at, is_deleted')
    .eq('id', id)
    .single()

  if (!existing) return NextResponse.json({ error: 'Komentaras nerastas' }, { status: 404 })
  if (existing.author_id !== authorId)
    return NextResponse.json({ error: 'Ne tavo komentaras' }, { status: 403 })
  if (existing.is_deleted)
    return NextResponse.json({ error: 'Pašalinti komentarai neredaguojami' }, { status: 403 })

  const minutesAgo = (Date.now() - new Date(existing.created_at).getTime()) / 60000
  if (minutesAgo > EDIT_WINDOW_MINUTES)
    return NextResponse.json({ error: `Redaguoti galima tik ${EDIT_WINDOW_MINUTES} min. po parašymo` }, { status: 403 })

  const { data, error } = await sb
    .from('comments')
    .update({ body: text.trim(), updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('id, body, updated_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ comment: { id: data.id, body: data.body, edited_at: data.updated_at } })
}

export async function DELETE(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email)
    return NextResponse.json({ error: 'Reikia prisijungti' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  const role = (session.user as any).role
  const isAdmin = role === 'admin' || role === 'super_admin'

  const sb = createAdminClient()
  const authorId = await resolveAuthorId(sb, session)
  if (!authorId && !isAdmin) return NextResponse.json({ error: 'Profilis nerastas' }, { status: 500 })

  const { data: existing } = await sb
    .from('comments')
    .select('author_id, body')
    .eq('id', id!)
    .single() as { data: any }

  if (!existing) return NextResponse.json({ error: 'Nerastas' }, { status: 404 })
  if (existing.author_id !== authorId && !isAdmin)
    return NextResponse.json({ error: 'Neleistina' }, { status: 403 })

  // Soft-delete — body iš lentelės NEKLOJAM (anksčiau body: '' nuteptindavom
  // tekstą, todėl admin'as nematydavo originalo). Dabar tiesiog flag'uojam
  // is_deleted=true, original'us body lieka. Public users iš API filtruojami
  // pagal is_deleted, admin'ai mato dim'intą originalą.
  const { error } = await sb
    .from('comments')
    .update({ is_deleted: true })
    .eq('id', id!)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

/** PATCH /api/comments?action=restore&id=N — admin-only un-soft-delete.
 *  Reactyvuoja anksčiau pašalintą komentarą atgal į public matomumą.
 *  Body taip pat lieka nepakitęs (DELETE jau nebenupila body). */
export async function PUT(req: Request) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as any)?.role
  const isAdmin = role === 'admin' || role === 'super_admin'
  if (!isAdmin) {
    return NextResponse.json({ error: 'Reikia admin teisių' }, { status: 403 })
  }
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  const action = searchParams.get('action')
  if (!id || action !== 'restore') {
    return NextResponse.json({ error: 'Reikia ?action=restore&id=N' }, { status: 400 })
  }
  const sb = createAdminClient()
  const { error } = await sb
    .from('comments')
    .update({ is_deleted: false })
    .eq('id', parseInt(id))
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
