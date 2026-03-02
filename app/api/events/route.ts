import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { getEvents, createEvent, searchEvents } from '@/lib/supabase-events'

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const search = sp.get('search')

  if (search) {
    const results = await searchEvents(search)
    return NextResponse.json(results)
  }

  try {
    const result = await getEvents({
      city: sp.get('city') || undefined,
      status: sp.get('status') || undefined,
      period: (sp.get('period') as 'week' | 'month' | 'all') || undefined,
      showPast: sp.get('showPast') === 'true',
      limit: parseInt(sp.get('limit') || '20'),
      offset: parseInt(sp.get('offset') || '0'),
    })
    return NextResponse.json(result)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Check admin
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const body = await req.json()
    const event = await createEvent(body, user.id)
    return NextResponse.json(event, { status: 201 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
