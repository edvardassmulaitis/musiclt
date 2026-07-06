import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { authorizeCron } from '@/lib/cron-auth'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// GET /api/cron/feed-candidates  (Authorization: Bearer $CRON_SECRET)
//
// Homepage feed KANDIDATŲ registracija + auto-approve (kas 30 min, vercel.json).
//
//  1. Surenka dabartinius AUTO feed įrašus (naujienos/renginiai/koncertų įrašai/
//     verta kelionės) per tuos pačius viešus endpoint'us kaip klientas — todėl
//     item_key'ai (type::href) sutampa 1:1 su HomeClient feedKey.
//  2. Naujus registruoja kaip kind='candidate':
//       • susieto atlikėjo score >= POP_SCORE → status='approved' IŠKART
//         (populiarumo taisyklė — žinomų atlikėjų turinys nelaukia)
//       • kitaip 'pending' → matomas /admin/feed „Kandidatai" bloke
//  3. 'pending' senesni nei AUTO_APPROVE_H — auto-pasitvirtina (auto_approved).
//
// Klientas (HomeClient) PRASLEPIA tik 'pending'/'rejected' — nežinomi raktai
// rodomi (fail-open: cron'ui nulūžus feed'as nenutrūksta).
const POP_SCORE = 30
const AUTO_APPROVE_H = 8

type Cand = { key: string; type: string; title: string; image: string | null; artistIds: number[] }

export async function GET(req: NextRequest) {
  if (!authorizeCron(req, { allowQueryKey: true })) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }
  const base = process.env.NEXT_PUBLIC_SITE_URL || 'https://musiclt.vercel.app'
  const j = async (path: string): Promise<any> => {
    try { const r = await fetch(base + path, { cache: 'no-store' }); return r.ok ? await r.json() : null } catch { return null }
  }

  const [news, hev, ev, recs, verta] = await Promise.all([
    j('/api/news?limit=12&since_days=7'),
    j('/api/events?home_hero=1&limit=8'),
    j('/api/events?limit=60'),
    j('/api/koncertu-irasai?limit=6'),
    j('/api/verta-keliones'),
  ])

  const cands: Cand[] = []
  for (const n of (news?.news || []).slice(0, 12)) {
    if (!n?.slug) continue
    cands.push({ key: `news::/news/${n.slug}`, type: 'news', title: n.title || '', image: n.image_small_url || null, artistIds: n.artist?.id ? [n.artist.id] : [] })
  }
  const evSeen = new Set<string>()
  for (const e of [...(hev?.events || []), ...((ev?.events || []).slice(0, 12))]) {
    if (!e?.slug || evSeen.has(e.slug)) continue
    evSeen.add(e.slug)
    const ids = (e.event_artists || []).map((ea: any) => ea?.artists?.id).filter(Boolean)
    cands.push({ key: `event::/renginiai/${e.slug}`, type: 'event', title: e.title || '', image: e.image_small_url || e.cover_image_url || null, artistIds: ids })
  }
  for (const r of (recs?.recordings || []).slice(0, 6)) {
    if (!r?.slug) continue
    cands.push({ key: `recording::/koncertu-irasai/${r.slug}`, type: 'recording', title: r.title || '', image: r.thumbnail_url || null, artistIds: r.artist_id ? [r.artist_id] : [] })
  }
  for (const c of (verta?.concerts || [])) {
    if (c?.id == null) continue
    cands.push({ key: `verta::/verta-keliones#vk-${c.id}`, type: 'verta', title: c.isFestival ? (c.festivalName || c.artist || '') : (c.artist || ''), image: c.image || null, artistIds: [] })
  }

  const sb = createAdminClient()

  // Esami kandidatai — kad neregistruotume pakartotinai.
  const { data: existing } = await sb.from('home_feed').select('item_key').eq('kind', 'candidate')
  const known = new Set((existing || []).map((r: any) => r.item_key))
  const fresh = cands.filter(c => !known.has(c.key))

  // Populiarumo taisyklė: susieto atlikėjo score.
  const allIds = Array.from(new Set(fresh.flatMap(c => c.artistIds)))
  const scoreById = new Map<number, number>()
  if (allIds.length) {
    const { data: arts } = await sb.from('artists').select('id, score').in('id', allIds)
    for (const a of arts || []) scoreById.set(a.id, a.score || 0)
  }

  let inserted = 0, instant = 0
  for (const c of fresh) {
    const maxScore = Math.max(0, ...c.artistIds.map(id => scoreById.get(id) || 0))
    const popular = maxScore >= POP_SCORE
    const { error } = await sb.from('home_feed').insert({
      kind: 'candidate', item_key: c.key, item_type: c.type,
      status: popular ? 'approved' : 'pending',
      auto_approved: popular,
      decided_at: popular ? new Date().toISOString() : null,
      title: c.title.slice(0, 300), image_url: c.image, href: c.key.split('::')[1] || null,
    })
    if (!error) { inserted++; if (popular) instant++ }
  }

  // Auto-approve: pending senesni nei AUTO_APPROVE_H.
  const cutoff = new Date(Date.now() - AUTO_APPROVE_H * 3600_000).toISOString()
  const { data: autoAppr } = await sb.from('home_feed')
    .update({ status: 'approved', auto_approved: true, decided_at: new Date().toISOString() })
    .eq('kind', 'candidate').eq('status', 'pending').lt('first_seen_at', cutoff)
    .select('id')

  return NextResponse.json({
    ok: true, scanned: cands.length, new: inserted, instant_approved: instant,
    auto_approved_now: (autoAppr || []).length,
  })
}
