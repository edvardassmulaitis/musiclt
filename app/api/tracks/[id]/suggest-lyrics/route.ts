// app/api/tracks/[id]/suggest-lyrics/route.ts
//
// Registruoti vartotojai gali pasiūlyti dainos tekstą (ypač kai jo dar nėra).
// Pasiūlymas patenka į `lyrics_suggestions` (status='pending') ir laukia admin'o
// peržiūros (/admin/teksto-pasiulymai). Anon vartotojams neleidžiam — reikia
// prisijungimo, kad būtų atsakomybė + galima atmesti spam'ą.

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'

async function resolveProfile(
  sb: ReturnType<typeof createAdminClient>,
  session: any,
): Promise<{ id: string; username: string } | null> {
  const uid = session?.user?.id as string | undefined
  if (uid) {
    const { data } = await sb.from('profiles').select('id, username').eq('id', uid).maybeSingle()
    if (data?.id) return { id: data.id, username: data.username || `user_${String(data.id).slice(0, 8)}` }
  }
  const email = session?.user?.email as string | undefined
  if (email) {
    const { data } = await sb.from('profiles').select('id, username')
      .ilike('email', email.trim().toLowerCase()).order('created_at', { ascending: true }).limit(1).maybeSingle()
    if (data?.id) return { id: data.id, username: data.username || `user_${String(data.id).slice(0, 8)}` }
  }
  return null
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const trackId = parseInt(id, 10)
  if (isNaN(trackId)) return NextResponse.json({ error: 'Blogas dainos id' }, { status: 400 })

  const session = await getServerSession(authOptions)
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Reikia prisijungti, kad galėtum siūlyti tekstą' }, { status: 401 })
  }

  let body: any = {}
  try { body = await req.json() } catch {}
  const lyrics = String(body?.lyrics || '').trim()
  if (!lyrics) return NextResponse.json({ error: 'Tekstas tuščias' }, { status: 400 })
  if (lyrics.length > 20000) return NextResponse.json({ error: 'Tekstas per ilgas' }, { status: 400 })

  const sb = createAdminClient()
  const profile = await resolveProfile(sb, session)
  if (!profile) {
    return NextResponse.json({ error: 'Profilis nerastas — atsijunk ir prisijunk iš naujo' }, { status: 500 })
  }

  // Patikrinam, kad daina egzistuoja.
  const { data: track } = await sb.from('tracks').select('id').eq('id', trackId).maybeSingle()
  if (!track) return NextResponse.json({ error: 'Daina nerasta' }, { status: 404 })

  // Jei tas pats vartotojas jau turi laukiantį pasiūlymą šiai dainai — atnaujinam jį
  // (kad nesikauptų dublikatai), kitaip įterpiam naują.
  const { data: existing } = await sb
    .from('lyrics_suggestions')
    .select('id')
    .eq('track_id', trackId)
    .eq('suggested_by_user_id', profile.id)
    .eq('status', 'pending')
    .limit(1)
    .maybeSingle()

  if (existing) {
    const { error } = await sb.from('lyrics_suggestions')
      .update({ lyrics, created_at: new Date().toISOString() })
      .eq('id', existing.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  } else {
    const { error } = await sb.from('lyrics_suggestions').insert({
      track_id: trackId,
      lyrics,
      status: 'pending',
      suggested_by_user_id: profile.id,
      suggested_by_username: profile.username,
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
