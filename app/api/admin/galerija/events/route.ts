// /api/admin/galerija/events
//
// Renginių paieška galerijos susiejimui (2c). Du režimai:
//   ?q=<tekstas>            — paieška pagal pavadinimą (+ lineup)
//   ?suggestFor=<reportId>  — auto-pasiūlymai konkrečiam reportažui (data + atlikėjai title'e)
// Grąžina renginius su lineup (atlikėjai iš event_artists), kad admin'as galėtų
// vienu paspaudimu užpildyti reportažo line-up'ą be dvigubo suvedimo.

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'
import { safeLike } from '@/lib/search-core'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function requireAdmin() {
  const session = await getServerSession(authOptions)
  if (!session?.user || !['editor', 'admin', 'super_admin'].includes((session.user.role as string) || '')) return null
  return session
}

type EventOut = {
  id: string; title: string; start_date: string | null; venue_name: string | null; city: string | null
  lineup: { artist_id: number; name: string; is_headliner: boolean; sort_order: number | null }[]
}

async function withLineup(sb: ReturnType<typeof createAdminClient>, events: any[]): Promise<EventOut[]> {
  if (!events.length) return []
  const ids = events.map((e) => e.id)
  const { data: ea } = await sb
    .from('event_artists')
    .select('event_id, artist_id, is_headliner, sort_order, artists:artist_id(name)')
    .in('event_id', ids)
    .order('is_headliner', { ascending: false })
    .order('sort_order', { ascending: true })
  const byEvent = new Map<string, EventOut['lineup']>()
  for (const r of (ea || []) as any[]) {
    const arr = byEvent.get(r.event_id) || []
    arr.push({ artist_id: r.artist_id, name: r.artists?.name ?? 'Atlikėjas', is_headliner: !!r.is_headliner, sort_order: r.sort_order })
    byEvent.set(r.event_id, arr)
  }
  return events.map((e) => ({
    id: e.id, title: e.title, start_date: e.start_date ?? null,
    venue_name: e.venue_name ?? null, city: e.city ?? null,
    lineup: byEvent.get(e.id) || [],
  }))
}

export async function GET(req: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  const sb = createAdminClient()
  const q = (req.nextUrl.searchParams.get('q') || '').trim()
  const suggestFor = req.nextUrl.searchParams.get('suggestFor')

  try {
    if (suggestFor) {
      // Pasiūlymai: renginiai ±45d nuo reportažo datos, kurių lineup atlikėjas yra title'e.
      const { data: rep } = await sb.from('reportages').select('title, event_date').eq('id', suggestFor).maybeSingle()
      if (!rep?.event_date) return NextResponse.json({ ok: true, events: [] })
      const d = new Date(rep.event_date)
      const from = new Date(d.getTime() - 45 * 864e5).toISOString().slice(0, 10)
      const to = new Date(d.getTime() + 45 * 864e5).toISOString().slice(0, 10)
      const { data: evs } = await sb
        .from('events')
        .select('id, title, start_date, venue_name, city')
        .gte('start_date', from).lte('start_date', to)
        .limit(60)
      const titleLow = (rep.title || '').toLowerCase()
      const withLine = await withLineup(sb, (evs || []) as any[])
      // Score: kiek lineup atlikėjų vardų yra reportažo title'e + datos artumas.
      const scored = withLine.map((e) => {
        const matches = e.lineup.filter((a) => a.name.length > 3 && titleLow.includes(a.name.toLowerCase())).length
        const dd = e.start_date ? Math.abs(new Date(e.start_date).getTime() - d.getTime()) : 9e15
        return { e, matches, dd }
      }).filter((x) => x.matches > 0)
        .sort((a, b) => b.matches - a.matches || a.dd - b.dd)
        .slice(0, 5)
        .map((x) => x.e)
      return NextResponse.json({ ok: true, events: scored })
    }

    if (q.length < 2) return NextResponse.json({ ok: true, events: [] })
    const pat = `%${safeLike(q)}%`
    const { data: evs } = await sb
      .from('events')
      .select('id, title, start_date, venue_name, city')
      .ilike('title_norm', pat)
      .order('start_date', { ascending: false })
      .limit(12)
    return NextResponse.json({ ok: true, events: await withLineup(sb, (evs || []) as any[]) })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'Klaida' }, { status: 500 })
  }
}
