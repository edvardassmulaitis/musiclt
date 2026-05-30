import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'

// Tik VIEŠI bendruomenės veiksmai — admin/sistema (naujienos, renginio sukūrimas)
// NErodomi „Kas vyksta" sraute. Šitas allowlist'as filtruoja event_type'us
// kliento prašymu (2026-05-30): anksčiau `news`/`event_created` rodydavo
// „atnaujino …" tipo eilutes (admin veiksmai), o nežinomi tipai (top_vote,
// artist_like, …) krisdavo į „atnaujino" fallback'ą. Dabar — tik realūs narių
// veiksmai.
const PUBLIC_EVENT_TYPES = [
  'track_like', 'album_like', 'artist_like',
  'comment',
  'nomination', 'daily_nomination', 'daily_vote', 'vote',
  'top_vote', 'voting_vote',
  'blog', 'blog_post',
  'discussion', 'thread_created',
  'review', 'follow',
]

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const limit = parseInt(searchParams.get('limit') || '50')
  const since = searchParams.get('since')
  const supabase = createAdminClient()

  // entity_image — snapshot artist/album/track cover URL'as. Pre-migration
  // deploy'uose šios column'os dar nėra → fallback'inam be jos.
  async function fetchWith(includeImage: boolean) {
    const cols = includeImage
      ? 'id, event_type, user_id, actor_name, actor_avatar, entity_type, entity_id, entity_title, entity_url, entity_image, metadata, created_at'
      : 'id, event_type, user_id, actor_name, actor_avatar, entity_type, entity_id, entity_title, entity_url, metadata, created_at'
    let q = supabase
      .from('activity_events')
      .select(cols)
      .eq('is_public', true)
      .in('event_type', PUBLIC_EVENT_TYPES)
      .order('created_at', { ascending: false })
      .limit(limit)
    if (since) q = q.gt('created_at', since)
    return await q
  }

  let { data, error } = await fetchWith(true)
  if (error && /entity_image/.test(error.message || '')) {
    const fb = await fetchWith(false)
    data = fb.data
    error = fb.error
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // ── Mini nuotraukos (FIX 3): jei snapshot entity_image tuščias, batch'iniu
  //    būdu išsprendžiam entity → atvaizdą. track → cover_url/YT thumb/atlikėjo
  //    nuotrauka; album → cover_image_url; artist → cover_image_url. Po vieną
  //    užklausą per tipą — pigu (feed limit ≤ 50). ──
  const rows = (data || []) as any[]
  const needImg = rows.filter(r => !r.entity_image && r.entity_id && r.entity_type)
  if (needImg.length) {
    const byType: Record<string, Set<number>> = {}
    for (const r of needImg) {
      ;(byType[r.entity_type] ||= new Set()).add(Number(r.entity_id))
    }
    const trackImg = new Map<number, string>()
    const albumImg = new Map<number, string>()
    const artistImg = new Map<number, string>()
    const YT_RE = /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([A-Za-z0-9_-]{11})/
    try {
      const tasks: Promise<any>[] = []
      if (byType.track?.size) {
        tasks.push(supabase.from('tracks')
          .select('id, cover_url, video_url, artist:artist_id(cover_image_url)')
          .in('id', Array.from(byType.track))
          .then(({ data }) => {
            for (const t of (data || []) as any[]) {
              const yt = t.video_url?.match?.(YT_RE)?.[1]
              const art = Array.isArray(t.artist) ? t.artist[0] : t.artist
              const img = t.cover_url || (yt ? `https://img.youtube.com/vi/${yt}/mqdefault.jpg` : null) || art?.cover_image_url
              if (img) trackImg.set(t.id, img)
            }
          }))
      }
      if (byType.album?.size) {
        tasks.push(supabase.from('albums')
          .select('id, cover_image_url')
          .in('id', Array.from(byType.album))
          .then(({ data }) => { for (const a of (data || []) as any[]) if (a.cover_image_url) albumImg.set(a.id, a.cover_image_url) }))
      }
      if (byType.artist?.size) {
        tasks.push(supabase.from('artists')
          .select('id, cover_image_url')
          .in('id', Array.from(byType.artist))
          .then(({ data }) => { for (const a of (data || []) as any[]) if (a.cover_image_url) artistImg.set(a.id, a.cover_image_url) }))
      }
      await Promise.all(tasks)
      for (const r of rows) {
        if (r.entity_image || !r.entity_id) continue
        const id = Number(r.entity_id)
        r.entity_image =
          r.entity_type === 'track' ? trackImg.get(id) || null
          : r.entity_type === 'album' ? albumImg.get(id) || null
          : r.entity_type === 'artist' ? artistImg.get(id) || null
          : null
      }
    } catch {}
  }

  return NextResponse.json({ events: rows })
}
