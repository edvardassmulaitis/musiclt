// app/api/discoveries/submit/route.ts
//
// Narys prideda naują atradimą: embed URL (YT/Spotify) + aprašymas + (nebūtina)
// atlikėjas/daina. Sistema parsina embed'ą, bando susieti atlikėją su DB (vardo
// sutapimas); jei neranda — atradimas patenka į admin „trūkstamų" eilę.

import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { resolveAuthorId } from '@/lib/resolve-author'

const YT_RE = /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/i
const SP_RE = /open\.spotify\.com\/(?:embed\/)?(track|album|artist|playlist)\/([A-Za-z0-9]+)/i

function parseEmbed(url: string): { type: string; id: string } | null {
  if (!url) return null
  const sp = url.match(SP_RE)
  if (sp) return { type: 'spotify_' + sp[1].toLowerCase(), id: sp[2] }
  const yt = url.match(YT_RE)
  if (yt) return { type: 'youtube', id: yt[1] }
  return null
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Reikia prisijungti' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const desc = (body.description || '').toString().trim()
  const embedUrl = (body.embed_url || '').toString().trim()
  const artistName = (body.artist_name || '').toString().trim() || null
  const trackName = (body.track_name || '').toString().trim() || null

  const emb = parseEmbed(embedUrl)
  if (!emb && !desc) {
    return NextResponse.json({ error: 'Įdėk embed nuorodą (YouTube/Spotify) arba aprašymą' }, { status: 400 })
  }
  if (embedUrl && !emb) {
    return NextResponse.json({ error: 'Nuoroda neatpažinta — palaikom YouTube ir Spotify' }, { status: 400 })
  }

  const sb = createAdminClient()
  const uid = await resolveAuthorId(sb, session)
  if (!uid) return NextResponse.json({ error: 'Profilis nerastas' }, { status: 500 })

  // Bandom susieti atlikėją
  let artist_id: number | null = null
  let resolve_state = artistName ? 'needs_import' : 'pending'
  if (artistName) {
    const { data: a } = await sb.from('artists').select('id').ilike('name', artistName).limit(1).maybeSingle()
    if (a?.id) { artist_id = a.id; resolve_state = 'resolved' }
  }

  const createdAt = new Date().toISOString()
  const { data, error } = await sb.from('discoveries').insert({
    source: 'user',
    author_id: uid,
    body: desc || null,
    artist_name: artistName,
    artist_id,
    track_name: trackName,
    embed_type: emb?.type || null,
    embed_id: emb?.id || null,
    resolve_state,
    created_at: createdAt,
  }).select('id, artists:artist_id(slug, name)').maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Pending eilė admin'ui jei neišspręsta
  if (resolve_state === 'needs_import' && data?.id) {
    await sb.from('discovery_pending_artist').insert({
      raw_name: artistName,
      youtube_id: emb?.type === 'youtube' ? emb.id : null,
      spotify_id: emb?.type?.startsWith('spotify') ? emb!.id : null,
      discovery_id: data.id,
    }).then(() => {}, () => {})
  }

  // ISR puslapis atsinaujina iškart — naujas atradimas matomas viršuje
  // be 600s laukimo.
  revalidatePath('/muzikos-atradimai')

  // Autoriaus profilis — klientas optimistiškai prepend'ina pilną kortelę.
  const { data: prof } = await sb.from('profiles')
    .select('username, full_name, avatar_url').eq('id', uid).maybeSingle()

  const discovery = {
    id: data?.id ?? 0,
    comment_id: null,
    created_at: createdAt,
    body: desc || null,
    like_count: 0,
    author: prof ? { username: prof.username, full_name: prof.full_name, avatar_url: prof.avatar_url } : null,
    artist_name: artistName ?? (data as any)?.artists?.name ?? null,
    artist_id,
    artist_slug: (data as any)?.artists?.slug ?? null,
    track_name: trackName,
    track_id: null,
    track_slug: null,
    album_name: null,
    album_id: null,
    album_slug: null,
    embed_type: emb?.type || null,
    embed_id: emb?.id || null,
    resolve_state,
    is_lt: false,
    tags: [] as string[],
  }

  return NextResponse.json({ ok: true, id: data?.id, linked: resolve_state === 'resolved', discovery })
}
