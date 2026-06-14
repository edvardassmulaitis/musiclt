// GET /api/studija/search-artists?q= — paprasta atlikėjų paieška claim'inimui.
// Grąžina id, slug, name, cover, is_claimed (kad UI rodytų „jau pasiimta").

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const q = (new URL(req.url).searchParams.get('q') || '').trim()
  if (q.length < 2) return NextResponse.json({ results: [] })
  try {
    const sb = createAdminClient()
    const { data } = await sb
      .from('artists')
      .select('id, slug, name, cover_image_url, is_claimed, country')
      .ilike('name', `%${q}%`)
      .eq('is_active', true)
      .order('score', { ascending: false })
      .limit(12)
    return NextResponse.json({ results: data || [] })
  } catch (e: any) {
    return NextResponse.json({ results: [], error: e?.message }, { status: 200 })
  }
}
