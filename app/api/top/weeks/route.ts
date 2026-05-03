import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'

function getMondayOf(date: Date): string {
  const d = new Date(date)
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  return d.toISOString().split('T')[0]
}

function getVoteClose(topType: string, mondayStr: string): string {
  const monday = new Date(mondayStr + 'T00:00:00')
  if (topType === 'lt_top30') {
    // Šeštadienis 15:00 Vilnius ≈ 13:00 UTC
    const sat = new Date(monday)
    sat.setDate(sat.getDate() + 5)
    sat.setUTCHours(13, 0, 0, 0)
    return sat.toISOString()
  } else {
    // Sekmadienis 15:00 Vilnius ≈ 13:00 UTC
    const sun = new Date(monday)
    sun.setDate(sun.getDate() + 6)
    sun.setUTCHours(13, 0, 0, 0)
    return sun.toISOString()
  }
}

/**
 * GET — gražina savaičių sąrašą + automatiškai sukuria aktyvią savaitę,
 * jei tokios nėra (self-healing).
 *
 * Triggers'ai aktyvios savaitės kūrimui:
 *   1. Pirmas kartas (DB tuščia) — sukuriama dabartinės savaitės dienai
 *   2. Po `/api/top/finalize` (manual finalize) — paskutinė savaitė buvo
 *      pažymėta is_finalized=true, is_active=false. Naujos nėra. Sukuriam.
 *   3. Po cron'o failure'o — analogiška situacija.
 *
 * Logika: jei nerandam jokio is_active=true įrašo šitam top_type, ieškom
 * paskutinės finalizuotos savaitės ir kuriam kitos savaitės įrašą (Monday + 7).
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const topType = searchParams.get('type') || 'top40'
  const supabase = createAdminClient()

  // 1. Ar yra aktyvi savaitė šitam top_type?
  const { data: active } = await supabase
    .from('top_weeks')
    .select('id')
    .eq('top_type', topType)
    .eq('is_active', true)
    .maybeSingle()

  if (!active) {
    // 2. Aktyvios nėra. Surandam paskutinę savaitę (bet kurią) — nuo jos start_date'os
    //    skaičiuojam kitą savaitę. Jei niekas neegzistuoja — naudojam dabartinį pirmadienį.
    const { data: latest } = await supabase
      .from('top_weeks')
      .select('week_start')
      .eq('top_type', topType)
      .order('week_start', { ascending: false })
      .limit(1)
      .maybeSingle()

    let newMondayStr: string
    if (latest) {
      const next = new Date(latest.week_start + 'T00:00:00')
      next.setDate(next.getDate() + 7)
      newMondayStr = next.toISOString().split('T')[0]
    } else {
      newMondayStr = getMondayOf(new Date())
    }

    // 3. Patikrinti ar kitos savaitės įrašas jau (idempotency apsauga).
    const { data: existing } = await supabase
      .from('top_weeks')
      .select('id, is_active')
      .eq('top_type', topType)
      .eq('week_start', newMondayStr)
      .maybeSingle()

    let newWeek: { id: number } | null = null

    if (existing) {
      // Egzistuoja, bet ne aktyvus — pažymim aktyvia.
      if (!existing.is_active) {
        await supabase
          .from('top_weeks')
          .update({ is_active: true })
          .eq('id', existing.id)
      }
      newWeek = { id: existing.id }
    } else {
      // Sukuriam naują
      const voteClose = getVoteClose(topType, newMondayStr)
      const { data: created } = await supabase
        .from('top_weeks')
        .insert({
          top_type: topType,
          week_start: newMondayStr,
          vote_open: new Date().toISOString(),
          vote_close: voteClose,
          is_active: true,
          is_finalized: false,
          total_votes: 0,
        })
        .select()
        .single()
      newWeek = created || null
    }

    // 4. Perkelti approved pasiūlymus į naujos savaitės top_entries
    if (newWeek) {
      const { data: approved } = await supabase
        .from('top_suggestions')
        .select('id, track_id')
        .eq('top_type', topType)
        .eq('status', 'approved')
        .not('track_id', 'is', null)

      if (approved && approved.length > 0) {
        // Patikrinti, kokie jau egzistuoja (kad neduplikuotume)
        const trackIds = approved.map(s => s.track_id)
        const { data: existingEntries } = await supabase
          .from('top_entries')
          .select('track_id')
          .eq('week_id', newWeek.id)
          .in('track_id', trackIds)

        const existingSet = new Set((existingEntries || []).map(e => e.track_id))
        const toInsert = approved.filter(s => !existingSet.has(s.track_id))

        if (toInsert.length > 0) {
          // Žinom dabartinį entries skaičių pozicijai paskaičiuoti
          const { count: baseCount } = await supabase
            .from('top_entries')
            .select('id', { count: 'exact', head: true })
            .eq('week_id', newWeek.id)

          const offset = baseCount || 0
          await supabase.from('top_entries').insert(
            toInsert.map((s, i) => ({
              week_id: newWeek!.id,
              track_id: s.track_id,
              top_type: topType,
              position: offset + i + 1,
              total_votes: 0,
              is_new: true,
              weeks_in_top: 1,
              peak_position: offset + i + 1,
            }))
          )
        }

        // Pažymim, kad pasiūlymai panaudoti (nepriklausomai nuo dublikatų,
        // visi „approved" pereina į „used", nes dabar jie tope).
        await supabase
          .from('top_suggestions')
          .update({ status: 'used' })
          .in('id', approved.map(s => s.id))
      }
    }
  }

  // 5. Grąžinti savaičių sąrašą (visada, nepriklausomai ar kūrėme naują)
  const { data, error } = await supabase
    .from('top_weeks')
    .select('*')
    .eq('top_type', topType)
    .order('week_start', { ascending: false })
    .limit(20)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ weeks: data || [] })
}
