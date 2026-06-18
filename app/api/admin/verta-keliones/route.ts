// POST/GET /api/admin/verta-keliones — admin valdymas „Verta kelionės".
// Auth: admin | super_admin. Žr. lib/verta-keliones-db.ts (schema) + scout.

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { runScout } from '@/lib/verta-keliones-scout'

export const dynamic = 'force-dynamic'

async function guard() {
  const session = await getServerSession(authOptions)
  if (!session?.user || !['editor', 'admin', 'super_admin'].includes((session.user as any).role || '')) return false
  return true
}

export async function GET() {
  if (!(await guard())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const sb = createAdminClient()
  const [d, e, c] = await Promise.all([
    sb.from('travel_destinations').select('*').order('sort_order', { ascending: true }),
    sb.from('abroad_events').select('*').order('start_date', { ascending: true }),
    sb.from('abroad_event_candidates').select('*').eq('status', 'pending').order('start_date', { ascending: true }),
  ])
  return NextResponse.json({
    destinations: d.data || [],
    events: e.data || [],
    candidates: c.data || [],
  })
}

export async function POST(req: NextRequest) {
  if (!(await guard())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'bad body' }, { status: 400 }) }
  const sb = createAdminClient()
  const action = body?.action

  try {
    switch (action) {
      case 'dest_save': {
        const d = body.dest || {}
        if (!d.key || !d.city) return NextResponse.json({ error: 'Trūksta key/city' }, { status: 400 })
        const row = {
          key: d.key, city: d.city, country: d.country || '', country_code: d.country_code || null,
          reach_mode: d.reach_mode === 'car' ? 'car' : 'flight',
          from_airport: d.from_airport || null, carrier: d.carrier || null,
          price_from: d.price_from != null && d.price_from !== '' ? Number(d.price_from) : null,
          drive_hours: d.drive_hours != null && d.drive_hours !== '' ? Number(d.drive_hours) : null,
          drive_from: d.drive_from || null,
          is_active: d.is_active !== false, sort_order: Number(d.sort_order) || 0, note: d.note || null,
        }
        const { error } = await sb.from('travel_destinations').upsert(row, { onConflict: 'key' })
        if (error) throw error
        return NextResponse.json({ ok: true })
      }
      case 'dest_toggle': {
        const { error } = await sb.from('travel_destinations').update({ is_active: !!body.is_active }).eq('id', body.id)
        if (error) throw error
        return NextResponse.json({ ok: true })
      }
      case 'dest_delete': {
        const { error } = await sb.from('travel_destinations').delete().eq('id', body.id)
        if (error) throw error
        return NextResponse.json({ ok: true })
      }
      case 'event_save': {
        const e = body.event || {}
        if (!e.artist_name || !e.dest_key || !e.start_date) return NextResponse.json({ error: 'Trūksta atlikėjo/krypties/datos' }, { status: 400 })
        const { data: dest } = await sb.from('travel_destinations').select('city, country, country_code, reach_mode').eq('key', e.dest_key).limit(1)
        const di: any = dest?.[0] || {}
        const row: any = {
          artist_name: e.artist_name, artist_slug: e.artist_slug || null, artist_id: e.artist_id || null,
          dest_key: e.dest_key, city: e.city || di.city || null, country: e.country || di.country || null,
          country_code: e.country_code || di.country_code || null, venue_name: e.venue_name || null,
          start_date: e.start_date, end_date: e.end_date || null, ticket_url: e.ticket_url || null,
          image_url: e.image_url || null, genres: e.genres || [], popularity: Number(e.popularity) || 0,
          is_festival: !!e.is_festival, festival_name: e.festival_name || null, why: e.why || null,
          reach_mode: e.reach_mode || di.reach_mode || null, verified: !!e.verified,
          source: e.source || 'manual', is_published: e.is_published !== false, sort_order: Number(e.sort_order) || 0,
        }
        if (e.id) {
          const { error } = await sb.from('abroad_events').update(row).eq('id', e.id)
          if (error) throw error
        } else {
          const { error } = await sb.from('abroad_events').insert(row)
          if (error) throw error
        }
        return NextResponse.json({ ok: true })
      }
      case 'event_toggle': {
        const { error } = await sb.from('abroad_events').update({ is_published: !!body.is_published }).eq('id', body.id)
        if (error) throw error
        return NextResponse.json({ ok: true })
      }
      case 'event_delete': {
        const { error } = await sb.from('abroad_events').delete().eq('id', body.id)
        if (error) throw error
        return NextResponse.json({ ok: true })
      }
      case 'cand_approve': {
        const { data: cand } = await sb.from('abroad_event_candidates').select('*').eq('id', body.id).limit(1)
        const c = cand?.[0]
        if (!c) return NextResponse.json({ error: 'Nerasta' }, { status: 404 })
        const { data: dest } = await sb.from('travel_destinations').select('city, country, country_code, reach_mode').eq('key', c.dest_key).limit(1)
        const di: any = dest?.[0] || {}
        const row = {
          artist_name: c.artist_name, artist_slug: c.artist_slug, artist_id: c.artist_id,
          dest_key: c.dest_key, city: c.city || di.city, country: c.country || di.country,
          country_code: di.country_code || null, venue_name: c.venue_name,
          start_date: c.start_date, end_date: c.end_date, ticket_url: c.ticket_url,
          image_url: c.image_url, genres: c.genres || [], popularity: c.popularity || 0,
          is_festival: !!c.is_festival, festival_name: c.is_festival ? c.artist_name : null,
          why: null, reach_mode: di.reach_mode || null, verified: false,
          source: 'scout', source_url: c.source_url, is_published: true, sort_order: 0,
        }
        const { error: insErr } = await sb.from('abroad_events').insert(row)
        if (insErr) throw insErr
        await sb.from('abroad_event_candidates').update({ status: 'approved' }).eq('id', body.id)
        return NextResponse.json({ ok: true })
      }
      case 'cand_reject': {
        const { error } = await sb.from('abroad_event_candidates').update({ status: 'rejected' }).eq('id', body.id)
        if (error) throw error
        return NextResponse.json({ ok: true })
      }
      case 'scout': {
        const res = await runScout({})
        return NextResponse.json({ ok: true, scout: res })
      }
      default:
        return NextResponse.json({ error: 'Nežinomas action' }, { status: 400 })
    }
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Klaida' }, { status: 500 })
  }
}
