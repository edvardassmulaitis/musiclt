import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'
import { notifyFromSession } from '@/lib/notifications'
import { logActivity } from '@/lib/activity-logger'

type AttachmentIn = {
  type: 'daina' | 'albumas' | 'grupe'
  id: number
  legacy_id: number | null
  title: string
  artist: string | null
  image_url: string | null
  slug?: string
}

type PostInput = {
  thread_legacy_id: number
  parent_post_legacy_id?: number | null
  text: string
  html?: string
  attachments?: AttachmentIn[]
}

/** Sanitize WYSIWYG HTML — keep basic formatting + YouTube iframes, strip everything dangerous. */
function sanitizeHtml(raw: string): string {
  if (!raw) return ''
  let s = raw
  s = s.replace(/<script[\s\S]*?<\/script>/gi, '')
  s = s.replace(/<style[\s\S]*?<\/style>/gi, '')
  s = s.replace(/<form[\s\S]*?<\/form>/gi, '')
  s = s.replace(/<input[^>]*>/gi, '')
  s = s.replace(/<iframe([^>]*)>([\s\S]*?)<\/iframe>/gi, (m, attrs: string) => {
    const srcMatch = attrs.match(/src="([^"]+)"/i)
    if (!srcMatch) return ''
    const src = srcMatch[1]
    if (!/^https?:\/\/(www\.)?(youtube\.com|youtu\.be|youtube-nocookie\.com)\//.test(src)) return ''
    return `<iframe src="${src}" width="560" height="315" frameborder="0" allow="autoplay; encrypted-media" allowfullscreen></iframe>`
  })
  s = s.replace(/\son\w+="[^"]*"/gi, '')
  s = s.replace(/\son\w+='[^']*'/gi, '')
  s = s.replace(/javascript:/gi, '')
  return s.trim()
}

