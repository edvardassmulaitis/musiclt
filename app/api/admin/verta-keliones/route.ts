// POST/GET /api/admin/verta-keliones — admin valdymas „Verta kelionės".
// Auth: admin | super_admin. Žr. lib/verta-keliones-db.ts (schema) + scout.

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { runScout } from '@/lib/verta-keliones-scout'
import { slugify } from '@/lib/slugify'

export const dynamic = 'force-dynamic'

async function guard() {
  const session = await getServerSession(authOptions)
  if (!session?.user || !['editor', 'admin', 'super_admin'].includes((session.user as any).role || '')) return false
  return true
}

// events (is_abroad) eilutė → VKAdminClient „Event" formatas (suderinamumui).
function eventToClient(ev: any) {
  return {
    id: String(ev.id),
    artist_name: ev.title,
    dest_key: ev.dest_key || '',
    city: ev.city || null,
    country: null,
    venue_name: ev.venue_name || null,
    start_date: ev.start_date ? String(ev.start_date).slice(0, 10) : '',
    end_date: ev.end_date ? String(ev.end_date).slice(0, 10) : null,
    image_url: ev.cover_image_url || null,
    ticket_url: ev.ticket_url || null,
    is_festival: !!ev.is_festival,
    popularity: ev.popularity || 0,
    is_published: !!ev.verified, // VK admine „Rodyti/Slėpti" valdo viešą matomumą = verified
    verified: !!ev.verified,
    source: null,
  }
}

// Unikalus slug'as events lentelei.
async function uniqueSlug(sb: any, title: string): Promise<string> {
  let slug = slugify(title || 'koncertas')
  const { data: existing } = await sb.from('events').select('id').eq('slug', slug).maybeSingle()
  if (existing) slug = `${slug}-${Date.now().toString(36)}`
  return slug
}

// Abroad-formos / kandidato laukai → events insert eilutė (is_abroad=true).
async function buildAbroadEventRow(sb: any, src: any): Promise<any> {
  const { data: dest } = await sb.from('travel_destinations').select('city').eq('key', src.dest_key).limit(1)
  const di: any = dest?.[0] || {}
  const title = (src.is_festival ? (src.festival_name || src.tour_name) : null) || src.artist_name
  return {
    title,
    slug: await uniqueSlug(sb, title),
    description: src.why || null,
    start_date: src.start_date,
    end_date: src.end_date || null,
    venue_name: src.venue_name || null,
    city: src.city || di.city || null,
    cover_image_url: src.image_url || null,
    ticket_url: src.ticket_url || null,
    is_festival: !!src.is_festival,
    is_abroad: true,
    dest_key: src.dest_key,
    why: src.why || null,
    popularity: Number(src.popularity) || 0,
    verified: src.verified === undefined ? true : !!src.verified,
    status: 'upcoming',
  }
}

export async function GET() {
  if (!(await guard())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const sb = createAdminClient()
  const [d, e, c] = await Promise.all([
    sb.from('travel_destinations').select('*').order('sort_order', { ascending: true }),
    // Po merge: užsienio koncertai gyvena unified `events` (is_abroad=true).
    sb.from('events').select('id, title, dest_key, city, venue_name, start_date, end_date, cover_image_url, ticket_url, is_festival, popularity, verified')
      .eq('is_abroad', true).order('start_date', { ascending: true }),
    sb.from('abroad_event_candidates').select('*').eq('status', 'pending').order('start_date', { ascending: true }),
  ])
  // Slėpti praėjusius — admin tvarko tik tuos, kurie dar gali patekti į feedus
  // (viešas /verta-keliones jau filtruoja praėjusius, žr. lib/verta-keliones-db.ts).
  // Daugiadieniai: pagal end_date; vienadieniai: pagal start_date (LT laiko zona).
  const ltToday = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Vilnius', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
  const isUpcoming = (r: any) => (((r.end_date || r.start_date || '') as string).slice(0, 10) >= ltToday)
  const evRows = ((e.data || []) as any[]).map(eventToClient)
  const upcomingEv = evRows.filter(isUpcoming)                 // start_date ASC → artimiausi viršuje
  const pastEv = evRows.filter((r) => !isUpcoming(r)).reverse() // praėję — į apačią (naujausi pirma)
  return NextResponse.json({
    destinations: d.data || [],
    events: [...upcomingEv, ...pastEv],
    candidates: (c.data || []).filter(isUpcoming), // praėję kandidatai = triukšmas, nerodom
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
        const row = await buildAbroadEventRow(sb, { ...e, verified: e.verified })
        if (e.id) {
          // Redaguojant nelyti slug (kad nesikeistų URL) — nuimam jį iš patch'o.
          const { slug, ...patch } = row
          const { error } = await sb.from('events').update(patch).eq('id', e.id).eq('is_abroad', true)
          if (error) throw error
        } else {
          const { error } = await sb.from('events').insert(row)
          if (error) throw error
        }
        return NextResponse.json({ ok: true })
      }
      case 'event_toggle': {
        // VK admine „Rodyti/Slėpti" = viešas matomumas = verified.
        const { error } = await sb.from('events').update({ verified: !!body.is_published }).eq('id', body.id).eq('is_abroad', true)
        if (error) throw error
        return NextResponse.json({ ok: true })
      }
      case 'event_delete': {
        const { error } = await sb.from('events').delete().eq('id', body.id).eq('is_abroad', true)
        if (error) throw error
        return NextResponse.json({ ok: true })
      }
      case 'cand_approve': {
        const { data: cand } = await sb.from('abroad_event_candidates').select('*').eq('id', body.id).limit(1)
        const c = cand?.[0]
        if (!c) return NextResponse.json({ error: 'Nerasta' }, { status: 404 })
        // Admin patvirtinimas = verifikuota (vieša rodoma TIK verified). Įrašom į
        // unified events (is_abroad=true) — nebe į abroad_events.
        const row = await buildAbroadEventRow(sb, { ...c, festival_name: c.is_festival ? c.artist_name : null, verified: true })
        const { error: insErr } = await sb.from('events').insert(row)
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
