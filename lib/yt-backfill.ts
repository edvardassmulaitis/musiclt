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

type PhaseSel = { phase: Phase | null; ids: number[] }

async function selectPhase(
  supabase: ReturnType<typeof createAdminClient>,
  batch: number,
  forcePhase?: Phase | null,
): Promise<PhaseSel> {
  const wantA = !forcePhase || forcePhase === 'A'
  const wantB = !forcePhase || forcePhase === 'B'
  const wantC = !forcePhase || forcePhase === 'C'

  if (wantA) {
    const { data } = await supabase
      .from('tracks').select('id')
      .not('video_url', 'is', null)
      .is('video_views_checked_at', null)
      .is('yt_backfill_at', null)
      .limit(batch)
    if (data && data.length) return { phase: 'A', ids: data.map((r: any) => r.id) }
  }
  if (wantB) {
    const { data } = await supabase
      .from('tracks').select('id')
      .is('video_url', null)
      .is('youtube_searched_at', null)
      .is('yt_backfill_at', null)
      .not('title', 'is', null)
      .not('artist_id', 'is', null)
      .limit(batch)
    if (data && data.length) return { phase: 'B', ids: data.map((r: any) => r.id) }
  }
  if (wantC) {
    const { data } = await supabase
      .from('tracks').select('id')
      .not('video_url', 'is', null)
      .is('video_uploaded_at', null)
      .is('yt_backfill_at', null)
      .limit(batch)
    if (data && data.length) return { phase: 'C', ids: data.map((r: any) => r.id) }
  }
  return { phase: null, ids: [] }
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

  const sel = await selectPhase(supabase, batch, opts.phase ?? null)
  if (!sel.phase) {
    return { ok: true, phase: null, processed: 0, found: 0, errors: 0, ms: Date.now() - start, done: true, samples: [] }
  }

  // Fazė C — tik datos backfill: praleidžiam Data API IR neperrašom views.
  // A/B — irgi skipDataApi (taupom kvotą), bet views rašom (jų dar nėra).
  const enrichOpts = sel.phase === 'C'
    ? { skipDataApi: true, preserveViews: true }
    : { skipDataApi: true }

  let processed = 0, found = 0, errors = 0
  const samples: BackfillRun['samples'] = []

  for (const id of sel.ids) {
    if (Date.now() - start > budgetMs) break
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

  return { ok: true, phase: sel.phase, processed, found, errors, ms: Date.now() - start, done: false, samples }
}

/** Likučiai pagal fazes (rankiniam stebėjimui ?stats=1). */
export async function backfillStats(): Promise<{ ok: true; remaining: { A: number | null; B: number | null; C: number | null } }> {
  const supabase = createAdminClient()
  const a = await supabase.from('tracks').select('id', { count: 'exact', head: true })
    .not('video_url', 'is', null).is('video_views_checked_at', null).is('yt_backfill_at', null)
  const b = await supabase.from('tracks').select('id', { count: 'exact', head: true })
    .is('video_url', null).is('youtube_searched_at', null).is('yt_backfill_at', null)
    .not('title', 'is', null).not('artist_id', 'is', null)
  const c = await supabase.from('tracks').select('id', { count: 'exact', head: true })
    .not('video_url', 'is', null).is('video_uploaded_at', null).is('yt_backfill_at', null)
  return { ok: true, remaining: { A: a.count ?? null, B: b.count ?? null, C: c.count ?? null } }
}
