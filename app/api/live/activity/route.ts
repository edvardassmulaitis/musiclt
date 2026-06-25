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

  // ── Ištrinto turinio filtras (2026-06-10): jei narys ištrynė įrašą/diskusiją,
  //    event'as likdavo sraute ir mesdavo į 404. Batch'u patikrinam, ar entity
  //    dar egzistuoja, ir dingusius išmetam. ──
  let alive = (data || []) as any[]
  try {
    const blogIds = [...new Set(alive.filter(r => r.entity_type === 'blog' && r.entity_id).map(r => Number(r.entity_id)))]
    const discIds = [...new Set(alive.filter(r => r.entity_type === 'discussion' && r.entity_id).map(r => Number(r.entity_id)))]
    const E = { data: [] as any[] }
    const [bp, dc] = await Promise.all([
      blogIds.length ? supabase.from('blog_posts').select('id').eq('status', 'published').eq('is_deleted', false).in('id', blogIds) : Promise.resolve(E),
      discIds.length ? supabase.from('discussions').select('id').eq('is_deleted', false).in('id', discIds) : Promise.resolve(E),
    ])
    const liveBlog = new Set((((bp as any).data || []) as any[]).map(x => x.id))
    const liveDisc = new Set((((dc as any).data || []) as any[]).map(x => x.id))
    alive = alive.filter(r => {
      if (r.entity_type === 'blog' && r.entity_id) return liveBlog.has(Number(r.entity_id))
      if (r.entity_type === 'discussion' && r.entity_id) return liveDisc.has(Number(r.entity_id))
      return true
    })
  } catch {}

  // ── Kanoninių URL'ų + mini nuotraukų perskaičiavimas (FIX 2026-06-23) ──
  //
  //  entity_url buvo įrašytas log'inimo metu su tuometiniu formatu, kuris dažnai
  //  pasenęs arba klaidingas → „Kas vyksta" nuorodos metė į 404. Pvz.:
  //    • album_like rašė /atlikejai/{artistSlug}/{albumSlug} — toks route'as
  //      NIEKADA neegzistavo (albumai gyvena /albumai/{slug}-{id}).
  //    • comment rašė /albumai/{id} bei /dainos/{id} (be slug) — [slugId]
  //      route'as reikalauja `-{id}` su slug prefiksu → 404.
  //    • seni track/artist event'ai turi pre-slug formato URL'us.
  //
  //  Sprendimas: NEPASITIKIM įrašytu entity_url — perskaičiuojam iš
  //  entity_type+entity_id pagal DABARTINĮ kanoninį formatą:
  //    track  → /dainos/{artistSlug}-{trackSlug}-{id}
  //    album  → /albumai/{artistSlug}-{albumSlug}-{id}
  //    artist → /atlikejai/{artistSlug}
  //  SVARBU: URL'ą perrašom TIK „nuoroda-į-entity" event'ams (like/comment/...),
  //  o NE balsavimams/pasiūlymams (nomination/daily_vote/top_vote rodo
  //  /dienos-daina, /top40 ir pan. — jų URL paliekam nepaliestą).
  //  Tuo pačiu batch'u užpildom ir mini nuotrauką (jei snapshot tuščias).
  const rows = alive

  // Event'ai, kurių nuoroda turi vesti į pačios entity (atlikėjo/albumo/dainos)
  // puslapį. Kitiems (top_vote, daily_vote, nomination, blog, discussion…)
  // paliekam įrašytą entity_url.
  const ENTITY_LINK_EVENTS = new Set(['track_like', 'album_like', 'artist_like', 'like', 'comment', 'review', 'follow'])

  const idsByType: Record<string, Set<number>> = {}
  for (const r of rows) {
    if (r.entity_id && (r.entity_type === 'track' || r.entity_type === 'album' || r.entity_type === 'artist')) {
      ;(idsByType[r.entity_type] ||= new Set()).add(Number(r.entity_id))
    }
  }

  const trackInfo = new Map<number, { url: string | null; img: string | null }>()
  const albumInfo = new Map<number, { url: string | null; img: string | null }>()
  const artistInfo = new Map<number, { url: string | null; img: string | null }>()
  const YT_RE = /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([A-Za-z0-9_-]{11})/
  const oneArtist = (a: any) => (Array.isArray(a) ? a[0] : a)

  if (idsByType.track || idsByType.album || idsByType.artist) {
    try {
      const tasks: PromiseLike<any>[] = []
      if (idsByType.track?.size) {
        tasks.push(supabase.from('tracks')
          .select('id, slug, cover_url, video_url, artist:artist_id(slug, cover_image_url)')
          .in('id', Array.from(idsByType.track))
          .then(({ data }) => {
            for (const t of (data || []) as any[]) {
              const art = oneArtist(t.artist)
              const yt = t.video_url?.match?.(YT_RE)?.[1]
              const img = t.cover_url || (yt ? `https://img.youtube.com/vi/${yt}/mqdefault.jpg` : null) || art?.cover_image_url || null
              const url = art?.slug && t.slug ? `/dainos/${art.slug}-${t.slug}-${t.id}` : null
              trackInfo.set(t.id, { url, img })
            }
          }))
      }
      if (idsByType.album?.size) {
        tasks.push(supabase.from('albums')
          .select('id, slug, cover_image_url, artist:artist_id(slug)')
          .in('id', Array.from(idsByType.album))
          .then(({ data }) => {
            for (const a of (data || []) as any[]) {
              const art = oneArtist(a.artist)
              const url = art?.slug && a.slug ? `/albumai/${art.slug}-${a.slug}-${a.id}` : null
              albumInfo.set(a.id, { url, img: a.cover_image_url || null })
            }
          }))
      }
      if (idsByType.artist?.size) {
        tasks.push(supabase.from('artists')
          .select('id, slug, cover_image_url')
          .in('id', Array.from(idsByType.artist))
          .then(({ data }) => {
            for (const a of (data || []) as any[]) {
              const url = a.slug ? `/atlikejai/${a.slug}` : null
              artistInfo.set(a.id, { url, img: a.cover_image_url || null })
            }
          }))
      }
      await Promise.all(tasks)

      for (const r of rows) {
        if (!r.entity_id) continue
        const id = Number(r.entity_id)
        const info =
          r.entity_type === 'track' ? trackInfo.get(id)
          : r.entity_type === 'album' ? albumInfo.get(id)
          : r.entity_type === 'artist' ? artistInfo.get(id)
          : null
        if (!info) continue
        // Mini nuotrauką užpildom visiems (jei snapshot tuščias).
        if (!r.entity_image && info.img) r.entity_image = info.img
        // URL'ą perrašom tik nuoroda-į-entity event'ams ir tik kai turim
        // patikimą kanoninį (kitaip paliekam įrašytą).
        if (info.url && ENTITY_LINK_EVENTS.has(r.event_type)) r.entity_url = info.url
      }
    } catch {}
  }

  return NextResponse.json({ events: rows })
}
