/**
 * YouTube info foninis backfill — užpildo praleistus/tuščius YT laukus.
 *
 * Kodėl: dauguma track'ų turi video_url, bet dėl Data API kvotos išnaudojimo
 * (žr. yt-innertube getVideoDetails) jiems niekada nebuvo paimti views / data /
 * embeddable. Šis worker'is lėtai, partijomis, NEEIKVODAMAS Data API kvotos
 * (skipDataApi → tik nemokami InnerTube šaltiniai), užpildo trūkstamą info.
 *
 * Fazės (prioriteto tvarka):
 *   A — turi video_url, bet video_views_checked_at NULL (visai neenrichinta):
 *       pilnas enrichTrack → views + data + embeddable.
 *   B — NETURI video_url ir youtube_searched_at NULL (visai neieškota):
 *       enrichTrack(force) → InnerTube paieška priskiria video + užpildo info.
 *   C — turi video_url, bet video_uploaded_at NULL (trūksta tik datos):
 *       enrichTrack(preserveViews) → užpildo datą+embeddable, NEliesdamas
 *       esamų views (kad neperrašytų tikslių aproksimuotomis).
 *
 * Resumability / anti-loop: kiekvienas apdorotas track'as gauna
 * `yt_backfill_at = now()` (net jei nepavyko), todėl nebepasirenkamas iš naujo
 * (jokių begalinių ciklų ant negyvų/blokuotų video). Migr. 2026-06-18.
 */
import { createAdminClient } from '@/lib/supabase'
import { enrichTrack } from '@/lib/yt-enrich'
// redeploy: 1781783027 retry3

type Phase = 'A' | 'B' | 'C'

/**
 * Partijos parinkimas su PRIORITETU daromas DB pusėje (RPC pick_yt_backfill_batch,
 * SQL funkcija). Tvarka: A fazė (trūksta views — svarbiausia) chart→top-atlikėjas
 * →bendra, tada B (be video→paieška), tada C (tik data). Grąžina { t_id, t_phase }.
 * Kiekviena eilutė neša savo fazę → enrich opts parenkamos PER eilutę. */
async function pickBatch(
  supabase: ReturnType<typeof createAdminClient>,
  batch: number,
  forcePhase?: Phase | null,
): Promise<Array<{ id: number; phase: Phase }>> {
  const { data, error } = await supabase.rpc('pick_yt_backfill_batch', {
    p_batch: batch,
    p_phase: forcePhase ?? null,
  })
  if (error || !data) return []
  return (data as any[]).map((r) => ({ id: r.t_id as number, phase: r.t_phase as Phase }))
}

export type BackfillRun = {
  ok: true
  phase: Phase | null
  processed: number
  found: number
  errors: number
  ms: number
  done: boolean           // true kai nebeliko darbo nė vienoje fazėje
  samples: Array<{ id: number; ok: boolean; views: number | null; found?: boolean }>
}

/**
 * Vienas backfill „kvėptelėjimas" — apdoroja iki `batch` track'ų (arba kol
 * baigiasi `budgetMs`), su `delayMs` pauze tarp track'ų (švelnumas InnerTube'ui).
 */
export async function runYtBackfill(opts: {
  budgetMs?: number
  batch?: number
  delayMs?: number
  phase?: Phase | null
} = {}): Promise<BackfillRun> {
  const budgetMs = opts.budgetMs ?? 50000
  const batch = Math.max(1, Math.min(opts.batch ?? 40, 100))
  const delayMs = opts.delayMs ?? 250
  const start = Date.now()
  const supabase = createAdminClient()

  const rows = await pickBatch(supabase, batch, opts.phase ?? null)
  if (!rows.length) {
    return { ok: true, phase: null, processed: 0, found: 0, errors: 0, ms: Date.now() - start, done: true, samples: [] }
  }

  let processed = 0, found = 0, errors = 0
  const samples: BackfillRun['samples'] = []
  const phasesSeen = new Set<Phase>()

  for (const { id, phase } of rows) {
    if (Date.now() - start > budgetMs) break
    phasesSeen.add(phase)
    // Fazė C — tik datos backfill: praleidžiam Data API IR neperrašom views.
    // A/B — irgi skipDataApi (taupom kvotą), bet views rašom (jų dar nėra).
    const enrichOpts = phase === 'C'
      ? { skipDataApi: true, preserveViews: true }
      : { skipDataApi: true }
    try {
      const r = await enrichTrack(id, true, enrichOpts)
      if (r.ok) {
        const ok = (r.wasFound || r.viewsAfter != null || (r as any).embeddable != null)
        if (ok) found++
        if (samples.length < 5) samples.push({ id, ok: true, views: r.viewsAfter ?? null, found: r.wasFound })
      } else {
        errors++
        if (samples.length < 5) samples.push({ id, ok: false, views: null })
      }
    } catch {
      errors++
    }
    // Anti-loop žyma — net jei nepavyko (kad nebepasirinktų amžinai).
    try {
      await (supabase.from('tracks') as any).update({ yt_backfill_at: new Date().toISOString() }).eq('id', id)
    } catch { /* ignore */ }
    processed++
    if (delayMs && Date.now() - start <= budgetMs) {
      await new Promise((res) => setTimeout(res, delayMs))
    }
  }

  const phase = phasesSeen.size === 1 ? [...phasesSeen][0] : null
  return { ok: true, phase, processed, found, errors, ms: Date.now() - start, done: false, samples }
}

export type RecentBackfill = {
  id: number
  title: string | null
  artist: string | null
  views: number | null
  status: 'views' | 'video' | 'dead'   // views=atkurti views; video=rasta/yra video be views; dead=negyvas
  at: string | null
}

/** Likučiai + progresas + paskutiniai sutvarkyti (stebėjimui ?stats=1 / admin puslapiui). */
export async function backfillStats(): Promise<{
  ok: true
  remaining: { A: number | null; B: number | null; C: number | null }
  processed: { total: number | null; recovered: number | null; dead: number | null }
  recent: RecentBackfill[]
}> {
  const supabase = createAdminClient()

  // Visi 6 skaičiai VIENA SQL funkcija (backfill_stats_counts) — patikima ir
  // greita (~1s). Anksčiau 6 atskiros PostgREST count='exact' užklausos
  // lygiagrečiai konkuruodavo / time-out'indavo → null'ai UI'e. 2026-06-18.
  const { data: countsData } = await supabase.rpc('backfill_stats_counts')
  const c: any = Array.isArray(countsData) ? countsData[0] : countsData

  // Paskutiniai sutvarkyti — atskira lengva užklausa (idx_tracks_yt_backfill).
  const { data: recentData } = await supabase
    .from('tracks')
    .select('id, title, video_views, video_url, yt_backfill_at, artists(name)')
    .not('yt_backfill_at', 'is', null)
    .order('yt_backfill_at', { ascending: false })
    .limit(15)

  const recent: RecentBackfill[] = ((recentData as any[]) || []).map((r: any) => {
    const art = Array.isArray(r.artists) ? r.artists[0] : r.artists
    const hasVideo = !!r.video_url
    const status: RecentBackfill['status'] =
      r.video_views != null ? 'views' : (hasVideo ? 'dead' : 'video')
    return { id: r.id, title: r.title ?? null, artist: art?.name ?? null, views: r.video_views ?? null, status, at: r.yt_backfill_at ?? null }
  })

  return {
    ok: true,
    remaining: { A: c?.rem_a ?? null, B: c?.rem_b ?? null, C: c?.rem_c ?? null },
    processed: { total: c?.total ?? null, recovered: c?.recovered ?? null, dead: c?.dead ?? null },
    recent,
  }
}
