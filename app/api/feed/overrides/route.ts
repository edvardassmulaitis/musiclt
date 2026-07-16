// app/api/feed/overrides/route.ts
//
// GET /api/feed/overrides — homepage reader feed'o admin override'ai:
//   overrides[] — paslėpti / prisegti / rankinis eiliškumas pagal item_key
//   custom[]    — admin pridėti laisvi įrašai (visi, įsk. paslėptus — homepage filtruoja)
// Skaitoma service-role klientu (lentelė be RLS, valdoma tik per admin route'us).

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'

export const revalidate = 0

export async function GET() {
  try {
    const sb = createAdminClient()
    const { data } = await sb.from('home_feed').select('*').order('sort_order', { ascending: true, nullsFirst: false })
    const rows: any[] = data || []
    return NextResponse.json({
      overrides: rows.filter(r => r.kind === 'override').map(r => ({ item_key: r.item_key, hidden: r.hidden, pinned: r.pinned, sort_order: r.sort_order, updated_at: r.updated_at })),
      custom: rows.filter(r => r.kind === 'custom').map(r => ({ id: r.id, title: r.title, subtitle: r.subtitle, image_url: r.image_url, href: r.href, chip: r.chip, chip_bg: r.chip_bg, video_url: r.video_url, sort_order: r.sort_order, hidden: r.hidden, updated_at: r.updated_at })),
      // Kandidatų sistema: 'pending'/'rejected' raktai PRASLEPIAMI homepage feed'e
      // (nauji auto-įrašai laukia patvirtinimo /admin/feed; žr. cron/feed-candidates).
      blocked: rows.filter(r => r.kind === 'candidate' && (r.status === 'pending' || r.status === 'rejected')).map(r => r.item_key),
    }, { headers: { 'Cache-Control': 'public, s-maxage=15, stale-while-revalidate=60' } })
  } catch (e: any) {
    return NextResponse.json({ overrides: [], custom: [], blocked: [], error: e?.message }, { status: 200 })
  }
}
