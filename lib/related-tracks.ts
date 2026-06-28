// lib/related-tracks.ts
//
// „Gudri" susijusios muzikos sistema dainos puslapiui IR TrackInfoModal'ui.
//
// Tikslas (Edvardo prašymas): NE to paties atlikėjo dainos, o KITŲ atlikėjų
// PANAŠAUS STILIAUS dainos. STILIUS yra FILTRAS (ne tik priedas):
//
//   1) Substyle atitiktis su IDF svoriu — kandidatai TIK iš atlikėjų,
//      dalinančių muzikos stilių (artist_substyles). Kuo RETESNIS (specifiškesnis)
//      bendras stilius, tuo DIDESNIS svoris (IDF): „Funk metal" (17 atlikėjų)
//      sveria daug daugiau nei „Alternative rock" (1000+). Tai neleidžia plačiam
//      stiliui prakišti nesusijusios pop/hip-hop muzikos.
//   2) YT populiarumas (video_views, log-skalė) — antrinis, rikiuoja stiliaus
//      viduje (kad nerodytume vien obskūrių dainų).
//   3) Co-like — nariai, pamėgę šią dainą, ką dar mėgsta — TIK kaip priedas
//      toms dainoms, kurios JAU stiliaus pool'e (NEįnešam kitų žanrų dainų).
//
// Same-artist dainos — tik paskutinis rezervas (kad juosta nebūtų tuščia).

type SupabaseClient = ReturnType<typeof import('@/lib/supabase').createAdminClient>

export type RelatedItem = {
  id: number
  slug: string
  title: string
  video_url: string | null
  artistSlug: string
  artistName: string
}

function uniq<T>(arr: T[]): T[] { return Array.from(new Set(arr)) }

