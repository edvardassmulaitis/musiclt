// Atlikėjo studijos dashboard (redizainas, milestone 1).
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { resolveProfile } from '@/lib/profile-resolve'
import { getTeamArtists, pickActiveArtist } from '@/lib/artist-studio'
import { createAdminClient } from '@/lib/supabase'
import EmptyStudio from './EmptyStudio'
import DashboardClient from './DashboardClient'

export const dynamic = 'force-dynamic'
const NINETY = 90 * 864e5

export default async function StudioDashboard({ searchParams }: { searchParams: Promise<{ a?: string }> }) {
  const sp = await searchParams
  const session = await getServerSession(authOptions)
  const profile = await resolveProfile(session)
  const artists = profile?.id ? await getTeamArtists(profile.id) : []
  const active = pickActiveArtist(artists, sp.a)
  if (!active) return <EmptyStudio />

  const sb = createAdminClient()
  const [artistRow, genresRes, tracksRes, photosRes, likesRes, followRes, embedsRes, evRes] = await Promise.all([
    sb.from('artists').select('id, slug, name, cover_image_url, cover_image_wide_url, description, profile_theme, accent_color, hidden_sections, page_view_count, legacy_likes').eq('id', active.id).maybeSingle(),
    sb.from('artist_genres').select('genres(id, name)').eq('artist_id', active.id),
    sb.from('tracks').select('id, title, slug, video_url, video_uploaded_at, video_views, is_pinned').eq('artist_id', active.id).not('video_uploaded_at', 'is', null).order('is_pinned', { ascending: false }).order('video_uploaded_at', { ascending: false }).limit(5),
    sb.from('artist_photos').select('id, url, caption, is_active, sort_order').eq('artist_id', active.id).eq('is_active', true).order('sort_order').limit(16),
    sb.from('likes').select('*', { count: 'exact', head: true }).eq('entity_type', 'artist').eq('entity_id', active.id),
    sb.from('artist_follows').select('*', { count: 'exact', head: true }).eq('artist_id', active.id),
    sb.from('artist_social_embeds').select('*', { count: 'exact', head: true }).eq('artist_id', active.id).eq('is_active', true),
    sb.from('event_artists').select('events(id, slug, title, start_date, venue_name, city)').eq('artist_id', active.id),
  ])

  const a: any = artistRow.data || {}
  const genres = (genresRes.data || []).map((g: any) => g.genres).filter(Boolean)
  const tracks = (tracksRes.data || []) as any[]

  // Top 40 būsenos — skaičiuojam pagal VISAS atlikėjo dainas (ne tik rodomas 5)
  const { data: allIdRows } = await sb.from('tracks').select('id').eq('artist_id', active.id)
  const trackIds = (allIdRows || []).map((t: any) => t.id)
  let topEntries: Record<number, { weeks: number; pos: number }> = {}
  let pendingIds = new Set<number>()
  if (trackIds.length) {
    const { data: wk } = await sb.from('top_weeks').select('id').eq('top_type', 'top40').eq('is_active', true).order('week_start', { ascending: false }).limit(1).maybeSingle()
    if (wk) {
      const { data: ent } = await sb.from('top_entries').select('track_id, weeks_in_top, position').eq('week_id', wk.id).in('track_id', trackIds)
      for (const e of (ent || []) as any[]) topEntries[e.track_id] = { weeks: e.weeks_in_top || 0, pos: e.position }
    }
    const { data: sug } = await sb.from('top_suggestions').select('track_id').eq('status', 'pending').in('track_id', trackIds)
    pendingIds = new Set((sug || []).map((s: any) => s.track_id))
  }
  const blockNew = Object.values(topEntries).some((e) => e.weeks < 8)

  const songs = tracks.map((t) => {
    const uploaded = t.video_uploaded_at ? new Date(t.video_uploaded_at).getTime() : 0
    const eligible3m = uploaded > 0 && (Date.now() - uploaded) <= NINETY
    const inTop = topEntries[t.id]
    let state: string
    if (pendingIds.has(t.id)) state = 'pending'
    else if (inTop) state = 'in'
    else if (!eligible3m) state = 'too_old'
    else if (blockNew) state = 'wait'
    else state = 'eligible'
    return { id: t.id, title: t.title, slug: t.slug, video_url: t.video_url, video_uploaded_at: t.video_uploaded_at, is_pinned: t.is_pinned, state, weeks: inTop?.weeks || 0 }
  })

  // Top vieta mini-dashboard'ui (geriausia pozicija)
  let topPos: { pos: number; title: string } | null = null
  for (const t of tracks) { const e = topEntries[t.id]; if (e && (!topPos || e.pos < topPos.pos)) topPos = { pos: e.pos, title: t.title } }

  const events = (evRes.data || []).map((r: any) => r.events).filter((e: any) => e && e.start_date)
    .filter((e: any) => new Date(e.start_date).getTime() >= Date.now() - 864e5)
    .sort((x: any, y: any) => new Date(x.start_date).getTime() - new Date(y.start_date).getTime()).slice(0, 5)

  const views = a.page_view_count || 0
  const likes = Math.max(likesRes.count || 0, a.legacy_likes || 0)
  // „Temperatūra" — laikina deterministinė reikšmė (tikras skaičiavimas — atskiras darbas)
  const temp = 40 + (((active.id * 37 + views) % 60))

  // Profilio užbaigtumas
  const checks = [!!a.cover_image_url, !!a.cover_image_wide_url, (a.description || '').length > 30, (photosRes.data || []).length > 0, genres.length > 0, (embedsRes.count || 0) > 0]
  const complete = Math.round((checks.filter(Boolean).length / checks.length) * 100)

  return (
    <DashboardClient
      artist={{ id: a.id, slug: a.slug, name: a.name, cover_image_url: a.cover_image_url, cover_image_wide_url: a.cover_image_wide_url,
        profile_theme: a.profile_theme || 'dark', accent_color: a.accent_color || null, hidden_sections: a.hidden_sections || [] }}
      genres={genres}
      songs={songs}
      photos={(photosRes.data || []) as any}
      events={events}
      stats={{ views, likes, followers: followRes.count || 0, temp, topPos, complete }}
    />
  )
}
