// app/api/atradimai/active-members/route.ts
//
// GET /api/atradimai/active-members?days=7&limit=8
//
// „Pažink narius" rail'ui /atradimai puslapyje — aktyviausi nariai per paskutines
// N dienas. Agreguojam activity_events pagal user_id, paimam top N pagal veiksmų
// skaičių, prisegam profilį (username → /@link, avatarą, vardą) ir sugeneruojam
// trumpą „antraštę" pagal dominuojantį veiksmo tipą („8 įrašai", „balsavo 12×").
//
// Tik VIEŠI realių narių veiksmai (is_public + user_id not null). Anoniminiai /
// sistemos įvykiai praleidžiami.

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'

export const revalidate = 300

type Member = {
  user_id: string
  username: string | null
  name: string | null
  avatar: string | null
  total: number
  last_active: string
  headline: string
  tastes?: string[]
  fav_artists?: { name: string; image: string | null; slug: string | null }[]
}

// Veiksmų grupavimas „antraštei". Raktas → žmogiškas daiktavardis (daugiskaita).
function headlineFor(counts: Record<string, number>): string {
  const posts = (counts['blog'] || 0) + (counts['blog_post'] || 0) + (counts['review'] || 0)
  const disc = (counts['discussion'] || 0) + (counts['thread_created'] || 0)
  const comments = counts['comment'] || 0
  const likes = (counts['track_like'] || 0) + (counts['album_like'] || 0) + (counts['artist_like'] || 0) + (counts['like'] || 0)
  const votes =
    (counts['vote'] || 0) + (counts['daily_vote'] || 0) + (counts['top_vote'] || 0) +
    (counts['voting_vote'] || 0) + (counts['nomination'] || 0) + (counts['daily_nomination'] || 0)

  // Prioritetas: kūrybiniai veiksmai pirma (jie „pažinimo" verti), tada socialiniai.
  if (posts > 0) return posts === 1 ? '1 naujas įrašas' : `${posts} įrašai`
  if (disc > 0) return disc === 1 ? 'pradėjo diskusiją' : `${disc} diskusijos`
  if (comments > 0) return comments === 1 ? '1 komentaras' : `${comments} komentarai`
  if (votes > 0) return `balsavo ${votes}×`
  if (likes > 0) return `pamėgo ${likes}×`
  return 'aktyvus narys'
}

