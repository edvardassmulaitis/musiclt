// Lightweight albums list (id, title, year) — used by the eras admin page
// to preview which albums fall into each era boundary as the user types.

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const sb = createAdminClient()
  const { data, error } = await sb
    .from('albums')
    .select('id, title, year')
    .eq('artist_id', parseInt(id))
    .order('year', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ rows: data || [] })
}
