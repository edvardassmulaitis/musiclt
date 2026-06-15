// Auto-feed jungčių valdymas (studija).
//   GET    ?artistId=            → atlikėjo jungtys (team)
//   POST   { artistId, platform, input? } → prijungti/atnaujinti + pradinis sync (team)
//   DELETE { artistId, platform } → atjungti (team)

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { requireStudioAccess } from '@/lib/artist-studio'
import { resolveChannelId, getChannelInfo } from '@/lib/social/youtube'
import { syncConnection, type Connection } from '@/lib/social/sync'

export const maxDuration = 60

export async function GET(req: NextRequest) {
  const artistId = Number(new URL(req.url).searchParams.get('artistId'))
  if (!Number.isFinite(artistId)) return NextResponse.json({ connections: [] })
  const { ok, reason } = await requireStudioAccess(artistId)
  if (!ok) return NextResponse.json({ error: reason }, { status: reason === 'unauthenticated' ? 401 : 403 })
  const sb = createAdminClient()
  const { data } = await sb.from('artist_social_connections')
    .select('id, platform, mode, external_id, username, status, last_synced_at, last_error')
    .eq('artist_id', artistId)
  return NextResponse.json({ connections: data || [] })
}

export async function POST(req: NextRequest) {
  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Blogas body' }, { status: 400 }) }
  const artistId = Number(body?.artistId)
  const platform = String(body?.platform || '')
  if (!Number.isFinite(artistId) || !platform) return NextResponse.json({ error: 'Trūksta laukų' }, { status: 400 })

  const { profile, ok, reason } = await requireStudioAccess(artistId)
  if (!ok) return NextResponse.json({ error: reason }, { status: reason === 'unauthenticated' ? 401 : 403 })

  const sb = createAdminClient()

  if (platform === 'youtube') {
    // Įvestis arba esamas artists.youtube
    let input = String(body?.input || '').trim()
    if (!input) {
      const { data: a } = await sb.from('artists').select('youtube').eq('id', artistId).maybeSingle()
      input = (a?.youtube || '').trim()
    }
    if (!input) return NextResponse.json({ error: 'Nurodyk YouTube kanalo nuorodą' }, { status: 400 })

    let channelId: string | null
    try { channelId = await resolveChannelId(input) }
    catch (e: any) { return NextResponse.json({ error: e?.message || 'YouTube klaida' }, { status: 500 }) }
    if (!channelId) return NextResponse.json({ error: 'Nepavyko atpažinti kanalo iš nuorodos' }, { status: 400 })

    let username: string | null = null
    try { username = (await getChannelInfo(channelId)).title } catch {}

    const { data: conn, error } = await sb.from('artist_social_connections').upsert({
      artist_id: artistId, platform: 'youtube', mode: 'auto', external_id: channelId,
      username, status: 'active', connected_by: profile?.id || null, last_error: null,
    }, { onConflict: 'artist_id,platform' }).select('id, artist_id, platform, external_id, status').single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const r = await syncConnection(conn as Connection)
    return NextResponse.json({ ok: true, platform, channelId, username, items: r.count, syncOk: r.ok, syncError: r.error })
  }

  return NextResponse.json({ error: 'Ši platforma dar nepalaikoma auto-feedui' }, { status: 400 })
}

export async function DELETE(req: NextRequest) {
  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Blogas body' }, { status: 400 }) }
  const artistId = Number(body?.artistId)
  const platform = String(body?.platform || '')
  if (!Number.isFinite(artistId) || !platform) return NextResponse.json({ error: 'Trūksta laukų' }, { status: 400 })
  const { ok, reason } = await requireStudioAccess(artistId)
  if (!ok) return NextResponse.json({ error: reason }, { status: reason === 'unauthenticated' ? 401 : 403 })
  const sb = createAdminClient()
  await sb.from('artist_social_connections').delete().eq('artist_id', artistId).eq('platform', platform)
  await sb.from('artist_social_items').delete().eq('artist_id', artistId).eq('platform', platform)
  return NextResponse.json({ ok: true })
}
