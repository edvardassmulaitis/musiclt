import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'

// Vercel automatiškai siunčia Authorization: Bearer $CRON_SECRET
export async function GET(req: Request) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createAdminClient()
  const now = new Date()
  const results: Record<string, string> = {}

  for (const topType of ['top40', 'lt_top30']) {
    try {
      // 1. Rasti aktyvią savaitę
      const { data: activeWeek } = await supabase
        .from('top_weeks')
        .select('*')
        .eq('top_type', topType)
        .eq('is_active', true)
        .maybeSingle()

      if (!activeWeek) {
        results[topType] = 'no active week'
        continue
      }

      // 2. Finalizuoti jei dar nefinalizuota
      if (!activeWeek.is_finalized) {
        // Suskaičiuoti balsus
        const { data: votes } = await supabase
          .from('top_votes')
          .select('track_id')
          .eq('week_id', activeWeek.id)

        // Suskaičiuoti kiekvienos dainos balsus
        const voteCounts: Record<number, number> = {}
        for (const v of (votes || [])) {
          voteCounts[v.track_id] = (voteCounts[v.track_id] || 0) + 1
        }

        // Gauti entries
        const { data: entries } = await supabase
          .from('top_entries')
          .select('id, track_id, position, peak_position, weeks_in_top')
          .eq('week_id', activeWeek.id)

        // Rikiuoti pagal balsus
        const sorted = (entries || [])
          .map(e => ({ ...e, votes: voteCounts[e.track_id] || 0 }))
          .sort((a, b) => b.votes - a.votes)

        // Rasti praeitą savaitę pozicijoms
        const { data: prevWeek } = await supabase
          .from('top_weeks')
          .select('id')
          .eq('top_type', topType)
          .eq('is_finalized', true)
          .order('week_start', { ascending: false })
          .limit(1)
          .maybeSingle()

        const { data: prevEntries } = prevWeek ? await supabase
          .from('top_entries')
          .select('track_id, position')
          .eq('week_id', prevWeek.id) : { data: [] }

        const prevMap = new Map((prevEntries || []).map((e: any) => [e.track_id, e.position]))

        // Atnaujinti pozicijas
        for (let i = 0; i < sorted.length; i++) {
          const e = sorted[i]
          const newPos = i + 1
          const prevPos = prevMap.get(e.track_id) ?? null
          await supabase
            .from('top_entries')
            .update({
              position: newPos,
              prev_position: prevPos,
              total_votes: e.votes,
              peak_position: Math.min(newPos, e.peak_position || newPos),
              weeks_in_top: (e.weeks_in_top || 0) + 1,
              is_new: prevPos === null,
            })
            .eq('id', e.id)
        }

        // Finalizuoti savaitę
        await supabase
          .from('top_weeks')
          .update({
            is_finalized: true,
            finalized_at: now.toISOString(),
            is_active: false,
            total_votes: votes?.length || 0,
          })
          .eq('id', activeWeek.id)

        results[topType] = `finalized with ${entries?.length || 0} entries, ${votes?.length || 0} votes`
      }

      // 3. Sukurti naują savaitę
      const nextMonday = new Date(activeWeek.week_start)
      nextMonday.setDate(nextMonday.getDate() + 7)
      const nextMondayStr = nextMonday.toISOString().split('T')[0]

      // Uždarymo laikas kitai savaitei
      const nextClose = new Date(nextMonday)
      if (topType === 'lt_top30') {
        nextClose.setDate(nextClose.getDate() + 5) // šeštadienis
      } else {
        nextClose.setDate(nextClose.getDate() + 6) // sekmadienis
      }
      nextClose.setUTCHours(13, 0, 0, 0)

      // Patikrinti ar jau egzistuoja
      const { data: nextExists } = await supabase
        .from('top_weeks')
        .select('id')
        .eq('top_type', topType)
        .eq('week_start', nextMondayStr)
        .maybeSingle()

      if (!nextExists) {
        const { data: newWeek } = await supabase
          .from('top_weeks')
          .insert({
            top_type: topType,
            week_start: nextMondayStr,
            vote_open: now.toISOString(),
            vote_close: nextClose.toISOString(),
            is_active: true,
            is_finalized: false,
            total_votes: 0,
          })
          .select()
          .single()

        // Perkelti approved pasiūlymus į naują savaitę
        if (newWeek) {
          const { data: approved } = await supabase
            .from('top_suggestions')
            .select('track_id')
            .eq('top_type', topType)
            .eq('status', 'approved')

          if (approved && approved.length > 0) {
            await supabase.from('top_entries').insert(
              approved.map((s, i) => ({
                week_id: newWeek.id,
                track_id: s.track_id,
                top_type: topType,
                position: i + 1,
                total_votes: 0,
                is_new: true,
                weeks_in_top: 1,
                peak_position: i + 1,
              }))
            )

            await supabase
              .from('top_suggestions')
              .update({ status: 'used' })
              .eq('top_type', topType)
              .eq('status', 'approved')
          }

          results[topType] += ` → new week ${nextMondayStr} created with ${approved?.length || 0} entries`
        }
      }
    } catch (err: any) {
      results[topType] = `error: ${err.message}`
    }
  }

  return NextResponse.json({ ok: true, results, timestamp: now.toISOString() })
}
