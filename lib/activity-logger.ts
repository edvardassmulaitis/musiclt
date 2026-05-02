import { createAdminClient } from '@/lib/supabase'

export type ActivityEventType =
  | 'track_like'
  | 'album_like'
  | 'artist_like'
  | 'comment'
  | 'daily_nomination'
  | 'daily_vote'
  | 'top_vote'
  | 'voting_vote'
  | 'news'
  | 'event_created'
  | 'blog_post'
  | 'thread_created'

interface LogActivityParams {
  event_type: ActivityEventType
  user_id?: string | null
  actor_name?: string | null
  actor_avatar?: string | null
  entity_type?: string
  entity_id?: number | string
  entity_title?: string
  entity_url?: string
  entity_image?: string | null     // snapshot artist/album/track image URL
  metadata?: Record<string, any>
  is_public?: boolean
}

export async function logActivity(params: LogActivityParams) {
  try {
    const supabase = createAdminClient()
    const row: any = {
      event_type: params.event_type,
      user_id: params.user_id || null,
      actor_name: params.actor_name || null,
      actor_avatar: params.actor_avatar || null,
      entity_type: params.entity_type || null,
      entity_id: params.entity_id ? Number(params.entity_id) : null,
      entity_title: params.entity_title || null,
      entity_url: params.entity_url || null,
      metadata: params.metadata || {},
      is_public: params.is_public !== false,
    }
    if (params.entity_image) row.entity_image = params.entity_image
    let { error } = await supabase.from('activity_events').insert(row)
    // Defensyvus: jei migracija dar neaplikuota — pakartojam be entity_image
    if (error && /entity_image/.test(error.message)) {
      delete row.entity_image
      const fb = await supabase.from('activity_events').insert(row)
      error = fb.error
    }
    if (error) {
      console.error('[logActivity] insert failed:', error.message)
    }
  } catch (err) {
    // Nekliudyti pagrindinės logikos jei activity log'as nepavyksta
    console.error('[logActivity] error:', err)
  }
}

// Formatuoti event'o tekstą UI'ui
export function formatActivityEvent(event: {
  event_type: string
  actor_name: string | null
  entity_title: string | null
  entity_url: string | null
  metadata: any
}): { text: string; url: string | null } {
  const actor = event.actor_name || 'Kažkas'
  const entity = event.entity_title

  switch (event.event_type) {
    case 'track_like':
      return { text: `${actor} pamėgo dainą „${entity || ''}"`, url: event.entity_url }
    case 'album_like':
      return { text: `${actor} pamėgo albumą „${entity || ''}"`, url: event.entity_url }
    case 'artist_like':
      return { text: `${actor} pamėgo atlikėją ${entity || ''}`, url: event.entity_url }
    case 'comment':
      return { text: `${actor} pakomentavo „${entity || ''}"`, url: event.entity_url }
    case 'daily_nomination':
      return { text: `${actor} pasiūlė dienos dainai „${entity || ''}"`, url: '/dienos-daina' }
    case 'daily_vote':
      return { text: `${actor} balsavo už dienos dainą „${entity || ''}"`, url: '/dienos-daina' }
    case 'top_vote':
      return { text: `${actor} balsavo ${event.metadata?.top_type === 'lt_top30' ? 'LT TOP 30' : 'TOP 40'}`, url: '/topas' }
    case 'voting_vote':
      return { text: `${actor} balsavo „${entity || event.metadata?.edition_title || 'balsavime'}"`, url: event.entity_url }
    case 'news':
      return { text: `Nauja naujiena: „${entity || ''}"`, url: event.entity_url }
    case 'event_created':
      return { text: `Naujas renginys: „${entity || ''}"`, url: event.entity_url }
    case 'blog_post':
      return { text: `${actor} parašė „${entity || ''}"`, url: event.entity_url }
    case 'thread_created':
      return { text: `${actor} sukūrė temą „${entity || ''}"`, url: event.entity_url }
    default:
      return { text: `${actor} atliko veiksmą`, url: null }
  }
}
