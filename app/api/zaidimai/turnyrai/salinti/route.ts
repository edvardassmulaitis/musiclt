// app/api/zaidimai/turnyrai/salinti/route.ts
//
// Kandidato šalinimas iš turnyro (savininko feature, peek UI):
//   POST { raktas, trackId }
//   * raktas turi sutapti su TOURNAMENT_PEEK_KEY (kaip peek puslapyje)
//   * daina įrašoma į boombox_tournament_exclusions (nebegrįš niekada)
//   * NESTARTAVĘS turnyras pergeneruojamas visas; STARTAVĘS (yra balsų ar
//     paskelbtų matų) — TAŠKINIS keitimas: pakaitalas įstatomas į tą pačią
//     vietą, nubalsuoti matai nepaliečiami. Gyvos (šiandien balsuojamos)
//     dvikovos keisti negalima — nuo rytojaus.
//
// Atsakas: { ok, rebuilt: [{ tournamentId, title, mode, size?, newTrack? }] }

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { rebuildTournament, replaceTrackInPlace, tournamentTouched } from '@/lib/tournament-db'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(req: NextRequest) {
  const key = process.env.TOURNAMENT_PEEK_KEY
  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Blogas JSON' }, { status: 400 }) }

  if (!key || body?.raktas !== key) {
    return NextResponse.json({ error: 'Neteisingas raktas' }, { status: 404 })
  }
  const trackId = Number(body?.trackId)
  if (!Number.isFinite(trackId) || trackId <= 0) {
    return NextResponse.json({ error: 'Blogas trackId' }, { status: 400 })
  }

  const sb = createAdminClient()

  // Kuriuose turnyruose ši daina dalyvauja?
  const { data: ms, error: me } = await sb.from('boombox_tournament_matches')
    .select('tournament_id')
    .or(`track_a_id.eq.${trackId},track_b_id.eq.${trackId}`)
  if (me) return NextResponse.json({ error: me.message }, { status: 500 })
  const tournamentIds = [...new Set((ms ?? []).map(m => m.tournament_id))]

  // Registruojam pašalinimą (idempotentiška — jei jau yra, tęsiam)
  const { error: ee } = await sb.from('boombox_tournament_exclusions')
    .upsert({ track_id: trackId, reason: body?.reason ?? 'peek-ui' }, { onConflict: 'track_id' })
  if (ee) return NextResponse.json({ error: ee.message }, { status: 500 })

  const rebuilt: Array<{ tournamentId: number; title: string; mode: string; size?: number; newTrack?: string }> = []
  for (const tid of tournamentIds) {
    try {
      const { data: t } = await sb.from('boombox_tournaments').select('title,status').eq('id', tid).single()
      if (t?.status === 'done') { rebuilt.push({ tournamentId: tid, title: t.title, mode: 'baigtas — neliestas' }); continue }
      if (await tournamentTouched(sb, tid)) {
        // Startavęs → taškinis keitimas toje pačioje vietoje
        const r = await replaceTrackInPlace(sb, tid, trackId)
        rebuilt.push({ tournamentId: tid, title: t?.title ?? '', mode: 'taškinis keitimas', newTrack: `${r.newTrack.artist} — ${r.newTrack.title}` })
      } else {
        const r = await rebuildTournament(sb, tid)
        rebuilt.push({ tournamentId: tid, title: t?.title ?? '', mode: 'pergeneruotas', size: r.size })
      }
    } catch (e: any) {
      return NextResponse.json({ error: `Turnyro #${tid} sutvarkyti nepavyko: ${e.message}` }, { status: 409 })
    }
  }

  return NextResponse.json({ ok: true, rebuilt })
}
