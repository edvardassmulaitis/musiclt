// /api/galerija/from?slug=<legacy-news-slug>
//
// Seni /news/FOTO-… reportažai peradresuojami čia (per middleware.ts). Surandam
// ar tas legacy įrašas konvertuotas į reportažą — jei taip, 308 → /galerija/[slug];
// jei ne — 308 → /galerija hub. Route handler'is = patikimas redirect (skirtingai
// nei server-component redirect su ISR cache).

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const slug = (req.nextUrl.searchParams.get('slug') || '').trim()
  const hub = new URL('/galerija', req.url)
  if (!slug) return NextResponse.redirect(hub, 308)

  try {
    const sb = createAdminClient()
    // 1) reportažas tiesiogiai pagal source_url legacy slug? Greičiausias kelias:
    //    discussions.slug → id → reportages.legacy_discussion_id.
    const { data: disc } = await sb.from('discussions').select('id').eq('slug', slug).maybeSingle()
    if (disc?.id) {
      const { data: rep } = await sb.from('reportages').select('slug').eq('legacy_discussion_id', disc.id).maybeSingle()
      if (rep?.slug) return NextResponse.redirect(new URL(`/galerija/${rep.slug}`, req.url), 308)
    }
  } catch {
    /* fall through to hub */
  }
  return NextResponse.redirect(hub, 308)
}
