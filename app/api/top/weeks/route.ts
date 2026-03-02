import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const topType = searchParams.get('type') || 'top40'
  const limit = parseInt(searchParams.get('limit') || '20')

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('top_weeks')
    .select('*')
    .eq('top_type', topType)
    .order('week_start', { ascending: false })
    .limit(limit)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ weeks: data })
}

export async function POST(req: Request) {
  const { getServerSession } = await import('next-auth')
  const { authOptions } = await import('@/lib/auth')
  const session = await getServerSession(authOptions)
  if (!session?.user?.role || !['admin','super_admin'].includes(session.user.role))
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { top_type, week_start } = body
  const supabase = createAdminClient()

  // Deaktyvuoti kitas aktyvias
  await supabase.from('top_weeks').update({ is_active: false }).eq('top_type', top_type)

  const { data, error } = await supabase
    .from('top_weeks')
    .insert({ top_type, week_start, is_active: true })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ week: data })
}
