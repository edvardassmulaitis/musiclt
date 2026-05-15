import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createClient } from '@supabase/supabase-js'
import { enrichTrack } from '@/lib/yt-enrich'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const { data: track, error } = await supabase
      .from('tracks')
      .select('*, artists!tracks_artist_id_fkey(id, name, slug)')
      .eq('id', parseInt(id))
      .single()
    if (error) throw error

    const { data: featRows } = await supabase
      .from('track_artists')
      .select('artist_id, is_primary, artists(id, name, slug)')
      .eq('track_id', parseInt(id))

    const featuring = (featRows || []).map((r: any) => ({
      artist_id: r.artist_id,
      name: r.artists?.name || '',
      slug: r.artists?.slug || '',
      is_primary: r.is_primary || false,
    }))

    const { data: albumRows } = await supabase
      .from('album_tracks')
      .select('position, is_primary, albums(id, title, year)')
      .eq('track_id', parseInt(id))
      .order('position')

    const albums = (albumRows || []).map((r: any) => ({
      album_id: r.albums?.id,
      album_title: r.albums?.title || '',
      album_year: r.albums?.year || null,
      position: r.position || 0,
    }))

    // Backward compat: parse old release_date if new fields empty
    let release_year = track.release_year || null
    let release_month = track.release_month || null
    let release_day = track.release_day || null
    if (!release_year && track.release_date) {
      const d = new Date(track.release_date)
      release_year = d.getFullYear()
      const isJan1 = d.getMonth() === 0 && d.getDate() === 1
      if (!isJan1) {
        release_month = d.getMonth() + 1
        release_day = d.getDate()
      }
    }

    return NextResponse.json({
      ...track,
      release_year,
      release_month,
      release_day,
      featuring,
      albums,
      chords: track.chords || '',
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user || !['admin', 'super_admin'].includes(session.user.role || '')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const trackId = parseInt(id)

  try {
    const data = await req.json()

    // Pirma — gaunam dabartinę video_url, kad galėtumėm detektuoti pakeitimą
    // ir auto-trigger'inti YT views fetch po update'o.
    const { data: existingTrack } = await supabase
      .from('tracks')
      .select('video_url')
      .eq('id', trackId)
      .maybeSingle()
    const oldVideoUrl = (existingTrack as any)?.video_url || null

    const updates: Record<string, any> = {}

    if ('title' in data) updates.title = data.title
    if ('artist_id' in data) updates.artist_id = Number(data.artist_id)
    if ('type' in data) updates.type = data.type || 'normal'
    if ('is_new' in data) {
      updates.is_new = data.is_new ?? false
      updates.is_new_date = data.is_new ? (data.is_new_date || new Date().toISOString().slice(0, 10)) : null
    }
    if ('cover_url' in data) updates.cover_url = data.cover_url || null
    if ('video_url' in data) updates.video_url = data.video_url || null
    if ('youtube_url' in data) updates.video_url = data.youtube_url || null
    if ('lyrics' in data) updates.lyrics = data.lyrics || null
    if ('chords' in data) updates.chords = data.chords || null
    if ('description' in data) updates.description = data.description || null
    if ('spotify_id' in data) updates.spotify_id = data.spotify_id || null
    if ('is_single' in data) updates.is_single = !!data.is_single  // admin form'e gali toggle
    if ('release_year' in data || 'release_month' in data || 'release_day' in data) {
      const y = data.release_year ? parseInt(data.release_year) : null
      const m = data.release_month ? parseInt(data.release_month) : null
      const d = data.release_day ? parseInt(data.release_day) : null
      updates.release_year = y
      updates.release_month = m
      updates.release_day = d
      updates.release_date = y
        ? `${y}-${String(m || 1).padStart(2, '0')}-${String(d || 1).padStart(2, '0')}`
        : null
    }

    // Auto-reset YT enrich state'ą jei video_url pasikeitė — kad enrichTrack
    // (žemiau) iš naujo paimtų views naujam video. Be šito, enrichTrack
    // pamatys senus video_views laukus ir tinkamai juos atnaujins, bet
    // explicit reset'as garantuoja, kad UI iškart matys "kraunama".
    const newVideoUrl = updates.video_url ?? oldVideoUrl
    const videoChanged = newVideoUrl !== oldVideoUrl
    if (videoChanged && newVideoUrl) {
      updates.video_views = null
      updates.video_views_checked_at = null
      updates.video_embeddable = null
    }

    if (Object.keys(updates).length > 0) {
      const { error } = await supabase.from('tracks').update(updates).eq('id', trackId)
      if (error) throw error
    }

    if (Array.isArray(data.featuring)) {
      await supabase.from('track_artists').delete().eq('track_id', trackId)
      if (data.featuring.length > 0) {
        const { error: featError } = await supabase.from('track_artists').insert(
          data.featuring.map((f: any) => ({
            track_id: trackId,
            artist_id: f.artist_id,
            is_primary: f.is_primary || false,
          }))
        )
        if (featError) throw featError
      }
    }

    // Auto-trigger YT views fetch po video_url pakeitimo. Naudojam force=true
    // kad bypass'intume 30 dienų refresh cutoff'ą. Await'inam su 8s timeout
    // — jei pavyks per tą laiką, frontend stats card iškart matys naują
    // video_views skaičių; jei timeout'uojam, vis tiek track update'as
    // sėkmingas, views update'inasi background'e.
    let enrichResult: any = null
    if (videoChanged && newVideoUrl) {
      try {
        const enrichPromise = enrichTrack(trackId, true)
        const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 8000))
        const result = await Promise.race([enrichPromise, timeoutPromise])
        if (result && (result as any).ok) {
          enrichResult = {
            views: (result as any).viewsAfter,
            videoTitle: (result as any).videoTitle,
            embeddable: (result as any).embeddable,
          }
        }
      } catch (e: any) {
        // Enrich klaida nesilaužia track save'ą — log only
        console.warn('[track update] enrich failed:', e?.message)
      }
    }

    return NextResponse.json({ ok: true, enrich: enrichResult })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user || !['admin', 'super_admin'].includes(session.user.role || '')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const trackId = parseInt(id)

  try {
    await supabase.from('track_artists').delete().eq('track_id', trackId)
    await supabase.from('album_tracks').delete().eq('track_id', trackId)
    const { error } = await supabase.from('tracks').delete().eq('id', trackId)
    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
