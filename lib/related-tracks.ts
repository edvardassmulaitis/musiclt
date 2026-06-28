// lib/related-tracks.ts
//
// „Gudri" susijusios muzikos sistema dainos puslapiui IR TrackInfoModal'ui.
//
// Tikslas (Edvardo prašymas): NE to paties atlikėjo dainos, o KITŲ atlikėjų
// PANAŠIOS dainos. Signalai:
//   1) Co-like — nariai, kurie pamėgo ŠIĄ dainą, ką dar mėgsta (stipriausias
//      „skonio" signalas; veikia tarp atlikėjų).
//   2) Populiarumas — YT peržiūros (video_views), log-skalė, panašus svoris.
//   3) Substyle peers — atlikėjai, dalinantys muzikos stilių (rezervas, kai
//      co-like duomenų mažai).
//
// Same-artist dainos NAUDOJAMOS tik kaip paskutinis rezervas (kad juosta
// niekada nebūtų tuščia), nes pagrindinis tikslas — atrasti kitus atlikėjus.

type SupabaseClient = ReturnType<typeof import('@/lib/supabase').createAdminClient>

export type RelatedItem = {
  id: number
  slug: string
  title: string
  video_url: string | null
  artistSlug: string
  artistName: string
}

type Cand = {
  id: number; slug: string; title: string; video_url: string | null
  artist_id: number; artistSlug: string; artistName: string
  views: number; coLikes: number; isPeer: boolean
}

function uniq<T>(arr: T[]): T[] { return Array.from(new Set(arr)) }

// PostgREST `in.()` saugiai — tik skaičiai, todėl join paprastas.
async function fetchTrackMeta(
  supabase: SupabaseClient,
  ids: number[],
): Promise<Map<number, Cand>> {
  const out = new Map<number, Cand>()
  if (!ids.length) return out
  // Chunk'inam, kad URL neperaugtų.
  for (let i = 0; i < ids.length; i += 80) {
    const chunk = ids.slice(i, i + 80)
    const { data } = await supabase
      .from('tracks')
      .select('id, slug, title, video_url, video_views, artist_id, artists!tracks_artist_id_fkey(slug, name)')
      .in('id', chunk)
      .not('video_url', 'is', null)
    for (const t of (data ?? []) as any[]) {
      const a = t.artists
      if (!a?.slug) continue
      out.set(t.id, {
        id: t.id, slug: t.slug, title: t.title, video_url: t.video_url,
        artist_id: t.artist_id, artistSlug: a.slug, artistName: a.name,
        views: t.video_views ?? 0, coLikes: 0, isPeer: false,
      })
    }
  }
  return out
}

