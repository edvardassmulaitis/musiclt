import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

// Grąžina pirmadienio datą savaitei kuriai priklauso data
function getMondayOf(date: Date): string {
  const d = new Date(date)
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  return d.toISOString().split('T')[0]
}

// Gauti arba sukurti aktyvią savaitę
async function getOrCreateActiveWeek(supabase: any, topType: string) {
  const thisMonday = getMondayOf(new Date())

  // Pirma bandyti rasti šios savaitės įrašą
  const { data: existing } = await supabase
    .from('top_weeks')
    .select('*')
    .eq('top_type', topType)
    .eq('week_start', thisMonday)
    .maybeSingle()

  if (existing) {
    // Jei dar nepažymėta kaip aktyvi - pažymėti
    if (!existing.is_active) {
      await supabase.from('top_weeks')
        .update({ is_active: false })
        .eq('top_type', topType)
      await supabase.from('top_weeks')
        .update({ is_active: true })
        .eq('id', existing.id)
      return { ...existing, is_active: true }
    }
    return existing
  }

  // Sukurti naują savaitę ir išjungti senąją
  await supabase.from('top_weeks')
    .update({ is_active: false })
    .eq('top_type', topType)

  const { data: created } = await supabase
    .from('top_weeks')
    .insert({ top_type: topType, week_start: thisMonday, is_active: true })
    .select()
    .single()

  return created
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const topType = searchParams.get('type') || 'top40'
  const limit = parseInt(searchParams.get('limit') || '20')
  const supabase = createAdminClient()

  // Automatiškai užtikrinti kad šios savaitės įrašas egzistuoja
  await getOrCreateActiveWeek(supabase, topType)

  const { data, error } = await supabase
    .from('top_weeks')
    .select('*')
    .eq('top_type', topType)
    .order('week_start', { ascending: false })
    .limit(limit)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ weeks: data || [] })
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.role || !['admin', 'super_admin'].includes(session.user.role))
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { top_type, week_start } = body
  const supabase = createAdminClient()

  // Deaktyvuoti visas kitas to tipo savaites
  await supabase.from('top_weeks').update({ is_active: false }).eq('top_type', top_type)

  const { data, error } = await supabase
    .from('top_weeks')
    .insert({ top_type, week_start, is_active: true })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ week: data })
}
