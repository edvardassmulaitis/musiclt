// app/api/cron/turnyrai/route.ts
//
// CRON: turnyrų gyvavimo ciklas — (1) vakarykščių dvikovų balsų suvedimas ir
// nugalėtojų perkėlimas į kitą ratą, (2) šiandienos turnyro mato paskelbimas
// kaip dienos dvikova.
//
// Grafikas (vercel.json): 21:10 ir 22:10 UTC — dėl DST viena jų visada yra
// tuoj po LT vidurnakčio (vasarą 00:10, žiemą 00:10 antroji); papildomai
// 03:10 UTC saugiklis. Visi žingsniai idempotentiški, tad pertekliniai
// paleidimai nekenkia.
//
// Apsauga: Vercel Cron `Authorization: Bearer <CRON_SECRET>` arba rankinis
// ?key=<CRON_SECRET> (žr. lib/cron-auth).

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { authorizeCron } from '@/lib/cron-auth'
import { resolveFinishedDuels, publishTodayDuel } from '@/lib/tournament-resolver'
import { refreshStalePending } from '@/lib/tournament-db'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: Request) {
  if (!authorizeCron(req, { allowQueryKey: true })) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const sb = createAdminClient()
  try {
    const resolveResult = await resolveFinishedDuels(sb)
    const publishResult = await publishTodayDuel(sb)

    // Pending turnyrų atšviežinimas: stilių/erų duomenys keičiasi, tad dar
    // nestartavę turnyrai po truputį pergeneruojami iš naujausių duomenų
    // (po 3 per paleidimą, seniausiai atnaujinti pirmi → visa eilė ~3-4 d.).
    // Best-effort: nesėkmė nestabdo resolve/publish rezultato.
    let refreshed: any[] = []
    try { refreshed = await refreshStalePending(sb, 3) } catch { /* kitą kartą */ }

    return NextResponse.json({
      ok: true,
      resolved: resolveResult.resolved.length,
      champions: resolveResult.champions,
      publish: publishResult,
      refreshed: refreshed.map(r => ({ title: r.title, changed: r.changed })),
    })
  } catch (e: any) {
    console.error('[cron/turnyrai]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
