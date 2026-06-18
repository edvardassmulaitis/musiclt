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

/** Likučiai + progresas (stebėjimui ?stats=1 / admin puslapiui). */
export async function backfillStats(): Promise<{
  ok: true
  remaining: { A: number | null; B: number | null; C: number | null }
  processed: { total: number | null; recovered: number | null; dead: number | null }
}> {
  const supabase = createAdminClient()
  const cnt = (q: any) => q as Promise<{ count: number | null }>
  const head = () => supabase.from('tracks').select('id', { count: 'exact', head: true })

  const [a, b, c, total, recovered, dead] = await Promise.all([
    cnt(head().not('video_url', 'is', null).is('video_views_checked_at', null).is('yt_backfill_at', null)),
    cnt(head().is('video_url', null).is('youtube_searched_at', null).is('yt_backfill_at', null)
      .not('title', 'is', null).not('artist_id', 'is', null)),
    cnt(head().not('video_url', 'is', null).is('video_uploaded_at', null).is('yt_backfill_at', null)),
    // Apdorota viso (turi backfill žymą)
    cnt(head().not('yt_backfill_at', 'is', null)),
    // Atkurta: apdorota IR turi views
    cnt(head().not('yt_backfill_at', 'is', null).not('video_views', 'is', null)),
    // Negyvi: apdorota, turi video_url, bet views taip ir liko tušti
    cnt(head().not('yt_backfill_at', 'is', null).not('video_url', 'is', null).is('video_views', null)),
  ])
  return {
    ok: true,
    remaining: { A: a.count ?? null, B: b.count ?? null, C: c.count ?? null },
    processed: { total: total.count ?? null, recovered: recovered.count ?? null, dead: dead.count ?? null },
  }
}
