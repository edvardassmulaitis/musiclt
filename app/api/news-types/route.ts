import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'

export async function GET() {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('news_types')
    .select('id, label, slug')
    .order('id')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data || [])
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user || !['admin', 'super_admin'].includes(session.user.role || '')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const { label } = await req.json()
    if (!label?.trim()) return NextResponse.json({ error: 'Label required' }, { status: 400 })
    const slug = label.toLowerCase()
      .replace(/[ą]/g, 'a').replace(/[č]/g, 'c').replace(/[ę]/g, 'e')
      .replace(/[ė]/g, 'e').replace(/[į]/g, 'i').replace(/[š]/g, 's')
      .replace(/[ų]/g, 'u').replace(/[ū]/g, 'u').replace(/[ž]/g, 'z')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('news_types')
      .insert({ label: label.trim(), slug })
      .select('id, label, slug')
      .single()
    if (error) throw new Error(error.message)
    return NextResponse.json(data)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
