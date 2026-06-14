// Soc. postų embed valdymas.
//   GET    ?artistId=  → viešas aktyvių embed'ų sąrašas (profiliui)
//   POST   { artistId, url, caption? }  → prideda embed (team)
//   DELETE { artistId, id }             → pašalina (team)

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { requireStudioAccess } from '@/lib/artist-studio'
import { detectPlatform, normalizeSocialUrl } from '@/lib/social-embed'

export async function GET(req: NextRequest) {
  const artistId = Number(new URL(req.url).searchParams.get('artistId'))
  if (!Number.isFinite(artistId) || artistId <= 0) {
    return NextResponse.json({ embeds: [] })
  }
  try {
    const sb = createAdminClient()
    const { data } = await sb
      .from('artist_social_embeds')
      .select('id, platform, url, caption, sort_order')
      .eq('artist_id', artistId)
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: false })
    return NextResponse.json({ embeds: data || [] })
  } catch {
    return NextResponse.json({ embeds: [] })
  }
}

export async function POST(req: NextRequest) {
  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Blogas body' }, { status: 400 }) }
  const artistId = Number(body?.artistId)
  if (!Number.isFinite(artistId) || artistId <= 0) return NextResponse.json({ error: 'Trūksta artistId' }, { status: 400 })

  const { ok, reason } = await requireStudioAccess(artistId)
  if (!ok) return NextResponse.json({ error: reason }, { status: reason === 'unauthenticated' ? 401 : 403 })

  const url = normalizeSocialUrl(String(body?.url || ''))
  if (!url) return NextResponse.json({ error: 'Bloga nuoroda' }, { status: 400 })
  const platform = detectPlatform(url)
  if (platform === 'unknown') {
    return NextResponse.json({ error: 'Nepalaikoma platforma (Instagram, Facebook, TikTok, YouTube, X)' }, { status: 400 })
  }
  const caption = typeof body?.caption === 'string' ? body.caption.trim().slice(0, 300) : null

  try {
    const sb = createAdminClient()
    const { data, error } = await sb
      .from('artist_social_embeds')
      .insert({ artist_id: artistId, platform, url, caption, source: 'manual' })
      .select('id, platform, url, caption, sort_order')
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, embed: data })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Klaida' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Blogas body' }, { status: 400 }) }
  const artistId = Number(body?.artistId)
  const id = String(body?.id || '')
  if (!Number.isFinite(artistId) || !id) return NextResponse.json({ error: 'Trūksta laukų' }, { status: 400 })

  const { ok, reason } = await requireStudioAccess(artistId)
  if (!ok) return NextResponse.json({ error: reason }, { status: reason === 'unauthenticated' ? 401 : 403 })

  try {
    const sb = createAdminClient()
    await sb.from('artist_social_embeds').delete().eq('id', id).eq('artist_id', artistId)
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Klaida' }, { status: 500 })
  }
}