/** Fallback text-to-HTML for the case where the client didn't send html. */
function textToHtml(raw: string) {
  return raw
    .split(/\r?\n\r?\n/)
    .map((chunk) =>
      `<p>${chunk
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/\r?\n/g, '<br />')}</p>`,
    )
    .join('\n')
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Reikia prisijungti' }, { status: 401 })
  }
  let body: PostInput
  try {
    body = (await request.json()) as PostInput
  } catch {
    return NextResponse.json({ error: 'Blogas JSON' }, { status: 400 })
  }
  if (!body.thread_legacy_id || typeof body.thread_legacy_id !== 'number') {
    return NextResponse.json({ error: 'Trūksta thread_legacy_id' }, { status: 400 })
  }
  const text = (body.text ?? '').trim()
  const attachments = (body.attachments ?? []).slice(0, 10)
  if (!text && attachments.length === 0) {
    return NextResponse.json({ error: 'Tuščias komentaras' }, { status: 400 })
  }

  const sb = createAdminClient()
  const { data: thread } = await sb
    .from('forum_threads')
    .select('legacy_id')
    .eq('legacy_id', body.thread_legacy_id)
    .maybeSingle()
  if (!thread) return NextResponse.json({ error: 'Tema nerasta' }, { status: 404 })

  // Profile → username
  const { data: profile } = await sb
    .from('profiles')
    .select('username,avatar_url')
    .eq('email', session.user.email)
    .maybeSingle()

  // Build content_html — prefer the sanitized HTML from the WYSIWYG editor; fall back
  // to naive text→html when the client only sent `text`.
  let contentHtml = body.html ? sanitizeHtml(body.html) : text ? textToHtml(text) : ''
  if (attachments.length > 0) {
    const items = attachments.map((a) => ({
      type: a.type,
      legacy_id: a.legacy_id ?? a.id,
      title: a.title,
      artist: a.artist,
      image_url: a.image_url,
      fav_count: 0,
    }))
    contentHtml += `\n<div class="music-attachments" data-items='${JSON.stringify(items).replace(/'/g, '&apos;')}'></div>`
  }

  // New post: use a synthesized legacy_id = 9_000_000_000 + epoch ms (to avoid collision with music.lt IDs)
  const newLegacyId = 9_000_000_000 + Date.now()
  const authorUsername = profile?.username || session.user.name || session.user.email.split('@')[0]

  const { error } = await sb
    .from('forum_posts')
    .insert({
      legacy_id: newLegacyId,
      thread_legacy_id: body.thread_legacy_id,
      parent_post_legacy_id: body.parent_post_legacy_id ?? null,
      page_number: 1,
      author_username: authorUsername,
      author_avatar_url: profile?.avatar_url ?? session.user.image ?? null,
      created_at: new Date().toISOString(),
      content_html: contentHtml,
      content_text: text,
      like_count: 0,
      is_deleted: false,
      music_attachments: attachments.map((a) => ({
        type: a.type,
        id: a.id,
        legacy_id: a.legacy_id,
        title: a.title,
        artist: a.artist,
        image_url: a.image_url,
        slug: a.slug,
      })),
    })
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Bump post_count
  const { count } = await sb
    .from('forum_posts')
    .select('legacy_id', { count: 'exact', head: true })
    .eq('thread_legacy_id', body.thread_legacy_id)
  await sb
    .from('forum_threads')
    .update({ post_count: count ?? 0, last_post_at: new Date().toISOString() })
    .eq('legacy_id', body.thread_legacy_id)

  // ── Notification: jeigu reply į konkretų post'ą — notify parent post author.
  // Antraip (root reply į thread) — notify thread starter (jei tai ne pats sau).
  // Defensive: viskas try/catch, niekada neblokuoja primary flow.
  //
  // Recipient resolution: forum_posts.author_username gali būti:
  //   - profile.username (jei user'is turi explicit username)
  //   - profile.full_name (jei username NULL, registracija krito į name fallback)
  //   - legacy ghost username (originalus music.lt user'is)
  // Bandom visus tris būdus + email fallback createNotification'e.
  try {
    const { data: thr } = await sb
      .from('forum_threads')
      .select('legacy_id, slug, title, author_username, author_user_id')
      .eq('legacy_id', body.thread_legacy_id)
      .maybeSingle() as { data: any }
    const url = thr?.slug ? `/diskusijos/${thr.slug}` : '/diskusijos'

    // Resolve a recipient profile by trying multiple lookup strategies.
    async function resolveRecipient(authorUsername: string | null, fallbackUserId?: string | null) {
      if (!authorUsername && !fallbackUserId) return null
      // 1. Try by stored user_id (might be stale)
      if (fallbackUserId) {
        const { data: byId } = await sb.from('profiles').select('id, email').eq('id', fallbackUserId).maybeSingle() as { data: any }
        if (byId?.email && byId.email !== session!.user!.email) return { id: byId.id as string, email: byId.email as string }
      }
      if (!authorUsername) return null
      // 2. By username (explicit profile username)
      const { data: byUsername } = await sb.from('profiles').select('id, email').eq('username', authorUsername).maybeSingle() as { data: any }
      if (byUsername?.email && byUsername.email !== session!.user!.email) return { id: byUsername.id as string, email: byUsername.email as string }
      // 3. By full_name (Google OAuth display name)
      const { data: byName } = await sb.from('profiles').select('id, email').eq('full_name', authorUsername).maybeSingle() as { data: any }
      if (byName?.email && byName.email !== session!.user!.email) return { id: byName.id as string, email: byName.email as string }
      return null
    }

    let recipient: { id: string; email: string } | null = null
    if (body.parent_post_legacy_id) {
      const { data: parent } = await sb
        .from('forum_posts')
        .select('author_username')
        .eq('legacy_id', body.parent_post_legacy_id)
        .maybeSingle() as { data: any }
      recipient = await resolveRecipient(parent?.author_username || null)
    } else {
      // Root reply — notify thread starter
      recipient = await resolveRecipient(thr?.author_username || null, thr?.author_user_id || null)
    }

    if (recipient) {
      await notifyFromSession({
        recipientUserId: recipient.id,
        recipientEmail: recipient.email,
        actorSession: session,
        type: body.parent_post_legacy_id ? 'comment_reply' : 'entity_comment',
        entity_type: 'thread',
        entity_id: body.thread_legacy_id,
        url,
        title: body.parent_post_legacy_id
          ? `${authorUsername} atsakė į tavo žinutę`
          : `${authorUsername} pakomentavo „${thr?.title || 'tavo temą'}"`,
        snippet: text.slice(0, 200),
      })
    } else {
      console.log('[notifications] forum reply — no recipient resolved', {
        parent_legacy_id: body.parent_post_legacy_id,
        thread_legacy_id: body.thread_legacy_id,
      })
    }
  } catch (e: any) {
    console.error('[notifications] forum reply failed:', e?.message || e)
  }

  // ── Activity log → 'Kas vyksta' feed ────────────────────────────────
  try {
    const { data: thr } = await sb
      .from('forum_threads')
      .select('slug, title')
      .eq('legacy_id', body.thread_legacy_id)
      .maybeSingle() as { data: any }
    await logActivity({
      event_type: 'comment',
      actor_name: authorUsername,
      actor_avatar: profile?.avatar_url ?? session.user.image ?? null,
      entity_type: 'thread',
      entity_id: body.thread_legacy_id,
      entity_title: thr?.title || 'forum thread',
      entity_url: thr?.slug ? `/diskusijos/${thr.slug}` : '/diskusijos',
    })
  } catch (e: any) {
    console.error('[activity-log] forum reply failed:', e?.message || e)
  }

  return NextResponse.json({ ok: true })
}
