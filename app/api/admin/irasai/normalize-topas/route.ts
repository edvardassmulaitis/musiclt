// app/api/admin/irasai/normalize-topas/route.ts
//
// POST { id } → konvertuoja topo list_items iš legacy plain-text formato į naują
// entity formatą (kaip kuriant topą per wizard'ą), su DB automatch.
//
//   • Auto-match: findConfidentMatch (atlikėjas + daina sutampa po normalizacijos)
//     → entity_id + cover. Borrow iš external topų valdymo (lib/chart-resolve).
//   • Jei randa atlikėją, bet ne dainą → match_state='artist_only' (FLAG: reikia
//     sukurti/priskirti dainą). Tuščia vieta lieka placeholder'iu, „dega" admine.
//   • Nerado nieko → match_state='unmatched' (placeholder, reikia kurti).
//
// Scrape vyksta → daug dainų DB dar nebus; nerasti įrašai lieka flag'ais.

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { findConfidentMatch, normalizeForMatch, primaryArtist } from '@/lib/chart-resolve'

export const maxDuration = 60

async function requireAdmin() {
  const session = await getServerSession(authOptions)
  if (!session?.user || !['admin', 'super_admin'].includes((session.user as any).role || '')) return null
  return session
}

const YT_RE = /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([A-Za-z0-9_-]{11})/
function ytThumb(url?: string | null): string | null {
  const m = url?.match?.(YT_RE)?.[1]
  return m ? `https://img.youtube.com/vi/${m}/mqdefault.jpg` : null
}

// Randa atlikėją be kūrimo (normalizuotas lookup). Grąžina {id,slug,cover}|null.
async function findArtistOnly(sb: any, rawArtist: string): Promise<{ id: number; slug: string | null; cover: string | null } | null> {
  const name = primaryArtist(rawArtist) || rawArtist
  const nNorm = normalizeForMatch(name)
  if (!nNorm) return null
  const tok = (name.split(/[^\p{L}\p{N}]+/u).filter(t => t.length >= 2).sort((a, b) => b.length - a.length)[0] || name).replace(/[%_]/g, '')
  const { data } = await sb.from('artists').select('id, name, slug, cover_image_url').ilike('name', `%${tok}%`).limit(60)
  const hit = (data || []).find((a: any) => normalizeForMatch(a.name) === nNorm)
  return hit ? { id: hit.id, slug: hit.slug || null, cover: hit.cover_image_url || null } : null
}

type RawEntry = { rank: number; artist: string; title: string | null; comment: string | null; rating: number | null; keep?: any }