export async function GET(req: NextRequest) {
  const days = Math.min(Math.max(parseInt(req.nextUrl.searchParams.get('days') || '7'), 1), 30)
  const limit = Math.min(Math.max(parseInt(req.nextUrl.searchParams.get('limit') || '8'), 1), 60)
  const sb = createAdminClient()

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()

  try {
    const { data, error } = await sb
      .from('activity_events')
      .select('user_id, event_type, actor_name, actor_avatar, created_at')
      .eq('is_public', true)
      .not('user_id', 'is', null)
      .gt('created_at', since)
      .order('created_at', { ascending: false })
      .limit(1500)

    if (error) return NextResponse.json({ members: [], error: error.message }, { status: 200 })

    type Agg = { total: number; last: string; counts: Record<string, number>; name: string | null; avatar: string | null }
    const byUser = new Map<string, Agg>()
    for (const e of (data || []) as any[]) {
      const uid = e.user_id as string
      if (!uid) continue
      let a = byUser.get(uid)
      if (!a) { a = { total: 0, last: e.created_at, counts: {}, name: e.actor_name || null, avatar: e.actor_avatar || null }; byUser.set(uid, a) }
      a.total += 1
      a.counts[e.event_type] = (a.counts[e.event_type] || 0) + 1
      if (!a.avatar && e.actor_avatar) a.avatar = e.actor_avatar
      if (!a.name && e.actor_name) a.name = e.actor_name
      if (e.created_at > a.last) a.last = e.created_at
    }

    // Top kandidatai pagal aktyvumą — paimam daugiau nei limit, nes dalis gali
    // neturėti username (ghost/legacy) ir iškris po profilio join'o.
    const ranked = Array.from(byUser.entries())
      .map(([user_id, a]) => ({ user_id, ...a }))
      .sort((x, y) => y.total - x.total)
      .slice(0, limit * 3)

    const ids = ranked.map(r => r.user_id)
    const profById = new Map<string, { username: string | null; full_name: string | null; avatar_url: string | null }>()
    if (ids.length) {
      const { data: profs } = await sb
        .from('profiles')
        .select('id, username, full_name, avatar_url')
        .in('id', ids)
      for (const p of (profs || []) as any[]) profById.set(p.id, { username: p.username, full_name: p.full_name, avatar_url: p.avatar_url })
    }

    const members: Member[] = []
    for (const r of ranked) {
      const p = profById.get(r.user_id)
      // Reikalingas username, kad būtų į ką nukreipti (/@username). Be jo praleidžiam.
      if (!p?.username) continue
      members.push({
        user_id: r.user_id,
        username: p.username,
        name: p.full_name || r.name || p.username,
        avatar: p.avatar_url || r.avatar || null,
        total: r.total,
        last_active: r.last,
        headline: headlineFor(r.counts),
      })
      if (members.length >= limit) break
    }

    // ── Nauji nariai — suimportuoti music.lt nariai pagal REGISTRACIJOS datą
    // (joined_legacy_at) mažėjančia tvarka. Reikalaujam avataro + tikro vardo
    // (ne „Naujokas" placeholder'io), kad sekcija atrodytų gyvai, o ne tuščiai.
    // Realios naujos registracijos (provider) natūraliai pakliūna į priekį, nes
    // jų joined_legacy_at = NULL → atskirai prepend'inam jas, jei yra. ──
    let new_members: { username: string; name: string | null; avatar: string | null; created_at: string; joined_legacy_at: string | null; tastes: string[]; fav_artists: { name: string; image: string | null; slug: string | null }[] }[] = []
    try {
      const { data: real } = await sb
        .from('profiles')
        .select('id, username, full_name, avatar_url, created_at')
        .in('provider', ['google', 'facebook', 'email'])
        .not('username', 'is', null)
        .order('created_at', { ascending: false })
        .limit(limit)
      const realMembers = (real || []).map((p: any) => ({ id: p.id as string, username: p.username, name: p.full_name || p.username, avatar: p.avatar_url, created_at: p.created_at, joined_legacy_at: null as string | null }))

      const { data: imp } = await sb
        .from('profiles')
        .select('id, username, full_name, avatar_url, created_at, joined_legacy_at')
        .not('joined_legacy_at', 'is', null)
        .not('username', 'is', null)
        .not('avatar_url', 'is', null)
        .not('full_name', 'is', null)
        .neq('full_name', 'Naujokas')
        .order('joined_legacy_at', { ascending: false })
        .limit(limit + realMembers.length)
      const impMembers = (imp || []).map((p: any) => ({ id: p.id as string, username: p.username, name: p.full_name || p.username, avatar: p.avatar_url, created_at: p.created_at, joined_legacy_at: p.joined_legacy_at as string | null }))

      const picked: typeof realMembers = []
      const seenU = new Set<string>()
      for (const m of [...realMembers, ...impMembers]) {
        if (seenU.has(m.username)) continue
        seenU.add(m.username)
        picked.push(m)
        if (picked.length >= limit) break
      }

      // Mėgstamiausi atlikėjai SU NUOTRAUKOMIS — pirmiausia „Mano muzika"
      // kuruotas rangas (profile_favorite_artists.sort_order), tada like'ai
      // (papildo / fallback). Rodom „Aktyvūs nariai" kortelėse kaip koliažą.
      type FavArt = { name: string; image: string | null; slug: string | null }
      const favArtByUser = new Map<string, FavArt[]>()
      try {
        const uids = [...new Set([...picked.map(m => m.id), ...members.map(m => m.user_id)])].filter(Boolean)
        if (uids.length) {
          const idsByUser = new Map<string, number[]>()
          const pushId = (uid: string, aid: number) => {
            if (!uid || !aid) return
            const arr = idsByUser.get(uid) || []
            if (arr.length >= 6 || arr.includes(aid)) return
            arr.push(aid); idsByUser.set(uid, arr)
          }
          // 1) „Mano muzika" kuruoti favoritai (rangas = sort_order).
          const { data: favs } = await sb
            .from('profile_favorite_artists')
            .select('user_id, artist_id, sort_order')
            .eq('bucket', 1)
            .in('user_id', uids)
            .order('sort_order', { ascending: true })
            .limit(uids.length * 10)
          for (const r of (favs || []) as any[]) pushId(r.user_id, r.artist_id)
          // 2) like'ai (naujausi) — papildo / fallback.
          const { data: lk } = await sb
            .from('likes')
            .select('user_id, entity_id, created_at')
            .eq('entity_type', 'artist')
            .in('user_id', uids)
            .order('created_at', { ascending: false })
            .limit(uids.length * 12)
          for (const r of (lk || []) as any[]) pushId(r.user_id, r.entity_id)
          // 3) atlikėjų info (vardas + nuotrauka + slug) batch'u.
          const allIds = [...new Set([...idsByUser.values()].flat())]
          const infoById = new Map<number, FavArt>()
          if (allIds.length) {
            const { data: arts } = await sb.from('artists').select('id, name, slug, cover_image_url').in('id', allIds)
            for (const a of (arts || []) as any[]) if (a.name) infoById.set(a.id, { name: a.name, image: a.cover_image_url || null, slug: a.slug || null })
          }
          for (const [uid, aids] of idsByUser) {
            favArtByUser.set(uid, aids.map(id => infoById.get(id)).filter((x): x is FavArt => !!x))
          }
        }
      } catch {}

      const tastesOf = (uid: string) => (favArtByUser.get(uid) || []).map(a => a.name).slice(0, 3)
      new_members = picked.map(m => ({ username: m.username, name: m.name, avatar: m.avatar, created_at: m.created_at, joined_legacy_at: m.joined_legacy_at, tastes: tastesOf(m.id), fav_artists: favArtByUser.get(m.id) || [] }))
      // Aktyviems nariams — tas pats.
      for (const m of members as any[]) { m.fav_artists = favArtByUser.get(m.user_id) || []; m.tastes = tastesOf(m.user_id) }
    } catch {}

    // total_active — kiek SKIRTINGŲ narių apskritai turėjo viešų veiksmų per langą
    // (ne tik top N). Naudojama header „N narių aktyvūs šią savaitę" eilutei.
    return NextResponse.json({ members, new_members, total_active: byUser.size, days })
  } catch (e: any) {
    return NextResponse.json({ members: [], error: e?.message || 'error' }, { status: 200 })
  }
}