export async function getRelatedTracks(
  supabase: SupabaseClient,
  opts: { trackId: number; artistId: number; limit?: number },
): Promise<RelatedItem[]> {
  const { trackId, artistId } = opts
  const limit = opts.limit ?? 14

  // ── 1. Stiliaus atitiktis (substyle) su IDF svoriu ──────────────────────────
  // artistStyle: atlikėjo_id → suminis stiliaus panašumo balas (kuo daugiau IR
  // kuo retesnių bendrų stilių su mūsų atlikėju, tuo aukštesnis).
  const artistStyle = new Map<number, number>()
  try {
    const { data: subs } = await supabase
      .from('artist_substyles').select('substyle_id').eq('artist_id', artistId)
    const subIds = uniq((subs ?? []).map((s: any) => s.substyle_id)).filter(Boolean)
    // Kiekvienam mūsų stiliui — surenkam peers IR IDF svorį (1/sqrt(peerų skaičius)).
    for (const sid of subIds) {
      const { data: peers } = await supabase
        .from('artist_substyles').select('artist_id')
        .eq('substyle_id', sid).neq('artist_id', artistId).limit(1500)
      const pids = uniq((peers ?? []).map((p: any) => p.artist_id)).filter(Boolean)
      const w = 1 / Math.sqrt(Math.max(1, pids.length))
      for (const a of pids) artistStyle.set(a, (artistStyle.get(a) ?? 0) + w)
    }
  } catch { /* substyle lentelės gali nebūti — kris į same-artist rezervą */ }

  // Top peer atlikėjai pagal stiliaus balą (apribojam tracks užklausą).
  const peerIds = [...artistStyle.entries()]
    .sort((a, b) => b[1] - a[1]).slice(0, 300).map(([id]) => id)

  // ── 2. Co-like signalas (tik kaip priedas pool viduje) ──────────────────────
  const coCount = new Map<number, number>()
  try {
    const { data: likers } = await supabase
      .from('likes').select('user_id')
      .eq('entity_type', 'track').eq('entity_id', trackId)
      .not('user_id', 'is', null).limit(200)
    const likerIds = uniq((likers ?? []).map((l: any) => l.user_id)).slice(0, 150)
    if (likerIds.length) {
      const { data: coLikes } = await supabase
        .from('likes').select('entity_id')
        .eq('entity_type', 'track').in('user_id', likerIds)
        .neq('entity_id', trackId).limit(5000)
      for (const r of (coLikes ?? []) as any[]) {
        coCount.set(r.entity_id, (coCount.get(r.entity_id) ?? 0) + 1)
      }
    }
  } catch { /* nesvarbu, jei nepavyksta */ }

  // ── 3. Kandidatų dainos — TIK iš stiliaus peer atlikėjų ─────────────────────
  if (!peerIds.length) return fallbackOwn(supabase, trackId, artistId, limit, [])

  const { data: peerTracks } = await supabase
    .from('tracks')
    .select('id, slug, title, video_url, video_views, artist_id, artists!tracks_artist_id_fkey(slug, name)')
    .in('artist_id', peerIds)
    .not('video_url', 'is', null)
    .order('video_views', { ascending: false, nullsFirst: false })
    .limit(300)

  type Cand = { id: number; slug: string; title: string; video_url: string | null; artist_id: number; artistSlug: string; artistName: string; views: number }
  const pool: Cand[] = []
  for (const t of (peerTracks ?? []) as any[]) {
    const a = t.artists
    if (!a?.slug || t.id === trackId) continue
    pool.push({
      id: t.id, slug: t.slug, title: t.title, video_url: t.video_url,
      artist_id: t.artist_id, artistSlug: a.slug, artistName: a.name,
      views: t.video_views ?? 0,
    })
  }

  // ── 4. Skoringas — STILIUS dominuoja, views antrinis, co-like priedas ───────
  const maxViews = pool.reduce((m, c) => Math.max(m, c.views), 0)
  const popScore = (v: number) => (maxViews > 0 && v > 0 ? Math.log10(v + 1) / Math.log10(maxViews + 1) : 0)
  const scored = pool.map(c => {
    const style = artistStyle.get(c.artist_id) ?? 0
    const co = Math.min(coCount.get(c.id) ?? 0, 3) // ribojam, kad keli bendri like'ai nedominuotų
    return { c, score: style * 8 + popScore(c.views) * 0.5 + co * 0.5 }
  }).sort((a, b) => b.score - a.score)

  // Diversifikacija — max 1 daina iš atlikėjo.
  const seenArtist = new Set<number>()
  const out: RelatedItem[] = []
  for (const { c } of scored) {
    if (seenArtist.has(c.artist_id)) continue
    seenArtist.add(c.artist_id)
    out.push({ id: c.id, slug: c.slug, title: c.title, video_url: c.video_url, artistSlug: c.artistSlug, artistName: c.artistName })
    if (out.length >= limit) break
  }

  // ── 5. Rezervas — to paties atlikėjo top dainos, jei stiliaus per mažai ──────
  if (out.length < 6) return fallbackOwn(supabase, trackId, artistId, limit, out)
  return out
}

// Same-artist top dainos — naudojam tik kaip rezervą.
async function fallbackOwn(
  supabase: SupabaseClient,
  trackId: number, artistId: number, limit: number, existing: RelatedItem[],
): Promise<RelatedItem[]> {
  const out = [...existing]
  const seenId = new Set(out.map(o => o.id))
  const { data: own } = await supabase
    .from('tracks')
    .select('id, slug, title, video_url, artists!tracks_artist_id_fkey(slug, name)')
    .eq('artist_id', artistId).neq('id', trackId)
    .not('video_url', 'is', null)
    .order('video_views', { ascending: false, nullsFirst: false })
    .limit(12)
  for (const t of (own ?? []) as any[]) {
    if (seenId.has(t.id)) continue
    seenId.add(t.id)
    const a = t.artists
    out.push({ id: t.id, slug: t.slug, title: t.title, video_url: t.video_url, artistSlug: a?.slug ?? '', artistName: a?.name ?? '' })
    if (out.length >= limit) break
  }
  return out
}
