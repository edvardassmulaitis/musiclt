// /pokalbiai/e/[type]/[id] — bendras chat-style komentarų view'as bet kuriam
// entity (track / album / news / event). Komentarai = žinutės. Composer'is
// post'ina į /api/comments su entity_type=type.

import { redirect, notFound } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { listMyConversations, resolveViewerId } from '@/lib/chat'
import { createAdminClient } from '@/lib/supabase'
import { EntityChatLayout } from '@/components/chat/EntityChatLayout'

export const dynamic = 'force-dynamic'

const ALLOWED_TYPES = new Set(['track', 'album', 'news', 'event'])

export default async function EntityChatPage({ params }: { params: Promise<{ type: string; id: string }> }) {
  const { type, id } = await params
  if (!ALLOWED_TYPES.has(type)) notFound()
  const entityId = Number(id)
  if (!entityId || isNaN(entityId)) notFound()

  const session = await getServerSession(authOptions)
  const userId = await resolveViewerId(session)
  if (!userId) redirect(`/auth/signin?callbackUrl=/pokalbiai/e/${type}/${entityId}`)

  const sb = createAdminClient()

  // Entity meta — title, image, link į pilną entity puslapį.
  let entity: any = null
  let entityFullUrl = '/'

  if (type === 'track') {
    const { data } = await sb
      .from('tracks')
      .select('id, slug, title, cover_url, artists:artist_id(id, slug, name, cover_image_url)')
      .eq('id', entityId)
      .single()
    if (!data) notFound()
    entity = {
      id: data.id, title: data.title,
      subtitle: (data as any).artists?.name || '',
      image_url: (data as any).cover_url || (data as any).artists?.cover_image_url || null,
    }
    const aSlug = (data as any).artists?.slug
    entityFullUrl = aSlug && data.slug ? `/lt/daina/${data.slug}/${data.id}` : `/dainos/${data.id}`
  } else if (type === 'album') {
    const { data } = await sb
      .from('albums')
      .select('id, slug, title, cover_image_url, artists:artist_id(id, slug, name, cover_image_url)')
      .eq('id', entityId)
      .single()
    if (!data) notFound()
    entity = {
      id: data.id, title: data.title,
      subtitle: (data as any).artists?.name || '',
      image_url: (data as any).cover_image_url || (data as any).artists?.cover_image_url || null,
    }
    const aSlug = (data as any).artists?.slug
    entityFullUrl = aSlug && data.slug ? `/lt/albumas/${data.slug}/${data.id}` : `/albumai/${data.id}`
  } else if (type === 'news') {
    const { data } = await sb
      .from('news')
      .select('id, slug, title, image_small_url, image_title_url, excerpt')
      .eq('id', entityId)
      .single()
    if (!data) notFound()
    entity = {
      id: data.id, title: data.title,
      subtitle: (data as any).excerpt || '',
      image_url: (data as any).image_small_url || (data as any).image_title_url || null,
    }
    entityFullUrl = `/news/${data.slug || data.id}`
  } else if (type === 'event') {
    const { data } = await sb
      .from('events')
      .select('id, slug, title, image_small_url, event_date, venue_custom, venues:venue_id(name, city)')
      .eq('id', entityId)
      .single()
    if (!data) notFound()
    const venue = (data as any).venues?.name || (data as any).venue_custom || ''
    const city = (data as any).venues?.city || ''
    const date = (data as any).event_date ? new Date((data as any).event_date).toLocaleDateString('lt-LT') : ''
    entity = {
      id: data.id, title: data.title,
      subtitle: [date, venue, city].filter(Boolean).join(' · '),
      image_url: (data as any).image_small_url || null,
    }
    entityFullUrl = `/renginiai/${data.slug || data.id}`
  }

  // Komentarai (entity-specific).
  const colMap: Record<string, string> = {
    track: 'track_id', album: 'album_id', news: 'news_id', event: 'event_id',
  }
  const col = colMap[type]
  const { data: comments } = await sb
    .from('comments')
    .select('id, parent_id, author_id, body, like_count, is_deleted, created_at, updated_at, profiles:author_id(username, full_name, avatar_url, email)')
    .eq(col, entityId)
    .order('created_at', { ascending: true })
    .limit(200)

  // Sidebar feed (DM/grupės).
  let conversations: any[] = []
  try {
    conversations = await listMyConversations(userId)
  } catch (e: any) {
    if (!/relation .* does not exist|chat_user_conversations/i.test(e?.message || '')) throw e
  }

  return (
    <EntityChatLayout
      viewerId={userId}
      initialConversations={conversations}
      entityType={type as 'track' | 'album' | 'news' | 'event'}
      entity={entity}
      entityFullUrl={entityFullUrl}
      initialComments={(comments || []) as any}
    />
  )
}