export async function getRelatedTracks(
  supabase: SupabaseClient,
  opts: { trackId: number; artistId: number; limit?: number },
): Promise<RelatedItem[]> {
  const { trackId, artistId } = opts
  const limit = opts.limit ?? 14

  // ── 1. Substyle peers ──────────────────────────────────────────────────────
  let peerIds: number[] = []
  try {
    const { data: subs } = await supabase
      .from('artist_substyles').select('substyle_id').eq('artist_id', artistId)
    const subIds = uniq((subs ?? []).map((s: any) => s.substyle_id)).filter(Boolean)
    if (subIds.length) {
      const { data: peers } = await supabase
        .from('artist_substyles').select('artist_id')
        .in('substyle_id', subIds).neq('artist_id', artistId).limit(900)
      peerIds = uniq((peers ?? []).map((p: any) => p.artist_id)).slice(0, 300)
    }
  } catch { /* substyle lentelės gali nebūti */ }

  // ── 2. Co-like signalas ─────────────────────────────────────────────────────
  const coCount = new Map<number, number>()
  try {
    const { data: likers } = await supabase
      .from('likes').select('user_id')
      .eq('entity_type', 'track').eq('entity_id', trackId)
      .not('user_id', 'is', null).limit(200)
    const likerIds = uniq((likers ?? []).map((l: any) => l.user_id)).slice(0, 150)
    if (likerIds.length) {
      // Ką dar mėgsta tie patys nariai (kitos dainos).
      const { data: coLikes } = await supabase
        .from('likes').select('entity_id')
        .eq('entity_type', 'track').in('user_id', likerIds)
        .neq('entity_id', trackId).limit(5000)
      for (const r of (coLikes ?? []) as any[]) {
        coCount.set(r.entity_id, (coCount.get(r.entity_id) ?? 0) + 1)
      }
    }
  } catch { /* likes lentelė visada yra, bet saugiklis nepakenks */ }

  // ── 3. Kandidatų metaduomenys ───────────────────────────────────────────────
  // Co-like TOP dainos (pagal bendrų mėgėjų skaičių) + peer atlikėjų
  // populiariausios dainos (pagal YT peržiūras).
  const coTopIds = [...coCount.entries()]
    .sort((a, b) => b[1] - a[1]).slice(0, 80).map(([id]) => id)

  const cands = await fetchTrackMeta(supabase, coTopIds)
  for (const [id, c] of cands) c.coLikes = coCount.get(id) ?? 0

  if (peerIds.length) {
    const { data: peerTracks } = await supabase
      .from('tracks')
      .select('id, slug, title, video_url, video_views, artist_id, artists!tracks_artist_id_fkey(slug, name)')
      .in('artist_id', peerIds)
      .not('video_url', 'is', null)
      .order('video_views', { ascending: false, nullsFirst: false })
      .limit(160)
    for (const t of (peerTracks ?? []) as any[]) {
      const a = t.artists
      if (!a?.slug) continue
      const existing = cands.get(t.id)
      if (existing) { existing.isPeer = true; continue }
      cands.set(t.id, {
        id: t.id, slug: t.slug, title: t.title, video_url: t.video_url,
        artist_id: t.artist_id, artistSlug: a.slug, artistName: a.name,
        views: t.video_views ?? 0, coLikes: coCount.get(t.id) ?? 0, isPeer: true,
      })
    }
  }

  // ── 4. Skoringas ────────────────────────────────────────────────────────────
  // Išmetam: pačią dainą + TO PATIES atlikėjo dainas (norim KITŲ atlikėjų).
  const pool = [...cands.values()].filter(c => c.id !== trackId && c.artist_id !== artistId)
  const maxViews = pool.reduce((m, c) => Math.max(m, c.views), 0)
  const popScore = (v: number) => (maxViews > 0 && v > 0 ? Math.log10(v + 1) / Math.log10(maxViews + 1) : 0)
  // Co-like — dominuojantis (skonio bendrumas), bet YT populiarumas panašaus
  // svorio; substyle atitiktis — nedidelis priedas.
  const scored = pool.map(c => ({
    c,
    score: c.coLikes * 1.6 + popScore(c.views) * 1.3 + (c.isPeer ? 0.35 : 0),
  })).sort((a, b) => b.score - a.score)

  // Diversifikacija — max 1 daina iš atlikėjo.
  const seenArtist = new Set<number>()
  const out: RelatedItem[] = []
  for (const { c } of scored) {
    if (seenArtist.has(c.artist_id)) continue
    seenArtist.add(c.artist_id)
    out.push({ id: c.id, slug: c.slug, title: c.title, video_url: c.video_url, artistSlug: c.artistSlug, artistName: c.artistName })
    if (out.length >= limit) break
  }

  // ── 5. Rezervas — to paties atlikėjo top dainos, jei mažai cross-artist ──────
  if (out.length < 6) {
    const { data: own } = await supabase
      .from('tracks')
      .select('id, slug, title, video_url, artists!tracks_artist_id_fkey(slug, name)')
      .eq('artist_id', artistId).neq('id', trackId)
      .not('video_url', 'is', null)
      .order('video_views', { ascending: false, nullsFirst: false })
      .limit(12)
    const seenId = new Set(out.map(o => o.id))
    for (const t of (own ?? []) as any[]) {
      if (seenId.has(t.id)) continue
      const a = t.artists
      out.push({ id: t.id, slug: t.slug, title: t.title, video_url: t.video_url, artistSlug: a?.slug ?? '', artistName: a?.name ?? '' })
      if (out.length >= limit) break
    }
  }

  return out
}
