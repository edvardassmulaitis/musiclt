import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'

export async function GET() {
  const sb = createAdminClient()
  const { data } = await sb
    .from('venues')
    .select('id,legacy_id,slug,name,city,address')
    .order('name', { ascending: true })
  return NextResponse.json({ venues: data || [] })
}
