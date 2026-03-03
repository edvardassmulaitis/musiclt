import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const topType = searchParams.get('type') || 'top40'
  const supabase = createAdminClient()

  // Auto-sukurti savaitę jei reikia (Supabase funkcija)
  await supabase.rpc('get_or_create_active_week', { p_type: topType })

  const { data, error } = await supabase
    .from('top_weeks')
    .select('*')
    .eq('top_type', topType)
    .order('week_start', { ascending: false })
    .limit(20)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ weeks: data || [] })
}