export async function POST(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  const id = body.id
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const sb = createAdminClient()
  const { data: post, error } = await sb.from('blog_posts').select('id, post_type, list_items').eq('id', id).maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!post) return NextResponse.json({ error: 'not found' }, { status: 404 })
  if (post.post_type !== 'topas') return NextResponse.json({ error: 'ne topas' }, { status: 400 })
  const list = Array.isArray(post.list_items) ? post.list_items : []
  if (!list.length) return NextResponse.json({ error: 'tuščias list_items' }, { status: 400 })

  // 1) Suvienodinam į RawEntry (palaikom abu formatus).
  const raws: RawEntry[] = list.map((e: any, i: number) => {
    const isNew = e && ('rank' in e || 'entity_id' in e)
    // Jau gerai sumatchintus naujo formato įrašus paliekam (keep).
    if (isNew && e.entity_id != null) {
      return { rank: e.rank ?? i + 1, artist: e.artist || '', title: e.type === 'artist' ? null : (e.title || null), comment: e.comment ?? null, rating: e.rating ?? null, keep: e }
    }
    const artist = e.artist || e.artist_name || ''
    const title = (e.type === 'artist') ? null : (e.title || e.track_title || null)
    return {
      rank: e.rank ?? e.position ?? i + 1,
      artist,
      title,
      comment: e.comment ?? e.description ?? null,
      rating: e.rating ?? null,
    }
  })

  // 2) Match (chunked parallel, kad greitai).
  type Resolved = { raw: RawEntry; trackId?: number; artistId?: number; state: 'matched' | 'artist_only' | 'unmatched' | 'kept'; isArtistEntry?: boolean }
  const resolved: Resolved[] = new Array(raws.length)
  const idxs = raws.map((_, i) => i)
  const CHUNK = 8
  for (let s = 0; s < idxs.length; s += CHUNK) {
    const slice = idxs.slice(s, s + CHUNK)
    await Promise.all(slice.map(async (i) => {
      const r = raws[i]
      if (r.keep) { resolved[i] = { raw: r, state: 'kept' }; return }
      if (r.title && r.title.trim()) {
        const m = await findConfidentMatch(sb, r.artist, r.title).catch(() => null)
        if (m) { resolved[i] = { raw: r, trackId: m.trackId, artistId: m.artistId, state: 'matched' }; return }
        const a = await findArtistOnly(sb, r.artist).catch(() => null)
        resolved[i] = a ? { raw: r, artistId: a.id, state: 'artist_only' } : { raw: r, state: 'unmatched' }
      } else {
        // Atlikėjo topas (be dainos)
        const a = await findArtistOnly(sb, r.artist).catch(() => null)
        resolved[i] = a ? { raw: r, artistId: a.id, state: 'matched', isArtistEntry: true } : { raw: r, state: 'unmatched', isArtistEntry: true }
      }
    }))
  }

  // 3) Cover/slug resolve (batch).
  const trackIds = [...new Set(resolved.filter(r => r.trackId).map(r => r.trackId!))]
  const artistIds = [...new Set(resolved.filter(r => r.artistId).map(r => r.artistId!))]
  const trackInfo = new Map<number, { slug: string | null; image: string | null }>()
  const artistInfo = new Map<number, { slug: string | null; image: string | null }>()
  if (trackIds.length) {
    const { data } = await sb.from('tracks').select('id, slug, cover_url, video_url, artists:artist_id(cover_image_url)').in('id', trackIds)
    for (const t of (data || []) as any[]) {
      const ac = Array.isArray(t.artists) ? t.artists[0]?.cover_image_url : t.artists?.cover_image_url
      trackInfo.set(t.id, { slug: t.slug || null, image: ytThumb(t.video_url) || t.cover_url || ac || null })
    }
  }
  if (artistIds.length) {
    const { data } = await sb.from('artists').select('id, slug, cover_image_url').in('id', artistIds)
    for (const a of (data || []) as any[]) artistInfo.set(a.id, { slug: a.slug || null, image: a.cover_image_url || null })
  }

  // 4) Naujas list_items (ListItem formatas + match_state flag).
  const newItems = resolved.map((r, i) => {
    if (r.state === 'kept') return r.raw.keep
    const base = { rank: r.raw.rank, title: r.raw.title || r.raw.artist || '?', artist: r.raw.artist || null, comment: r.raw.comment, rating: r.raw.rating }
    if (r.state === 'matched' && r.isArtistEntry && r.artistId) {
      const a = artistInfo.get(r.artistId)
      return { ...base, type: 'artist', entity_id: r.artistId, entity_slug: a?.slug || null, image_url: a?.image || null, match_state: 'matched' }
    }
    if (r.state === 'matched' && r.trackId) {
      const t = trackInfo.get(r.trackId)
      return { ...base, type: 'track', entity_id: r.trackId, entity_slug: t?.slug || null, image_url: t?.image || null, match_state: 'matched' }
    }
    if (r.state === 'artist_only' && r.artistId) {
      const a = artistInfo.get(r.artistId)
      // Atlikėjas yra, daina trūksta → placeholder/flag.
      return { ...base, type: 'track', entity_id: null, entity_slug: null, image_url: a?.image || null, match_state: 'artist_only', artist_id_hint: r.artistId }
    }
    // Nerado nieko → placeholder/flag.
    return { ...base, type: r.isArtistEntry ? 'artist' : 'track', entity_id: null, entity_slug: null, image_url: null, match_state: 'unmatched' }
  })

  const summary = {
    total: newItems.length,
    matched: resolved.filter(r => r.state === 'matched').length,
    kept: resolved.filter(r => r.state === 'kept').length,
    artist_only: resolved.filter(r => r.state === 'artist_only').length,
    unmatched: resolved.filter(r => r.state === 'unmatched').length,
  }

  const { error: upErr } = await sb.from('blog_posts').update({ list_items: newItems, homepage_reviewed_at: new Date().toISOString() }).eq('id', id)
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })

  return NextResponse.json({ ok: true, summary, items: newItems })
}
