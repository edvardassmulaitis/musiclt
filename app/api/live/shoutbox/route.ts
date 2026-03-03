import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

const RATE_LIMIT_SECONDS = 30
const HOURLY_LIMIT = 20

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const since = searchParams.get('since') // ISO timestamp — tik naujesnes
  const limit = parseInt(searchParams.get('limit') || '80')
  const supabase = createAdminClient()

  let query = supabase
    .from('shoutbox_messages')
    .select('id, user_id, author_name, author_avatar, body, created_at')
    .eq('is_deleted', false)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (since) query = query.gt('created_at', since)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ messages: data || [] })
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id)
    return NextResponse.json({ error: 'Reikia prisijungti' }, { status: 401 })

  const body = await req.json()
  const { text } = body

  if (!text?.trim()) return NextResponse.json({ error: 'Tuščia žinutė' }, { status: 400 })
  if (text.trim().length > 255) return NextResponse.json({ error: 'Žinutė per ilga (max 255)' }, { status: 400 })

  const supabase = createAdminClient()
  const userId = session.user.id

  // Patikrinti ar nutildytas
  const { data: mute } = await supabase
    .from('shoutbox_mutes')
    .select('muted_until, reason')
    .eq('user_id', userId)
    .gt('muted_until', new Date().toISOString())
    .maybeSingle()

  if (mute) {
    const until = new Date(mute.muted_until).toLocaleTimeString('lt-LT', { hour: '2-digit', minute: '2-digit' })
    return NextResponse.json({
      error: `Nutildytas iki ${until}${mute.reason ? ': ' + mute.reason : ''}`
    }, { status: 403 })
  }

  // Rate limit: 1 žinutė per 30s
  const rateLimitSince = new Date(Date.now() - RATE_LIMIT_SECONDS * 1000).toISOString()
  const { count: recentCount } = await supabase
    .from('shoutbox_messages')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('is_deleted', false)
    .gt('created_at', rateLimitSince)

  if ((recentCount || 0) > 0)
    return NextResponse.json({ error: `Palaukite ${RATE_LIMIT_SECONDS}s tarp žinučių` }, { status: 429 })

  // Rate limit: 20 žinučių per valandą
  const hourAgo = new Date(Date.now() - 3600000).toISOString()
  const { count: hourlyCount } = await supabase
    .from('shoutbox_messages')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('is_deleted', false)
    .gt('created_at', hourAgo)

  if ((hourlyCount || 0) >= HOURLY_LIMIT)
    return NextResponse.json({ error: `Valandos limitas (${HOURLY_LIMIT} žinučių) pasiektas` }, { status: 429 })

  const { data, error } = await supabase
    .from('shoutbox_messages')
    .insert({
      user_id: userId,
      author_name: session.user.name || session.user.email || 'Vartotojas',
      author_avatar: session.user.image || null,
      body: text.trim(),
    })
    .select('id, user_id, author_name, author_avatar, body, created_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ message: data })
}

export async function DELETE(req: Request) {
  const session = await getServerSession(authOptions)
  const isAdmin = session?.user?.role === 'admin' || session?.user?.role === 'super_admin'
  if (!session?.user?.id || !isAdmin)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  const supabase = createAdminClient()

  const { error } = await supabase
    .from('shoutbox_messages')
    .update({ is_deleted: true, deleted_by: session.user.id })
    .eq('id', id!)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
