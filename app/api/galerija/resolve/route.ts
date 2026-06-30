// /api/galerija/resolve?slug=<sena-arba-nauja>
//
// Grąžina kanoninį reportažo slug'ą. Naudoja middleware senų slug'ų 301
// redirect'ui (page-lygio permanentRedirect neveikia dėl Vercel edge cache —
// žr. middleware.ts /atradimai komentarą). Lengvas: tik slug stulpeliai.

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const slug = (req.nextUrl.searchParams.get('slug') || '').trim()
  if (!slug) return NextResponse.json({ slug: null }, { status: 400 })
  try {
    const sb = createAdminClient()
    // Jei toks slug jau kanoninis — nieko nereikia.
    const { data: exact } = await sb.from('reportages').select('slug').eq('slug', slug).maybeSingle()
    if (exact) return NextResponse.json({ slug: exact.slug, canonical: true })
    // Kitaip — ieškom per old_slugs.
    const { data: byOld } = await sb.from('reportages').select('slug').contains('old_slugs', [slug]).limit(1).maybeSingle()
    return NextResponse.json({ slug: byOld?.slug ?? null, canonical: false }, {
      headers: { 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800' },
    })
  } catch {
    return NextResponse.json({ slug: null }, { status: 500 })
  }
}
