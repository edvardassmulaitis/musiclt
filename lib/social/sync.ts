// lib/social/sync.ts
//
// Bendras socialinių jungčių sinchronizavimas: paima jungtį, pasirenka
// adapterį pagal platformą, upsert'ina įrašus į artist_social_items.

import { createAdminClient } from '@/lib/supabase'
import { fetchYouTubeUploads, type NormalizedItem } from '@/lib/social/youtube'

export type Connection = {
  id: string
  artist_id: number
  platform: string
  external_id: string | null
  status: string
}

async function fetchItemsFor(conn: Connection): Promise<NormalizedItem[]> {
  switch (conn.platform) {
    case 'youtube':
      return conn.external_id ? fetchYouTubeUploads(conn.external_id, 12) : []
    // spotify / instagram / facebook — vėliau
    default:
      return []
  }
}

/** Sinchronizuoja vieną jungtį. Grąžina įdėtų įrašų kiekį. */
export async function syncConnection(conn: Connection): Promise<{ ok: boolean; count: number; error?: string }> {
  const sb = createAdminClient()
  try {
    const items = await fetchItemsFor(conn)
    if (items.length) {
      const rows = items.map((it) => ({
        artist_id: conn.artist_id,
        platform: conn.platform,
        external_id: it.external_id,
        kind: it.kind,
        url: it.url,
        media_url: it.media_url,
        thumb_url: it.thumb_url,
        caption: it.caption,
        published_at: it.published_at,
        raw: it.raw,
      }))
      await sb.from('artist_social_items').upsert(rows, { onConflict: 'platform,external_id' })
    }
    await sb.from('artist_social_connections')
      .update({ last_synced_at: new Date().toISOString(), last_error: null, status: 'active' })
      .eq('id', conn.id)
    return { ok: true, count: items.length }
  } catch (e: any) {
    await sb.from('artist_social_connections')
      .update({ last_synced_at: new Date().toISOString(), last_error: (e?.message || 'error').slice(0, 300) })
      .eq('id', conn.id)
    return { ok: false, count: 0, error: e?.message || 'error' }
  }
}

/** Sinchronizuoja visas aktyvias jungtis (cron). */
export async function syncAllConnections(limit = 500): Promise<{ synced: number; items: number }> {
  const sb = createAdminClient()
  const { data } = await sb.from('artist_social_connections')
    .select('id, artist_id, platform, external_id, status')
    .eq('status', 'active').eq('mode', 'auto')
    .order('last_synced_at', { ascending: true, nullsFirst: true })
    .limit(limit)
  const conns = (data || []) as Connection[]
  let items = 0
  for (const c of conns) {
    const r = await syncConnection(c)
    items += r.count
  }
  return { synced: conns.length, items }
}
